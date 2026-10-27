# Temporal antialiasing, v0.60

## Before implementation

1. The current light-effects pipeline owns a stable scene color/depth frame and SMAA, but no temporal history. Add one temporal resolve before bloom/exposure, with projection jitter scoped to that composer's render.
2. Reuse the existing antialias preference and surface-protection draw. Extend its mask with temporal reactivity from actual object transforms, transparency and first-person ownership; do not add flags to every mob or a second scene renderer.
3. Keep two HDR history targets. RGB stores unexposed scene color; signed linear depth in alpha distinguishes stable surfaces, sky and reactive pixels. Camera matrices, sample phase and previous transforms are runtime-derived state, not save fields.
4. Use neighbourhood clipping, depth-aware reprojection and conservative reactive rejection. Restore the camera projection in `finally`, and reset on camera cuts, resize, world changes and setting changes. Target ownership remains with composer passes.
5. Verify actual GPU images against a supersampled reference and the existing SMAA baseline. Exercise transformed production mobs, disocclusion, rapid camera changes, real UI options, water, viewport changes and disposal. Native Pointer Lock remains replaced only at the browser boundary.

## Failure modes

- Jitter must not leak into controls, picking or later frames, even after a failed render.
- Static edges must improve against a higher-resolution reference without erasing pixel textures or increasing settled-frame flicker.
- Moving actors, first-person items, water and vacated silhouettes must not reuse stale history.
- New geometry, sky, camera translation/rotation and projection changes must reproject or reject history correctly; no black borders or NaNs.
- Exposure and bloom must not feed back into history. Low presets, antialias off, resize and world changes must reset or release the correct targets.

## References and scope

Reference read from Photon revision `6e67b36e818bacde0304edd49f28e2bb70e33f04`, specifically [the temporal resolve](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c4_taa_exposure.fsh). Reprojection, HDR compression and luminance/chroma neighbourhood bounds inform an independent implementation. No upstream shader code or assets are copied.

## Results

`npm run check` passes 43 Node scenarios and the production build. Browser checks use headless installed Chrome with SwiftShader at `http://127.0.0.1:5173`; `tests/browser-fixture.js` replaces only native Pointer Lock before application startup. No desktop input or foreground automation is used.

The static fixture uses production world blocks, fences, six-facing stairs and calcite columns. The simulation is paused while the real renderer continues. The reference is rendered at 2× width and height with antialiasing off, then downsampled by the browser compositor. The SMAA ablation disables only the actual temporal pass. The final image follows 24 accumulated frames. Metrics cover the inner frame and reference gradients above 30; they compare display RGB, not internal state.

| Image measure                                          | Result                                   |
| ------------------------------------------------------ | ---------------------------------------- |
| SMAA squared edge error against 2× reference           | 71.4004                                  |
| Temporal + SMAA squared edge error                     | 35.3582                                  |
| Error ratio                                            | 0.4952 (about 50.5% lower in this scene) |
| Temporal/SMAA gradient ratio at those edges            | 0.7850                                   |
| Mean display change after another eight settled frames | 0.001206 of full channel range           |
| Compared edge-channel samples                          | 121293                                   |

A dedicated moving-pig scenario uses `createMob()` from production, changes its actual transform and samples history/mask pixels after the next real frame. It also renders the same changed scene with temporal accumulation disabled to compare the newly exposed background and actor. A lifecycle scenario checks exact projection/inverse restoration, hard translation/rotation reset, a one-shot GPU-target-boundary exception, viewport resizing, real antialias/quality controls, first-person protection, disposal and dimension travel.

The production pig's new silhouette has a fully reactive mask and negative history alpha; its vacated position returns to positive stable depth. Summed mean HDR RGB differences from a fresh rendering are 0.00340 for the vacated patch and 0.04847 for the moved actor. The first-person check finds 34170 protected pixels in the lower half of the frame, all rejecting history. Resizing keeps both histories, the scene frame and shared mask at 800×600; projection restoration is exact, GL error is zero, and switching to the low preset emits exactly two history disposals and one mask disposal.

