# Photon 固定参考场景与硬件基线

本轮只增加测试、可重放存档和证据采集，不修改产品渲染、世界生成或存档格式。基线是 0.85 `3edc8ea0f07716671fbe756f41acdad46d91125b`，用户图为外部 `hexminecraft-round-0.85/photon-user-reference.png`。目标和边界沿用 [Photon 迁移计划](photon-migration.md)。设计先于编码完成；GPU 按父代理授权的独占窗口执行。

## 五个设计判断

1. 结构性：同一组正式 v16 存档、镜头和设置同时供旧版及天空/云改版使用，避免每版临时挑角度。
2. 调用负担：产品不增加字段；测试只选择已有场景、分辨率和产物目录，种子、姿态、时间和设置由固定 fixture 提供。
3. 可推导性：真实太阳方向、启用 pass、物理画布大小、GPU 扩展与资源大小从运行中的对象或设备读取，不让调用者填写预期结果。
4. 最小复杂度：保留现有 World、序列化器、正式导入 UI、生产 shader 和 browser-fixture 的 DOM Pointer Lock 边界；测试在 WebGL/rAF 外部边界计时，不新增产品 hook 或第二套渲染。
5. 不针对单张图：固定向光森林、开阔天空、低洼、远景标尺、背光、侧光、近冠层和水面八个视角，两个物理分辨率；艺术验收逐图进行。

最小方案是一份真实自然世界和八个相机存档，加一份共享浏览器采集器。单张截图无法控制时刻/曝光，也不能提供真实 GPU 成本；另造演示几何或复制 shader 到 CPU 会改变被测路径。远景标尺只使用自然地形上的实测点位，不为拍图改地形、放置远山或扩展视距。

## 失败类别（编码前）

- 输入：存档不通过正式校验、导入后安全重生导致位置改变、yaw/pitch/FOV 丢失、库存物品遮挡构图、不同镜头意外改变种子/地形编辑/天气/时间。
- 自然场景：森林名存在但没有真实树，近冠层镜头在实体内，低洼没有高度差，水面镜头没有真实液体，标尺点超出真实加载/渲染距离而被误称远山。
- 时序：导入后的第一帧推进时间；暂停冻结了真实渲染；曝光仍自动变化；影子、空气、体积云历史或抗锯齿尚未预热；尺寸变化后读取旧目标。
- 产品路径：只靠开发 API 构造结果、生产包不能导入同一 JSON；低质量或几何云被误报为高质量体积云；真实 pass 被 harness 替换。
- 设备：软件渲染、错误 ANGLE 后端、CSS 尺寸冒充物理像素、上下文丢失、GL error、page/console error 或未记录 warning。
- 计时：扩展缺失/计数位无效、GPU disjoint、查询未就绪即读取、查询交叠、无限积压或泄漏、把 rAF/CPU 提交/截图耗时当 GPU 时间、截图/HDR 回读污染计时窗口、编译/分配冷启动冒充稳态成本。
- HDR：读到显示转换后的 8 位颜色、读错 composer ping-pong 目标、通道/行方向错误、半浮点非有限值、文件尺寸不匹配；PNG/HDR 元数据没有说明色彩空间和捕获位置。
- 内存：共享纹理/几何重复计数，漏报 render target 深度/多附件，估计值冒充实际 VRAM；隐藏驱动、着色器和浏览器成本没有标明。
- 证据：截图未逐张查看、只断言像素 hash/均值、首轮失败被覆盖、运行结果混入不同相机/设置、没有可读 manifest、自己的 CLI/Vite/Chrome 或 5191 没有退出即交接。

## E2E 准备与验收

`tests/photon-reference-scenes.capture.js` 的采集场景先加载正式高画质设置偏好并走 `#save-file` 导入，再经已有开发场景入口冻结游戏模拟，保持真实帧渲染；固定时间在首个游戏帧之前生效。独立生产 UI 场景在构建后的 preview 中正常导入、核验设置并导出相同存档，不访问开发入口。八个视图共享种子 624、清朗天气、时间 30、FOV 72、材质、固定曝光 1 和全部默认高画质效果（自动曝光关闭）。

每个 900×650 / 1920×1080 视图在实际绘制至少 120 帧后采集 180 帧。计时器在真实 world WebGL2 上使用 `EXT_disjoint_timer_query_webgl2`，包围同一个 rAF 回调内全部真实绘制；异步轮询，删除每个 query，不使用 `finish`。没有扩展时 GPU 时间为 null，保留真实浏览器帧间和 CPU 提交分布；出现 disjoint 的窗口不可作为可比较 GPU 基线。PNG 和线性 HDR 在计时结束后单独回读。HDR 来自实际 OutputPass 的输入纹理，禁止重新执行着色算法。

