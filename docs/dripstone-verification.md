# Dripstone caves, v0.59

## Before implementation

1. Extend seeded cave descriptors, block shapes, the existing falling-block owner and player landing damage. This changes exploration and harvesting through the production world rather than adding a decorative preview.
2. Reuse `upper` for a ceiling-mounted pointed block, as for existing ceiling-oriented shapes. Falling stalactites always point down and use the existing falling record fields. No new save version or dependency is required.
3. Thickness, tips and merged pairs are derived from adjacent blocks. A loaded pointed-cell index is rebuilt by streaming; no persistent growth timers or copy of geometry state is necessary.
4. A tapered polygon part is needed by the same world mesh, item icon and collider. Extend that representation consistently instead of maintaining a second cone with a different collision envelope. Falling rendering and cosmetic droplets retain explicit resource ownership.
5. Exercise natural generation and real mining/placement rays first. Additional world/physics checks cover fast falls, narrow collision, unsupported chains, restoration mid-fall and rare growth opportunities at the random boundary.

## Failure modes

- Spikes or pools must not seal the chamber approach; chunk order, bedrock and old edits remain stable.
- Floor and ceiling placement need the correct full support face, preserve orientation and use an actual item. Adjacent opposite tips merge visually.
- Mining a root produces one direct drop, releases only its unsupported descendants and never duplicates an item after reload.
- Stalactites fall and shatter rather than becoming standing blocks. Their swept physics must find small supports at high speed; player/mob damage happens once at impact.
- Standing on a spike is harmless until a real landing; jumping/falling onto a sharp tip hurts, while a merged column is not a sharp tip.
- Growth needs a water source above a dripstone block, free space and no intervening fluid. It stops at seven segments and at unloaded cells or occupied bodies.
- Droplets are bounded cosmetic particles; world reset and chunk disposal release or reuse owned geometry correctly.

## Results

- Baseline browser case failed because the old world had no `dripstone` cave descriptor. New generated caves contain both orientations, columns and natural source pockets.
- `npm run check`: 43 logic scenarios and the production build passed. The cave traversal test still covers 37 chambers across seeds 624, 129 and 404, now checking all resident natural spikes are anchored before physics runs. A wider generation probe found three exposed-roof cases; generation now omits hanging formations where the roof is above the terrain.
- Six dripstone logic scenarios compare tapered geometry against actual Three.js ray intersections and point/support queries in both orientations; check chunk-order equality for blocks, states and liquids; preserve edits and mid-air falling records; freeze unloaded motion; verify one-time drops, partial-face attachment, merged tips, fluid and body blockers, and seven-segment growth limits.
- A regression case builds more than 300 queued gravel cells, removes a pointed-block support and confirms its unsupported child breaks in the next bounded physics tick. The original FIFO queue visibly delayed it in the browser; local pointed-block wakeups now precede natural scans while retaining the 32-cell tick budget.
- Real survival rays mine a two-piece standing formation, pick up two drops, place one on a floor and one under a ceiling, extend a standing tip, join an opposite tip and restore the orientations/inventory through normal Continue validation.
- In the captured hazard run an ordinary landing leaves health at 20; the falling stalactite leaves health at 14 with the real `fallingBlock` damage cause. A separate real landing on a pointed tip leaves health at 18. The hurt-event count stays at one while resting; natural regeneration is allowed to restore health.
- The water-fed browser fixture seals a real water source above a dripstone block. Only the host randomness boundary is forced, with restoration in `finally`; the game's normal update loop grows seven hanging segments and stops. A validated v15 reload restores all seven cells and the still water source. Node coverage separately checks upward growth, fluid paths and occupied-body rejection.
- The production crafting route was also exercised: four harvested pointed items fill the actual crafting grid, produce one dripstone block without a workbench and leave zero pointed items.

## Ownership, state and limits

`dripstoneCells` is a derived loaded index for growth and droplets, maintained on edits, generation, unload and clear. Geometry uses the existing `upper` orientation and neighbour-derived thickness. `topScale` extends polygon parts for mesh construction, item SVG projection, point collision and vertical support clipping; no alternative cone collider is kept.

Falling records keep the existing `{q,y,r,type,velocity}` layout and accept the new block ID. Their renderer shares one pointed geometry/material through the existing FallingModels owner and clears only instances when changing world. Falling fragments currently use a tip mesh rather than preserving each original shaft's thickness. DripstoneEffects owns one points object, geometry and material; two fixed arrays hold at most 96 droplets from 24 nearby tips, and reset clears the emitters/draw range. Cosmetic drops neither create liquid nor emit light.

Growth uses a memoryless mean 1800-second opportunity followed by downward/upward choice. Full-length stalactites may still seed a stalagmite below; fluid between tips and an occupied target prevent growth. The seven-segment limit and ten-block reach follow the [official feature description](https://www.minecraft.net/en-us/article/caves---cliffs--part-i-out-today-java). Implementation, geometry and pixels are original. Damage estimates falling distance from velocity using this game's gravity, with a 40-point cap; it does not reproduce vanilla entity NBT, exact damage rounding or update ordering.

The version remains compatible with current v15 saves. Existing terrain edits and liquid removals override seeded formations and sources. There is no cauldron filling, waterlogged pointed block, trident-breaking interaction or Shift option to prevent merging. This iteration uses the existing colored voxel light, eye adaptation, ambient occlusion and shadows; it introduces no new Photon temporal algorithm.

All nine distinct browser scenarios passed in batches: five dripstone scenarios, existing cave exploration/mining/restoration, two existing control/body/flight scenarios, and cross-dimension/quality rendering. Background browser fixtures replace native Pointer Lock at the browser boundary; no desktop input was taken. The final cave capture equips a real held torch, waits for its emission and the welcome toast to clear, and shows textured formations, a resting bat and water droplets. Visual inspection replaced initially flat/stretched surfaces and wood-like stripes with mineral patches and cracks.

Evidence is preserved outside the checkout in the task's `dripstone-0.59` visualization folder. `dripstone-cave.png` and `formations.json` show the final natural cave; `interaction-evidence` contains completed mining/placement and hazard captures; `growth-evidence` contains the completed water-fed growth/reload manifest; `regression-evidence` preserves the final control, cave and graphics run. Early failed natural-render waits in the growth batch are diagnostic artifacts, superseded by the final regression capture. All changed files pass scoped Prettier checking and `git diff --check`. The production bundle retains the existing size warning at 1,235.73 kB minified JS. Full changed-file and added-module review completed.

New recipes are appended after the existing catalogue so the default first craft remains planks and existing entries keep their indices. Net added lines by area: product 518, tests 646, documentation 55, configuration 0. No new dependency, setting, persistent growth timer or generic simulation framework was added.
