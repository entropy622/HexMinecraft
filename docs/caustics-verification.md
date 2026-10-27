# Refracted sunlight and water caustics, v0.65

## Before implementation

1. Structural: apply refraction/colored transmission/focusing to the actual directional surface light, shared by terrain and moving models, rather than adding a screen-space animated brightness overlay.
2. Burden: derive eligibility from the existing high preset, daylight, material opacity and water occupancy; add no player setting or save field.
3. Determinable: read water heights, intervening solid cells and loaded bounds from the existing packed voxel volume, with the actual sun direction and shared animated water normal.
4. Gratuitous: reuse the current volume/uniform owners and material hooks; avoid another render target, caustic mesh, texture asset or per-frame CPU simulation.
5. Overfitted: cover pools at different elevations/depths, source/flow heights, negative seams, roofs, moving models, sun motion, all dimensions and quality/lifecycle changes.

The smallest coherent implementation augments the existing shared directional-light response with a bounded path through real water and a refracted-ray area estimate. Its animated normal is shared with surface reflections/refraction. A material-space decal or post-process multiplication would modulate ambient/emissive light, follow the screen, ignore actual water and fail behind opaque occluders. Factor the raw packed-volume coordinate/height decoder out of existing readers so the third consumer does not invent another medium convention.

## Failure modes specified before code

- The floor stays static while the water moves; focused regions never brighten, defocused regions never darken, or ambient/emission is incorrectly modulated.
- The water surface and its caustics use different wave/time fields; the pattern slides with the camera or resets at a negative chunk boundary.
- Dry surfaces, lava/glow, air gaps, water-free columns, submerged roof cavities or out-of-volume rays acquire water focusing; opaque roof/side walls leak sunlight.
- Partial fluid heights, stacked water, shallow water and elevated pools use an assumed global sea level or stale medium data.
- Refraction derivatives become singular, generate NaNs/extreme flashes, vary with screen resolution, or create severe distant aliasing.
- Sun rays in water are suppressed by the old vertex-skylight threshold, or new attenuation multiplies already-attenuated direct lighting twice.
- Low presets, night and other dimensions retain the expensive focused-sun path; entering/leaving/Continue/resize leaks targets or invalid uniforms.
- Terrain works but real shaped/instanced/skinned models fail to compile or receive a different directional response.
- Existing water reflection/refraction, water fog, colored light, TAA, shadows or native cursor protection regress.

## Reference

Photon's pinned [shadow fragment shader](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/shadow.fsh) estimates focusing from the area change after water-normal refraction. Its [shadow filtering](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/shadows/pcss.glsl) carries colored transmission into direct illumination. This project uses its own receiver-side hex-volume approximation; no upstream code or assets are copied.

## Results

`npm run check` passes all **63 Node scenarios** and the production build. A complete **14-scenario browser batch** passes: four new caustic scenarios, four underwater scenarios, three water-surface scenarios, graphics across three dimensions / three presets, and two temporal camera/motion recovery scenarios. A subsequent narrow-column reproduction exposed a false horizontal-interface detection at hex side exits. After that localized guard was corrected, a final **seven-scenario batch** passes all four extended caustic scenarios and all three water-surface regressions. Both batches have passed `.last-run.json` records. The other seven cases were passed before this localized interface guard and were not repeated afterward. New scenarios report no unexpected page/console errors; the existing GPU-failure case deliberately injects one driver-boundary exception and verifies recovery.

Before implementation, the real floor-motion scenario fails with normalized spatial change **0.000923** after 1.3 game seconds. The final floor changes by about **0.556**; these are scene-specific RMS change / initial mean measures after removing global bias, not a quality score. The measurements read actual HDR surface rendering before water fog and grading. An ordinary high-preset capture then enables existing TAA, exposure and bloom and hides the HUD.

The four normalized manifests record:

- `floor-motion.json`: finite surface values, animated focusing and no unexpected errors; paired images plus `caustics-light-effects.png` show the actual rendered result.
- `eligibility.json`: open-water change about **0.546**, opaque cover **0**, air-gap receiver **0.000803** and dry receiver **0.00112**. A real glowstone remains visible in the covered scene, with surface green mean around **0.340**. The test changes real blocks and fluids; it never swaps the material or solver.
- `models.json`: the production sheep hierarchy changes around **4.0%** in a selected surface patch as the water moves. After moving it, the newly sampled point stays finite; all three GL error reads are zero. The scene also renders the production blaze's instanced rods. General skeletal skinning is not separately exercised; current mob rigs use hierarchical transforms.
- `lifecycle.json`: a pool above floor **44** retains the same world-space sample within roughly **1.2%** after camera movement, far streaming and return. Shallow-water change is about **8.6%**; actual source height **0.92** becomes flowing height **0.835** at level 1. Resize, UI low/balanced/high transitions, Continue and three dimensions render successfully. The derived daylight path flags are **0/0/1** across quality presets, and zero at night / in the other dimensions. Restored flow and the existing texture-count bound hold.

A deliberately narrow five-cell-tall water column reproduces the side-exit defect: an ascending step crosses a hex side before reaching its predicted top, but its old `atTop` flag accepts that top as a free water interface. The test sees normalized change **0.08019** where focusing should be absent. The guard now queries the actual volume immediately below the candidate exit plane and requires occupied water there; the final column change is **0.000616**. This fixes a demonstrated geometry class rather than reducing the caustic intensity or relaxing the test threshold.

