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

Host changes include kilometres with stable sphere products, a WebGL2 3D
half-float texture, linear sRGB output, a shared asynchronous sky/SH/light
snapshot, and explicit resource lifetime. The table uses Photon's fixed ground-level atmosphere;
direct sunlight uses the source analytic Chapman approximation. Local air retains
the host's linear-sRGB integration and weather aerosol multiplier. Full-sphere
SH and the existing celestial artwork/geometry remain host adaptations. This is
not a port of the whole Photon shader pack.