资源清单去重枚举运行中实际 render target、纹理和几何属性，报告已知字节估计与 renderer.info；不声称这是进程 VRAM。稳定 manifest 保存每视图相机/设置/太阳/active pass/设备/GL/成本分布及文件名，原始时间样本单独保存。误差应在未来成对运行时比较分布，不能从截图得出 FPS。

GPU query 的计数位、异步可用性、纳秒单位及 disjoint 判定依据 [Khronos WebGL 扩展规范](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)。不含绘制的 rAF 回调不进入样本；重叠或超过 8 个待回收 query 会记录 busy，验收要求 busy、disjoint、剩余 query 均为 0。

HDR 使用已有 Three `EXRExporter` 写无压缩 RGBA16F EXR，同时保留原始 GPU 半浮点数据；无需私有 RGBE 编码，EXR 保留负通道。CPU 检查曾发现默认 ZIP 在非完整 16 行块上经现有 reader 解出零值，因此显式采用无压缩扫描线。EXRLoader 返回的 GPU 行顺序是由下到上，EXR 文件扫描线由上到下；独立 reader 检查两行不同颜色、负通道、非有限输入与长度错误。

固定输入导出：`node tests/fixtures/export-photon-reference-scenes.js <产物目录>/inputs`。CPU 验证：`node --test tests/photon-reference-scenes.test.js`。独占硬件命令为 `node node_modules/@playwright/test/cli.js test --config tests/photon-reference.config.js`，以 `PHOTON_REFERENCE_OUTPUT` 指定独立输出目录；每次尝试都使用新目录，保留失败原件。结束并确认进程退出后，以 `PHOTON_REFERENCE_PRODUCTION=1` 运行同一命令检查生产构建导入。配置由自身 URL 推导 webServer.cwd，避免从 tests 目录误解析 CLI 路径。

执行前允许 Node 存档/场景检查、语法、格式和生产构建。硬件执行必须等父代理明确授权，5191 独占，独立 Vite cache、configLoader runner、headless Chrome，参数 `--use-cmd-decoder=passthrough --use-gl=angle --use-angle=d3d11`，忽略默认 `--enable-unsafe-swiftshader`。全部原始 PNG/HDR、结果、失败和进程释放记录保留在外部产物目录，不进入 Git。当前地形没有参考图的无限远山 LOD，标尺会据实揭示这一限制。

## 构图校准记录

首轮仅跑 900×650 的森林/天空两项：2/2 通过，但逐图审查发现时间 75 的森林太阳投影 NDC y=1.558，位于上缘之外。保留 `pilot-first` 的全部 PNG/EXR/原始 half/manifest/180 帧计时及 `inputs-time75`，这组不作为最终配对输入。经父代理视觉审查，共同时刻校准为 30，八个相机、FOV、曝光、天气及自然地形全部保持原值；后续旧/新版统一使用 30。边界雾过浓与远景尺度不足属于待处理的产品问题，不在 fixture 中掩盖。

时间 30 的 `pilot-time30` 两项再次 2/2 通过（49.3s），父代理逐图审查后锁定构图。森林太阳实际 NDC `[-0.189906, 0.645072, 0.998735]`，方向 `[0.823791, 0.267666, -0.499722]`，仰角 15.5254°、方位角 58.7585°。两种分辨率保持同一垂直 FOV，横向构图随宽高比正常变化。

## 0.85 基线硬件结果

`full-time30-first` 完整 16/16 通过（4.9m），逐张查看全部 16 PNG。实际设备为 `ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 (0x00002882) Direct3D11 vs_5_0 ps_5_0, D3D11)`，WebGL2。全部视图具有 180 个有效、64 位 GPU timer 样本，disjoint/busy/pending 均为 0；没有浏览器 page/console error、warning、上下文丢失或 GL error。画布物理像素分别精确为 900×650、1920×1080，pixelRatio=1。

下表为实际整帧 query 的中位数 / p95，单位 ms，不由截图或启动耗时推算。每个视图还保留 min/max、全部 180 个样本、CPU 提交分布和浏览器帧间分布。两种分辨率的 rAF 中位数均约 16.7ms、p95 16.7–16.8ms；这说明本次浏览器节奏受约 60Hz 调度约束，不能拿它替代 GPU 成本，也不表示所有场景具有同样余量。一次窗口内的分布是本机基线，未来须同输入成对复测，不能把 pilot 与 full 的不同分布包装成产品优化。

