# Redstone inversion and repeaters, v0.61

## Before implementation

1. Extend the existing six-way power solver and simulation timers so delayed components participate in actual circuits, including loops, rather than adding a separate demonstration circuit.
2. Players choose repeater orientation and one of four delays. Signal strength, rear input, side locking, torch inversion and emitter state are derived from placed geometry and current signals.
3. Reuse `redstoneTimers` for pending transitions. Repeater delay is a block state; torch burnout history/cooldown must persist and freeze with unloaded regions. New save data requires v16, with the old browser key preserved and no migration path.
4. Keep source direction and strong/weak propagation in the existing solver. One network snapshot per transition batch avoids iteration-order-dependent same-step feedback. Existing shapes, icons, item meshes, mining and colored light handle presentation.
5. Verify real placement/use/mining/save routes in the browser first, then isolated timing/direction/loop cases through `World` and its production redstone solver. The browser fixture prevents native Pointer Lock; no foreground mouse automation is used.

The smallest complete change adds redstone torches and repeaters to the current power graph. A visual model or unconditional powered block would not supply inversion, pulse extension, isolation or delayed feedback. No new dependency or user setting is needed.

## Failure modes before implementation

- A torch powers its own attachment, inverts immediately, fails to extinguish its actual colored light, or loses cooldown across save/unload.
- A repeater reads side/front input, outputs backwards, loses strength over long wires, or leaks power through weakly powered blocks.
- Delay changes are visual only; chained delays collapse into the same step; short on pulses vanish or short off pulses incorrectly extinguish output.
- Side locking accepts dust/torches, ignores direction, loses a stored on/off state, or delivers stale pending transitions when unlocked.
- Oscillators run infinitely inside a solver call; torch burnout depends on browser frame rate or burns unrelated torches.
- Components float after support removal, survive flooding, cannot be crafted/held/mined/picked, or restore timers without matching blocks.
- Invalid delays, timers, duplicate/orphaned burnout records or oversized cooldown/history data pass save validation.

## Reference

Minecraft's [official redstone guide](https://learn.microsoft.com/en-us/minecraft/creator/documents/redstoneguide?view=minecraft-bedrock-stable) describes torch inversion, strength restoration, directional repeater output, adjustable 1–4 redstone tick delay and short-pulse extension. This project adapts horizontal placement to six directions and implements the solver and geometry independently, reusing the existing licensed wood/stone textures and original redstone tiles.

## Results

`npm run check` passes all **50** Node scenarios and the production build. Seven new production-`World` scenarios cover all six orientations at negative chunk seams, strength-one input restored to 15, all four delays, short on/off pulses, summed chain delays, both locked states, a real feedback oscillator, unrelated torches, colored-light removal, unloaded clocks, save restoration, actual-slot crafting, and malformed save records.

**Eleven distinct browser scenarios pass**, in two batches, using installed Chrome headlessly with SwiftShader at `http://127.0.0.1:5173`. Four new scenarios enter through actual crafting UI, relative view/rays, mouse/touch handlers, mining/pickup and Continue. Existing redstone scenarios cover wall/ceiling controls, dust, lamps and actual lit geometry, blocked doors, pressure plates, button/menu timing, support loss and water. The graphics scenario covers three dimensions and three presets; two additional scenarios cover v16 player-state validation and hungry-player/vine restoration.

The new results are normalized JSON, not screenshots alone:

- `interaction.json`: a placed wall torch drives wire and a player-placed repeater/lamp; powering the attachment extinguishes the torch and its light. Repeater delay 2 and the one unused torch survive reload. The screenshot uses the light-effects preset, including TAA.
- `survival-crafting.json`: two logs + three redstone + three stone become one repeater through two torch crafts and a workbench-only recipe. The placed repeater is mined and collected, with zero ingredient remainder and one repeater in inventory.
- `touch-support-water.json`: actual touch interaction cycles delays `[2,3,4,1]`, reports no native Pointer Lock, then support removal drops a repeater and water removes a torch.
- `lock-burnout.json`: an actual side repeater holds a lit output when rear input turns off; unlocking releases it. A separate real feedback loop burns out, its cooldown stays identical in the pause menu and stored save, and resumes after Continue. Removing its feedback wire allows recovery after cooldown.

