# Photon 迁移审计与实施矩阵

目标是用户参考图中的视觉关系，以及本地 Photon 的绝大部分可迁移能力。完成当前 bloom 不代表完成这个目标。本文件先列出真实差距与后续实施批次，不把功能名称、源码存在或技术检查通过当作画面验收。

审计基准：

- Photon：`D:/Git/photon`，固定提交 [`6e67b36e818bacde0304edd49f28e2bb70e33f04`][p-root]。已对照 [README][p-readme]、[settings.glsl][p-settings]、[shaders.properties][p-properties] 的菜单/启用条件，以及对应 program/include 的实际实现。下方所有 Photon 链接固定到该提交。
- HexMinecraft：初始审计基线为 [`bf64bbf855484deb040d56561fc6713b74fa0480`][h-root]，版本 0.85；下方机制状态已按当前 0.88 源码更新。各验证文件保留首次失败与后续结果，本矩阵不替代实际图像和性能验收。
- 参考图：用户附件 `codex-clipboard-332466b9-bff0-4693-9c2d-c219012105ea.png`。实际查看了 1920x1080 图像；场景是向光森林，白色太阳周围薄云发亮，多层积云有明显厚度和暗底，远山与林冠向空气色递进，低洼湿霾保留前景深绿与背光亮叶的对比。不能从单张图确定其资源包、全部开关、时刻或曝光值。

机制表中的本项目源码链接跟随当前检出版本；初始审计基线保留在上方固定提交中。

`已有` 表示真实生产路径存在该行的核心行为，不表示与 Photon 逐像素相同；`部分` 表示已有机制但缺关键能力；`缺失` 针对该行机制，不否认同一子系统已有基础效果；`宿主接口不适用` 表示依赖 Iris/Minecraft/原生 mod 的接口，不能把相关宏或 UI 参数算成已移植功能。优先级 `P0` 直接决定参考图，`P1` 补齐常用可迁移能力，`P2` 覆盖可选摄影、夜景和质量/性能功能，`P3` 是宿主适配或开发工具。优先级不等于放弃低优先级的持续目标。

当前默认是 `quality=1` 均衡档；真实体积云和后处理链只在 `quality=1.7` 光影档启用，均衡档使用几何云。下面体积云、GTAO、TAA、SSR 和后处理的“已有”均受各自启用条件约束。目标图的成对验收明确使用光影档并记录基线成本；便宜的天空、太阳/月亮和方向光改进应按可行性同时覆盖均衡档，不自动替玩家切高档，也不靠改变曝光伪造改善。

## 参考图最先要求的五个变化

0.88 已加入[局部云覆盖缓存](cloud-coverage-verification.md)，实际复用宏观噪声并减少两次场景的 GPU 成本。它不增加新的云形或光学机制；下方视觉差距和五项优先目标仍然存在。

1. 统一天空辐亮度与方向天光。0.86 已接通球壳天空图和 SH；天空、云、雾、叶片和反射仍需在同一时刻、方向和颜色尺度下完成视觉校准，不能仅凭数值通过认定参考图已还原。
2. 建立厚积云、独立第二体积层和薄高云的形态与遮挡关系。0.86 已扩展既有积分和历史路径；各层厚度、内部光学和天空留白仍需按参考图改善。
3. 让低层云接受高层遮光，校准薄云太阳前向亮边、厚云暗底和多次散射近似。Photon 本身也包含艺术近似，不能把它描述为完整跨层 GI。
4. 让远景空气透视与低洼湿霾保留层次。当前有真实高度雾与光线步进；差距在 RGB Rayleigh/Mie 分离、尺度、天气/群系耦合和沿射线的云影变化。
5. 用方向天光、叶片透射/高光和冠层遮挡共同形成绿叶受光关系。当前已有真实叶片厚度透射；继续提高饱和度、曝光或 bloom 无法补齐冠层结构与照明关系。

## 天空与云

