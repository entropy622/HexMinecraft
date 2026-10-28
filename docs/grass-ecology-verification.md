# Grass ecology verification

## Design gate before implementation

1. Structural: random ticks cover natural, player-placed, and sheep-grazed grass/dirt through the same real world entry.
2. Burden: there are no new player settings, save fields, save versions, or caller-selected algorithms.
3. Determinable: loaded chunks, cover shapes, fluids and static voxel light already provide the required facts.
4. Gratuitous: one maintenance function uses existing world mutation and batched terrain refresh; no grass index, event queue, or second light solver is needed.
5. Overfitted: the rule applies to all loaded grass and dirt, including negative chunk seams and artificial underground pastures.

The smallest change is bounded random sampling in the existing one-second plant maintenance call. Checking only edits would omit natural grass; scanning every dirt/grass block would add work proportional to terrain volume. Changing `World.set` callers or sheep grazing would duplicate rules.

## Primary evidence and adaptation contract

- [Mojang, Block of the Week: Grass](https://www.minecraft.net/en-us/article/block-week-grass), 2017-10-06, documents adjacent dirt spreading after a delay, sheep grazing for wool, and grass dying under cover/water.
- Exact Java rule checked by static bytecode inspection of Mojang's official **1.21.5 server**, not execution: [server JAR](https://piston-data.mojang.com/v1/objects/e6ec2f64e6080b9b5d9b471b291c33cc7f509733/server.jar), SHA-1 `e6ec2f64e6080b9b5d9b471b291c33cc7f509733`; [official mappings](https://piston-data.mojang.com/v1/objects/f4812c1d66d0098a94616b19c21829e591d0af3a/server.txt), SHA-1 `f4812c1d66d0098a94616b19c21829e591d0af3a`. `SpreadingSnowyDirtBlock` maps to `dvp`; `canBeGrass` lines 21–34, `canPropagate` lines 41–42, `randomTick` lines 47–62. Local scratch evidence is in `test-results/grass-official-source/grass-bytecode.txt` and is reproducible using `javap -c -p dvp` on the bundled server JAR.
- Observed constants/branches: opaque downward occlusion or fluid amount 8 kills grass; one snow layer is exempt; darkness with air alone does not kill grass. A surviving source requires raw light **9** above it; it tries **four** dirt destinations with horizontal offsets −1…+1 and vertical offsets **−3…+1**. Destination survival and water are checked; there is **no destination light-4 threshold** in this version.
- Hex adaptation uses the source column plus **six** face-neighbor columns, retaining −3…+1 height and four independent attempts. It does not reproduce square diagonals. The 8×8×64 chunk is 4096 cells; 60 samples per active second preserves the default Java random-tick mean of roughly 68 seconds per cell. Rates are batched to the existing one-second maintenance cadence, not a Java server tick simulator.
- Reuse the existing static sky/RGB field, excluding held lights. The existing 600-second day/night convention attenuates sky at night by 11; rain/thunder attenuate daytime contribution using Java's 5/16 factors, without changing true block light. This retains the game's half-cycle day/night convention rather than simulating Java's solar angle. Unready/stale light defers this maintenance pass instead of forcing a rebuild.
- Cover support consumes existing optical cost and actual `buildingParts` polygons, not a second slab/stair orientation table. Optical cost 1, glass/foliage/non-solid decorations transmit; full cubes and full lower faces of bottom/double slabs, bottom stairs and closed bottom trapdoors obstruct. Bottom polygons in the current catalog partition the face; their combined area determines coverage. The game has full snow blocks, not Java's one-layer snow. Source/falling fluids count as full fluid; any destination liquid (including this game's custom glow liquid) prevents spreading.
- The separately implemented carpets must retain optical cost 1 even though their collision footprint is complete. The official 1.21.5 `CarpetBlock`/`WoolCarpetBlock` inherit `BlockBehaviour.useShapeForLightOcclusion=false`; `LightEngine.isEmptyShape` consequently treats them as optically empty. Thus a carpet permits the grass below to survive and receive spread. This is a static observation from `doh`, `dya`, `ebp`, `exr`, not an inference from carpet height. Scratch disassembly files beside the grass evidence preserve these checks; no Mojang JAR, mappings or decompiled code is committed.
- State changes use `World.set` immediately, so competing sources see the first conversion and duplicates are not emitted. A single `graphics.updateCells` call refreshes affected chunks. Existing v16 edits preserve results through export/import and chunk unload/reload. No offscreen catch-up or new timer is persisted.

