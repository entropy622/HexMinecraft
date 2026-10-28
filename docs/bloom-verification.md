# HDR bloom verification

## Proposal gate, written before implementation

1. **Structural:** filter the entire linear HDR signal through a normalized scale pyramid, so highlight extraction, aliasing and cross-scale reconstruction are addressed together.
2. **Burden:** reuse the light-effects preset and its existing bloom amount; add no settings, save fields, dependencies or alternate rendering path.
3. **Determinable:** derive every pyramid size from the composer's physical pixel size; zero amount releases its targets and low quality has no composer.
4. **Gratuitous:** one pass replaces UnrealBloomPass; use separate small targets rather than Photon's packed atlas, tile padding, merge and tile-index machinery.
5. **Overfitted:** dark/bright fields, colored lights, moving small sources, water, resize and context restoration exercise the same pass, rather than tuning one screenshot.

The smallest sufficient change is an independently written normalized downsample / recursive tent reconstruction pass. Three r186's installed UnrealBloomPass already provides five Gaussian scales, but extracts with one bilinear half-resolution sample plus a narrow luminance threshold and adds unnormalized weighted scales. Adjusting its parameters cannot change those sampling and composition contracts. Its simpler BloomPass provides one convolution scale. BloomNode is the same high-pass/Gaussian family for the WebGPU/TSL renderer, while this game uses WebGLRenderer and EffectComposer. A renderer migration or another package would add more code than the missing capability.

## Actual reference

