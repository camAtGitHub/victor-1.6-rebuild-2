#!/usr/bin/env bash
# Tighter ambient laser-detector console set (companion to laser-wide-console.sh).
# 1) Reset every Vision.LaserPointDetector slider to its C++ default.
# 2) Overlay the few ambient-tight knobs that actually produced FoundCentroid
#    (maxR 40, sat 2/2, 70/80). Stock 235/240 and sat 30/15 will not pass this
#    room. See LASER-CONSOLE-SNAPSHOT.md.
#
# Usage:
#   ./tools/laser-tight-console.sh
#   ./tools/laser-tight-console.sh 192.168.50.189
#   ANKI_ROBOT_HOST=192.168.50.189 ./tools/laser-tight-console.sh
#
# Optional: --head-down  SetHeadAngle -22 (only if DevSquawkBoxTest is active).
# Do not re-run this (or the wide script) while TrackLaser is mid-confirm —
# AutoExp=true turns AE back on.

set -euo pipefail

HEAD_DOWN=0
HOST="${ANKI_ROBOT_HOST:-192.168.50.189}"

for arg in "$@"; do
  case "$arg" in
    --head-down) HEAD_DOWN=1 ;;
    --help|-h)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) HOST="$arg" ;;
  esac
done

BASE="http://${HOST}:8888"

setvar() {
  local key="$1" value="$2" body
  body="$(curl -fsS -G "${BASE}/consolevarset" \
    --data-urlencode "key=${key}" \
    --data-urlencode "value=${value}")" || {
    echo "FAIL set ${key}=${value}" >&2
    return 1
  }
  printf '  set %-42s %s\n' "${key}=${value}" "${body}"
}

getvar() {
  curl -fsS -G "${BASE}/consolevarget" --data-urlencode "key=$1"
}

callfunc() {
  local func="$1" args="${2-}" body
  if [[ -n "$args" ]]; then
    body="$(curl -fsS -G "${BASE}/consolefunccall" \
      --data-urlencode "func=${func}" \
      --data-urlencode "args=${args}")" || {
      echo "FAIL func ${func} ${args}" >&2
      return 1
    }
  else
    body="$(curl -fsS -G "${BASE}/consolefunccall" \
      --data-urlencode "func=${func}")" || {
      echo "FAIL func ${func}" >&2
      return 1
    }
  fi
  printf '  func %-41s %s\n' "${func} ${args}" "${body}"
}

echo "Engine ${BASE}"
curl -fsS -o /dev/null "${BASE}/consolevarlist?key=Lasers" || {
  echo "Cannot reach engine console on ${BASE}" >&2
  exit 1
}

echo
echo "== Feature gate (FeatureType::Laser = 1) =="
setvar FeatureToEdit 1
callfunc EnableFeature

echo
echo "== Vision modes (toggle Lasers so VSM re-subscribes) =="
setvar Lasers false
setvar Lasers true
setvar Viz true
setvar AutoExp true

echo
echo "== Log channels =="
setvar VisionSystem true
setvar VisionComponent true

echo
echo "== Reset Vision.LaserPointDetector to C++ defaults =="
setvar Laser_scaleMultiplier 2
setvar Laser_minRadius_pix 2
setvar Laser_maxRadius_pix 25
setvar Laser_darkThresholdFraction_darkExposure 0.7
setvar Laser_darkThresholdFraction_normalExposure 0.9
setvar Laser_darkSurroundRadiusFraction 2.5
setvar Laser_MaxSurroundStdDev 25
setvar Laser_lowThreshold_normalExposure 235
setvar Laser_highThreshold_normalExposure 240
setvar Laser_lowThreshold_darkExposure 128
setvar Laser_highThreshold_darkExposure 160
setvar Laser_saturationThreshold_red 30
setvar Laser_saturationThreshold_green 15
setvar Laser_saturationBoundingBoxFraction 1.25
setvar Laser_DrawDetectionsInCameraView false
setvar LaserDetectionDebug 0

echo
echo "== Tight overlays (ambient; not ship 235/240 / 30/15) =="
setvar Laser_maxRadius_pix 40
setvar Laser_lowThreshold_normalExposure 70
setvar Laser_highThreshold_normalExposure 80
setvar Laser_saturationThreshold_red 2
setvar Laser_saturationThreshold_green 2
setvar LaserDetectionDebug 2
setvar Laser_DrawDetectionsInCameraView true
setvar DrawMirrorModeSalientPointsFor_ms 2000

if [[ "$HEAD_DOWN" -eq 1 ]]; then
  echo
  echo "== SetHeadAngle -22 (needs DevSquawkBoxTest active) =="
  callfunc SetHeadAngle -22 || true
fi

echo
echo "== Read-back =="
for k in \
  FeatureToEdit Lasers Viz AutoExp VisionSystem \
  Laser_scaleMultiplier Laser_minRadius_pix Laser_maxRadius_pix \
  Laser_darkThresholdFraction_darkExposure Laser_darkThresholdFraction_normalExposure \
  Laser_darkSurroundRadiusFraction Laser_MaxSurroundStdDev \
  Laser_lowThreshold_normalExposure Laser_highThreshold_normalExposure \
  Laser_lowThreshold_darkExposure Laser_highThreshold_darkExposure \
  Laser_saturationThreshold_red Laser_saturationThreshold_green \
  Laser_saturationBoundingBoxFraction \
  LaserDetectionDebug Laser_DrawDetectionsInCameraView \
  DrawMirrorModeSalientPointsFor_ms
do
  printf '  %-42s %s\n' "$k" "$(getvar "$k")"
done

cat <<EOF

Tight set: all Laser_* sliders reset to C++ defaults, then overlays:
  maxRadius 25 → 40
  normal thresh 235/240 → 70/80
  sat 30/15 → 2/2
  debug 0 → 2, draw true, DrawMirrorMode 2000
  ring / dark-fraction / scale / stddev / dark-pair / bbox = stock

If FoundCentroid dies, run ./tools/laser-wide-console.sh and step one family.
If TrackLaser should darken the room, do not re-run this while it is active
(AutoExp=true). darkenedGain must be ≥ 0.25 or SetAndDisableCameraControl no-ops.
EOF
