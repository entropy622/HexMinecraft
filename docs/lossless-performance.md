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

这个重载丛林仍未达到 60 FPS 的 16.7 ms 预算。主线程的长帧仍需在移动、重建区块和植物生长时拆解。额外 16 帧 GPU 分段采样显示，水面使用的无水场景采集占 **16.4 ms**，主视图几何占 **11.6 ms**，两次云合成各约 **3 ms**。下一轮优先让水面采集与主视图共享可复用的不透明几何阶段，分别验证岸边、透明物排序和水下广角路径；直接降云采样对当前主瓶颈帮助较小。

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
npx playwright test -c tests/lossless-performance.config.js
```

输出在 Playwright 测试目录，包含同机位截图、连续帧间隔、CPU 采样与 WebGL GPU 计时。找基线时使用提交 `cd21357`，把分支里的两个 `tests/lossless-performance.*.js` 复制到基线工作树再运行。
