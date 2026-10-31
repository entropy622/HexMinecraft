# Photon rendering assets and optics

Since 0.128, `src/distant-foliage.js` reuses the attributed leaf-lighting
functions for the host's coarse distant leaf surfaces: upward sky diffuse,
primary solar scattering, sheen and the far-shadow zero-thickness response.
It does not trace the near world's incomplete optical volume for these surfaces.
The distant terrain/voxel meshing and packed geometry are original host code.

Since 0.131, the distant leaf shader also uses the attributed sky ambient-SSS
and far-shadow visibility compensation from `include/lighting/diffuse_lighting.glsl`.
The visibility is computed from the host's actual temporary hex world using
the same original local canopy sampler as the near surfaces, not Photon's
screen-space horizon integration. The derived lighting retains Photon's license.

Since 0.126, `src/border-fog.js` adapts the directional border-color selection
from `program/d4_deferred_shading.fsh`: morning/evening and rain horizon
selection, view-elevation dampening and the squared blend. It samples the
host's published clear-sky map through the same projection and lower-horizon
extension as the visible dome, then uses the existing air-transport paths.
Photon's cubic distance/eighth-power border profile and downward cutoff
are adapted to the host's oblique axial chunk bounds, retaining the 87.32..118
default range and cave skylight gate. Upward relief and LOD-specific
transitions are not migrated in this change.
These derived portions retain Photon's license.

Hexwild 0.99 and later bundle the unmodified `shaders/image/atmosphere/scattering.dat`
from Photon Shaders by Benjamin Stott (SixthSurge), commit
`6e67b36e818bacde0304edd49f28e2bb70e33f04`.

Source: https://github.com/sixthsurge/photon/tree/6e67b36e818bacde0304edd49f28e2bb70e33f04

Since 0.118, the unmodified `shaders/image/worley_bubbly.dat` and
`worley_swirley.dat` are also bundled as `src/assets/photon-worley-*.dat`.
Each is an R8 64 x 64 x 64 volume, 262144 bytes. Their SHA256 hashes are
`39f2d27cfe0dbbb2222cc9e2f7c37f3b93a0c7dd2567e6f6685b60dc16cefdf9` and
`6e13f05304287ae28efbcf73a44903a1dea77104617a8e591e4617a4bb1b0d8d`.
Runtime stacking into one guarded R8 64 x 64 x 132 atlas preserves every source
byte and periodic filtering. The two volumes supply cumulus bubbly/swirl erosion and altocumulus
swirl detail, including distinct physical frequencies, secondary wind and
sequential edge erosion from `sky/clouds/{cumulus,altocumulus}.glsl`.
Weather detail weights and sharpening from `weather/clouds.glsl` are prepared
once per frame and shared with all cloud-density consumers.
These assets and derived portions retain Photon's license.

Since 0.119, the unmodified `shaders/image/noise.png` is bundled as
`src/assets/photon-noise.png` (512 x 512 RGBA8; SHA256
`9972ae2cad05ccf00fbe2d81209244e265e3c089e840862f3cf0859443f77c34`).
It remains numeric data, without sRGB conversion. A periodic border preserves
linear/repeat filtering inside a shared seed/cache atlas. The cumulus coverage
map and altocumulus base/coverage/detail follow the original channels and
physical frequencies in `sky/clouds/{coverage_map,altocumulus}.glsl`.
`weather/core.glsl`, `weather/clouds.glsl`, `utility/random.glsl` and time weights
in `shaders.properties` supply the temporal temperature/humidity/wind, weak
biome influence, paired coverage ranges and altitude shaping. Cumulus/alto
height shaping no longer applies the earlier extra host top fade/alto density
multiplier. The host still supplies biome noises, a 600-second solar cycle,
rain as wetness, deterministic spatial seed offsets, separate analytic layer
advection, a rectangular macro cache and WebGL ray integration. Cirrus remains
a partial host implementation; congestus and noctilucent clouds are still
missing. These assets and
derived portions retain Photon's license.

Since 0.120, the high cloud layer uses the Perlin-gradient/hash curl from
`sky/clouds/common.glsl` and `utility/random.glsl`, and the R/A/G image channels,
physical frequencies, octave wind offsets and separate cirrus/cirrocumulus
density defaults from `sky/clouds/cirrus.glsl`. The high-cloud amounts follow
`weather/clouds.glsl`; existing saved wetness now supplies `weather/core.glsl`
instead of substituting instantaneous rain. The density's source day_factor
travels with the existing optical snapshot. Zero cell coverage has a defined
zero-density limit. The same published field serves camera, environment and
ground shadows. The host retains its shell thickness, ray integration and
analytic advection. Verbatim source density/hash/gradient functions retained
in the test fixture also retain Photon's license. No new binary asset is added.
The source attributes its Perlin-gradient routine to Inigo Quilez's
gradient-noise article: https://iquilezles.org/articles/gradientnoise/ .

