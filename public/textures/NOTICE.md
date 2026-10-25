# Pixel Perfection / VoxeLibre textures

Files in `pixel-perfection/` are copied without file modification from
[VoxeLibre](https://github.com/VoxeLibre/VoxeLibre), commit
`4492ce6ff8d856daa4567abe2ea689f4e7a39842`, directory `textures/`.

The base artwork is **Pixel Perfection by XSSheep**, with contributions by the
VoxeLibre artists listed in [VOXELIBRE-CREDITS.md](VOXELIBRE-CREDITS.md).
Source pack: https://www.planetminecraft.com/texture_pack/131pixel-perfection/

These selected base textures are redistributed under **Creative Commons
Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)**, following the upstream media
license. See the preserved [upstream legal notice](VOXELIBRE-LEGAL.md) and
https://creativecommons.org/licenses/by-sa/3.0/legalcode . No code from VoxeLibre
is included. Its GPL code license does not replace the media license.

Hexwild crops/resamples these images into a padded atlas and tints grass/leaves
at runtime to fit the hexagonal world. Those derived texture tiles retain the
same CC BY-SA 3.0 license. Source images are supplied alongside the application.
Original procedural fantasy tiles and application code remain MIT licensed.

Version 0.14 additionally uses the unmodified `default_furnace_front.png`,
`default_furnace_side.png`, and `mcl_core_charcoal.png` from the same revision
and license. The existing active furnace front is used only while burning.

Version 0.15 adds six unmodified `mcl_fishing_*` inventory textures (fishing
rod, raw/cooked cod, raw/cooked salmon, and tropical fish) from the same
revision and license. The hexagonal bobber, fishing line and held rod are
original procedural geometry.

Version 0.16 adds the unmodified `mcl_boats_oak_boat.png` inventory icon from
the same revision and media license. The hexagonal hull, seats and oars are
original geometry using the existing wood tiles; no upstream boat model is
redistributed.

Version 0.20 adds unmodified `farming_bread.png`, `mcl_mobitems_beef_raw.png`,
and `mcl_mobitems_beef_cooked.png` from the same revision and media license,
used for food inventory icons, dropped items and held eating animation.

Version 0.21 adds the unmodified `mcl_shield.png` inventory icon from the same
revision and media license. The held hexagonal shield is original geometry,
using the existing wood tile and plain metal material.

Version 0.23 adds the unmodified `mcl_core_lapis_ore.png`, `mcl_core_lapis.png`,
`mcl_enchanting_table_top.png`, and `mcl_enchanting_table_side.png` from the
same revision and CC BY-SA 3.0 media license. The hexagonal enchanting pedestal,
floating open book, orbiting glyphs, experience orbs and enchantment glow are
original geometry and rendering effects; no upstream models are included.

Photon (https://github.com/sixthsurge/photon) provided visual inspiration for
warm low sunlight, sky color and water highlights. No Photon source or assets
are included, and this project does not implement or bundle the Photon pack.
