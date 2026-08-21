"""Engine consolevarset URLs for VisionMode::Viz. No robot; fake urlopen."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager.vision_http import (  # noqa: E402
    CONSOLE_PORT,
    DISABLE_TIMEOUT,
    ENABLE_TIMEOUT,
    set_viz_mode,
    viz_console_url,
)


class _FakeResp:
    def __init__(self, status, body):
        self.status = status
        self._body = body.encode("utf-8") if isinstance(body, str) else body

    def read(self):
        return self._body

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_viz_console_url_true_false():
    assert viz_console_url("192.168.50.155", True) == (
        "http://192.168.50.155:8888/consolevarset?key=Viz&value=true"
    )
    assert viz_console_url("10.0.0.1", False) == (
        "http://10.0.0.1:8888/consolevarset?key=Viz&value=false"
    )
    assert CONSOLE_PORT == 8888
    assert ENABLE_TIMEOUT >= 10.0
    assert DISABLE_TIMEOUT <= 3.0


def test_set_viz_mode_ok_and_engine_errors():
    def ok(url, timeout=None):
        assert "value=true" in url
        assert timeout == ENABLE_TIMEOUT
        return _FakeResp(200, "true<br>")

    assert set_viz_mode("192.168.50.155", True, urlopen=ok) is None

    def not_found(url, timeout=None):
        return _FakeResp(200, "Variable not found Viz<br>")

    err = set_viz_mode("192.168.50.155", True, urlopen=not_found)
    assert err and "Variable not found" in err

    def timed(url, timeout=None):
        return _FakeResp(200, "Timed out after 10 seconds")

    err = set_viz_mode("192.168.50.155", False, urlopen=timed)
    assert err and "Timed out" in err

    def bad_set(url, timeout=None):
        return _FakeResp(200, "Error setting variable Viz=maybe")

    err = set_viz_mode("192.168.50.155", True, urlopen=bad_set)
    assert err and "Error setting" in err


def test_set_viz_mode_connection_failure_does_not_raise():
    def boom(url, timeout=None):
        raise OSError("connection refused")

    err = set_viz_mode("192.168.50.155", False, urlopen=boom)
    assert err and "connection refused" in err
    assert timeout_used_on_disable()


def timeout_used_on_disable():
    seen = []

    def ok(url, timeout=None):
        seen.append(timeout)
        assert "value=false" in url
        return _FakeResp(200, "false<br>")

    assert set_viz_mode("1.2.3.4", False, urlopen=ok) is None
    assert seen == [DISABLE_TIMEOUT]
    return True