| 场景                | 900×650 GPU ms | 1920×1080 GPU ms | 几何属性估计 MiB |
| ------------------- | -------------: | ---------------: | ---------------: |
| forest-toward-light |  6.341 / 7.293 |  13.175 / 15.630 |            35.13 |
| open-sky            |  1.559 / 3.999 |    7.670 / 8.833 |            35.13 |
| low-basin           |  3.628 / 7.309 |    8.748 / 9.300 |            31.52 |
| distance-ruler      |  6.603 / 7.592 |  14.019 / 15.157 |            35.13 |
| forest-back-light   |  6.736 / 8.092 |  16.362 / 17.422 |            32.17 |
| forest-side-light   |  3.921 / 4.558 |   9.021 / 11.203 |            35.13 |
| canopy-close        |  4.747 / 5.873 |  12.444 / 14.147 |            32.51 |
| water-surface       |  2.981 / 5.962 |    7.895 / 8.861 |            33.78 |

已知 render target 估计为 86,987,960 B（82.958 MiB）/ 222,937,728 B（212.610 MiB），独立纹理约 4.16 MiB，unknownTextureCount=0。几何属性按共享数组对象去重；资源枚举包含持有中的公共资源对象，不保证均已上传或驻留。深度/MSAA/mip 存储仍是估计，未包含驱动对齐、着色器二进制、浏览器合成与未暴露资源，因此不报“实际总 VRAM”。

实际 active pass 为 SceneFrame、SurfaceProtection、ContactOcclusion、Atmosphere、TemporalResolve、Bloom、SMAA、Output；清朗且 wetness=0 时 WetSurface pass 按产品自身逻辑不执行。几何云不可见，SceneFrame 内真实 CloudVolume 及历史在工作。自动曝光关闭，实际 ACES 输出曝光为 1；EXR 捕获发生在最终 OutputPass 之前的真实 RGBA16F 输入，保留线性高动态范围，不把 PNG 反解成 HDR。

逐图结论：向光镜头同时容纳太阳、冠层和坡地；开阔天空足以揭示云层的薄平轮廓；低洼镜头可观察树间透光、阴影和地面层次；远景三棵天然树均由真实相机投影确认在视锥内；背光/侧光可对照叶面受光；近冠层纹理与镂空清楚；水面真实反射/折射和岸线均可见。当前画面仍有浓雾抹平中远景、缺少参考远山尺度、云层厚度与层间关系不足、晨间天空残留细星点。这些属于产品艺术差距，基线没有达到用户参考图效果，未改曝光或造景掩盖。

## 生产 UI 与首轮失败

生产构建源自同一未改动的 0.85 产品树，`source-provenance.json` 记录 revision、空产品 diff、dist 文件及 runner 构建来源；`build-runner.log` 保留既有大 chunk 提示。CLI 原始日志保留 NO_COLOR/FORCE_COLOR 提示，不能与浏览器零 warning 混为一谈。

`production-first` 真实失败：异步文件导入后再由 Playwright 往返发 Escape，模拟已经从 30 推进到 31.2667，127 个天然 gravel 经真实 Gravity 落下，导出含 127 null + 127 gravel（254 edits）。这并非解析器丢失数据；相机姿态检查已通过，原始 export、失败图、trace、日志完整保留。`production-ready` 又记录了 harness 将 KeyboardEvent 错派到 Document 的错误，正常键盘处理依赖 HTMLElement 的 `matches`，导致暂停没有打开；该轮的错误及 trace 同样保留。

最终仅把输入就绪边界放在 HUD 解除 hidden 的 MutationObserver 微任务中，从 body 派发普通 Escape 键，先于首个游戏 rAF 打开正常暂停菜单。`production-ready-body` 1/1 通过（23.4s），没有开发入口，未改产品或存档，原 edits=[]、时间、种子、位置、yaw/pitch 和 UI 设置断言均保留。最终导出 time 精确为 30、edits=0、姿态不变，高画质/固定曝光 UI 正确，浏览器 error/warning=0。

## 产物与复用

外部证据根为 `C:\Users\aentrozhou\.codex\artifacts\hexminecraft-photon-reference-0.86`。`inputs/` 是最终时间 30 的八份普通 v16 JSON 和设置；可以正常导入生产包。最终图像索引为 `full-time30-first/baseline-index.json`，同时列出 16 个 PNG/EXR/manifest 的完整相对路径、每场景性能/资源、太阳与 active pass。每个 capture 目录保留 `baseline.png`、`baseline.exr`、`baseline.rgba16f`、`manifest.json`、`frame-before-readback.json`、`timing-samples.json`、`browser-messages.json`。

各图目录统一在 `full-time30-first/captures/photon-reference-scenes.ca-<ID>-l-production-frame-baseline/`。

