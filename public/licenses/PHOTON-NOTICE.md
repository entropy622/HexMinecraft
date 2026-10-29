# Photon atmosphere

Hexwild 0.99 bundles the unmodified `shaders/image/atmosphere/scattering.dat`
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

The atmospheric coordinate mapping is based on Eric Bruneton's implementation.
Its [BSD notice](bruneton.txt), also reproduced by Photon, is retained.

Host changes include kilometres with stable sphere products, a WebGL2 3D
half-float texture, linear sRGB output, the existing host scattered-light and
moon brightness scales, a shared asynchronous sky/SH snapshot, and explicit
resource lifetime. The table uses Photon's fixed ground-level atmosphere;
host direct sunlight and local air transport retain their separate spherical
model. This is not a port of the whole Photon shader pack.
