# Cave ecology, v0.58

## Before implementation

1. Hanging plants belong in the existing block, item, shape and lighting systems. Bats belong in Fauna, with one species-specific flight routine and original model.
2. Callers supply world cells and elapsed simulation time. No new settings, registries, save versions or generic entity framework are needed.
3. Berry state is the block type. Loaded plant cells are a derived index, rebuilt during chunk loading. Bat roost and steering state are transient.
4. A small hanging-plant module handles attachment, growth, harvesting and support loss. Existing plant mesh refresh and drop handling are shared. One bounded particle buffer owns the flower ambience.
5. Verification uses real seeded worlds, actual interaction rays and existing Fauna. Randomness is controlled only at its boundary for rare growth/roost cases; native Pointer Lock remains mocked to protect the desktop cursor.

## Failure modes to exercise

- Natural decorations must be deterministic across chunk order and preserve cave routes.
- Harvesting removes berries, not the vine; bone meal ripens exactly one segment. Seeds attach underneath a ceiling or vine, never float.
- Breaking an attachment or flooding a chain removes unsupported segments without duplicating fruit. Empty vines have no item drop.
- Growth stops at occupied cells, world bounds and the maximum chain length. Unloaded cells do not tick; saved edits survive reload.
- Berry emission must disappear after harvesting. Flowers have particles, not light emission.
- Bats spawn only near underground chambers, respect loaded solid/fluid boundaries, roost, wake nearby, and grant no loot or XP. They do not inflate saved animal records.
- GPU resources and world reset must remain bounded; browser validation must not use native cursor locking.

## Results

- Baseline browser scenario failed on the old build: no `caveVinesBerries` cells existed in the loaded lush cave. The same scenario now harvests an actual generated vine through the targeting ray and picks up its fruit.
- `npm run check`: 37 logic scenarios and the production build passed. Existing cave traversal checks still cover 37 chambers across seeds 624, 129 and 404, and chunk-order equality now also includes the new decorations.
- Five ecology scenarios cover chain collapse, flood destruction, no duplicate drops, save validation/restoration, slab attachment faces, growth limits, unloaded chunks, colored light removal, bat roost/wake/flight collision, zero loot/XP, transient animal records, fluid body clearance and particle resource reuse after world reset.
- Browser planting checks passed using real rays: seed under a stone ceiling, consume one bone meal, harvest and remove the emitter, suspend a flower without light, preserve edits after a validated v15 reload, then mine the supporting ceiling and observe the vine disappear.
- Natural-cave evidence contains two resting bats, one harvested berry in inventory and 48 active flower particles. The later interaction check approaches a resting bat and verifies takeoff and movement.
- During verification, fixed early abandonment of a roost target, movement trapped under a stepped ceiling, and stale entries in the render emitter map after berry harvesting. Test fixtures also needed the existing tuple-based graphics update API and actual slab identifiers.

## Implementation limits and ownership

Vine growth uses a memoryless average 90-second opportunity per loaded tip and a 26-segment limit, rather than reproducing Minecraft random-tick internals. Berry state is encoded in block IDs, so current v15 saves remain valid and no migration is required. Harvested segments do not spontaneously ripen again; bone meal ripens them, and new growth may bear fruit.

`hangingPlants` is a derived loaded-cell index needed to avoid scanning all blocks each frame. It is maintained on edits, generation, unload and world clear. Bat `resting`, `flightTarget` and `roostTarget` fields describe temporary steering and animation; existing `think`/`flee` timers are reused. Bats naturally repopulate near underground cave descriptors, capped at eight nearby; seasonal spawning and exact vanilla light thresholds are not simulated. Their visual wing span is wider than the body collider.

The single `CaveAmbience` owner holds one geometry, material and points object for at most 128 particles and eight nearby flowers. World reset clears its draw range and sources; it reuses these resources across resets. Original bat meshes use the existing MobRig batching and disposal path. All new plant meshes use existing chunk rebuilding and geometry disposal, and the 16px berry canvas is shared by UI, held item and dropped item sprites.

The visuals extend the existing colored voxel lighting, eye adaptation and scattering; this iteration adds no new Photon reflection algorithm. References: [official cave-plant behavior](https://www.minecraft.net/en-us/article/caves---cliffs--part-i-out-today-java), [official bat behavior and lack of loot](https://www.minecraft.net/en-us/article/bat). Geometry, pixels and code were authored locally.

Six distinct browser scenarios passed in batches: four new ecology cases, existing cave exploration/mining/building/restoration, and existing cross-dimension/quality rendering. The mobile case uses a 390x844 touch device with no pointer lock; the desktop cases use the existing browser-boundary Pointer Lock mock. The hungry-player fixture is inserted into the next document before the normal Continue validation because the live game's beforeunload hook correctly saves its current state. Actual held use raises hunger from 16 to 18 and consumes one berry; holding Space inside the chain raises the player more than 0.8 blocks.

All changed files pass scoped Prettier checking and `git diff --check`. Repository-wide Prettier checking reports two unchanged upstream attribution files, `public/textures/VOXELIBRE-CREDITS.md` and `public/textures/VOXELIBRE-LEGAL.md`; their contents were preserved. The build retains the pre-existing large-bundle warning (1,227.71 kB minified JS).

Evidence is kept outside the repository under the task's `cave-ecology-0.58` visualization folder: `lush-ecology.png`, `ecology.json` and `food-and-climbing.json`. Final capture and visual inspection completed: hanging silhouettes, fruit, flower and bat are visible against the cave, with warm berry lighting and cooler stone. The captured climb moves the eye from 41.65 to 43.83656; hunger ends at 18 and one berry remains. Full changed-file and newly added module review completed.

Net added lines by area: product 646, tests 582, documentation 54, configuration 0. New state is limited to loaded-cell indexing, temporary steering and owned GPU resources described above; no new dependency, option, save field or framework was introduced.