| 功能                           | Photon 的实际机制与固定源                                                                                                                  | HexMinecraft 状态与实质差距                                                                                                                                                                 | 优先级与视觉收益                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 天空大气与日落过渡             | [atmosphere.glsl][p-atmosphere] 含行星壳、RGB Rayleigh/Mie/O3 系数、透射/散射 LUT 和多次散射项；[d0][p-sky-map] 生成天空图                 | **部分，已有球壳 LUT 核心**。[sky-atmosphere.js](../src/sky-atmosphere.js) 采用 RGB Rayleigh/Mie/O3、透射及天空图；当前为有限步单次散射和地面回照近似，仍缺 Photon 的多次散射及完整视觉校准 | **P0**，蓝天到地平线、太阳附近和日落颜色的共同基础                    |
| 有限角太阳、月亮与太阳周围散射 | [sky.glsl][p-sky] 的太阳角盘/临边昏暗；[atmosphere.glsl][p-atmosphere] 的有限角度 RGB 前向相位                                             | **部分**。太阳已为圆盘，含临边昏暗、大气透射及可见角度驱动的软阴影；月亮保留既有相位贴图，尚未完成同等角盘/表面模型                                                                         | **P0**，参考图太阳盘、暖白光晕与薄云边缘                              |
| 星星、月相与日夜               | [stars.glsl][p-stars]、[sky.glsl][p-sky]、[light_color.glsl][p-light-color]                                                                | **已有核心**。[sky-environment.js][h-sky] 有星点、闪烁、八月相贴图和月相亮度；表现方法不同                                                                                                  | **P2**，完善夜间连续性，保留现有真实月相                              |
| 银河                           | [sky.glsl][p-sky] 的球面银河采样与夜间亮度                                                                                                 | **缺失**；现有星点不包含银河                                                                                                                                                                | **P2**，夜空层次；不是白天参考图的前置项                              |
| 极光及对云/地面照明            | [aurora.glsl][p-aurora] 体积积分；[aurora_colors.glsl][p-aurora-colors] 与天气触发                                                         | **缺失**                                                                                                                                                                                    | **P2**，雪地/夜间可选能力，需独立资源与亮度验收                       |
| 雨后双彩虹                     | [rainbow.glsl][p-rainbow] 的反太阳角双虹与色带；[weather/rainbow.glsl][p-weather-rainbow] 推导强度                                         | **缺失**                                                                                                                                                                                    | **P2**，雨后环境反馈；不应常驻屏幕装饰                                |
| 主积云体态与侵蚀细节           | [cumulus.glsl][p-cumulus] 的高度整形、coverage、两种 3D Worley 细节；[common][p-cloud-common]                                              | **部分**。球壳主层约 1200 m，三维云块/细碎边缘及 24..80 步积分；已有厚云体和留白，整体光色与参考图艺术验收继续推进                                                                          | **P0**，参考图大块厚云、碎边和内部体态                                |
| 高积云第二体积层               | [altocumulus.glsl][p-altocumulus] 独立高度、厚度、密度和风；[clouds.glsl][p-cloud-layers] 按代表距离混合                                   | **已有独立层核心，待视觉校准**。独立高度、厚度、覆盖率和风，12..48 步积分、厚度约 480 m 起；与主层按距离合成，参数和形态尚未达到完整 Photon 表现                                            | **P0**，中高云重叠、天空留白与纵深                                    |
| 卷云和卷积云薄高层             | [cirrus.glsl][p-cirrus] 的 curl/多频细节及薄层光学                                                                                         | **部分**。已有独立薄高层积分，纤维与碎片覆盖分开生成；缺 Photon 完整 curl 纤维细节与光学标定，夜光云仍单列为缺失                                                                            | **P0**，参考图高处细云和太阳附近的半透亮层                            |
| 浓积云/天气低层替代            | [cumulus_congestus.glsl][p-congestus] 与 [weather/clouds.glsl][p-weather-clouds] 的混合                                                    | **部分天气增厚基础**；当前 rain/storm 只降低单层 threshold、增加高度，没有独立形态/替代关系                                                                                                 | **P1**，晴天到阴雨的结构变化                                          |
| 夜光云                         | [noctilucent.glsl][p-noctilucent] 的高层形态和暮光条件                                                                                     | **缺失**                                                                                                                                                                                    | **P2**，少见暮光能力，不与普通高云混为一项                            |
| 云单次/多次散射近似与粉末效果  | [common.glsl:57][p-cloud-phase]，主积云 [scattering][p-cumulus-scattering] 有窄前向峰、后向瓣和多阶衰减近似                                | **部分**。已独立接入有限太阳盘、窄前向峰、后向瓣、粉末响应与八阶衰减近似；跨层与地面光程仍为有界近似                                                                                        | **P0**，白云银边、厚云暗底与亮面可同时存在                            |
| 云层合成与上层遮光             | [common.glsl:130][p-cloud-blend] 按 apparent distance 排序；[weather/clouds.glsl:148][p-cloud-upper-shadow] 推导 `l0_shadow`               | **已有多层距离合成，部分光学近似**。三层按最近实际距离排序并保持总透射；上层覆盖率影响下层照明，仍缺完整天空/地面反弹及更充分的层间光学关系                                                 | **P0**，保留明确的前后关系，避免各层独自发白                          |
| 云历史与低分辨率重建           | [d1][p-cloud-render] 稀疏采样；[d2:139][p-cloud-reproject] 按云高度选各层风、重投影及拒绝                                                  | **已有实际视图历史与层风选择，部分重建能力**。复用同一套 MRT，按最近层选择风、拒绝层变化与前景遮挡，水捕获独立；没有 Photon 的 checkerboard 时域放大                                        | **P0 随新层适配，P2 再优化采样**；保留已有系统，避免 N 层各建一套历史 |
| 云空气透视                     | [common.glsl:87][p-cloud-aerial] 使用 air transmittance、clear sky 和云透射合成，保持云自身 T                                              | **已有共同 RGB 空气项，部分耦合**。各层按共同天空的空气透射输运预乘辐亮度，保持云自身 T；地形附近的高度湿霾仍是另一套近似积分                                                               | **P0**，远云接入地平线，减少浮在天空前的贴层感                        |
| 云影场与长距离天空云隙光       | [cloud_shadows.glsl:69][p-cloud-shadow] 组合多层 T；[p0][p-cloud-prep] 预计算 shadow/coverage；[crepuscular:89][p-cloud-rays] 沿样本采云影 | **部分**。物体/水/雾共享同一真实密度场；雾目前在射线中点只算一次云影，没有沿长天空光程变化的云影积分                                                                                        | **P0/P1**，参考图太阳下方湿霾与云隙光保持空间关系                     |
| 方块云可选外观                 | [blocky_clouds.glsl][p-blocky-clouds] 支持第二层、圆角、厚度和散射                                                                         | **已有几何低档外观，部分可选体积形态**。[clouds.js][h-clouds] 的六棱柱云是当前低档路径                                                                                                      | **P2**，保留低档风格；不以它替代参考图厚云                            |

## 天气、空气与介质

