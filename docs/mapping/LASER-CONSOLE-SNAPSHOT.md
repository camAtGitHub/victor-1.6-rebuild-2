# Laser detector console snapshot — first FoundCentroid streak

**Robot:** `192.168.50.189` (`vic-engine` pid 955)  
**Polled:** 2026-09-13 (HTTP `/consolevarget`)  
**Why:** first sustained `[@VisionSystem] LaserPointDetector.Detect.FoundCentroid` hits (~03:39–03:40).  
**Not ship settings.** Wide-open debug that *reports* points. `maxRadius_pix=4000` + sat −1 + ring radius 0 will also fire on huge floor patches (one hit was **54204 px**).

Head must be **down**. A prior `BadProjectedZ` at **42.3°** was a valid blob that failed ground homography (look-up).

## Live values (poll)

| Console var | Live | Stock (C++ default) |
|---|---:|---:|
| `Lasers` (VisionMode) | **true** | false |
| `VisionSystem` (log channel) | **true** | VicOS filter **false** |
| `LaserDetectionDebug` | **2** | 0 |
| `Laser_DrawDetectionsInCameraView` | **true** | false |
| `Laser_scaleMultiplier` | 2 | 2 |
| `Laser_lowThreshold_normalExposure` | **70** | 235 |
| `Laser_highThreshold_normalExposure` | **80** | 240 |
| `Laser_lowThreshold_darkExposure` | 128 | 128 |
| `Laser_highThreshold_darkExposure` | 160 | 160 |
| `Laser_minRadius_pix` | **1** | 2 |
| `Laser_maxRadius_pix` | **4000** | 25 |
| `Laser_darkThresholdFraction_normalExposure` | **1.0** | 0.9 |
| `Laser_darkThresholdFraction_darkExposure` | 0.7 | 0.7 |
| `Laser_darkSurroundRadiusFraction` | **0** | 2.5 |
| `Laser_MaxSurroundStdDev` | **25** | 25 |
| `Laser_saturationThreshold_red` | **−1** | 30 |
| `Laser_saturationThreshold_green` | **−1** | 15 |
| `Laser_saturationBoundingBoxFraction` | **4.0** | 1.25 |
| `FeatureToEdit` | 0 (Invalid) | 0 |

**On-disk `features.json` via HTTP** still showed `"Laser": false` at poll time. Detections prove **in-memory** `FeatureType::Laser` is on (`Lasers` mode + gate). Reboot can drop the gate unless the override file / scp’d json is true. **This tree** `resources/config/features.json` Laser is **true**.

## Example hits (03:39)

```
Found 51.0-pixel  @ (155.8, 57.7)
Found 49.0-pixel  @ (157.1, 66.3)
Found 54204-pixel @ (51.4, -21.8)    ← size cap off; ignore as “laser”
Found 4810-pixel  @ (101.3, 4.7)
Found 24.0-pixel  @ (79.3, -28.2)
Found 34–110 px   later, y often negative (ground frame)
```

## What made logs visible

`VisionSystem=true` un-mutes `PRINT_CH_INFO` `FoundCentroid`. VicOS `console_filter_config.json` has that channel **off** by default.

## Refine from here (do not lose hits first)

1. `Laser_maxRadius_pix` 4000 → **80 → 40 → 25** until 5k–54k blobs die and ~20–110 px remain.  
2. Saturation −1 → **0 → 10 → 20 → 30/15** if white glare.  
3. Ring radius 0 → **0.5 → 1.0** only after size is sane.  
4. Brightness 70/80 → **up** toward 180/220 only if the pointer still fires.  
5. Keep `MaxSurroundStdDev` **≥ 25**. 10 was only useful as a reject-log probe.

## Re-apply (if engine restarts)

Console vars (except feature override file) reset. Minimum to see hits again:

```
Lasers=true
VisionSystem=true
LaserDetectionDebug=2
Laser_DrawDetectionsInCameraView=true
Laser_lowThreshold_normalExposure=70
Laser_highThreshold_normalExposure=80
Laser_minRadius_pix=1
Laser_maxRadius_pix=4000
Laser_darkThresholdFraction_normalExposure=1.0
Laser_darkSurroundRadiusFraction=0
Laser_MaxSurroundStdDev=25
Laser_saturationThreshold_red=-1
Laser_saturationThreshold_green=-1
```

Plus Laser **feature gate** on (`EnableFeature` with `FeatureToEdit=Laser`, or `features.json`). Head down.

Related: `docs/mapping/TRACK-LASER-PLAN.md`
