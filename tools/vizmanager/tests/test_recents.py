"""Recent robot IPv4 cache: load / save / remember."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizmanager.recents import (
    MAX_RECENT,
    load_recent_robots,
    recents_file,
    remember_recent_robot,
    save_recent_robots,
)


def test_remember_moves_to_front_unique_and_capped():
    current = ["10.0.0.{0}".format(i) for i in range(MAX_RECENT)]
    out = remember_recent_robot("10.0.0.3", current)
    assert out[0] == "10.0.0.3"
    assert out.count("10.0.0.3") == 1
    assert len(out) == MAX_RECENT
    extra = remember_recent_robot("192.168.1.9", current)
    assert extra[0] == "192.168.1.9"
    assert len(extra) == MAX_RECENT
    assert "10.0.0.{0}".format(MAX_RECENT - 1) not in extra


def test_remember_rejects_invalid():
    current = ["10.0.0.1"]
    assert remember_recent_robot("not-an-ip", current) == current
    assert remember_recent_robot("10.0.0", current) == current
    assert remember_recent_robot("", current) == current


def test_load_save_roundtrip(tmp_path):
    path = str(tmp_path / "recent_robots.json")
    ips = ["192.168.50.155", "10.0.0.2"]
    assert save_recent_robots(ips, path) is True
    assert load_recent_robots(path) == ips


def test_load_missing_and_corrupt(tmp_path):
    missing = str(tmp_path / "nope.json")
    assert load_recent_robots(missing) == []
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert load_recent_robots(str(bad)) == []
    junk = tmp_path / "junk.json"
    junk.write_text('{"robots": [1, "10.0.0.1", "nope"]}', encoding="utf-8")
    assert load_recent_robots(str(junk)) == ["10.0.0.1"]


def test_recents_file_env_override(monkeypatch, tmp_path):
    path = str(tmp_path / "custom.json")
    monkeypatch.setenv("VIZMANAGER_RECENTS", path)
    assert recents_file() == path