Existing regression scenarios retain RGB absorption, covered water scattering, local emitter response, changed fluid levels, physical waterline/camera transitions, deep-floor visibility, scene reflection/refraction, elevated pools/waterfalls and optical resource disposal. Temporal checks retain moving-model history rejection and restore projection/camera/targets after the intentional failed draw.

The usual PowerShell command, after `$env:PLAYWRIGHT_CHANNEL='chrome'`, is:

```powershell
npx playwright test tests/caustics.spec.js tests/underwater.spec.js tests/water.spec.js tests/graphics.spec.js tests/temporal.spec.js -g 'animated refracted|solid cover|real hierarchical|shallow and flowing|submerged near|covered water|physical waterlines|deep water retains|water reflects|deeper water absorbs|an elevated|pixel world|moving production mob|camera cuts' --timeout=180000
```

This session runs that same production composition through the existing external HMR-disabled Vite configuration on `127.0.0.1:5174`. Installed Chrome runs headlessly with SwiftShader and the existing browser/device Pointer Lock boundary. There is no foreground desktop input. Software rendering makes the full batch slow; this is not physical-GPU performance acceptance.

## Implementation and limits

The shared directional-light hook now derives a receiver's water path from the actual packed volume. A normal offset enters the adjacent medium, then at most **32** steps of no more than **0.6** world units follow the mean air-to-water refracted direction. Steps clip to the local encoded fluid top, distinguishing full stacked cells from source/flow surfaces. A solid or non-water liquid encountered inside the water path blocks that direct light. A horizontal free interface, verified to have occupied water directly beneath the exit point, must be found within loaded bounds; otherwise the existing vertex-sky response is retained. Dry or air-gap receivers retain their original response. No global sea height or camera-submerged condition is used.

The surface water shader and receiver lighting share three world-space directional waves and one actual water-time uniform object. Two bounded inverse-map refinements estimate the light's surface origin. Finite differences of refracted displacement form a two-dimensional ray-area Jacobian; using displacement differences avoids subtracting large world positions. Its inverse is limited to **0.35..3**. Receiver derivatives are evaluated before divergent tracing branches and fade fine focusing as a pixel's world footprint grows from **0.12 to 0.35** units. Depth **9..13** similarly fades focusing toward uniform transmitted sunlight. These are internal bounds, not new settings.

RGB sunlight transmission uses the same `WATER_EXTINCTION` coefficients as the visible surface and water fog. The final refracted direction also drives the material's direct-light BRDF. This replaces the old scalar vertex-skylight cutoff for eligible water paths; it does not multiply that cutoff again. Existing ambient/hemisphere light, colored voxel emitters, emission and the camera fog remain in their original terms. Existing directional shadow/cloud modulation still applies. Transparent media do not compile the receiver path, preventing water from projecting its own caustics onto itself.

The packed-volume address, bounds and water-height decoder now have one shared GLSL owner for dynamic models, water sunlight and atmosphere. The atmospheric below-world behavior and dynamic masked interpolation remain intact. Static terrain receives the same existing volume uniform objects as dynamic models. `waterSunlight` is derived from high preset + overworld + positive solar elevation; the shared clock is written by the existing fluid renderer. No new render target, texture, asset, dependency, save field or UI choice is introduced. Save remains **v16 / `hexwild-save-v16`**.

This is a bounded, receiver-side approximation of the first contiguous water segment. It uses mean-direction voxel occlusion and the existing receiver shadow map; it does not trace every displaced light ray, resolve multiple focusing branches, transport all energy exactly, or follow additional separated water layers above the first interface. Thin/partly occupied geometry inherits the existing voxel precision. Unresolved, side-exit or out-of-volume paths do not invent a focusing surface. Very deep/subpixel light tends toward a simpler response. The procedural wave field is more regular than a full noise hierarchy. Total internal reflection, multiple scattering, fully refracted external views and complete Photon equivalence remain future work.

## Evidence and review

Evidence is under `C:/Users/aentrozhou/.codex/visualizations/2026/10/26/01a176f8-8115-7010-9745-1dfe66ad81af/caustics-0.65/`. `baseline/` preserves the pre-change failed floor test; `first-pass/`, `three-pass/` and `flow-water-regression/` retain intermediate checks. `integration-fourteen/test-results/` preserves the full passing batch before the side-exit guard. `side-exit-baseline/` preserves the later real failure, and `final-seven/test-results/` is the final passing batch after the guard. The top-level `caustics-light-effects.png` is the viewed high-preset image. Inspected images also include actual underwater models, the covered pool and the elevated shallow stream; these are controlled validation scenes.

Review covers all changed hunks, the full new volume/lighting modules, water shader, skylight hook, dynamic-light module and new browser scenarios. Unchanged portions of large main/graphics/atmosphere/foliage files are not reviewed as whole modules. The two small shared shader modules each have multiple production consumers; no general optics framework or alternative renderer was added. Transparent-material compilation and derived preset/daylight bypass are required by actual media and existing quality choices. The only new uniforms are consumed by production shaders, and the water clock is shared rather than written twice. No test-only product parameter, compatibility reader or new dependency is added.

Net growth is product code/UI +107 lines, tests +493, documentation +80 and configuration 0 (version values change). Tests grow to measure actual GPU surfaces, exclusions, models and lifecycle; no source-text or byte-hash assertions are added.