Official Photon main was resolved with `git ls-remote` on 2026-10-28 to [6e67b36e818bacde0304edd49f28e2bb70e33f04](https://github.com/sixthsurge/photon/tree/6e67b36e818bacde0304edd49f28e2bb70e33f04). The source was read at that revision, rather than inferring the algorithm from screenshots.

- [README](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/README.md) credits Sledgehammer Games' Call of Duty: Advanced Warfare downsampling method.
- [Downsample](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c5_c10_bloom_downsample.fsh) reads full HDR TAA output without a brightness threshold, then creates six half-resolution levels using the normalized 13-fetch overlapping-box filter.
- [Horizontal](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c12_bloom_gaussian_0.fsh) and [vertical](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c13_bloom_gaussian_1.fsh) passes apply normalized nine-tap binomial blur to the packed tiles.
- [Upsample](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c14_c18_bloom_upsample.fsh) recursively mixes each tile with its coarser neighbor. At default spread the coarse fraction is 0.575. Bilinear is default; bicubic is an option.
- [Color grading](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c19_color_grading.fsh) mixes the final bloom with scene color at default fraction 0.12 before exposure and tone mapping. Bloomy fog is an additional separate effect.

Only principles and the publicly described normalized filter are used here. No Photon source, packed atlas, bicubic helper, Gaussian code, grading or fog implementation is redistributed. Our recursive nine-fetch tent reconstruction differs from Photon's per-level Gaussian plus selectable upsampler. This change does not claim visual or physical equivalence to Photon.

## Observable contract and complete failure categories

These categories precede implementation and are the basis of `tests/bloom.spec.js`.

| Category       | Failure to catch                                                                                                                  | Production-path evidence                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Signal         | Zero input glows; constant fields gain energy; a color channel becomes negative, NaN or infinite; finite half-float HDR overflows | Render the actual exported pass on GPU with zero, constant colored fields and values up to 60000; read half-float output                   |
| Sampling       | A small source disappears at a threshold; its halo energy pulses with pixel phase; broad scales are absent                        | Constant-energy moving HDR footprint into the actual pass; record integrated RGB and radial halo distribution                              |
| Reconstruction | Coarse tiles form blocks, ringing or anisotropic bands                                                                            | Inspect actual dark-room and emissive-source screenshots, radial metrics and motion sequence; no screenshots accepted solely on brightness |
| Color          | Colored emission becomes gray, changes hue or clips due to a channel-wise nonlinear operation                                     | Colored GPU impulses and real emissive/colored-glass chamber; compare RGB ratios before output mapping                                     |
| Composition    | TAA, exposure, OutputPass or alpha cease to work; water/hand protection changes                                                   | Full app scene with TAA and exposure enabled, air/underwater transition, hand mask and existing colored-light suite                        |
| Dimensions     | Resize, odd sizes, DPR or tiny viewport create invalid targets, stale borders or wrong footprints                                 | Real composer resize and DPR changes, plus actual pass at odd and tiny sizes                                                               |
| Lifecycle      | Bloom zero still allocates/runs, low quality retains targets, context loss leaves stale handles, repeated toggles leak            | Actual controls, target disposal events, renderer draw observations and WEBGL_lose_context restoration                                     |
| Driver         | Compilation/link errors, GL errors or unintended software renderer                                                                | Save unmasked renderer/vendor, browser console errors/warnings and GL error in manifests; run native headless D3D11                        |
| Acceptance     | Only a synthetic probe passes, baseline is missing, or brighter is called better                                                  | Preserve old/new/off real-scene images and normalized manifest; view the images and explain remaining limitations                          |

Supported color domain is finite nonnegative linear HDR RGB representable by half float (0 through 65504). The pass preserves alpha. Its normalized kernels and convex scale/final blends preserve a spatially constant RGB field (DC gain 1), including values below 1. This is the concrete energy-control claim. Interior impulse integrated radiance should be stable across sampling phases within GPU/half-float tolerance. Clamp-to-edge and non-even resampling do **not** promise exact global finite-image energy conservation for an arbitrary source at the image border. This is an image-space scattering approximation, not a physical lens PSF.

The existing bloom value 0.24 maps to a scattered fraction of 0.12, matching the reference's default final mixing fraction; the existing maximum 0.5 maps to 0.25. The scene is redistributed instead of adding a separately amplified signal. No hard brightness threshold is used. Linear filtering and the same scalar weights for every RGB channel retain hue before display mapping.

## Cost and acceptance procedure

For physical frame area F, six downsample targets occupy approximately F/3 and five reconstructed targets another F/3. Total is about 0.6663 F RGBA16F pixels (5.33 F bytes), versus old bright half target plus two five-level chains, about 0.9160 F (7.33 F bytes). The broadest scale reaches 1/64 rather than 1/32. Odd sizes round upward and tiny chains stop at 1x1. There are six down draws, five reconstruction draws and one full-resolution composite at ordinary sizes, versus the old extraction, ten blur draws, scale merge and additive draw. Fetch counts and native GPU time must be measured; smaller allocations alone do not establish a performance win.

Run the real-scene test on baseline commit `9f98362539956178e9b1a4a35b323cf055810687` first using an isolated checkout and the same test files/config, then on this branch. `BLOOM_LABEL=old` or `new` labels artifacts; it never changes product rendering. Preserve each output directory. The baseline scene test makes no assertions on new pass internals. Numeric/lifecycle contracts apply to the new pass.

Use `tests/bloom.playwright.config.js` only after the parent grants the serial GPU window. It owns port 5199, a separate Vite cache and output directory, uses `browser-fixture.js` at the pointer-lock device boundary, native headless Chrome, and D3D11 arguments. No frontmost browser, foreground pointer lock, or 5173 server is needed. Save actual RTX renderer details and all shader diagnostics, including existing gradient-loop warnings; do not suppress errors to make a run green.

Required final evidence: old/new/off air chamber images, small-emitter motion strip, underwater images, HDR numeric manifest, resize/DPR/quality/context manifest, existing colored-light regression, source/build/format checks and explicit visual review. Until those runs and review finish, this document records a plan and contract, not visual acceptance.

## Static delivery review

The complete `bloom-pass.js`, `postprocessing.js`, `bloom.spec.js`, both isolated run configs and this document were read line by line. The old product bloom import and construction are removed. There are no new player fields, branches selecting implementations, test-only product parameters, dependencies, saved data or compatibility readers. A single pass class is appropriate for EffectComposer's existing pass boundary; its two filters and final composite each have one rendering responsibility. Separate test configs are required to isolate the allocated port, GPU driver, artifacts and Vite cache from concurrent work.

Before GPU allocation: all 158 existing Node tests pass; production build passes (existing large-chunk warning); changed files pass Prettier, JavaScript syntax and whitespace checks; Playwright discovers all three scenarios without launching a browser. GPU contracts and visual acceptance remain pending.
