# 十六色地毯验证

## 编码前的五个设计判断

1. 结构性：十六色共用 `DYES`、羊毛材质和一个 `carpet` 薄层形状，贯通现有合成、库存、世界与物品模型，不逐色复制实现。
2. 调用负担：玩家只选择颜色与位置，不增加设置、存档字段或公开参数。
3. 可推导性：颜色从同色羊毛配方确定，厚度固定为 1/16 格，支撑由下方真实世界单元决定，均由系统推导。
4. 最小性：复用 `buildingParts`、`buildingItemMesh`、`cutBlockIcon`、`maintainBuildings`、v16 序列化，只增加地毯注册和必要分类；菜单色块无法满足碰撞、掉落和存档，因而不能更小。
5. 泛化范围：覆盖全部 16 色、普通地面、现有半砖和围栏，以及支撑移除，不为单张截图或某个颜色增加分支。

## 编码前的失败类别

- 合成：同色两块羊毛产三张；不同色混合、数量不足、错误材料不能合成；旋转/平移后的七格布局保持成本；批量合成及背包满时材料不能丢失。
- 库存：16 色分别堆叠，真实产物进入库存，放置消耗一张，采回与支撑掉落保持颜色及数量。
- 几何与物品：世界、手持、掉落、图标共用羊毛纹理与薄层几何，不能显示成整块羊毛；1/16 顶面、薄层内外命中、跨格相邻与围栏伸出的 1.5 格碰撞不能混淆。
- 支撑：空气不支持地毯；已有非空气方块和液体可支持；下半砖上方保留按单元铺设的位置，围栏上的地毯提供周围的平台但保留围栏中央高碰撞；支撑移除必须掉落上方地毯和连续叠放地毯。
- 采集与分类：任意工具或空手采回本色一张，剪刀不获得羊毛加速；地毯透光、不发光、不传导红石、不作为完整面支撑红石元件。
- 保存：真实库存、地毯单元与掉落实体经完整 v16 校验、刷新继续后保持；不升级存档版本。
- 交互回归：放在玩家/生物体内被拒绝，侧面无支撑时不扣物品，重载后不产生重复地毯或重复掉落。

## E2E 场景（先于实现准备）

`tests/carpets.spec.js` 使用现有 `tests/browser-fixture.js` 在浏览器 Pointer Lock 边界替代原生锁定。通过实际背包配方搜索、填充与取出合成产物，右键瞄准真实世界几何铺设，再通过移动、长按采集、拾取、保存与刷新继续验证。场景生成截图和稳定 JSON 清单，不替换仓库内部模块。测试平台/初始原料通过已有开发 fixture 或真实存档导入准备，功能操作走现有 UI 与输入事件。

`tests/carpets.test.js` 隔离检查直接使用真实 World、PlayerInventory、crafting、buildingParts、mining、VoxelLight、Redstone 和完整 v16 校验；它们不代替尚未运行的 E2E。

## 一手来源与实现范围

