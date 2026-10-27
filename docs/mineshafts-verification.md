# Branching mines, cobwebs and cave spiders, v0.62

## Before implementation

1. Replace the existing fixed six-spoke mine with a seed-derived connected layout, using the existing structure descriptors, chunk stamping, loot initialization and discovery.
2. Derive tunnel floors, supports, loot alcoves and the spider nest from the plan; do not ask callers for topology flags or save a second copy of generated terrain.
3. Reuse ordinary block edits, chest records, mob composition and timed survival effects. Poison cadence can be derived from its remaining effect duration, so it needs no new save timer or format migration.
4. Share body/web contact between players and mobs, and keep mining/fluid removal in their production systems. Spiders remain immune to webs; successful cave-spider bites apply poison through the existing damage path.
5. Verify natural generation, collision clearance, real mining/looting, web movement/falling, spawner suppression, poison/milk/shields and save restoration in headless browser scenarios. Native Pointer Lock stays mocked at the browser boundary.

The smallest complete change is a deterministic mine plan plus usable cobwebs and its cave-spider encounter. Merely adding decorative tunnels or a renamed spider would not provide the exploration, movement hazard and combat behavior. No dependency, user setting or parallel world generator is needed.

## Failure modes specified before implementation

- Chunk order/seams alter the plan or erase edits; tunnels intersect with two-block steps, supports seal junctions, floors collapse under gravity, or the surface exit is inaccessible.
- Loot/spawners sit inside supports or ceilings; reloading or emptying a chest regenerates its contents.
- Webs are solid walls or only decorative, fail to slow horizontal movement/falling, trap immune spiders, or are discarded instead of placed/harvested/saved.
- Sword/shears/hand drops or durability differ from their tool semantics; water/lava remove a web repeatedly or duplicate string.
- A cave spider spawner creates ordinary mobs; scaled spiders regain full size while animating or cannot fit a low passage.
- Poison applies through shields/invulnerability, kills below one health, changes cadence on save/frame size, or survives milk.
- New cutout models compile incorrectly under the light-effects preset or native desktop input is captured.

## References

Primary references are Minecraft's [mineshaft overview](https://www.minecraft.net/en-us/article/mineshaft), [cave spider introduction](https://www.minecraft.net/en-us/article/meet-cave-spider) and [cobweb description](https://www.minecraft.net/en-us/article/block-week--cobweb). Layout, six-sided meshes, web artwork, movement and combat code are original; existing licensed material/skin assets are reused.

## Results

`npm run check` passes all **55** Node scenarios and the production build. The five new scenarios use the actual `World`, floor/body collision, fluids, mining, mob factory and survival code. They cover multiple seeds and negative chunk seams, surface/loot reachability, reverse chunk loading, saved edits, web contact and tool/fluid drops, natural nest spawning and suppression, scaled-body clearance, and poison partition/save/absorption/milk behavior.

The initial natural-mine browser scenario failed against the previous implementation because it generated no cobwebs. Four new real-browser flows subsequently passed:

- Natural mine exploration finds 32 webs, three supply chests and the nest in seed 624. Shift-clicking every occupied chest slot through the actual container UI leaves it empty after save/Continue.
- Actual keyboard movement measures web travel at about 25% of free travel, normalized by simulation time. A body falling into an elevated web descends at **0.5 blocks per simulated second**; the final measured horizontal ratio is **0.245**.
- Actual sword mining yields one string, placing a carried web uses the normal ray/build path, and shears recover one web. Sword/shears wear decreases by two/one. Mining remains removed after Continue.
- A naturally spawned cave spider hits a raised shield without damaging or poisoning the player. Lowering the shield permits a venomous bite. After saving and restoring the remaining poison, holding use consumes milk and removes the effect before its natural expiry.

**Eight distinct browser scenarios pass** across the final regression batches: these four flows plus existing natural-cave exploration/mining/building/save, Ctrl/double-forward sprint and player-state validation, placed torch/repeater lighting and three-dimension/preset graphics. Chrome runs headlessly with SwiftShader at `http://127.0.0.1:5173`. The browser fixture replaces only native Pointer Lock before startup; no foreground mouse automation or product test command was added.

An initial regression navigation was aborted before gameplay; the unchanged cave scenario passes on rerun. Two test assumptions were corrected rather than changing gameplay: a poll for one simulated second may overshoot on a slow software renderer, so descent is normalized by its actual time interval; the shield encounter now waits on a safe ledge and aligns toward the naturally spawned spider before approaching, preventing a pre-test bite. The complete four-flow mine batch then passes, including saved poison cured by milk before expiry.

Commands (PowerShell, `$env:PLAYWRIGHT_CHANNEL='chrome'`):

```powershell
npm run check
npx playwright test tests/mineshafts.spec.js tests/caves.spec.js --timeout=180000 --reporter=list
npx playwright test tests/controls.spec.js tests/diodes.spec.js tests/graphics.spec.js -g 'Ctrl and double forward|placed torch inverts|pixel world renders' --timeout=180000 --reporter=list
```