| 功能                                  | Photon 的实际机制与固定源                                                                                                            | HexMinecraft 状态与实质差距                                                                                                                                           | 优先级与视觉收益                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 温度/湿度/风连续天气参数              | [weather/core.glsl][p-weather-core] 从时间噪声、群系、时刻、wetness 推导三个标量；[weather/clouds.glsl][p-weather-clouds] 推导云参数 | **部分**。现有天气状态上增加连续温湿度、stratus/coverage、三层独立且可由种子/时刻重现的风；更广的群系天气、低空介质和叶动耦合仍待完善                                 | **P0**，让云型、雾、叶动和降水一致变化                     |
| 雨雪、斜雨与闪电                      | [gbuffers_weather][p-rain]、[vertex/displacement][p-wind]、[lightning_flash][p-lightning]                                            | **已有核心，部分光照表现**。[weather-graphics.js][h-weather-graphics] 有真实降水、屋顶限制、落水花和闪电；不是完整的天气层辐亮度合成                                  | **P1**，雨天可信度与云内闪电响应                           |
| 沙尘暴及更多群系天气参数              | [weather/fog.glsl][p-weather-fog]、[settings][p-settings]                                                                            | **部分**。沙漠不降雨、雪原变雪已有；没有独立沙尘介质及丰富的温湿群系映射                                                                                              | **P1**，避免所有群系只是同一种灰雨雾                       |
| RGB Rayleigh/Mie 高度雾和距离空气透视 | [fog/overworld/raymarched.glsl][p-air-fog]、[analytic.glsl][p-air-analytic] 分开散射/消光与高度衰减                                  | **部分**。[atmosphere.js][h-atmosphere]、[atmosphere-pass.js][h-air-pass] 已有解析高度雾与 24 步光学积分；目前主要使用标量 T 与单一 density/phase，视程有 58 单位上限 | **P0**，森林层次、远山、低洼湿霾；先统一世界单位再校准系数 |
| 局部彩色光的体积散射                  | [lpv_fog.glsl][p-lpv-fog] 读取 LPV 积分                                                                                              | **已有核心，部分光场模型**。当前空气/水体积读取真实 RGB 光体，能在密闭洞穴保留火把颜色；底层光场不是同一 LPV                                                          | **P1**，洞穴、灯光和火焰气氛；保留已通过的独立光色         |
| 彩色玻璃光束                          | [air_fog][p-air-fog] 使用透明/不透明 shadow depth 与颜色缓冲                                                                         | **已有核心，部分几何覆盖**。[glass-transmission.js][h-glass] 沿六边体素光程过滤太阳/月光，并接入表面、空气、水和叶片；不是任意透明材质的彩色阴影缓冲                  | **P1**，扩充透明几何时保持真实遮挡和色彩                   |
| 水下吸收与体积散射                    | [water_fog_vl.glsl][p-water-fog] 分离 RGB 吸收/散射、太阳与局部光                                                                    | **已有核心，算法不同**。当前按真实占据水长积分，正确区分 source/flow、介质切换、局部光和额外反射水路；不宜退回统一距离蓝滤镜                                          | **P1**，保留正确几何水长，再统一环境辐亮度                 |
| Bloomy fog / bloomy rain              | [c1][p-blend-layers] 记录雾透射，随后 [c19][p-grading] 额外混合散射图                                                                | **缺失独立机制**。一般 bloom 在雾后执行不等于基于雾 T 的 bloom 混合                                                                                                   | **P2**，强雾/强雨的光晕；避免先靠它掩盖空气积分差距        |
| 边界/洞穴/下界/末地/熔岩/细雪与状态雾 | [simple_fog.glsl][p-simple-fog]、[end_fog_vl.glsl][p-end-fog]                                                                        | **部分**。已有维度色、洞穴环境、边界雾和水/熔岩状态；不是完整对应的多种介质/状态消光及 End 体积效果                                                                   | **P1/P2**，跨维度一致，防止摄影效果破坏生存可读性          |

## 光照、阴影与材质

