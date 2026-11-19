# 霜珠 · 白龙娘

[下载 YSM 模型包](../public/models/pearl-dragon-hy.zip) · [可编辑的 Blockbench 工程](../art/models/Pearl-Dragon-HY.bbmodel) · [六秒转台与动作](media/pearl-hy/turntable.mp4)

![设定正面与同高度的六野实渲正、侧、背面，以及面部近景](media/pearl-hy/model-sheet.webp)

**六野**已内置这版角色。按 **F5** 切换视角，按 **E** 看背包里的表情。用过自定义角色的玩家，可在「选项 → 角色模型 → 恢复白龙娘」切回。角色选择独立于世界存档。

**Minecraft Java / Yes Steve Model**：将 ZIP 原样放进实例的 `config/yes_steve_model/custom/`，在有权限的世界执行 `/ysm model reload`，然后在模型菜单选「六野 · 白龙娘」。如果已安装同名旧版，可先把旧 ZIP 移出该目录。[官方模型格式与目录](https://yesstevemodel.github.io/wiki/type/)

## 造型与动作

混元 GLB 是一张连续的身体网格，含 1,998,136 个三角面和一张 4096 像素方形贴图。重建时以它的横截面校对身体厚度、裙摆和尾弧，由网格采样翼展与颜色。脸单独制作：方块刘海遮住眉梢，紫瞳、腮红和嘴形对齐设定图的四个表情；下颌向两侧收窄，转头时眼睛随脸面转动。

两翼左右各一只。分层裙由左右前片和后拖裙组成，迈步时前片分别跟腿，后片单独摆动。尾巴使用七个首尾相接的骨段，鳞面带厚度。发饰和腰扣凸出衣料，裙脚的结纹直接绣进贴图。

第三人称使用 33 根骨骼、2,594 个三角面和一张 1024 × 2048 图集；第一人称只加载手臂、前臂和握持点。包内含待机、行走、奔跑、挥手、使用物品、潜行、乘坐等 20 个第三人称动作，第一人称的物品动作单列。

## 制作与验证

- **结构参照**：[YSM 官方「酒狐 · 汉服」工程](https://github.com/YesSteveModel/YesSteveModel/tree/15c2c25f5b50f54ee099bc474483dc4b588d956d/src/main/resources/assets/ysm/builtin/wine_fox/06_hanfu)。采用 spec 2 清单、Bedrock 几何、独立手臂、分段尾骨及握持定位点。酒狐的模型、贴图和动画没有打入这个包。
- **第一人称动作来源**：[官方 Default 工程](https://github.com/YesSteveModel/YesSteveModel/tree/15c2c25f5b50f54ee099bc474483dc4b588d956d/src/main/resources/assets/ysm/builtin/default)。该工程的 `ysm.json` 标明 CC0；使用其中 `animations/arm.animation.json`，保留与本模型手臂骨架匹配的轨道。
- **可编辑工程**：Blockbench 5.2.2 的 Bedrock 导入器读入成品几何、内嵌贴图和 20 个动作，再回导核对面件数量。角色不用六野专用的曲面扩展。
- **游玩验收**：后台 Edge 运行六野，模拟 Pointer Lock。查看[第三人称实景](media/pearl-hy/field.webp)和[背包预览](media/pearl-hy/inventory.webp)。性能数据见[同机位采样](media/pearl-hy/performance.md)。

如需从原始混元 GLB 重建，在仓库根目录运行下列命令。Python 需要 Pillow、NumPy 和 SciPy；Blockbench 工程导出脚本使用后台 Edge 与 Blockbench 网页版。

```sh
python tools/pearl_hy/build.py "path/to/hunyuan.glb"
node tools/editable-dragon.mjs public/models/pearl-dragon-hy.zip art/models/Pearl-Dragon-HY.bbmodel
node tools/pearl_hy/review.mjs test-results/pearl-hy --motion
```

[旧版白龙娘、旧 Blender 源件及牧场生物](pearl-dragon-0147.md)
