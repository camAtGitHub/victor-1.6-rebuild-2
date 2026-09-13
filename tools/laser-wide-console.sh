#!/usr/bin/env bash
# Restore the wide-open laser-detector console set that first produced
# FoundCentroid on 192.168.50.189 (see docs/mapping/LASER-CONSOLE-SNAPSHOT.md).
#
# NOT ship settings. maxRadius 4000 + sat -1 + ring 0 will also fire on huge
# floor patches. Head must be down (table in camera). Engine restart wipes
# these except the FeatureGate override file.
#
# Usage:
#   ./tools/laser-wide-console.sh
#   ./tools/laser-wide-console.sh 192.168.50.189
#   ANKI_ROBOT_HOST=192.168.50.189 ./tools/laser-wide-console.sh
#
# Optional: --head-down  also calls SetHeadAngle -22 (only works if
# DevSquawkBoxTest is already the active behavior).

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
# Subscribe only happens on change for VisionModes; gate is a func after enum.
setvar FeatureToEdit 1
callfunc EnableFeature

echo
echo "== Vision modes (toggle Lasers so VSM re-subscribes) =="
setvar Lasers false
setvar Lasers true
setvar Viz true
setvar AutoExp true

echo
echo "== Log channels (FoundCentroid is PRINT_CH_INFO VisionSystem) =="
setvar VisionSystem true
setvar VisionComponent true

echo
echo "== Wide detector knobs (snapshot 2026-09-13) =="
setvar LaserDetectionDebug 2
setvar Laser_DrawDetectionsInCameraView true
setvar DrawMirrorModeSalientPointsFor_ms 2000
setvar Laser_scaleMultiplier 2
setvar Laser_lowThreshold_normalExposure 70
setvar Laser_highThreshold_normalExposure 80
setvar Laser_lowThreshold_darkExposure 128
setvar Laser_highThreshold_darkExposure 160
setvar Laser_minRadius_pix 1
setvar Laser_maxRadius_pix 4000
setvar Laser_darkThresholdFraction_normalExposure 1.0
setvar Laser_darkThresholdFraction_darkExposure 0.7
setvar Laser_darkSurroundRadiusFraction 0
setvar Laser_MaxSurroundStdDev 25
setvar Laser_saturationThreshold_red -1
setvar Laser_saturationThreshold_green -1
setvar Laser_saturationBoundingBoxFraction 4.0

if [[ "$HEAD_DOWN" -eq 1 ]]; then
  echo
  echo "== SetHeadAngle -22 (needs DevSquawkBoxTest active) =="
  callfunc SetHeadAngle -22 || true
fi

echo
echo "== Read-back =="
for k in \
  FeatureToEdit Lasers Viz AutoExp VisionSystem \
  LaserDetectionDebug Laser_DrawDetectionsInCameraView \
  DrawMirrorModeSalientPointsFor_ms \
  Laser_lowThreshold_normalExposure Laser_highThreshold_normalExposure \
  Laser_minRadius_pix Laser_maxRadius_pix \
  Laser_darkThresholdFraction_normalExposure Laser_darkSurroundRadiusFraction \
  Laser_MaxSurroundStdDev \
  Laser_saturationThreshold_red Laser_saturationThreshold_green \
  Laser_saturationBoundingBoxFraction
do
  printf '  %-42s %s\n' "$k" "$(getvar "$k")"
done

cat <<EOF

Wide set applied. Still required on the robot:
  1. Head DOWN so the camera sees the table (not faces/ceiling).
     If Behaviors stack is DevSquawkBoxTest, vision may be empty — force-run
     InitNormalOperation, then push the head down with a finger.
  2. Red or green pointer on the FLOOR.
  3. Watch syslog for [@VisionSystem] LaserPointDetector.Detect.FoundCentroid

Not ship. Tighten maxRadius 4000 → 80 → 40 → 25 after hits return.
EOF