| 功能                                    | Photon 的实际机制与固定源                                                                                                        | HexMinecraft 状态与实质差距                                                                                                                                                    | 优先级与视觉收益                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 方向性 SH 天光                          | [d4a_generate_sky_sh.csh][p-sky-sh] 从天空图采 256 方向、归约 9 系数；[diffuse_lighting][p-diffuse] 以 bent normal 求 irradiance | **已有天空投影与表面求值核心，部分环境反馈**。同一 GPU 天空图投影为九系数 SH，再原子发布纹理、CPU 摘要与 LightProbe；表面保留 vSkylight 门控。尚无真实云体向天空环境的反向照明 | **P0**，叶冠蓝天/暖地反照、阴面颜色与方向层次                             |
| 局部彩色体素照明/LPV                    | [lpv/floodfill.glsl][p-lpv] 以邻居平均和发光/透色迭代辐亮度                                                                      | **已有 RGB 体素光，部分 LPV 行为**。[voxel-light.js][h-voxel] 是 CPU 0..15 最大强度衰减传播，动态模型从 [dynamic-light.js][h-dynamic] 插值；不是同一辐亮度扩散/GI              | **P1**，可独立提高渲染光场质量，保留游戏光级语义                          |
| 手持动态灯光                            | [handheld_lighting.glsl][p-hand-light] 的双手光源/距离响应                                                                       | **已有核心，算法不同**。[voxel-light.js][h-voxel] 把双手光合并到玩家占据格，随移动更新真实 RGB 传播；不是手尖点光源，需对照近场位置/方向响应                                   | **P1**，行走和洞穴场景；复用既有光体                                      |
| 接触硬化 PCSS                           | [shadows/pcss.glsl][p-pcss] 的 blocker search、可变半影、SSS 深度与透明阴影                                                      | **已有核心**。[soft-shadows.js][h-shadows] 使用可见日/月盘角、16 blocker/32 过滤、接收面斜率校正和手工双线性；不是固定模糊冒充软阴影                                           | **P1 调优**，保留日月半影与接触强度，避免为“迁移”重写已验证机制           |
| 阴影投影扭曲/像素化与覆盖分配           | [distortion.glsl][p-distortion]、[pcss][p-pcss]                                                                                  | **部分**。单张 2048 正交阴影图，无 Photon 的扭曲分辨率分配和可选像素化                                                                                                         | **P1/P2**，近处枝叶锐度、远处覆盖；需先测别名收益与边缘稳定性             |
| 屏幕空间直接光接触阴影 SSRT             | [shadows/ssrt.glsl][p-ssrt] 沿直接光方向追屏幕深度，还估 SSS 距离                                                                | **缺失**。GTAO 不是直接光方向的接触阴影                                                                                                                                        | **P1**，细枝、草、模型接触和 shadow-map 分辨率补充                        |
| 透明彩色阴影                            | [shadow program][p-shadow-program]、[pcss][p-pcss] 的双深度/颜色采样                                                             | **部分**。体素玻璃光程真实存在，但未覆盖任意透明模型/贴图/非体素透明几何                                                                                                       | **P1**，保持玻璃、树叶和模型混合遮挡的区别                                |
| 叶片/植物 SSS 与 sheen                  | [diffuse_lighting][p-diffuse] 的透射和 sheen；[material][p-material] 的叶/草材质参数                                             | **部分**。[foliage-shader.js][h-foliage] 已有阴影前脸深度约束、最长 48 格叶厚度光程与 Beer-Lambert 着色；缺通用材质 SSS/sheen 和与天光/BRDF 的一致组合                         | **P0**，参考图背光亮绿叶与深冠层并存，不能把已有透射列为缺失              |
| GTAO/SSAO 与几何 AO                     | [gtao.glsl][p-gtao]、[ssao.glsl][p-ssao]、[d3][p-ao]                                                                             | **已有 GTAO 核心，部分能力**。[contact-occlusion.js][h-ao] 使用 Three GTAO、Poisson 去噪和深度上采样/保护遮罩；没有 Photon 可选 SSAO 路线和完整输出                            | **P1**，保留真实深度与手持/水保护；不必新增第二套玩家 AO 实现             |
| Bent normal、ambient SSS 与 AO 专用历史 | [d3_ao.fsh][p-ao] 输出 AO/ambient SSS/bent normal 和深度年龄历史                                                                 | **缺失这些输出**。当前输出 AO+距离，主画面 TAA 不等于 AO 专用重投影或 bent-normal 天光                                                                                         | **P1**，先使 SH 对几何法线可用，再有证据地增加这些量                      |
| 方向 lightmap 梯度                      | [directional_lightmaps.glsl][p-directional-lightmap] 从光级屏幕梯度恢复方向响应                                                  | **缺失该机制**。现有光体插值/表面 sky 属性不等于 directional lightmap                                                                                                          | **P2**，兼容资源包或提高局部照明方向感；避免与真实动态灯重复计光          |
| GGX 金属/非金属与粗糙漫反射             | [bsdf.glsl][p-bsdf]、[specular_lighting.glsl][p-specular] 的 Hammon、Smith/GGX、F0/F82 与角盘高光                                | **部分，缺通用 PBR**。大多数地形/模型为 MeshLambertMaterial，玻璃/水使用 Phong；湿面 Fresnel 不等于完整 PBR                                                                    | **P0 叶材质基础，P1 通用材质**，高光层次、湿润/金属/粗糙面区分            |
| labPBR/旧格式法线和镜面贴图             | [material.glsl][p-material] 解码 roughness/metal/F0/emission/porosity/SSS；[solid program][p-solid] 读取资源贴图                 | **缺失**。[texture-pack.js][h-texture-pack] 主要加载现有颜色纹理，未建立这些数据通道                                                                                           | **P1**，是对应资源包外观的前提；没有素材通道时不应宣称 PBR 贴图支持完成   |
| POM、视差自阴影、坡度法线               | [parallax.glsl][p-parallax]、[solid program][p-solid]                                                                            | **缺失**                                                                                                                                                                       | **P2**，近景砖/矿物/石面细节；不能用普通法线或几何台阶计作 POM            |
| 通用粗糙 SSR、天空反射与环境 BRDF       | [specular_lighting][p-specular] 的 GGX VNDF 多射线、粗糙度/颜色 mip、天空图回退；[raytracer][p-raytracer]                        | **部分**。已有水面 32+5 步追踪和湿面 40+6 步 SSR；无所有不透明 PBR 材质的粗糙反射/通用环境响应                                                                                 | **P1**，材质真实感；延伸一条共享路径，避免另建第二套互不一致的水/地面规则 |
| 所有透明材质折射与层合成                | [c1_blend_layers][p-blend-layers] 的 refraction data、透明层、雾和前置云合成                                                     | **部分**。真实水折射已做，普通玻璃更多是透明材质与透光，不是任意透明表面视线折射                                                                                               | **P1**，玻璃/冰等效果；保护前景深度、手持与水捕获边界                     |
| 发光材质和固定材质参数                  | [material.glsl][p-material] 的 hardcoded specular/emission/SSS                                                                   | **已有发光核心，部分材质元数据**。当前 lamp/torch/emissive map、体素发光与 bloom 已联通；缺完整材质光学映射                                                                    | **P1**，统一灯、矿物、植物与 HDR，不以统一抬亮代替发光                    |
| 雨后湿润/孔隙率/水洼                    | [rain_puddles.glsl][p-puddles] 修改 albedo/F0/roughness/normal/SSR                                                               | **已有核心，部分 PBR 耦合**。[wet-surfaces.js][h-wet] 有世界空间覆盖、孔隙率、淋雨条件、干燥过程、雨滴环和真实 SSR；未修改通用 PBR 粗糙度/F0                                   | **P1**，延伸既有遮罩/字段，避免再建天气存档或第二水洼场                   |

## 水与后处理

