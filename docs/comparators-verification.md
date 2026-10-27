# Comparators and real container signals, v0.64

## Before implementation

1. Preserve signal strength across sources, strong/weak block power and wires in the existing solver, rather than adding an isolated binary comparator or a parallel analog network.
2. Keep normal facing/placement/use and support rules; the only new player choice is compare versus subtract, toggled by use interaction.
3. Read fullness from canonical world-owned chest, furnace and brewing inventories, using actual item/slot capacities; derive input and side levels from the current network.
4. Reuse the existing diode timer map and last published output state for the 0.1-second delayed transition. Sample current input at expiry; do not add a second saved pending target or UI invalidation protocol.
5. Verify real placement, inventory transfers while containers are open, workbench crafting and mined quartz, six directions, analog chains/feedback, save restoration, support/fluid removal and rendered geometry.

The smallest complete change extends the existing signal snapshot to numeric maps, adds one comparator block/mode/output and queries actual inventories from the same World that owns its simulation. Chest data currently lives beside World in main; move ownership into World and keep a UI alias instead of asking every UI/furnace mutation to notify a second container model. Cache the full current network in place of only wire levels, so unchanged topology can still schedule a comparator when its live inventory reading changes. Nether quartz ore/items complete the survival recipe with three torches and three stone, without substituting a different material.

## Failure modes specified before code

- Analog values are boosted to 15 when crossing a comparator or conductive block; smaller inputs replace larger ones; weak blocks incorrectly relay power back into wire.
- Facing is reversed, output drives the rear/sides, side containers/powered solids are treated as measured inputs, equal compare inputs fail, or subtract becomes negative.
- Empty/one-item/full storage, 64/16/1-item stacks, portable storage, three furnace slots or five brewing slots use the wrong denominator or stale inventory data.
- A comparator fails to read through one solid rear block, reads through glass/two blocks, or ignores the strong-15 override; blocked ordinary chest lids and stale records after removing a container produce wrong readings.
- UI transfers and automatic processing do not update the circuit; inventory views stop diode timing, while Esc should still pause it.
- Delays run recursively in a single solve, unloaded devices advance, a mode change adds a new delay setting, or a save loses the old output and remaining pending time.
- Invalid output/mode/mount fields or comparator timers are accepted on unrelated blocks; removed devices retain timers or contents duplicate during world travel.
- Quartz does not naturally generate, can be harvested bare-handed, has no held/drop/icon appearance, or has wrong Fortune/Silk/XP/smelting behavior; real crafting skips the workbench or ingredients.
- Comparator model, direction arrow and three torches do not distinguish mode/output, or shader/input testing captures the native desktop cursor.

## References

