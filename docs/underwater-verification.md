# Underwater absorption and volumetric light, v0.63

## Before implementation

1. Extend the existing atmosphere pass to integrate the actual water segments seen by a submerged camera, rather than applying one screen tint regardless of scene depth.
2. Keep the existing light-effects preset and production camera/fluid state; no new player setting, save field or extra render target is required.
3. Water type, surface level, ray length, sunlight visibility and local emitter color are derived from the actual world, depth buffer, shadow map and packed light volume.
4. Reuse the existing half-resolution fog target, bilateral composite and fixed-budget integration. Its alpha represents air transmission for air views, or integrated water length for water views; RGB water transmission is then reconstructed in the composite from shared extinction coefficients.
5. Cover open/deep/shallow/covered water, variable source/flow heights, close surfaces, mixed liquid transitions, quality changes, resizing and save restoration. Do not add a general refraction framework or a second medium-history flag.

The smallest useful change is depth-dependent water absorption plus light scattering along occupied water segments in the existing fog pass. A different overlay color cannot establish distance response, local-light response, shadowed beams or correct air gaps. The surface water shader must use the same extinction coefficients. The packed light volume already has spare medium codes to represent actual water heights, avoiding another texture or a guessed global sea level.

## Failure modes specified before code

- Near and far surfaces receive identical tint; red light is not attenuated more than blue; additive fog masks actual transmission.
- A clear seven-cell water column exhausts sky illumination to near black instead of attenuating it by optical distance.
- Sealed/covered water inherits outdoor sunlight, local colored emitters do not scatter, or air gaps and lava/glow are treated as water.
- Source/flow heights, internal stacked cells, negative chunks and near-surface views disagree with the physical liquid; level-only changes leave stale medium data.
- Water absorption gets applied twice to an above-water surface, a CSS tint covers the new water effect, or first-person geometry receives a distant fog length.
- Enter/leave, water-to-lava/glow, low/high quality, resize, dimension change or Continue uses stale media/history/targets or leaks GPU resources.
- Fixed-step quadrature misses shallow water or produces bands/noise; sky rays over-integrate air as water; silhouettes bleed across depth edges.
- Shaders fail under actual WebGL/Three composition or testing confines the desktop cursor.

## Reference

Photon's pinned [water volume integration](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/fog/water_fog_vl.glsl) separates colored extinction/transmission from scattering and modulates sun shafts with shadows and moving noise. The implementation here is original and adapted to the current hex voxel volume; no upstream code/assets are copied.

## Results

`npm run check` passes **55** Node scenarios and the production build. After the final shader-only denoising change, the build passes again and **10 distinct browser scenarios pass in one batch**, in installed Chrome headlessly with SwiftShader. Four new scenarios cover actual HDR absorption/scattering, production renderer/light composition, real fluid stepping, UI quality/resize/Continue/dimension transitions and deep-floor illumination. Six existing scenarios cover surface reflection/refraction/depth response, elevated pools/falling water, natural cave mining/building/saves/exposure, three dimensions/presets, and camera/projection/history restoration after an intentionally failed GPU draw.

The browser entry remains the real page and Creative/Continue UI, with the existing DEV scene fixture API to arrange reproducible geometry and freeze simulation time. World, fluids, meshing, voxel light, shadow maps, atmosphere, temporal resolve and actual WebGL draws remain real. `tests/browser-fixture.js` intercepts only native Pointer Lock before startup; no foreground desktop input is used. The GPU-failure regression deliberately throws at the graphics-driver boundary and verifies recovery; the new scenarios record no page/shader errors.

## Observations and visual review

- The pre-change near/far wall material response was almost unchanged at about **0.97 / 0.98** for red. Final HDR response is around **0.27 / 0.008**, while blue retains roughly **0.81 / 0.50**. Swapping actual stone walls for calcite at fixed positions and normalizing by each surface's unfogged HDR response separates transmission from additive scattering and differing surface illumination.
- Covering the water with a stone roof reduces mean green scattering from roughly **0.093** to **0.0026**. A real nearby glowstone block raises local scattering and removing it lowers it again. A solid emitter displaces water, so the test correctly allows occupied path length to change rather than demanding an unrelated invariant.
- Removing top sources and stepping the actual fluid simulator creates lower streams. Occupied water length in the selected horizontal view drops from roughly **7.0** to **0.93** and increases after refilling. A camera above a real level-one stream (height **0.835**) is air. Tiny cuts across the exposed source surface and water-to-glow transitions reset history, without treating glow as water.
- A second pre-fix reproduction places the camera in the upper part of an internal water cell: it incorrectly reports air despite another water cell above. The shared column-height query fixes this for player contact, optical medium detection, water meshes and packed light data. The final internal-cell snapshot reports water.
- The seven-cell-deep floor initially receives only **1.09%** of its dry green illumination. Exponential optical attenuation of vertical sky visibility raises this to about **13.3%** in the same rendered scene. The final screenshot exposes the floor texture while retaining the distance tint; its beauty capture enables the ordinary exposure/bloom controls and hides HUD with F1. HDR measurements use the ungraded scene target.
- Roof slits produce visible water shafts. Advancing the actual world clock changes their rendered field. Layer diagnostics show the initial grain belongs to the fog buffer, while the original scene layer is clean. A water-only 5-by-5 depth-aware Gaussian gather reduces it while preserving opaque depth edges; air keeps its previous 2-by-2 reconstruction. In one documented roof rectangle, green-channel high-frequency residual RMS falls from **0.672** to **0.311**. This local image observation is not a universal image-quality metric.