| 功能                            | Photon 的实际机制与固定源                                                                         | HexMinecraft 状态与实质差距                                                                                                                             | 优先级与视觉收益                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 水波高度、流向、视差和位移      | [water_normal.glsl][p-water-normal] 的 Gerstner 频带/噪声/流向；[displacement][p-wind] 的几何位移 | **部分**。[water-shader.js][h-water] 是三频一致法线，明确不改物理液面；没有波高视差/几何位移和独立流向频带                                              | **P1**，波浪体积感；应为渲染位移并保持物理 source/flow 数据不变                    |
| Fresnel、Snell 窗口与全反射     | [bsdf][p-bsdf]、[translucent program][p-translucent]                                              | **已有核心**。当前共享 IOR=4/3 的非近似偏振 Fresnel、折射方向和 TIR，含入水/出水路径保护                                                                | **P1 保留/调优**，不应退化为固定透明度水                                           |
| 焦散与水下太阳照明              | [water_fog_vl][p-water-fog]、[translucent][p-translucent]                                         | **已有核心，算法不同**。[water-lighting.js][h-water-light] 使用与可见波面共享法线的折射足迹/聚焦关系；Photon 中有噪声焦散近似，不能一概认定现有算法更弱 | **P1**，以实际图像与输入一致性决定改进，不为同名机械替换                           |
| 群系水色、边缘高光与可选水纹理  | [translucent program][p-translucent]、[settings][p-settings]                                      | **部分**。当前水色/吸收主要固定系数与天空/环境，缺 Photon 群系颜色导出的消光及对应纹理策略                                                              | **P1/P2**，不同水域、浅水边缘与地下水可读性                                        |
| HDR bloom                       | [c5-c10][p-bloom-down]、[c12/c13][p-bloom-blur]、[c14-c18][p-bloom-up]、[c19][p-grading]          | **已有核心，独立近似**。[bloom-pass.js][h-bloom] 有全 HDR 六层 13 点下采样、tent 重建和凸组合；不是 Photon 逐层 Gaussian/可选上采样的完整复刻           | **P1 已完成当前改善**，保留 DC/亮点相位与低能彩色 FP16 限制，不再靠提高 bloom 追图 |
| 曝光与测光                      | [c4.vsh][p-exposure] 有手动、mip 平均和 32-bin 分位直方图/非对称适应；源码默认 AUTO_EXPOSURE_OFF  | **部分**。[exposure-pass.js][h-exposure] 是 16x16 加权几何均值与非对称适应，不是直方图                                                                  | **P1**，稳定明暗切换；不能假设参考图一定开自动曝光                                 |
| 色调映射、白平衡和输入/输出调色 | [c19][p-grading]、[tonemap_operators][p-tonemap]；源码默认 Lottes，支持 ACES 等                   | **部分**。当前 Three ACESFilmic/OutputPass 与线性 sRGB，没有相同白平衡、宽色域工作空间、HSL 定向调色和 Lottes 曲线                                      | **P0 统一校准，P1 完整分级**，避免以曝光或绿饱和度掩盖光学差距                     |
| 原生 TAA                        | [c4.fsh][p-taa] 的近深度重投影、Catmull-Rom 历史、YCoCg/variance clipping 与稳定性策略            | **已有核心，算法不同**。[temporal-pass.js][h-temporal] 已有八相位、HDR 历史、深度/反应遮罩、夹取和相机切换恢复，不是单帧抗锯齿                          | **P1/P2**，随着新云/反射继续验证；不需要先重写已工作的时域框架                     |
| 后置空间抗锯齿 FXAA             | [c21_fxaa][p-fxaa]                                                                                | **已有替代能力**。[postprocessing.js][h-post] 使用 SMAA；不是 Photon FXAA，但不应把 FXAA 再叠一遍来计功能数                                             | **P2**，只在图像/成本证明收益时替换或复用一种路径                                  |
| Contrast-adaptive sharpening    | [final.fsh][p-final] 的 CAS，基于局部极值自适应增益                                               | **缺失 CAS**。TAA 后的固定有界五点锐化不是 CAS                                                                                                          | **P1/P2**，细叶纹理与清晰度；实现后删除旧重复锐化                                  |
| 时域放大 TAAU                   | [c3][p-taau]、[c4][p-taa] 的低分辨率当前帧、全分辨率历史和 confidence/flicker 规则；源码默认关闭  | **缺失**。现有 DPR、半分辨率云、TAA 都不能计作全场景 TAAU                                                                                               | **P2**，性能与画质覆盖；需要独立分辨率/显存和运动验收                              |
| 景深 DoF                        | [c2_dof][p-dof] 使用深度 CoC、自动/固定焦点、Vogel 盘与手部保护；默认关闭                         | **缺失**                                                                                                                                                | **P2**，摄影功能，参考图全景不以它为前置；避免重复渲染已有场景深度                 |
| 相机运动模糊                    | [c20_motion_blur][p-motion] 按深度和前后相机矩阵求速度、20 次采样并保护手部；默认关闭             | **缺失**。TAA 历史拖影不是运动模糊；Photon 此处也不是完整每物体速度缓冲                                                                                 | **P2**，移动摄影，不能把模型拖尾当完成                                             |
| 暗角与夜间 Purkinje shift       | [c19][p-grading] 的暗角；[purkinje_shift][p-purkinje] 区分天光/局部光/夜间视杆色偏                | **缺失对应着色机制**。生命/伤害 UI 遮罩不是摄影暗角，也不是 Purkinje                                                                                    | **P2**，夜景/镜头风格，需保护洞穴和火把色彩                                        |
| 输出抖动/量化控制               | [final][p-final]、[dithering.glsl][p-dithering] 的显示转换与 8-bit 抖动                           | **部分**。HDR/OutputPass 已有，但没有等同的最终抖动；天空渐变可能暴露色带                                                                               | **P1/P2**，在新天空下用暗渐变/显示输出实际评估                                     |

## 宿主适配、资产与辅助功能