Since 0.121, cloud-shadow preparation, light-plane radial projection, per-layer
shadow coefficients, primary-only transmission, horizon/altitude fades and the
0.8 intensity follow `lighting/cloud_shadows.glsl`. Preparation uses the source
`PROGRAM_PREPARE` constant Worley detail. The B-spline weights derive from
`utility/bicubic.glsl`, which credits
https://stackoverflow.com/questions/13501081/efficient-bicubic-filtering-code-in-glsl .
The host packs a logical 512 x 512 RG map into spare RGBA atlas space and
unpacks before filtering. Stable factored sphere roots preserve WebGL precision.
These derived portions retain Photon's license. Congestus is not implemented.

The source binary is `src/assets/photon-scattering.dat`, 393216 bytes, SHA256
`d4834ef3babc1376f923f39d495d69dd9d7099f56feb40335a184af8a6b98fc6`.
It is embedded in the application bundle. Runtime RGB16F to RGBA16F packing
preserves every source RGB bit, including signed residuals, and adds alpha 1.

Since 0.112, `src/photon-fog.js` adapts the default biome/weather fog
coefficients, time weights, blue-hour mist and evening glow from
`include/weather/fog.glsl`, `shaders.properties`, `settings.glsl` and
`include/fog/overworld/{analytic,raymarched}.glsl`. `src/air-transport.js`
uses their isotropic Rayleigh direct phase and rain attenuation. The host
retains linear-sRGB transport, local height profiles, a spatial hex biome
filter, its shared cloud climate and local block-light scattering. Photon's
license also covers these derived portions.

Since 0.113, `src/sky-fog.js`, `src/sky-clouds.js` and
`src/sky-atmosphere.js` adapt the sky-map air-fog composition and raw clear-sky
incident-light direction/normalization from `program/d0_sky_map.*` and
`include/fog/overworld/analytic.glsl`. The host keeps its shared capped height
profiles and local units, publishes fog with sky lighting, and composes a
non-overlapping analytic far segment after the near-field volume march.
Photon's license applies to these derived portions as well.

Since 0.116, `src/cloud-optics.js` adapts the source per-layer extinction,
albedo and illumination-response parameters from `weather/clouds.glsl`,
`clouds/altocumulus.glsl`, `clouds/cirrus.glsl` and default density settings.
Their published snapshot drives both cloud transport and the shared cloud
shadow field. Noise shapes and optical-depth quadrature remain host adaptations.

Since 0.115, `src/cloud-scattering.js` adapts the distinct cumulus, altocumulus
and cirrus scattering closures, powder responses, coefficient falloffs and
planet/layer bounce from the pinned cloud includes. `src/cloud-integral.js`
combines their coefficients with raw incident sky/weather light and light at
cloud altitude. Geometry, shared extinction scale, quadrature and finite-disk
phase sampling remain host adaptations.

Since 0.114, `src/photon-lighting.js` adapts rain/snow colours, their day curves
and the precipitation snow night floor from `lighting/colors/weather_color.glsl`.
`src/sky-atmosphere.js` applies the source weather mixture to fog incident light;
`src/cloud-integral.js` adapts the rain tint, morning/evening weight and aerial
transmission desaturation from `sky/clouds/common.glsl`. Native rain/snow/splash
materials use the published linear-sRGB colours. These derived portions retain
Photon's license; the host particle geometry and opacity model remain original.

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
Cloud feedback is added in 0.111 below; analytic-fog feedback remains separate work.
These derived portions retain Photon's license.

Since 0.111, sky composition follows the cloud-scattering/transmittance path
in `program/d0_sky_map.fsh` and `include/sky/sky.glsl` before SH projection and
sky reflections. `src/cloud-integral.js` moves the existing host ray integration
out of `cloud-volume.js` so camera and environment captures share it.
`sky-clouds.js` supplies a host WebGL capture, while `sky-atmosphere.js` keeps
clear background and clouded radiance separate and publishes them with SH.
Cloud incident light uses unboosted clear-sky irradiance; the existing adapted
skylight boost is applied after sky composition. The cloud field, 96 x 48
capture, 19-pixel reduction and resource lifecycle are host adaptations.
No new Photon binary asset is included. Existing source-derived helper portions
continue to retain Photon's license; this does not implement the complete sky.

Host changes include kilometres with stable sphere products, a WebGL2 3D
half-float texture, linear sRGB output, a shared asynchronous sky/SH/light
snapshot, and explicit resource lifetime. The table uses Photon's fixed ground-level atmosphere;
direct sunlight uses the source analytic Chapman approximation. Local air retains
the host's linear-sRGB integration and weather aerosol multiplier. WebGL SH
reduction and the existing celestial artwork/geometry remain host adaptations. This is
not a port of the whole Photon shader pack.
