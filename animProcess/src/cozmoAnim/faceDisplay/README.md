# faceDisplay/

**Path:** `animProcess/src/cozmoAnim/faceDisplay/`  
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high  
**Upstream docs:** [`docs/architecture/proceduralFace.md`](../../../../docs/architecture/proceduralFace.md), [`docs/architecture/physical_vs_sim.md`](../../../../docs/architecture/physical_vs_sim.md)

## What this is

Face LCD path for Vector: double-buffered RGB565 frames, worker-thread draw, platform backends (VICOS LCD HAL vs Mac/Webots stub). Also owns the on-face **info/debug screen** stack (`FaceInfoScreenManager`) used for pairing, mic direction clock, factory, and rebuild FPS toggle.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `faceDisplay.{h,cpp}` | file | Singleton: `DrawToFace`, `StopBootAnim`, draw thread |
| `faceDisplayImpl.h` | file | Platform impl interface (`FaceDraw`, brightness, clear) |
| `faceDisplayImpl_vicos.cpp` | file | `lcd_init` / `lcd_draw_frame2` / `lcd_set_brightness` |
| `faceDisplayImpl_mac.cpp` | file | Simulator/host face surface |
| `faceInfoScreen*.{h,cpp}` | files | Debug/pairing/status screens over the face |
| `faceInfoScreenTypes.h` | file | `ScreenName` and related types |

## Draw path

1. **Producers** (anim tick thread): `AnimationStreamer` builds `Vision::ImageRGB565` (procedural eyes, sprite sequences, composite images, or engine image chunks) and calls `FaceDisplay::DrawToFace` (`animationStreamer.cpp` ~L1540).
2. **Gate:** if `FaceInfoScreenManager` is actively drawing a debug screen, normal eye draw is skipped (`faceDisplay.cpp` `DrawToFace` ~L137). Debug path uses `DrawToFaceDebug`.
3. **Double buffer:** `DrawToFaceInternal` copies into next free buffer (`_faceDrawImg[0|1]`), signals `_readyCondition`.
4. **Worker** `DrawFaceLoop` (~L169): waits for ready face; lazily constructs `FaceDisplayImpl` after boot anim stopped; calls `_displayImpl->FaceDraw(...)`.
5. **VICOS:** `faceDisplayImpl_vicos.cpp` → `lcd_draw_frame2(frame, WIDTH*HEIGHT*sizeof(u16))` using `FACE_DISPLAY_WIDTH/HEIGHT` from `cozmoConfig.h` (184×96 stock; 160×80 Xray).

## Boot animation handoff

- Separate process `vic-bootAnim` owns LCD until systemd stop.
- `MANUALLY_STOP_BOOT_ANIM` is `0` — stop is via `systemctl stop vic-bootAnim` from `FaceDisplay::StopBootAnim()` (~L244), with kill-9 fallback + fault code on failure.
- `AnimProcessMessages::Update` stops boot when cloud connected + engine loaded (`animProcessMessages.cpp` ~L1011+).
- Until `_stopBootAnim`, draw copies are ignored and impl is not created.

## FaceInfoScreenManager

- Initialized from `AnimEngine::Init` with streamer pointer.
- Handles calm power mode vs pairing screens (`Tag_calmPowerMode` intercept).
- Rebuild-specific: writes/deletes `/data/data/rebuild/using-30-fps` to switch anim tick 16↔33 ms (`faceInfoScreenManager.cpp` ~L544).

## Talks to

- **Depends on:** `robot_core` LCD (`core/lcd.h`) on VICOS [CONFIRMED]; `Vision::ImageRGB565` [CONFIRMED].
- **Depended on by:** `AnimationStreamer`, `animProcessMessages`, `FaceInfoScreenManager`, fault-code display [CONFIRMED].
- **Peers:** boot process `src/bootAnim/`; engine image/procedural CLAD → streamer → here [CONFIRMED].

## Notable observations

- Face draw is **asynchronous** relative to anim tick (worker + condition variable) — overruns on tick do not block LCD the same way.
- `SetFaceBrightness` uses CLAD `LCDBrightness` enum through impl.
- Mac vs VICOS file split selected by CMake platform (same pattern as other anim sources).

## Open questions

- [UNKNOWN] Exact Xray vs stock panel timing differences beyond resolution constants.
- [UNKNOWN] Full `ScreenName` catalog and which screens block eye draw.