| 功能                                        | Photon 的实际机制与固定源                                                                                                                         | HexMinecraft 状态与边界                                                                                                      | 优先级与处理                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 植物/叶片风动                               | [vertex/displacement.glsl][p-wind] 的材质分类、锚定与天气风                                                                                       | **已有核心，部分天气耦合**。[foliage-shader.js][h-foliage] 同步可见/阴影顶点、草根锚定和玩家接触，风场不是 Photon 连续天气场 | **P1**，接入共同派生风，避免两个不一致的风方向                                       |
| 门户视差、附魔 glint、可选边缘高亮          | [solid][p-solid]、[translucent][p-translucent]、[armor_glint][p-glint]、[edge_highlight][p-edge]                                                  | **部分**。当前有真实门户/动画材质与玩家交互，但未对应门户视差、shader glint 和通用边缘高亮                                   | **P2**，独立可迁移表现；不与 gameplay 门户可用性混算                                 |
| 下界/末地天空及特殊光色                     | [sky.glsl][p-sky]、[end_color][p-end-color]、[nether_color][p-nether-color]                                                                       | **部分**。已有三个维度环境色/雾与真实游戏内容，未对应全部 End sun/glow/体积外观                                              | **P2**，后续覆盖维度，不影响先验收白天森林                                           |
| 自定义天空与资源包接入                      | [gbuffers_skytextured][p-custom-sky]、[settings][p-settings]                                                                                      | **部分基础资产加载，缺完整天空/PBR通道协议**。现有纹理包不等于 Photon/Iris 材质标记与 custom-sky 接口                        | **P2/P3**，独立定义本项目资产映射，勿迁移 Minecraft 专用 ID                          |
| Distant Horizons / Voxy                     | [dh_terrain][p-dh]、[voxy_opaque][p-voxy]、[lod_mod_support][p-lod] 的额外投影/深度/水层                                                          | **宿主接口不适用**。本项目流式六边体素不是这些 mod；远景 LOD 原理可独立实现                                                  | **P3 接口，P1/P2 远景能力**，不把兼容宏/空适配层算成功能；云尺度不应依赖扩大世界距离 |
| Photonics 的硬件光追/ReSTIR                 | [photonics.glsl][p-photonics] 是运行时 mod API 空桩；[shader_interface][p-photonics-interface]、[properties][p-properties] 提供 G-buffer/参数适配 | **宿主接口不适用**。仓库中的 ReSTIR 参数不是独立可执行光追器；WebGL2 不能直接使用其原生后端                                  | **P3**，不把启用宏算“有 ReSTIR/GI”；若另做光追是独立高成本目标                       |
| White-world、distance/box/debug、直方图视图 | [settings][p-settings]、[final][p-final]                                                                                                          | **缺失完整开发视图**。现有开发场景 API 和读回探针可复用                                                                      | **P2/P3**，优先按实际调试缺口增加工具，不制造玩家设置矩阵                            |

## 迁移路径与最小实现约束

Photon 的 OpenGL/Iris 多缓冲、compute/imageStore 和宿主材质标记不能直接搬到当前 WebGL2 forward + EffectComposer 结构。应迁移光学行为与验收结果，沿用已有场景深度、保护遮罩、云 MRT、光体、天气和生命周期。继续独立实现原理，核实复用素材/外部算法的许可；不直接复制许可证受限的整包源码。

- 天空与 SH 优先检查 Three 的 LightProbe/SphericalHarmonics3 与环境预滤工具，复用成熟表示；Photon 的 compute 归约可改为适合 WebGL2 的小型 reduction，不能让同步 GPU 读回成为每帧固定成本。共用天空辐亮度是云/雾/天光/反射多个消费者的基础，不必复制 Photon 的全部附件布局。
- 通用 PBR 先比较 Three 的现有物理材质/环境能力与本项目材质注入点，再决定缺失的叶片、体素光和折射部分；不要只为得到 GGX 再造完整材质框架。已有水/湿面追踪可统一扩展，避免三套 SSR 并存。
- SSAO 与 FXAA 的名称不构成必须增加平行实现的理由。当前 GTAO/SMAA 已覆盖相应能力；CAS 接入后应替代旧固定锐化，新增 TAAU 时应复用真实时域重建。
- 风、温湿度、云型和罕见天象应从已有 time/seed/biome/降雨/湿度派生。先提供一致的默认高画质结果，不复制数十个滑块、另一套天气计时器或天气存档。
- 保持低画质和关闭效果的资源预算；新资源必须接入 resize、DPR、quality、dimension、capture 和真实 context loss/restoration。云与水 capture 继续使用各自实际视图的历史，保护前景和手持表面。

### 天空尺度的明确前置问题

当前 `CLOUD_BASE=52`、`cloudFar=130`、`camera.far=220`、天空穹顶半径 180。现有 volume 把 sky depth=1 也当作 220 的几何终点；其云历史还把这个距离作为前景遮挡比较。直接照搬 Photon 1200/3200/6000 高度，即使考虑 `CLOUDS_SCALE`，仍可能不可见，或让更远云在每一帧被旧 sky distance 错误拒绝。

应建立独立的天空虚拟云尺度：无地形天空射线使用云自己的远界，有地形仍由真实深度截断；云历史同步区分无遮挡天空与真实前景，记录可比较的代表云距离。保留现有 apparent-distance/MRT 机制，先由高度推导各层风；不要求每层新增一整套历史或 pass，也不应先扩大整个世界渲染距离来求高云。参考图中的远山/森林几何纵深另需场景与 LOD 评估，不能由天空比例或更浓边界雾替代。

## 接下来实际实施的批次与验收

每批先保存同种子/镜头/时刻的旧图、HDR 和资源基线，再修改一条生产路径；保留首次失败，使用真实 shader/GPU，禁止用 CPU 重写同一算法自证。下面的画面、数值和生命周期三类均需通过，才将矩阵相应行提升为完成。已有功能的技术通过不会自动提升其艺术状态。