- [Mojang，Taking Inventory: Carpet，2025-10-24](https://www.minecraft.net/en-us/article/carpet)：同色两块羊毛横向合成三张地毯；地毯让光通过；有 16 色。
- [Mojang，Trails & Tales Bedrock 更新说明](https://www.minecraft.net/en-us/article/trails---tales-update-now-available-bedrock)：列出十六个独立颜色地毯 ID。
- [Mojang，A Step in the Wrong Direction](https://www.minecraft.net/en-us/article/a-step-wrong-direction)：明确地毯使站立高度增加 0.0625 米，对应 1/16 格。
- 官方 Java 1.21.5 的 [server JAR](https://piston-data.mojang.com/v1/objects/e6ec2f64e6080b9b5d9b471b291c33cc7f509733/server.jar) 与 [Mojang mappings](https://piston-data.mojang.com/v1/objects/f4812c1d66d0098a94616b19c21829e591d0af3a/server.txt) 静态核对：`CarpetBlock` 的形状为 0..1 像素高，`canSurvive` 要求下方非空气。此处为字节码与官方名称映射核对，未运行原版客户端。
- 本项目六边形网格按相邻两格表达原版横向两格，使用现有旋转、镜像、平移规则，保留成本和产量。
- 1/16 格厚度和现有围栏的 1.5 格碰撞在本项目真实形状体系中表达；本次不含直接给地毯再染色、地毯燃料、骆马装饰、村民售卖、刷怪规则或原版生物寻路。围栏地毯不增加另一套玩家/生物碰撞模型。
- 不增加新资产或依赖。材质使用当前已随项目分发的羊毛纹理和 `DYES` 调色。

## 草方块、光学面与红石的独立规则

地毯本身需要下方非空气单元，允许本项目已有半砖、楼梯、活板门、围栏和地毯支撑。它有真实碰撞底面，但不因此充当红石、木门等要求的完整支撑面。世界几何与碰撞为 1/16 高；VoxelLight 使用与空气相同的传输成本 1，不额外遮蔽天空或脚下光源；Redstone 依据既有部分形状分类判为不导电。

地毯不应使脚下草方块退化为泥土。官方 1.21.5 中，`SpreadingSnowyDirtBlock.canBeGrass` 通过 `LightEngine.getLightBlockInto` 判断存活；后者的 `isEmptyShape` 将 `canOcclude=false` 或 `useShapeForLightOcclusion=false` 的光学形状视为空。`CarpetBlock` 与 `WoolCarpetBlock` 没有覆盖默认返回 false 的 `BlockBehaviour.useShapeForLightOcclusion`，因此地毯的碰撞下表面不能直接用作草的完全遮光面。`BlockBehaviour.getLightBlock` 对非 solidRender 返回 0/1，低于草存活判定阈值 15。草生态代理据同一份官方 JAR/mappings 核对该结论，组合验收应保留地毯下的草。当前分支已重放到验证后的 0.83 主线 `d6c8938`，该基线尚无草退化系统，此行为等待与草生态 feature 合并验收。

## 执行证据

- `npm test`：重放到 0.83 主线后，现有 125 项 Node 检查通过，包括主线新增的染色光束检查。
- `node --test tests/carpets.test.js`：新增 8 项通过，覆盖所有颜色的配方/旋转、拒绝与背包满原子性、真实薄层碰撞、已有部分支撑与围栏、空气与液体、透光/红石、采集、活塞实际调度和 v16 序列化。
- `npm run build`：生产构建通过；仍有项目已有的大 bundle 提示。
- 本次改动文件的 Prettier 检查、`node --check tests/carpets.spec.js`、`git diff --check` 通过。
- E2E 静态列出三条场景成功。浏览器 E2E 尚未运行，须等待主代理分配串行图形窗口。独立配置位于忽略目录 `test-results/carpets-playwright.config.mjs`，仅 headless Chrome / D3D11，端口 `5189`，Vite 缓存在本工作区的 `test-results/carpets-vite-cache`，不使用共享 `node_modules/.vite` 或用户 `5173` 页面。

## 交付设计复查

逐行复查了全部改动和四个新增文件。新增内容没有公开参数、配置、依赖、存档状态或兼容格式；`tile` 是现有材质字段，颜色来自 `DYES`，形状只有一份，支撑规则由放置和维护共用。液体只加入既有可流入分类，维护复用既有建筑移除与掉落实体路径。测试没有读取源码、替换仓库模块或添加产品测试分支。真实流程脚本与隔离失败类别保留，未运行的浏览器场景不计作通过。

分组净行数为产品代码 +64、测试 +731、验证文档 +55，共 +850。产品增长来自 16 色注册/配方与六边形薄层、已有链路的分类和支撑维护；测试增长用于三条真实 UI 生命周期及八组独立失败类别，不能用读取源码或替换模块的短断言代替。
