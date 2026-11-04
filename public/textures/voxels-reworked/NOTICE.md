# Voxels Reworked selection

52 unmodified block PNGs with 16 x 16 frames by **Chiragon**, based on **Pixel Perfection by XSSheep**. Native transparency and animation strips are preserved; the runtime atlas uses the first frame.

- Project: https://content.luanti.org/packages/Chiragon/voxels_reworked/
- Release: **33761**, `0.7.0 - Bleeding Edge Hud Elements`.
- Pinned archive: https://cdn.content.luanti.org/uploads/14ffd8c672.zip
- Archive SHA256: `6756f89ed5c6380aa7589ba99cbd59d8a2d5fa1b2226a4fd7a3f5b95cb79c822`.
- License: **CC BY-SA 4.0**. The unmodified upstream notice is in [LICENSE.txt](LICENSE.txt); full terms: https://creativecommons.org/licenses/by-sa/4.0/legalcode .
- Individual source paths and hashes: [source.json](source.json).

Hexwild selects stone, cobblestone, stone bricks, slab faces, mossy cobblestone,
dirt, gravel, oak / birch / spruce wood, six ores, calcite, basalt, tuff and
bedrock. The PNG files themselves are unchanged. Atlas padding, projected icons,
and native numeric relief / roughness tiles derived from these files retain
CC BY-SA 4.0. These adaptations do not imply endorsement by the original artists.

Version 0.140 expands the selection to 52 files, including metal and raw ore
blocks, amethyst and budding amethyst, jungle logs, enchanting-table faces,
redstone ore, End stone/bricks, Nether surfaces, glowstone and smoker faces.
Transparent source pixels are retained rather than filled. The source archive
and its license are unchanged; all new per-file hashes are in `source.json`.

The relief is a modest host-generated approximation from pixel values and
material categories, not a height map supplied by Voxels Reworked. Native
numeric channels are separate from imported labPBR semantics. Hexwild's code
remains MIT licensed. Other default textures retain their existing notices in
[the parent notice](../NOTICE.md).