| 批次                   | 可交付改变与边界                                                                               | 画面验收                                                                           | 数值/行为验收                                                                                                        | 生命周期/成本验收                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 0 固定参考场景         | 建立向光森林/开阔天空、低洼地和远景标尺，锁定 seed、镜头、时刻、纹理包、曝光与参考姿态         | 保留参考图、现产品和后续每批对照；同时有背光/侧光、树冠近景、远景和水面            | 记录太阳角、渲染物理尺寸、实际 active pass/renderer/GL；不以平均亮度或像素 hash 评分                                 | RTX 4060 的 900x650 与 1920x1080 真实 GPU 时间/显存基线；软件渲染测试总时长不能代替帧率                        |
| 1 天空大气 + SH        | 统一天空辐亮度、太阳/月亮与大气透射；先让方向天光进入实际材质                                  | 正午蓝天/地平线、日落、月夜、叶冠阴面；色彩自然且太阳附近无灰圈/硬接缝             | 真实生产 pass 的零/恒定输入、有限 HDR、方向性与旋转一致；SH 常量环境应保持面向无关，天空旋转改变照明方向而不改总标定 | LUT/SH/环境资源的 resize、quality、dimension、恢复、低档无额外运行；测更新频率与读回成本                       |
| 2 多层云 + 天气        | 独立虚拟天空尺度，Cu/AC 两体积层 + Cirrus/Cirrocumulus 薄层；宏 coverage、温湿风、必要 3D 噪声 | 地平线与低/云内/层间/高相机均连续可见；薄云亮边、厚云遮太阳，不能整体奶白          | 每层及合成 T 在 [0,1]、层序正确；前景不被覆盖；独立风不随相机；天气 clear→rain→storm→clear 连续且暂停/保存一致       | 复用现有 MRT 和实际视图历史；不同风/层交叠无残影；水 guard-band、DPR 奇数尺寸、恢复/低档释放；先测预算再选步数 |
| 3 云光学/云影 + 空气   | 多阶散射近似/粉末关系、保持云 T 的空气透视；共用多层云影场；分离 RGB 空气消光/散射与低层湿霾   | 参考图太阳附近、阴云暗底、森林低洼与远山梯度；物体/雾/水上的云影一致               | 沿射线取样的云隙光、无云/有云透射、厚度单调性、分波段吸收；密闭洞穴保留局部光而不注入外界蓝天                        | 单场/共享缓存，不并排保留两套云影规则；主视图与捕获、介质切换、日月/天气更新全部回归                           |
| 4 叶材质/PBR + AO/接触 | 叶片 sheen/方向天光耦合，常用材质 roughness/F0；再补 bent normal/SSRT 与资源包通道             | 背光绿叶、树冠暗面、草边、金属/粗糙石/湿土对照；没有统一油亮或伪发光               | 实际光源开/关与材料标准片，粗糙度/入射角响应；不重复加 SSS/环境光；保留 colored-light、半影及手部保护                | 材质 program cache、实例/动态模型、透明/阴影 pass、context 恢复；PBR 数据和纹理通道预算                        |
| 5 反射/折射/水         | 通用粗糙 SSR/天空回退，透明折射；改进波高/流向/群系水色，保留真实占据水长                      | 粗糙与镜面、屏幕边缘、空中/水下/TIR、浅水/流水、雨洼与玻璃；无拉伸前景或幽灵反射   | 同场高采样参考、命中/未命中、能量/颜色/深度边界；焦散仍与可见波面一致                                                | 复用 capture/深度/追踪资源，反应表面历史、resize/介质/维度/恢复；不得新增第二份无用途场景捕获                  |
| 6 调色/测光/重建       | 参考 Lottes/白平衡/调色关系，必要直方图测光；CAS 替换旧锐化；再做 TAAU                         | 固定曝光对照后再测动态曝光，叶片和云高光不剪成白片；暗部不翻灰；低分辨率运动无爬行 | 灰阶/饱和色/HDR、强光占比变化、适应时序；TAAU 对同场高分辨率参考，保细节且不制造 halo                                | 只保留一种最终锐化与必要 AA 路径；原生/DPR/放大分辨率、相机切换、手持/云/水历史恢复；显存与 GPU 时间有记录     |
| 7 摄影/夜景/特殊天气   | DoF、相机运动模糊、暗角、Purkinje、输出抖动；虹、极光、夜光云、congestus 与维度外观            | 各有独立实际场景；摄影模糊不破坏默认全景，夜景火把色与生存可读性保持               | 手部不被模糊，焦平面/运动方向正确；特殊天象按方向/天气/时段触发，非随机常驻                                          | 默认关闭或由既有 preset 派生；关闭时不运行/不留无用目标；切换、保存继续、暂停和设备恢复                        |

## 本次审计边界

已读参考图，核对固定提交的功能目录和以上机制对应源，交叉核对当前实际 renderer 模块。云/天气的层序、上层遮光边界、虚拟天空尺度与历史问题同时结合了独立深审计。没有运行新天空/多层云的 GPU 场景，没有新增产品功能，也没有据此宣称参考图已复现。

这份矩阵的完成标准是每批生产实现、实际画面对照、数值与生命周期验收共同成立；不能按开关数或“支持同名效果”的数量宣布“绝大部分已迁移”。宿主接口项单独列出，既不伪报实现，也不掩盖需要独立工程的远景/光追工作。持续目标仍未完成。

