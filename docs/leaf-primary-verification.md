# Photon 主叶片 SSS 与颜色吸收

0.96 将叶片主透射由原来的经验相位改为 Photon 的主 SSS 响应，同时接入其材质强度和颜色吸收。主世界光影档启用，默认叶片强度为 1；其他画质和维度的太阳 SSS 强度为 0，保留原有简化照明。沿用 v16 存档和现有设置。

## 来源与宿主适配

本地 Photon 固定提交为 `6e67b36e818bacde0304edd49f28e2bb70e33f04`，只读对照以下实际实现。

- [diffuse_lighting.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/diffuse_lighting.glsl) 的密度 14、默认尺度 5、归一化各向同性/HG 混合相位，以及普通方向漫反射的 `1 - 0.5 * sss_amount`。
- [phase_functions.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/utility/phase_functions.glsl) 的归一化 HG。主瓣使用 g=0.7，HG 权重 0.33；保留此前 g=0.5 的 sheen。
- [material.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/surface/material.glsl) 的叶片强度 1、sheen 0.5；[global.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/global.glsl) 的 epsilon 1e-6 与 `dampen(s) = s * (2 - s)`，s 限于 0..1。
- [shadows/ssrt.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/shadows/ssrt.glsl#L103) 的几何射线距离乘 0.2。宿主将该值用于真实六边体素叶层光程的响应尺度。它不是物理单位换算，也不证明与 Photon PCSS 平均 blocker 深度等价。
- [color.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/utility/color.glsl) 使用 Rec.2020 工作空间；宿主保持线性 sRGB/Rec.709 及其亮度权重，没有在叶片局部混入另一套颜色空间。

`leaf-lighting.js` 中，透射颜色为 `exp2(-coefficient * thickness * 0.2)`，系数由纹理颜色、亮度和强度决定。主响应为 `5 * phase * dampen(s) * albedo * transmission`。Photon 在光照最终输出乘 albedo/π，因此主 SSS 内部的 π 抵消；sheen 的归一化与 /π 保持。零强度直接跳过太阳透射及其光程追踪。

`skylight.js` 在记录完整入射能量及计算反弹光之后，再降低普通方向漫反射。原生点光、体素 RGB 和发光不受该比例影响。当前叶片是 Lambert 材质；未来接 PBR 时必须分别处理漫反射与镜面项，不能直接沿用对入射颜色的整体缩放。

近距 48 步、远距 128 步、已知世界顶部、0.06 微观厚度和真实屋顶/半砖/玻璃/未知边界规则保持。没有实现 Photon 的远距厚度归零与 AO/环境 SSS 补偿；草、通用材质、完整 PBR 和末地太阳 SSS 也未完成，迁移状态仍为部分。

## 验证

使用独立无头 Chrome / RTX 4060 / ANGLE D3D11，串行执行；设备边界 fixture 接管 DOM Pointer Lock，未占用前台鼠标，未操作玩家的 5173 服务。每批按 PID 与 UTC 创建时间核对退出，5191/5193 端口已释放。

- **204 项 Node 测试、生产构建通过**。
- **19 项不同的功能浏览器检查通过**：15 项完整光照回归、两个独立数值核检查、原生森林捕获与生产 UI 存档导入/导出。重复执行的原生方向光检查只计一次，性能窗口另计。
- **864 组太阳响应与 60 组 Beer 吸收**：Float32 最大归一化误差约 6.12e-7，吸收最大绝对误差约 8.10e-8；太阳响应的半浮点检查保持原有 1 ULP 限制。覆盖角度、颜色、强度、透射、sheen 与零输入。
- **24 条独立光程和 606 个覆盖过渡样本通过**，占据长度 oracle 保持独立积分。真实叶片方向光的 923 个有效像素，强度 0.5 时响应约为 0.75，误差在 1 半浮点 ULP 内；强度 1 时比例为 0.5。真实点光的 955 个有效像素 RGB 完全不变。
- 两种分辨率 900×650 / 713×509 的 **12 组完整 HDR/深度对照零差异**，覆盖静止、风与水面捕获。近远叶片、屋顶、半砖、玻璃、云影、日月光、天空环境 SSS、软阴影、建筑与生物材质，以及画质/尺寸/上下文恢复均通过。最终各批页面、GL 和 shader 错误及 shader 警告为零。

首次原生方向光测试在 `page.evaluate` 中直接导入裸 `three` 模块，因浏览器模块解析失败而终止。已将测试辅助代码移入 Vite 正常编译的 fixture，修正后及完整回归均通过；原始失败记录保留，不将它描述为产品渲染缺陷。

## 画面与成本

实际查看最终 900×650 固定曝光、默认明暗适应和 1920×1080 森林。背光亮叶有改善，整体仍偏暗橄榄绿，最暗冠层、云团和用户参考图的光色差距保持。相同原生种子 624、时刻 30、FOV 72、光影档，固定曝光为 1；参考图的实际时刻和曝光未知。

| 腐蚀叶片区域统计，900×650 |       0.95 |       0.96 |
| ------------------------- | ---------: | ---------: |
| 有效叶片像素              |     226943 |     227152 |
| 普通直射 p90              | 0.00669412 | 0.00334706 |
| 间接光中位数              | 0.00496968 | 0.00496896 |
| 表面总辐亮度 p10          | 0.00393369 | 0.00379090 |
| 表面总辐亮度中位数        | 0.02272328 | 0.02688271 |
| 主 SSS 中位数             | 0.00786969 | 0.01289667 |
| sheen 中位数              | 0.00755024 | 0.00701886 |

掩码像素和诊断前缀的 RMS 不同，以上是区域统计，不能解释为严格同像素增益。最暗 p10 略降，不能据中位数上涨宣称厚冠层问题解决。默认明暗适应测得曝光从 1.9521484375 变为 1.849609375；曝光、饱和度与适应设置未改，这是画面输入变化后的自动响应。

固定 1920×1080 森林，预热后采 120 帧。GPU 绘制批次合计中位数 / p95 为 **32.182 / 32.744 ms**，与 0.95 的 32.812 / 33.384 ms 接近，不宣称本轮公式带来稳定提速。关闭深度预绘制的对照仍使用本轮新 SSS，测得 42.102 / 43.032 ms；它不是 0.95 旧光学对照。

开启/关闭预绘制时，CPU 提交中位数在 GPU 查询开启下为 32.2 / 15.3 ms，关闭查询后为 **32.7 / 15.1 ms**。上一版的 CPU 回退仍存在；该窗口无查询 RAF 间隔中位数为 35 / 36 ms，不用于推导稳定游玩帧率。GPU 数字不包含初始清屏、全部浏览器和合成成本，CPU 包含原生 WebGL 调用。

已知渲染目标 234809064 字节、几何属性 349482676 字节、独立纹理 11959483 字节与 51 个程序保持；该估算不等于进程显存。渲染 441 / 驻留 529 个区块，默认视距 **10**，晴天地形雾 **87.32～118**，起点为旧值 34.8 的 **2.51 倍**。

原始记录位于 `C:/Users/aentrozhou/.codex/artifacts/hexminecraft-photon-0.96/`，包括 `primary-core` 首次失败、`primary-core-fixed-import`、`lighting-candidate`、`profile-final`、`regressions-final`、`production-ui` 和 `node-tests.log`。生产入口 `index-CpO8u5lC.js` 的 SHA256 为 `be6354ddccb328d3863cb10206ef1dcf7285b975472fed4468387f9e798786a3`。完整 MC/Photon 目标继续推进。
