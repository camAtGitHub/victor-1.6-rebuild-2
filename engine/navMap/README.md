# navMap

**Path:** `engine/navMap`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** [`docs/architecture/map.md`](../../docs/architecture/map.md) — **primary reference**; planner consumption in [`planner.md`](../../docs/architecture/planner.md)

## What this is

Engine subsystem for the robot’s **2D navigation / memory map**: free space, cliffs, prox obstacles, vision edges, and footprints of observable objects. `MapComponent` (robot dependency-managed component) owns one or more `INavMap` instances keyed by pose origin; the sole concrete map is **`MemoryMap`**, implemented on an internal **`QuadTree`**.

## Why it exists

Path planning and exploratory behaviors need a spatial memory of “where have I driven / what blocks me?” BlockWorld tracks discrete marked objects in 3D; the nav map tracks **continuous planar occupancy/content** with decay and broadcast to Viz/Web/SDK.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `mapComponent.h` / `.cpp` | file | Robot component: sensor fusion into map, origin handling, collision queries, broadcast |
| `iNavMap.h` | file | Abstract map API (query + protected mutators; only friends like `MapComponent` mutate) |
| `navMapFactory.h` / `.cpp` | file | `NavMapFactory::CreateMemoryMap()` → `new MemoryMap()` |
| `memoryMap/` | dir | `MemoryMap` impl + `memoryMapTypes` + typed `MemoryMapData_*` (Cliff, ProxObstacle, ObservableObject) |
| `quadTree/` | dir | Spatial storage: `QuadTree`, `QuadTreeNode`, `QuadTreeProcessor`, types |

## Key entry points

1. **`MapComponent`** (`mapComponent.h`)
   - Init dep: `CozmoContextWrapper`
   - Update deps: **`Vision`**, **`BlockWorld`**
   - Ingest: `ProcessVisionOverheadEdges`, `AddDetectedObstacles`, `UpdateRobotPose`, `UpdateObjectPose`, `InsertData`
   - Origins: `UpdateMapOrigins`, `CreateLocalizedMemoryMap(worldOriginID)`
   - Queries: `CheckForCollisions`, `GetCollisionArea`, prox flags for planning
   - Outbound: `BroadcastMapToViz` / `ToWeb` / `ToSDK`
   - Accessors: `GetCurrentMemoryMap()` → `shared_ptr<INavMap>`

2. **`INavMap`** (`iNavMap.h`) — public queries (`AnyOf`, `GetArea`, `FindContentIf`, `GetBroadcastInfo`, explored area); protected `Insert` / `Merge` / `TransformContent` / `FillBorder` (friend `MapComponent`).

3. **`MemoryMap`** (`memoryMap/memoryMap.h`) — `INavMap` using `QuadTree` + `QuadTreeProcessor`; comment: “QuadTree map … with some memory features (like decay = forget).”

4. **`QuadTree`** (`quadTree/quadTree.h`) — mesh of known geometry; `Insert` / `Transform` / `Merge`; expands/shifts root to fit region up to max size (truncation when too large — upstream `map.md`).

5. **Content types** (`memoryMap/memoryMapTypes.h` `EContentType`):  
   `Unknown`, `ClearOfObstacle`, `ClearOfCliff`, `ObstacleObservable`, `ObstacleProx`, `ObstacleUnrecognized`, `Cliff`, `InterestingEdge`, `NotInterestingEdge`.

## MemoryMap vs QuadTree

| Layer | Role |
|---|---|
| **MapComponent** | Robot-facing policy: when to add cliffs/prox/objects, multi-origin maps, broadcast dirty flags |
| **INavMap** | Stable interface for queries/mutations without exposing storage |
| **MemoryMap** | Concrete nav map: decay/timeouts, content semantics, implements `INavMap` |
| **QuadTree** | **Storage only** — adaptive cells, split/merge, geometric fold operations; “shouldn't affect usage” (upstream) |

Factory always returns `MemoryMap` today (`navMapFactory.cpp`). Precision of cells: `GetContentPrecisionMM()` — upstream states **~1 cm** as of writing of `map.md`.

## Talks to

- Depends on: `RobotComponentID::Vision`, `BlockWorld` [CONFIRMED]
- Depends on: overhead edge frames, prox data, observable object poses [CONFIRMED via MapComponent API]
- Depended on by: path planning / `PathComponent` for obstacles [INFERRED from `map.md` + `SetUseProxObstaclesInPlanning`]
- Broadcast peers: Viz, WebViz, SDK via external interfaces [CONFIRMED method names]

## Build

Part of `cozmo_engine`. CLAD types for broadcast: `clad/types/memoryMap.h` (included from `memoryMapTypes.h`).

## Related root files

| File | Relation |
|---|---|
| `engine/pathPlanner.h` | Planners consume obstacle geometry; nav map is a major obstacle source |
| `engine/blockWorld/` | 3D object model; MapComponent update-depends on it and mirrors objects into 2D content |
| `engine/faceWorld.h` | Unrelated face world; same “per-origin” delocalize theme elsewhere in engine |

## Notable observations

- Multiple maps can exist per origin (`MapComponent` private `MapInfo` / `_navMaps`); current map follows robot origin.
- Mutation is intentionally gated through `MapComponent` so broadcast/dirty state stays consistent (`iNavMap.h` protected + friend).
- Prox obstacles can be toggled for planning (`SetUseProxObstaclesInPlanning`) or wiped entirely (`RemoveAllProxObstacles` — caution comment in header).

## Open questions

- [UNKNOWN] Exact max root size / truncation thresholds in `quadTree.cpp` (not re-read this pass; see upstream + source).
- [UNKNOWN] Full list of E2G/gateway messages used for SDK map broadcast.