[p-root]: https://github.com/sixthsurge/photon/tree/6e67b36e818bacde0304edd49f28e2bb70e33f04
[p-readme]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/README.md
[p-settings]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/settings.glsl
[p-properties]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/shaders.properties
[p-atmosphere]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/atmosphere.glsl
[p-sky-map]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/d0_sky_map.fsh
[p-sky]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/sky.glsl
[p-stars]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/stars.glsl
[p-light-color]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/colors/light_color.glsl
[p-aurora]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/aurora.glsl
[p-aurora-colors]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/aurora_colors.glsl
[p-rainbow]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/rainbow.glsl
[p-weather-rainbow]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/weather/rainbow.glsl
[p-cumulus]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/cumulus.glsl
[p-cloud-common]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/common.glsl
[p-altocumulus]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/altocumulus.glsl
[p-cloud-layers]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds.glsl
[p-cirrus]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/cirrus.glsl
[p-congestus]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/cumulus_congestus.glsl
[p-weather-clouds]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/weather/clouds.glsl
[p-noctilucent]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/noctilucent.glsl
[p-cloud-phase]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/common.glsl#L57
[p-cumulus-scattering]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/cumulus.glsl#L135
[p-cloud-blend]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/common.glsl#L130
[p-cloud-upper-shadow]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/weather/clouds.glsl#L148
[p-cloud-render]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/d1_clouds.fsh
[p-cloud-reproject]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/d2_clouds_upscaling.fsh#L139
[p-cloud-aerial]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/clouds/common.glsl#L87
[p-cloud-shadow]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/cloud_shadows.glsl#L69
[p-cloud-prep]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/p0_clouds_prep.fsh
[p-cloud-rays]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/crepuscular_rays.glsl#L89
[p-blocky-clouds]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/sky/blocky_clouds.glsl
[p-weather-core]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/weather/core.glsl
[p-rain]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/gbuffers_weather.fsh
[p-wind]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/vertex/displacement.glsl
[p-lightning]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/misc/lightning_flash.glsl
[p-weather-fog]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/weather/fog.glsl
[p-air-fog]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/fog/overworld/raymarched.glsl
[p-air-analytic]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/fog/overworld/analytic.glsl
[p-lpv-fog]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/fog/lpv_fog.glsl
[p-water-fog]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/fog/water_fog_vl.glsl
[p-blend-layers]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c1_blend_layers.fsh
[p-grading]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c19_color_grading.fsh
[p-simple-fog]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/fog/simple_fog.glsl
[p-end-fog]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/fog/end_fog_vl.glsl
[p-sky-sh]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/d4a_generate_sky_sh.csh
[p-diffuse]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/diffuse_lighting.glsl
[p-lpv]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/lpv/floodfill.glsl
[p-hand-light]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/handheld_lighting.glsl
[p-pcss]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/shadows/pcss.glsl
[p-distortion]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/shadows/distortion.glsl
[p-ssrt]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/shadows/ssrt.glsl
[p-shadow-program]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/shadow.fsh
[p-material]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/surface/material.glsl
[p-gtao]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/ao/gtao.glsl
[p-ssao]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/ao/ssao.glsl
[p-ao]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/d3_ao.fsh
[p-directional-lightmap]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/directional_lightmaps.glsl
[p-bsdf]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/bsdf.glsl
[p-specular]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/specular_lighting.glsl
[p-solid]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/gbuffers_all_solid.fsh
[p-parallax]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/surface/parallax.glsl
[p-raytracer]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/misc/raytracer.glsl
[p-translucent]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/gbuffers_all_translucent.fsh
[p-puddles]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/surface/rain_puddles.glsl
[p-water-normal]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/surface/water_normal.glsl
[p-bloom-down]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c5_c10_bloom_downsample.fsh
[p-bloom-blur]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c12_bloom_gaussian_0.fsh
[p-bloom-up]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c14_c18_bloom_upsample.fsh
[p-exposure]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c4_taa_exposure.vsh
[p-tonemap]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/post_processing/tonemap_operators.glsl
[p-taa]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c4_taa_exposure.fsh
[p-fxaa]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c21_fxaa.fsh
[p-final]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/final.fsh
[p-taau]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c3_taau_prep.fsh
[p-dof]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c2_dof.fsh
[p-motion]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c20_motion_blur.fsh
[p-purkinje]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/misc/purkinje_shift.glsl
[p-dithering]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/utility/dithering.glsl
[p-glint]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/gbuffers_armor_glint.fsh
[p-edge]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/surface/edge_highlight.glsl
[p-end-color]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/colors/end_color.glsl
[p-nether-color]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/colors/nether_color.glsl
[p-custom-sky]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/gbuffers_skytextured.fsh
[p-dh]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/dh_terrain.fsh
[p-voxy]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/voxy_opaque.glsl
[p-lod]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/misc/lod_mod_support.glsl
[p-photonics]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/photonics/photonics.glsl
[p-photonics-interface]: https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/photonics/shader_interface.glsl
[h-root]: https://github.com/entropy622/HexMinecraft/tree/bf64bbf855484deb040d56561fc6713b74fa0480
[h-sky]: ../src/sky-environment.js
[h-cloud-field]: ../src/cloud-field.js
[h-cloud-volume]: ../src/cloud-volume.js
[h-clouds]: ../src/clouds.js
[h-weather]: ../src/weather.js
[h-weather-graphics]: ../src/weather-graphics.js
[h-atmosphere]: ../src/atmosphere.js
[h-air-pass]: ../src/atmosphere-pass.js
[h-glass]: ../src/glass-transmission.js
[h-graphics]: ../src/graphics.js
[h-skylight]: ../src/skylight.js
[h-voxel]: ../src/voxel-light.js
[h-dynamic]: ../src/dynamic-light.js
[h-shadows]: ../src/soft-shadows.js
[h-foliage]: ../src/foliage-shader.js
[h-ao]: ../src/contact-occlusion.js
[h-texture-pack]: ../src/texture-pack.js
[h-wet]: ../src/wet-surfaces.js
[h-water]: ../src/water-shader.js
[h-water-light]: ../src/water-lighting.js
[h-bloom]: ../src/bloom-pass.js
[h-exposure]: ../src/exposure-pass.js
[h-temporal]: ../src/temporal-pass.js
[h-post]: ../src/postprocessing.js
