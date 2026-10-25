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

Version 0.24 adds nine unmodified files from the same revision and CC BY-SA 3.0
media license: `default_steel_block.png`, `mcl_anvils_anvil_base.png`,
`mcl_anvils_anvil_side.png`, `mcl_anvils_anvil_top_damaged_0.png`,
`mcl_anvils_anvil_top_damaged_1.png`, `mcl_anvils_anvil_top_damaged_2.png`,
`grindstone_front.png`, `grindstone_side.png`, and `grindstone_top.png`.
The hexagonal anvils, grindstone, supports, axle and processing animations
are original geometry; no upstream model or GUI artwork is included.

Version 0.26 adds 30 unmodified files from the same revision and CC BY-SA 3.0
media license:

- `mcl_brewing_base.png`, `mcl_brewing_side.png`, `mcl_brewing_top.png`;
- `mcl_potions_potion_bottle.png`, `mcl_potions_potion_overlay.png`;
- `mcl_nether_soul_sand.png`, `mcl_nether_nether_wart.png`, and
  `mcl_nether_nether_wart_stage_0.png` through `_2.png`;
- `mcl_core_redstone_ore.png`, `redstone_redstone_dust.png`,
  `mcl_nether_glowstone_dust.png`, `mcl_mobitems_magma_cream.png`,
  `mcl_mobitems_slimeball.png`, `mcl_fishing_pufferfish_raw.png`;
- `mcl_core_gold_nugget.png`, `farming_carrot_gold.png`,
  `mcl_potions_melon_speckled.png`, `farming_melon.png`,
  `mcl_farming_melon_stem_disconnected.png`, `farming_melon_side.png`,
  `farming_melon_top.png`, `mcl_farming_melon_seeds.png`;
- the six `mcl_potions_effect_*.png` icons for `swiftness`, `strength`,
  `regeneration`, `fire_resistance`, `water_breathing`, and `night_vision`.

The bottle overlay is tinted and combined with the original bottle texture at
runtime for inventory icons, held sprites and dropped items. These derived
texture combinations retain CC BY-SA 3.0. The six-sided brewing stand, glass
vials, bubbles and melon geometry are original; no upstream models are included.

Version 0.30 adds six unmodified images from the same VoxeLibre revision:

- `mcl_mobitems_ghast_tear.png`, `mcl_fire_fire_charge.png`,
  `vl_mobitems_flaming_rod.png`, and `vl_mobitems_flaming_powder.png` use
  the upstream general CC BY-SA 3.0 media terms.
- **Exception to the base-texture license above:** `mobs_mc_ghast.png` and
  `mobs_mc_ghast_firing.png` are distributed under **CC BY-SA 4.0**, following
  the mob-media notice. The ghast artwork is based on Pixel Perfection by
  XSSheep, with VoxeLibre modifications credited to MysticTempest. See the
  preserved [mob-media attribution](VOXELIBRE-MOBS-MEDIA.md) and
  https://creativecommons.org/licenses/by-sa/4.0/legalcode .

Runtime ghast skin crops and UV views retain CC BY-SA 4.0. The hexagonal ghast,
seven tentacles, blaze with three six-rod rings, flight/attack logic, fireball
geometry, particle trails and synthesized sounds are original implementations.
No upstream mob model, GPL source code, or sound recording is bundled.

Photon (https://github.com/sixthsurge/photon) provided visual inspiration for
warm low sunlight, sky color and water highlights. No Photon source or assets
are included, and this project does not implement or bundle the Photon pack.