The three scenarios in the last command were run as part of the earlier eight-scenario combined regression. This does not establish a full historical-browser or physical-GPU performance acceptance.

## Visual verification

The mine screenshot uses the light-effects preset and a carried torch. It waits for the chunk relight queue to drain, at least 24 TAA frames and another half-second of simulation before capture. An earlier immediate capture was too dark to judge. The settled image makes the plank floor, timber supports, stone walls and receding tunnel readable.

The first web artwork covered too much of its crossed geometry, appearing as a pale clump. The revised original artwork uses six spokes and two widely spaced rings, shared with the inventory SVG. Two crossed sheets replace the denser three-sheet arrangement, and modest surface shading avoids a bright white clump under the held torch. Exact single-pixel texture strands preserve diagonal spokes above the alpha-test threshold; antialiased subpixel strokes had erased them. The final production tile has **66.0% fully transparent pixels** (original dense artwork: 29.7%), and the light-effects mine capture shows visible strands and holes. The production texture PNG and its transparent-pixel fraction are recorded alongside the final screenshot; no opaque fallback plate or downloaded replacement asset is used.

## Implementation and limits

`mineshafts.js` derives a seed-only plan through the existing cached structure descriptor. Up to three main arms and their branches have occasional rises, a shared hub, three-cell-wide tunnels, periodic fence/beam frames, supply alcoves and a spider nest. The entrance rises by at most one block per cell toward the surface. Adjacent floor relaxation removes two-block junction steps; frame posts avoid center paths, and stable stone ceilings avoid natural gravel collapse. Surface-reaching columns suppress trees through the current halo generation path. Ordinary edits are applied after natural stamping.

The plan is runtime generation data, not a new saved copy of terrain. Chest initialization/discovery use the existing structure IDs and chest records. New block edits and poison use existing v16 block/effect records; **save stays v16 / `hexwild-save-v16`**, with no new migration or timer field. Existing modified cells continue to win, but older generated mine layouts are not frozen, so a new world is recommended for a coherent new layout.

Webs are alpha-tested crossed surfaces with no solid collision. A shared body-contact query slows players and ordinary mob walking; spider definitions mark immunity. The player's downward speed is capped while in contact, sprint cancels and gliding ends. Mining remains in the normal tool/durability/drop pipeline. Fluids replace web blocks through their existing write path and queue one string drop for water; lava does not drop it.

Cave-spider identity is derived from an existing spawner's position in a natural mine plan. It reuses the licensed spider skin with a blue tint and a smaller body/rig, and its scale remains correct while animating or reacting to a hit. Successful damage returns a result before poison applies, preventing poison through a blocked, ignored or fatal hit. Poison cadence derives from remaining duration, preserving it across saves without a second clock; absorption hearts are consumed first, health stops at one and milk clears the effect. This is a bounded approximation of MC combat, not an exact simulation of Java's entity tick ordering.

Rails/minecarts, cave-spider wall climbing, full pathfinding, spider eyes and a new poison-potion recipe family remain future work. Spawner suppression still checks nearby torches/lanterns rather than the full rendered LPV brightness; spider daylight aggression uses sky visibility. Web drag covers player movement/falling and ordinary mob walking, not every projectile, dropped item or falling-block entity. This iteration integrates with the existing Photon-inspired voxel light, atmosphere, exposure and TAA; it adds no new Photon shader algorithm.

## Design review

No dependency, user option, second world generator, product testing mode or saved derived layout was added. The only new transient ownership is the mine plan in existing structure descriptors and pending water-washed string drops in the fluid owner. Natural generation, mining, containers, movement, combat, effects and rendering stay in their existing composition.

Review covers every changed hunk, full new `mineshafts.js`, `cobwebs.js` and both new mine test files. Unchanged portions of the large main/graphics/world files were not reviewed as a whole. Net growth is product code/UI +409 lines, tests +722, documentation +88 and configuration 0 (version/test-command values change). The test growth covers real UI/input, container/mining/food use, natural encounter and save behavior plus the seed/chunk/body/time input space; no test framework or runtime seam was added.

## Evidence

Artifacts are preserved at `C:/Users/aentrozhou/.codex/visualizations/2026/10/26/01a176f8-8115-7010-9745-1dfe66ad81af/mineshafts-0.62/`. `integration-five/` contains the passing natural-cave regression and all four new flows, with normalized `mine.json`, `web-movement.json`, `web-harvest.json` and `poison-shield-milk.json`. `regression-first/` preserves the earlier combined batch, including the three passing controls/diodes/graphics regressions and the subsequently corrected failures. `visual-final/` contains the passing natural-mine/loot/save flow after the last texture-only change; the top-level `natural-mine.png` and `web-tile.png` are the final viewed images. Earlier visual attempts remain in separate folders for comparison.

The final natural cave image measures adapted brightness 127.65 versus fixed 64.24 in the existing scene sample, with a reachable entrance and no browser/shader errors. The cave-spider record restores 6.7 seconds of poison, then consumes milk in 2.0 simulated seconds and cures it before expiry. These are scenario observations, not universal image-quality or performance scores.