Browser commands (PowerShell, with `$env:PLAYWRIGHT_CHANNEL='chrome'`):

```powershell
npx playwright test tests/diodes.spec.js tests/redstone.spec.js tests/graphics.spec.js --timeout=150000 --reporter=list
npx playwright test tests/controls.spec.js tests/cave-ecology.spec.js -g 'Ctrl and double forward sprint|berries feed' --timeout=150000 --reporter=list
```

`tests/browser-fixture.js` replaces only the native Pointer Lock boundary before application startup. The touch context uses real mobile browser events and reports a null lock element. No foreground desktop mouse automation is used. The tests exercise existing production composition; no diode-specific debug command, timer override or fake solver was added. An initial redundant registry-presence assertion was removed once actual crafting/placement covered availability. Aim synchronization checks both cell coordinates and type so an old stone target cannot satisfy a new placement's wait.

Screenshots and normalized JSON are preserved at `C:/Users/aentrozhou/.codex/visualizations/2026/10/26/01a176f8-8115-7010-9745-1dfe66ad81af/diodes-0.61/`. `integration-nine/` contains the four new scenarios, four existing redstone scenarios and graphics; `save-regression/` contains the two v16 checks. This does not constitute a full historical-browser or physical-GPU performance acceptance.

## Implementation and limits

Directional source emission is shared by network solving, rear sensing and side locking. The existing strong/weak propagation and wire queue remain authoritative. All due component transitions read the same pre-transition network snapshot; after applying that batch, one new snapshot schedules future work. Clocks therefore advance with simulation time rather than recursively oscillating inside a solve call. A repeater's pending transition is the opposite of its current output, so it needs no separately saved target bit. An expired off transition checks rear input again; a rising pulse is retained even if its input has already ended. Side locking cancels pending work and unlock schedules from the current rear input.

`delay` is the only new block-state field. Existing `redstoneTimers` store positive remaining times for buttons, plates and diodes. The new `torchBurnouts` map stores at most eight remaining three-second recent-off windows plus a remaining eight-second cooldown per torch. These records are required to preserve past activity; current power alone cannot reconstruct them. Unloaded records freeze, and removing/replacing a torch clears its timer/heat. Invalid ranges, duplicate/orphaned heat records, active cooldown on a lit torch, non-repeater delay state and unsupported mounts are rejected.

Shapes share the current world/held/drop/ray/icon mesh path. The thin repeater has an output arrow, moving delay indicator and side-lock bar. Dust's visual arms connect to the repeater's axis. Procedural icon tiles now take the referenced surface's color rather than the parent item's base color; missing side colors receive a bounded dark grain. Torch light records and the LPV field both read the actual powered state, following the existing lamp/campfire handling in their separate owners. Keeping that short predicate in both existing owners avoids adding a lighting API solely to replace the comparison.

The seven-cell recipe uses logs because this project has no separate stick item. Horizontal directions are six-way, so four off-axis neighbors may lock a repeater. This is not Java's exact neighbor-update priority, quasi-connectivity, zero-tick behavior or burnout wake-up chain: the project uses physics-step scheduling, eight off transitions within three simulated seconds, and fixed eight-second cooling. Comparator, piston and burnout smoke/sound effects remain future work. This iteration adds no new Photon algorithm; it integrates the new red emitter with the existing colored voxel light, held light, atmosphere, TAA and exposure.

Save data is **v16 / `hexwild-save-v16`**. The v15 browser key is left in place, with no legacy reader or migration. Both normal world restore and dimension construction pass the new burnout records to `World`.

## Design review

The new player choice is the actual 1–4 tick repeater setting, controlled by use interaction. Input, lock state, signal level and emitter state are derived; no lock flag is persisted. The pending-transition map is reused, and past torch activity is saved because it cannot be derived from the present world. No dependency, optional engine path, source-code probe or product test flag was added.

Review covers all changed hunks, full `redstone.js`, `redstone-data.js`, `redstone-shapes.js` and both new diode test files. Unchanged portions of the large main/graphics/world/save files were not reviewed as a whole. Net growth is product code/UI +366 lines, tests +780, documentation +76 and configuration 0 (version/test-command values change). The test growth covers real crafting, rays, touch, mining, locks, feedback and saves plus the timing/direction input space; it adds no testing framework or runtime seam.