## Complete failure classes, listed before code

1. Propagation: no source, wrong soil, all six directions, same column, gap-jumping, y−3/y+1 included, y−4/y+2 and horizontal distance 2 excluded; first and fourth random attempts; two sources targeting one dirt; converted dirt must not convert twice.
2. Cover: air, glass, leaves, flowers/torches/fences, opaque full cube, lower/upper/double slabs, lower/upper stairs, lower/upper/open trapdoors, full snow; state changes must take effect without replacing the cover block.
3. Light: source level 8/9 boundary, unlit cave and exposed day/night, target allowed below 4, placed torch restoration/removal, held-light exclusion, a different-world or stale/uninitialized light field must not authorize growth.
4. Fluids: source/falling/flowing water, source lava and custom glow, a water-covered target, water removed; grass/dirt changes must not erase liquid state.
5. Scheduling and resources: zero/negative/nonfinite delta, fractional maintenance steps, no chunks, loaded chunks only, bounded attempts proportional to active time/chunk count, no full block-map traversal, no light rebuild, no skipped post-update render refresh. One grass pass cannot use terrain occlusion invalidated by a cover change in that pass.
6. Streaming and persistence: positive/negative seams, source or target unloaded, return to chunk, fresh `World` from v16 serialization, no growth while paused/in menus or while the region is unloaded, no backlog burst after resume.
7. Product integration: a real imported pasture and normal animation/maintenance loop regenerate sheep-grazed dirt; actual right-click cover placement kills grass and removing cover permits recovery; visible mesh/material, raycast and collision match block state; continue/import retain the outcome; no browser console/page errors.

## E2E scenario prepared before implementation

`tests/grass-ecology.spec.js` imports a pasture through the normal save-file UI, resumes gameplay and observes actual maintenance without calling the ecology function. It uses the existing `browser-fixture.js` pointer-lock boundary, never native mouse control, and saves a normalized manifest/screenshots. The pasture is built from a current production serialization; sheep and save structures come from the actual running game. Browser execution is deferred until the parent grants the serial GPU test window. Separate Node checks exercise the actual `World`, `VoxelLight`, shape state, serializer and randomness boundary for numerical/scheduling cases.

## Delivery evidence

- `node --test tests/grass-ecology.test.js`: **8/8 passed**, using production World/VoxelLight/shape/state/save modules and controlled host randomness.
- Existing `npm test`: **123/123 passed**. The parent owns adding the independent test file to package.json.
- `node --check` passed for grass module, integration entry and browser scenario; Prettier check and `git diff --check` passed.
- Every changed/new file was read line by line: `src/grass.js`, the three inserted main.js lines, both grass test files and this document. No new player options, saved state, dependencies, alternate implementations, test-only product branches, or compatibility routes were added. The private polygon area helper measures existing geometry; no duplicate orientation rules or new shape metadata were added.
- Net lines by area: product **+104**, tests **+462**, documentation **+45**, configuration **0**. Product growth is the bounded random-tick rule plus 3 integration lines; test growth covers the enumerated boundary classes and a real import/interaction/continue scenario.
- **Browser/GPU verification remains pending** the parent's serial test window. No browser, Vite server or foreground mouse control has been started in this worktree. The E2E leaves `grass-ecology.json` and `covered-pasture.png` under its Playwright output directory when run.
