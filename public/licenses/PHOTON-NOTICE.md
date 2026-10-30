# Photon atmosphere

Hexwild 0.99 and later bundle the unmodified `shaders/image/atmosphere/scattering.dat`
from Photon Shaders by Benjamin Stott (SixthSurge), commit
`6e67b36e818bacde0304edd49f28e2bb70e33f04`.

Source: https://github.com/sixthsurge/photon/tree/6e67b36e818bacde0304edd49f28e2bb70e33f04

The source binary is `src/assets/photon-scattering.dat`, 393216 bytes, SHA256
`d4834ef3babc1376f923f39d495d69dd9d7099f56feb40335a184af8a6b98fc6`.
It is embedded in the application bundle. Runtime RGB16F to RGBA16F packing
preserves every source RGB bit, including signed residuals, and adds alpha 1.

`src/photon-sky.js` adapts the lookup mapping, finite-area RGB Mie phases,
colour matrices and atmosphere saturation from Photon's `atmosphere.glsl`,
`phase_functions.glsl`, `color.glsl`, settings and `shaders.properties`.
Photon's original [license](photon.txt) applies to these portions and the table;
the project's MIT license does not replace it.

Since 0.100, `src/photon-lighting.js` also adapts the default sun/moon exposure,
tints, phase brightness table, early-night skylight boost, Chapman approximation,
coefficients and atmosphere saturation from `lighting/colors/light_color.glsl`,
`sky/atmosphere.glsl`, `global.glsl`, `color.glsl`, `settings.glsl` and
`shaders.properties`. `src/sky-transport.js` uses the source density profiles
and coefficients. These derived portions retain the same upstream licenses.

The atmospheric coordinate mapping is based on Eric Bruneton's implementation.
Its [BSD notice](bruneton.txt), also reproduced by Photon, is retained.

Since 0.101, `src/photon-color.js`, `src/photon-grading.js` and
`src/photon-output.js` adapt the Rec.2020 transforms, input/output grading,
Lottes operator, selective hue adjustments, blackbody/Bradford white balance
and display-transfer approximation from `utility/color.glsl`,
`post_processing/tonemap_operators.glsl`, `post_processing/aces/utility.glsl`,
`program/c19_color_grading.*`, `program/final.fsh`, `global.glsl` and
`settings.glsl` at the same pinned revision. The upstream license also covers
these derived portions. Three's input texture transfer remains the host model.

Since 0.102, `src/photon-cas.js` and `src/photon-output.js` adapt Photon's
FidelityFX CAS filter from `program/final.fsh`: display-space 3x3 soft extrema,
the source weight shaping, intensity mapping and clamp/division order. Host
changes repeat image edges, define zero-signal channels as zero amplification,
and fuse pointwise grading with the taps instead of storing the source's packed
R11F_G11F_B10F intermediate. Photon's license still applies to these portions.
The [AMD FidelityFX CAS MIT notice](fidelityfx-cas.txt) is also retained.

Since 0.103, the geometric directional diffuse response in `src/skylight.js`
adapts `lift(NoL, 0.25)` and `AO_IN_SUNLIGHT` from `lighting/diffuse_lighting.glsl`
and `global.glsl` at the same pinned revision. The finite incident multiplier
preserves separate transmission, shadow bounce, and local-light energy.
These derived portions retain Photon's license.

Since 0.104, `src/photon-specular.js` adapts the hardcoded optical classes,
dielectric Fresnel, GGX/Smith visibility, spherical light-disk approximation,
and source highlight limit from `surface/material.glsl`, `lighting/bsdf.glsl`
and `lighting/specular_lighting.glsl` at the pinned revision. The host uses
linear-sRGB albedo, reconstructs the texture-space brightness, and defines
finite degenerate/smooth limits. `surface-optics.js` maps native block IDs;
no upstream material-mask or labPBR texture decoder is assumed. These derived
portions retain Photon's license.

Since 0.105, `src/surface-reflection.js` adapts the visible-normal GGX sampler,
Smith reflection weights, interleaved gradient noise, fixed-material reflection
mask and skylight fallback from `lighting/specular_lighting.glsl` and
`utility/dithering.glsl`. The host extends its existing same-frame wet-surface
tracer to eligible opaque surfaces, with four rough rays and shared sky radiance.
It uses compact material attachments in the existing protection draw; source
history reprojection, reflected fog correction and color mip filtering are not
included. These derived portions retain Photon's license.

Since 0.106, `src/reflection-trace.js` adapts the projected depth march and
refinement from `misc/raytracer.glsl`. `surface-reflection.js` also adapts the
roughness-to-color-mip rule and R1 dither progression. Host changes clip to
actual WebGL screen bounds, retain protection/thickness/range rejection,
use an IGN seed instead of the source noise texture, and reuse the march for
wet surfaces. `reflection-radiance.js` uses standard Three.js HDR copying and
GPU mip generation; source history/fog correction remains separate work.
These derived portions retain Photon's license.

Since 0.107, `src/photon-specular.js` also adapts labPBR specular decoding,
the eight source metal F0/F82 pairs and the Lazanyi Fresnel approximation from
`surface/material.glsl` and `lighting/bsdf.glsl`. Normal XY reconstruction and
material-AO light-level adjustment follow `program/gbuffers_all_solid.fsh`.
The host retains linear-sRGB lighting, its atlas, tangent-frame derivatives,
and its shared reflection buffers. POM and generic material SSS remain separate
work. These derived portions retain Photon's license.

Since 0.108, `src/photon-skylight.js` adapts the 256-point R2 hemisphere
projection from `program/d4a_generate_sky_sh.csh` and the sampling/random/SH
utilities. The host converts coefficient ordering and the last two source
basis normalizations for Three.js's standard real-SH irradiance evaluator.
Its clear-air sky map and shared asynchronous publication remain in use;
cloud/analytic-fog feedback into the sky map is not yet included.
These derived portions retain Photon's license.

Host changes include kilometres with stable sphere products, a WebGL2 3D
half-float texture, linear sRGB output, a shared asynchronous sky/SH/light
snapshot, and explicit resource lifetime. The table uses Photon's fixed ground-level atmosphere;
direct sunlight uses the source analytic Chapman approximation. Local air retains
the host's linear-sRGB integration and weather aerosol multiplier. WebGL SH
reduction and the existing celestial artwork/geometry remain host adaptations. This is
not a port of the whole Photon shader pack.
