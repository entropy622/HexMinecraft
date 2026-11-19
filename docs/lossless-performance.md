# 无损性能分支交接

## 本轮处理

- 藤蔓保留原有生长概率、顶到底的检查顺序和区块边界规则。原有支撑通过后会复用结果；编辑相邻方块、改变支撑形态、液体进出和区块加载会重新检查。
- 区块网格在构建时复用带一格外圈的体素快照。单次植物更新涉及的光源、状态和掉落照常处理，同一块地形最多重建一次。
- 叶片环境光沿原有射线计算。只有阻光类别或叶片采样点变化才重算；烘焙顶点的天光和方块光相同时不重复上传对应数组。
- Photon 后处理的场景主视图、水面采集和保护掩码复用同一份场景变换。分辨率、视距、阴影分辨率、抗锯齿、反射、体积雾和云层积分采样均沿用原设置。

## RTX 4060 实测

后台 Edge / ANGLE D3D11，i7-13700 + RTX 4060，1366 × 768 原生帧缓冲，最高光影 1.7 档。使用种子 624 的同一丛林机位，169 个远景地形块就绪后截取对照图，再开世界模拟、保持机位静止，采集 72 个绘制帧。帧率按总帧间隔换算。两次测量均无 GPU disjoint 或 WebGL 错误。

| 指标             | `cd21357` 基线 | 性能分支 |
| ---------------- | -------------: | -------: |
| 平均帧率         |       4.76 FPS | 9.12 FPS |
| 帧间隔中位数     |        99.9 ms |  50.0 ms |
| 帧间隔 P95       |       933.5 ms | 733.3 ms |
| 主线程每帧中位数 |        90.4 ms |  47.9 ms |
| GPU 每帧中位数   |        41.2 ms |  42.5 ms |

[优化前截图](media/lossless-performance/before.webp) · [优化后截图](media/lossless-performance/after.webp) · [基线采样](media/lossless-performance/baseline.json) · [性能分支采样](media/lossless-performance/optimized.json)

同机位截图保留近景叶隙、远处冠层、树影和云层细节；两张 8 位截图的通道平均绝对差约为 0.77 / 255。

初版主线程和长帧有改善，GPU 仍耗时约 42.5 ms。追加 16 帧分段采样定位到水面无水场景采集（16.4 ms）和主视图几何（11.6 ms），因此第二轮直接消除这两路的重复不透明绘制。

## 水面与主视图共享不透明场景

水面上方的两个视图使用同一投影。场景不透明几何与植被深度只绘制一次，用一个 GPU blit 复制 HDR 颜色和深度；两路各自绘制原有的透明队列，水面采集跳过水和第一人称物品。第一人称不透明装备仍和场景做深度测试。水下采集的 0.4× 投影系数、云层历史、波浪、反射与折射采样保持不变。

| 同一丛林基准       | `155237c` |  共享水面 |
| ------------------ | --------: | --------: |
| 平均帧率           |  9.12 FPS | 13.79 FPS |
| 帧间隔中位数       |   50.0 ms |   33.3 ms |
| 帧间隔 P95         |  733.3 ms |   50.1 ms |
| 最长帧间隔         | 1033.4 ms |  933.3 ms |
| 主线程每帧中位数   |   47.9 ms |   30.5 ms |
| GPU 每帧中位数     |   42.5 ms |   28.6 ms |
| 每帧绘制调用中位数 |      3097 |      1974 |

[共享水面后的同机位截图](media/lossless-performance/shared-water.webp) · [逐帧及 GPU 分段记录](media/lossless-performance/shared-water.json)

自然丛林对照覆盖两种分辨率、静止与摆动的树叶及水下广角。主视图和水面采集的 HDR 颜色分量与深度读数在同一帧对照中逐像素一致。

仍未达到 60 FPS。共享不透明阶段本身的 GPU 中位数为 17.2 ms；云层两路各约 3.2 ms。当前最差帧仍接近 1 秒，缩短这类卡顿要进一步减少区块网格重建。这组 P95 取自一次 72 帧测量，最长帧单列保留。

## 换电脑继续

```powershell
git fetch origin
git switch --track origin/codex/lossless-performance
npm ci
npm run dev
```

使用独立端口在后台运行固定机位基准。装有 Edge 时可直接运行下方命令；脚本使用本机真实 GPU，记录 WebGL 实际选中的设备，并模拟 Pointer Lock。

```powershell
$env:HEX_PROFILE = '1'
$env:HEX_GPU_PASSES = '1'
npx playwright test -c tests/lossless-performance.config.js lossless-performance.spec.js
```

输出在 Playwright 测试目录，包含同机位截图、连续帧间隔、CPU 采样与 WebGL GPU 计时。复测分支初版前的基线时使用提交 `cd21357`；水面优化前使用 `155237c`。把分支里的两个 `tests/lossless-performance.*.js` 复制到基线工作树再运行。