Minecraft's [comparator introduction](https://www.minecraft.net/en-us/article/taking-inventory--redstone-comparator) and [official redstone guide](https://learn.microsoft.com/en-us/minecraft/creator/documents/redstoneguide?view=minecraft-bedrock-stable) describe compare/subtract, containers and the quartz recipe. [Cuberite's primary comparator implementation](https://github.com/cuberite/cuberite/blob/master/src/Simulator/IncrementalRedstoneSimulator/RedstoneComparatorHandler.h) provides a cross-check for normalized slot fullness and delayed re-evaluation. Code, six-way geometry and quartz artwork are independently implemented; no upstream code or new downloaded asset is included.

## Results

The first production browser scenario failed before implementation because the comparator item did not exist. After implementation, five new headless Chrome scenarios pass through normal placement, ray targeting, mouse/touch use, actual slot transfers, workbench crafting, mining, pickup, dimension travel and Continue. Two fixture corrections were necessary: normalize hex negative zero when comparing aimed coordinates, and check the furnace status rather than a zero-width empty progress bar. Neither correction bypasses gameplay.

The normalized JSON artifacts record:

- `chest-mode.json`: three real stone-stack transfers produce output 2 and wire tail 1; emptied storage produces 0. Nether travel uses a separate canonical inventory map and returning restores the original filled chest/output. Compare/subtract mode survives Continue.
- `arithmetic.json`: rear input 10 and side inputs 7/4 give compare output 10, or subtract output 3; the front conductive block preserves these values and the next wire attenuates to 9/2. High-preset screenshots show the real three-post geometry and wire rendering.
- `processing.json`: a real lava-bucket transfer gives signal 5; inserting quartz ore starts the furnace, leaves an empty bucket and changes output to 1 while the inventory stays open. The quartz is smelted and removed with the bucket, taking output to 0. Esc freezes remaining burn time.
- `survival.json`: a naturally generated Nether ore is mined, its quartz and XP collected, then three torches and the workbench-only comparator are crafted through actual UI. The placed comparator is mined and collected with zero ingredient remainder.
- `touch-support-water.json`: touch use toggles modes, native Pointer Lock remains absent, and support loss / water remove two devices while preserving their total item count.

Eight new Node scenarios use the production World, network, timers, save validator, inventories, furnace/brewing processors, mining and crafting. They cover every output value in six directions across a negative chunk seam; equality, maximum side input and saturated subtraction; empty/one-item/full storage and 64/16/1 stack capacities; portable storage versus blocked ordinary lids; stale records; three furnace and five brewing slots; one rear conductor versus glass/two blocks and strong-15 override; analog relay versus repeater boosting and weak-power isolation; delayed chains and a real three-comparator feedback oscillator; unloaded pending output and restored slots; malformed mode/output/mount/timer records; and quartz generation, tool gating, Fortune/Silk/XP, smelting and station crafting.

All **63 Node scenarios**, the production build and **14 browser scenarios in one final batch** pass. The browser batch contains the five new comparator cases, four existing diode cases, four existing redstone cases and the graphics case across three dimensions / three presets. The graphics listener reports no page or console errors. Prettier checks all changed formatted sources/docs/tests, and `git diff --check` passes.

With `$env:PLAYWRIGHT_CHANNEL='chrome'`, the normal repository command is `npx playwright test tests/comparators.spec.js tests/diodes.spec.js tests/redstone.spec.js tests/graphics.spec.js --timeout=180000`. This session used the same test files, browser fixture and production Vite app through an external HMR-disabled server configuration on `127.0.0.1:5174`, to keep background verification independent of the existing dev server. No product runtime flag was added. All tests ran headlessly with SwiftShader; desktop Pointer Lock is emulated only at the browser/device boundary, and no foreground computer-use action occurred.

Evidence is preserved at `C:/Users/aentrozhou/.codex/visualizations/2026/10/26/01a176f8-8115-7010-9745-1dfe66ad81af/comparators-0.64/`: `baseline/` contains the pre-implementation failure, `five-pass/` contains the first five passing scenarios, and `integration-fourteen/test-results/` contains the final batch. Four inspected images show compare/subtract models, naturally generated quartz, and the real workbench recipe. Earlier images in `first-four/` include a transient dimension/recipe notice; the final batch waits for those notices before capture.

## Implementation and limits

The current solver owns numeric `levels`, `strong`, `weak` and `direct` maps. Source emission, rear sensing and the published wire state share those values; no parallel analog solver is added. The cached full snapshot replaces the old wire-only cache. When topology is unchanged, comparators sample actual container slots against that snapshot and schedule the existing 0.1-second timer only if the derived output differs. Expiry reads current inputs; all due devices observe one pre-transition snapshot, and later stages are scheduled after publishing that batch. There is no separately saved target or recursive fixed-point search. A feedback oscillator therefore consumes simulation time.

World now owns chest inventory alongside furnaces/brewing; main keeps an alias for its existing UI and drop handlers. Dimension capture, travel and saves use that same owner, and the save fixture uses its real serializer. Filled slots use `sum(count / stackSize) / slotCount`; any nonempty container outputs `floor(1 + 14 * fullness)`. Furnace burn/XP and brewing charges/progress do not occupy slots. Ordinary chest lids must be unblocked; portable-storage readings ignore lid clearance. A removed container is not read even if a stale map entry has not yet been spilled.

A direct rear container takes precedence over block power. Otherwise one complete conductive rear block can expose a container one cell farther back, unless its existing signal is 15. Side input accepts adjacent dust or an aimed repeater/comparator only; side containers and powered solids do not become measured side signals. The six-way grid has four off-axis neighbors. Double chests, hoppers, other measurable blocks, Java/Bedrock-specific update priorities and quasi-connectivity are outside this implementation.

The comparator persists only optional `subtract` and last published `output`; a duplicate powered flag is rejected. Current v16 files remain readable, no required field or migration is introduced, and pending timers use existing serialized records. Removing a component clears its timer through the normal World mutation path. Mode is the only new player choice, with no delay setting or global option.

The slab, output arrow and three torches share world/ray/held/drop/icon geometry. Two rear tips show nonzero output; the front tip rises/lights in subtract mode independently of output. Dust connects to comparator inputs on all horizontal sides. Quartz uses an original pixel shard plus independently drawn mineral veins over the existing licensed netherrack tile; held items, drops, UI and terrain use the same artwork. Nether terrain generation remains deterministic, and saved edits continue to override natural ore. No new downloaded asset or dependency is introduced.

This iteration changes no Photon shader algorithm. Existing high-preset TAA, exposure, colored voxel light and atmosphere render the new circuit normally. Browser evidence is software-rendered Chrome; it is not a full historical-suite or physical-GPU performance acceptance.

## Design review

Review covers every changed hunk, the full redstone solver/data/shapes and both new comparator test files. Unchanged portions of large main/world/save/icon/texture files are not reviewed as complete modules. The numeric cache replaces existing ownership, containers have one canonical owner, and mode/output/timers represent player intent or past simulation rather than redundant derived flags. No general observer framework, compatibility solver, test-only product command, dependency or runtime switch is added. Net growth is product code/UI +246 lines, tests +1002, documentation +73 and configuration 0 (version/test-command values change). Test growth covers real rays, slot UI, dimension ownership, processing, mobile use, mining/crafting, numeric boundaries, timer snapshots and corrupt-save rejection; it adds no test framework or product-only seam.