The selected integration run covers 11 distinct scenarios in `temporal.spec.js`, `water.spec.js`, `graphics.spec.js`, `caves.spec.js` and `controls.spec.js`. Ten initially passed; the cave scenario reached its final map screenshot but exceeded the 90-second limit. The unchanged cave scenario completed on an isolated repeat with a 150-second CLI limit. This is recorded as a software-rendering timeout, not a hidden passing first run. The integration checks exercise real cave mining/building/save restoration, cave exposure, three dimensions/presets, crouch/ledge protection, inventory, sprint, pick block, creative flight, water reflection/absorption, underwater transitions and elevated flowing sources. No full historical browser-suite or physical-GPU performance acceptance is claimed.

The two browser commands use `$env:PLAYWRIGHT_CHANNEL='chrome'`, then:

```powershell
npx playwright test tests/temporal.spec.js tests/water.spec.js tests/graphics.spec.js tests/caves.spec.js tests/controls.spec.js --reporter=list
npx playwright test tests/caves.spec.js tests/water.spec.js -g 'natural cave route|water reflects' --timeout=150000 --reporter=list
```

Screenshots and normalized JSON are preserved outside Playwright's cleared output directory at `C:/Users/aentrozhou/.codex/visualizations/2026/10/26/01a176f8-8115-7010-9745-1dfe66ad81af/temporal-0.60/`. `comparison.html` shows SMAA, temporal and the 2× reference from `verified-temporal/`; `quality.json`, `moving-mob.json` and `lifecycle.json` retain the measurements. `integration-11/` retains the initial 10-pass/one-timeout run. The isolated cave/water repeat is stored under `integration-repeat/`. In its 7×7 water-surface patch, both reactive-mask coverage and current-frame-only history coverage are 100%.

## Implementation and limits

The resolve uses eight centred Halton samples, camera reprojection, four depth-aware history taps, and a 3×3 current-frame HDR-compressed YCoCg neighbourhood. A variance bound and radial box clip restrict old colours. A bounded five-tap sharpening filter is applied only to display colour, never fed back into history. SMAA follows exposure and bloom. DOM UI is outside the scene pipeline.

The previous AO-only protection pass is now shared. R retains transparent/overlay AO protection; G marks newly created or transformed meshes, first-person descendants, transparent materials, liquids and instanced meshes as reactive. The previous transforms and flags use weak object keys. The sky dome and celestial group are explicitly exempt from transform rejection and use rotation-only reprojection. Mesh alpha holes and shader-deformed foliage are not exactly represented by this mask; points/lines/sprites rely on colour/depth rejection rather than a dedicated reactive draw. Moving actors use fresh samples rather than per-object velocity reprojection. Fine particles, wind-blown foliage, animated textures and cloud motion still require broader visual acceptance.

Each history target stores unexposed HDR RGB and signed linear view depth in alpha: zero is sky, negative means reactive, positive means stable. Two RGBA16F histories cost 16 bytes per rendered pixel together (about 31.6 MiB at 1920×1080), without separate depth history or an age texture. The shared RGBA8 mask replaces the prior AO mask. Full-resolution resolve and display draws add GPU work; no physical-GPU performance claim has been verified.

`Graphics.frame()` brackets composer rendering with jitter and exact projection/inverse restoration in `finally`. Hard camera translation/rotation, projection changes, water-medium transitions, target resizing, antialias/AO preference changes, world rebuilding and WebGL context restoration invalidate history. World changes use the existing graphics build hook; low presets release the composer targets. No dependency, save field, per-species flag or second scene graph was added. The existing antialias preference controls temporal accumulation and SMAA together.

This is native-resolution scene TAA. It does not implement Photon's complete pipeline, histogram exposure, per-object velocity, temporal upscaling, offscreen reflection, or independent temporal denoising of water reflections. Water deliberately remains reactive so waves/reflections keep current-frame responsiveness.

## Design review

Review covers every changed diff and the full new production modules / browser scenarios. The existing antialias preference, composer lifecycle, scene depth, graphics rebuild and browser-boundary fixture are reused. Two history targets and weakly keyed previous transforms are the runtime state required by temporal reprojection; no new saved settings or compatibility layer is introduced. Product code/UI is net +335 lines; tests are net +535 lines; configuration is net zero lines (version values only). Documentation is net +76 lines.