Measurements and viewed images are from controlled scenes, not a claim of exact MC/Photon equivalence or physical-GPU frame rate. The final browser run uses an isolated Vite instance at `http://127.0.0.1:5174` with HMR disabled; this avoids live-edit interruptions observed during an early dev-server probe. Its two small standard config files are stored with the evidence, not as product options or alternate renderer code.

## Implementation and limits

The existing half-resolution RGBA fog target stores water scattering in RGB and occupied water length in alpha for water-camera views. The bilateral composite reconstructs colored Beer-Lambert transmission using the same `WATER_EXTINCTION` values as the surface shader. Air-camera views keep scalar air transmission in alpha. There is no second fog target or extra underwater scene capture.

Water integration is bounded to **32** quadratic intervals per ray and the existing **58-world-unit** ray limit. Fine intervals near the eye preserve shallow surface contact. Only actual water codes contribute; exposed cells are clipped to their physical source/flow height, while stacked interior cells are full. Sun visibility uses the existing shadow map and sky field; ambient and colored local light come from the packed voxel volume, with an independent moving-noise modulation of sun shafts. Near first-person geometry retains the existing close-surface protection.

The spare low nibble of the existing packed light volume now represents solid 0, full water 1, exposed water levels 0..7 as 2..9, lava 10, glow 11 and air 15. All consumers use the new meanings. The tiny GLSL height decoder mirrors the production level formula because it crosses the CPU/GPU codec boundary; no additional height texture is allocated. Level-only fluid changes now invalidate optical light data, since height is no longer optically irrelevant.

`Fluids.height()` is shared by meshes, camera immersion, player contact and water-volume encoding. Vertical sky visibility uses the green extinction coefficient as a scalar visibility proxy, keeps fractional running values through a column, then quantizes into the existing 0..15 sky field. RGB point-light propagation keeps its current rules. This improves underwater surface illumination without claiming full wavelength-dependent sunlight transport.

The existing renderer-owned submerged boolean is replaced throughout by current liquid identity. TAA can therefore distinguish water from glow/lava, rather than seeing all liquids as one state. High-quality water removes the old DOM tint; low presets and non-water liquids retain their existing screen treatment. Save stays **v16 / `hexwild-save-v16`**, with no new fields, settings, dependencies or migration.

The method remains a single-scattering, voxel/raymarch approximation with limited distant/thin-medium precision and residual spatial noise. The spatial gather can soften fine beams. It does not add ground caustic light patterns, underwater total internal reflection, a full refracted exit view, multiple scattering, off-screen reflections or independent temporal fog history. Air segments seen from a water camera are skipped by this water integral. The full Minecraft and Photon-style objective remains in progress.

## Verification and evidence

Portable checks use the existing configuration and test entry points:

```powershell
npm run check
$env:PLAYWRIGHT_CHANNEL='chrome'
npx playwright test tests/underwater.spec.js tests/water.spec.js tests/graphics.spec.js tests/caves.spec.js tests/temporal.spec.js -g 'submerged near|covered water|physical waterlines|deep water retains|water reflects|deeper water absorbs|an elevated|pixel world|natural cave route|camera cuts' --timeout=180000 --reporter=list
```

The final run used the same command with `-c` pointing to the evidence folder's `playwright-stable.config.mjs`, which imports the normal repository config and only selects its isolated, HMR-disabled Vite server. No product testing flag or mock renderer was introduced. Frame waits observe a fresh render, matching optical/world revisions and a drained relight queue before accumulating 16 more TAA frames; this avoids recording a counter before a medium change resets it. Resize waits observe the actual resized fog target. These correct synchronization mistakes without changing the rendered contract.

Artifacts are under `C:/Users/aentrozhou/.codex/visualizations/2026/10/26/01a176f8-8115-7010-9745-1dfe66ad81af/underwater-0.63/`. `final-ten/` contains the entire passing batch, including normalized `absorption.json`, `scattering.json`, `shafts.json`, `lifecycle.json`, `floor-light.json` and the existing regression manifests. The top-level `underwater-shafts.png` and `underwater-floor.png` are final viewed images. `grain-diagnostic/` preserves separate scene/fog layers and the pre-filter image; `fog-grain.json` records the local comparison. `baseline/`, `column-gap-baseline/` and `floor-baseline/` preserve the three actual pre-fix failures. Earlier probes remain separately archived.

## Design review

Current medium and heights are derived by their owners; callers receive no new player choice or saved parameter. The existing fog target, scene frame, shadow field, packed light texture and temporal lifecycle remain authoritative. Shared extinction replaces an embedded shader literal; the height query serves four production consumers. The camera-medium interface is changed at all call sites without an alias or compatibility branch. The water spatial gather is justified by actual layer diagnostics, not a hypothetical fallback. No new runtime class, dependency or resource owner is added.

Review covers all changed hunks, full `atmosphere-pass.js` and the new underwater browser file. Unchanged portions of the large main, graphics, voxel-light, fluids and temporal files were not audited as a whole. Net growth is product code/UI +102 lines, tests +542, documentation +85 and configuration 0 (version values change). Tests grow to exercise actual GPU input/output and fluid/quality/save/history behavior; no unit source probes, new framework or test-only engine path is added.
