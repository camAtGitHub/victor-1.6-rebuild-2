# blockWorld

**Path:** `engine/blockWorld`
**Mapped:** 2026-07-28   **Depth:** L2   **Confidence:** high
**Upstream docs:** [`docs/architecture/blockWorld.md`](../../docs/architecture/blockWorld.md) — **primary reference**; also [`observableObjects.md`](../../docs/architecture/observableObjects.md), [`poses.md`](../../docs/architecture/poses.md)

## What this is

Robot dependency-managed component that stores **observable objects** with markers: light cubes, charger, SDK custom objects. Tracks **located** instances (have pose, per origin/frame) separately from **connected** active objects (radio heard, may lack pose). Provides filter-based queries, object lifecycle (add/update/delete), and origin **rejigger** bookkeeping when the robot re-localizes.

## Why it exists

Behaviors, docking, path clearance, and cube light/motion control need a consistent world model of “where are the cubes/charger?” Without BlockWorld there is no shared, origin-aware object catalog — each subsystem would re-implement vision/BLE fusion.

## Contents

| Entry | Type | What it is |
|---|---|---|
| `blockWorld.h` / `.cpp` | file | `BlockWorld` component: markers → poses, connected vs located containers, queries |
| `blockWorldFilter.h` | file | Header-only query filter (origins, types, IDs, custom predicates) |

Related types live at engine root / coretech (not this folder): `engine/block.h`, `charger.h`, `customObject.*`, `cozmoObservableObject.*`, `coretech/vision/.../observableObjectLibrary`.

## Key entry points

Read **`docs/architecture/blockWorld.md` first**, then:

1. **`BlockWorld`** (`blockWorld.h`) — `IDependencyManagedComponent<RobotComponentID>` + `UnreliableComponent<BCComponentID>` so BehaviorComponent can access it without a hard dep cycle.
2. **Update deps** — `GetUpdateDependencies`: `CubeComms`, `Vision`. Init needs `CozmoContextWrapper`.
3. **`UpdateObservedMarkers(list<ObservedMarker>)`** — vision markers → object pose updates.
4. **Connected path** — `AddConnectedBlock(activeID, factoryID, type)` / `RemoveConnectedBlock`; query via `GetConnectedBlockByID` / `ByActiveID` / `FindConnectedMatchingBlock(s)`.
5. **Located path** — `AddLocatedObject`, `SetObjectPose`, `GetLocatedObjectByID`, rich `FindLocated*` APIs, `DeleteLocatedObjects(filter)`.
6. **Origins** — `OnRobotDelocalized(newWorldOriginID)`; charger-based localization / rejigger described in upstream doc (Vector uses charger, not cube, for localization).
7. **`BlockWorldFilter`** (`blockWorldFilter.h`):
   - Allow/ignore sets for **IDs**, **ObjectType**, **PoseOriginID**
   - `OriginMode`: `InRobotFrame` (default), `NotInRobotFrame`, `InAnyFrame`, `Custom`
   - `FilterFcn` list; static helpers: `PoseStateKnownFilter`, `ActiveObjectsFilter`, `UniqueObjectsFilter`, `IsLightCubeFilter`, `IsCustomObjectFilter`
   - Rule: cannot be in ignore set; allowed set empty ⇒ all allowed, else must be in allowed

## Filters, origins, located vs connected

Summary of upstream `blockWorld.md` verified against headers:

| Concept | Meaning |
|---|---|
| **Located** | Object has estimated pose; stored **per origin**; comparable only within same frame |
| **Connected** | Active (BLE) object heard over radio; lights/motion usable **without** pose |
| **Unique objects** | One of type (cubes, charger); matched by type; type↔ObjectID 1:1 |
| **Passive / non-unique** | Matched by pose; runtime ObjectID; imperfect under drift |
| **Rejigger** | Re-observe localizable object (charger) from prior origin → merge frames |
| **Zombie origin** | No localizable objects left; kept for pose-tree validity |

## Talks to

- Depends on: Vision markers, CubeComms, `ObservableObject` hierarchy, pose origins (`PoseOriginList`) [CONFIRMED via headers + upstream doc]
- Depends on: External interface for observation broadcast messages (e.g. `RobotObservedObject`) [INFERRED from fwd decls in header]
- Depended on by: `MapComponent` (update dep on BlockWorld), docking/cube components, behaviors [CONFIRMED MapComponent; others [INFERRED]]
- Sibling world models: `engine/faceWorld.h`, `engine/petWorld.h` (faces/pets, not marker objects)

## Build

Part of `cozmo_engine`.

## Related root files

| File | Relation |
|---|---|
| `engine/faceWorld.h` | Parallel “world” for faces; same UnreliableComponent pattern; origin update/delocalize hooks |
| `engine/pathPlanner.h` | Planning consumes obstacles/object poses; BlockWorld objects can feed nav map / clearance, not owned here |
| `engine/navMap/` | 2D memory map of free/obstacle space — **separate** from BlockWorld’s 3D object poses (see `docs/architecture/map.md`) |

## Notable observations

- Name is historical: designed for many Cozmo blocks; Victor’s object set is small but storage/filter machinery remains.
- Vector rarely stays BLE-connected to cubes → cube less useful for localization than on Cozmo (upstream).
- BCComponents cannot declare a hard dependency on BlockWorld (updated at same level as BehaviorComponent); they use `UnreliableComponent` access.

## Open questions

- [UNKNOWN] Full list of message handlers subscribed inside `blockWorld.cpp` (not fully read this pass).
- [UNKNOWN] Rebuild-specific deltas vs stock Anki 1.6 for cube connection policy (see `CHANGES.md` if present).