| 场景                | 900×650 ID | 1920×1080 ID |
| ------------------- | ---------- | ------------ |
| forest-toward-light | 94837      | 57d68        |
| open-sky            | 6c1b0      | fce51        |
| low-basin           | 27583      | 79c54        |
| distance-ruler      | a66b3      | 9e185        |
| forest-back-light   | 60c77      | ac836        |
| forest-side-light   | b7aee      | 06fc7        |
| canopy-close        | 42f85      | 206c3        |
| water-surface       | c9541      | 17ec7        |

pilot-first（20 条 PID 观测）、pilot-time30（16）、full-time30-first（59）、production-first（15）、production-ready（13）、production-ready-body（13）均保存完整 owned PID 树、实际 5191 监听和退出记录。各阶段 `*-gpu-released.json` 复查 CLI、Vite/preview、Chrome profile、wrapper 和监听全部为 0，released=true；失败 test 的 exitCode=1 如实保留，最终通过阶段 exitCode=0。硬件结束后不再启动 GPU；后续配对由父代理接管。

CPU 专项正式存档/自然场景与独立 EXR reader 2/2，通过语法、Prettier、diff 检查和 runner 生产构建。采集器是显式配置的独立 `.capture.js`，普通 E2E 默认匹配不会意外开启这批硬件采集；未改测试 scripts、版本、产品或依赖。

## 0.85 基线交付复核

逐行读过全部九个提交文件：本说明、reference config/capture/Node 场景检查，以及 fixtures 内的 scenes/export/vite config/frame probe/artifacts。产品净改动 0；测试/fixture 净增 968 行；独立配置净增 64 行；文档净增 103 行。测量、资源清单和 HDR 导出由全部 16 场景共享，使用现有浏览器设备边界及成熟 EXR exporter；两个运行模式对应采集与正式生产导入这两个明确入口。没有产品字段、产品测试 hook、兼容格式、第二套 shader、依赖或通用框架；增长用于本任务明确要求的八镜头、两分辨率、实际 GPU/HDR/资源与原始故障证据。

## 0.86 大视距配对与异常追踪

八镜头、两种分辨率的候选采集 16/16 完成。默认视距已为渲染 441 / 驻留 529 区块，晴天地形雾 87.32..118，固定相机、时刻、FOV 和曝光保持原值。首张 900×650 森林图出现大面积黑色冠层，尽管有限 HDR、GL 和页面错误检查全部通过，因此没有把这一批记为艺术验收。

该异常原图、RGBA16F、EXR 和计时完整保留在 candidate-reference-scenes。其前景 HDR 均值约 0.004437，低于 0.001 的像素占约 68.1%。后续逐 pass、SH、体素顶点及云/AO/TAA 排查没有稳定复现或确认根因。加入的实际 HDR 前景检查要求此固定白天森林的底部 40% 均值大于 0.005，近黑像素少于 10%；这些门槛只阻止冠层消失，不作艺术评分。

两种分辨率各三次复验 6/6 通过，之后天然仙人掌生成修复又补跑两张，共八次均未重现黑帧。最新快照还记录真实 SH 系数、天空摘要、相机天空光、体素光版本和待重照区块数，便于异常再次出现时定位。问题仍保留为待追踪状态。

| 最后固定森林 | GPU 中位数 / p95 ms | 前景 HDR 均值 | 近黑比例 |
| ------------ | ------------------: | ------------: | -------: |
| 900×650      |     16.222 / 19.792 |      0.044836 |        0 |
| 1920×1080    |     28.414 / 33.139 |      0.049660 |        0 |

两张均有 180 个有效 GPU 样本，页面错误、shader 警告与 GL 错误为零，实际查看了 PNG。显卡成本高于 0.85 的短视距基线，不能据此宣称稳定帧率或整机 VRAM。最后源代码、测试和包文件在 GPU 检查期间的 278 个哈希全部未变。

生产版首轮在时刻 30 导出九条额外仙人掌删除记录；实际自然生成导致横向相邻列，原生维护按既有生存规则移除了它们。生成改为种子/地形优先级选点，跨区块顺序检查先红后绿。重新构建后，生产入口 1/1 通过，导出位置、方向、时刻与零编辑均保持一致，生产包没有暴露开发接口。随后仙人掌真实玩法 E2E 1/1 通过。全部 197 项 Node 和构建通过。

当前云层仍偏薄和条带化，材质及低空 RGB 输运继续推进；本节不表示 Photon 参考图或绝大部分迁移目标已经完成。本机产物在 hexminecraft-photon-0.86/ 的 forest-readability-regressions、final-forest-after-cactus、production-cactus-fix、cactus-far-view-native，各自保留 CLI、PID/独立端口释放记录。早期漏过初始 PID 快照的检查已如实注明。所有验证使用后台无头 Chrome 与 DOM Pointer Lock 边界，没有操作前台鼠标或用户 5173 服务。后续由主代理独立开发，不再启动子代理。
