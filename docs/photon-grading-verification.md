# Photon 色调映射与调色

0.101 推进用户森林参考图与绝大部分可迁移 Photon 功能的持续目标。本批移植默认色彩流程与实际可调设置，未完成整体光色或完整 Photon/MC 验收。

## 固定源与算法

只读 Photon `6e67b36e818bacde0304edd49f28e2bb70e33f04` 的 [c19_color_grading.fsh](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c19_color_grading.fsh)、[顶点阶段](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/c19_color_grading.vsh)、[tonemap_operators.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/post_processing/tonemap_operators.glsl)、[color.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/utility/color.glsl)、[ACES utility](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/post_processing/aces/utility.glsl) 和 [final.fsh](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/final.fsh)。范围、默认值和脉冲来自同一提交的 settings/global。

- 宿主线性 Rec.709 场景先转换为源 Rec.2020。输入亮度使用源 0.83 倍，围绕 0.18 的 log2 对比度使用源 epsilon 1e-6，饱和度采用 0.98 倍及源 luminance weights。
- Lottes 原样使用 a=1.5、d=0.91、HDR white=8、mid-in=0.26、mid-out=0.32。映射后转换为 709 并夹到 0～1。
- 输出在 sqrt 感知空间使用源橙/青/绿色隔离、绿色色相及 1.05 gain，随后平方。源名为 HSL 的 helper 实际采用 HSV/value，保留原算法、epsilon 和顺序，不换成标准 HSL。
- 白平衡采用源 660/550/440 nm 黑体函数、6500 K 目标、Bradford/Von Kries 矩阵及源行向量约定；只在设置变化时计算 CPU 矩阵。默认 6500 K 跳过转换，避免额外矩阵往返。
- 最终采用 Photon `1.14374 * (sqrt(x) - 0.126893*x)` 显示近似。源 final 的 CAS、8-bit dither 未随之移植。输入贴图继续使用宿主 IEC sRGB 解码，未修改纹理资产、天空/直接光强度、全局曝光或叶片材质来补偿调色。

宿主 TAA 可产生微小负振铃，而源输入要求非负；调色入口先限制负分量。中间 HDR、bloom、测光、反射和其他照明仍使用宿主线性 709，并非全管线 Rec.2020。源其他 ACES/Hejl/Hable 等备选曲线、Purkinje、摄影暗角、CAS、完整白点/宽色域材质链仍待后续实现。

## 接入与实际设置

`photon-color.js` 将原天空的源矩阵提取为有 GLSL include guard 的共享模块。`photon-grading.js` 保存源色彩核、黑体矩阵及八项设置；`photon-output.js` 使用 Three 的 CustomToneMapping 槽，并让光影档最终 OutputPass 承担一次调色/显示转换。未增加生产 pass 或渲染目标。显示编码只发生在最终 sRGB 输出；纹理解码与线性中间缓冲保持。

均衡/流畅的 toneMapped 材质使用相同默认函数，未增加 composer。低档仍按宿主方式逐材质映射/混合，透明混合和不参与 tone mapping 的对象不等同于 Photon 的全场景延迟调色。可调色彩属于光影档，其余档禁用实际滑块/重置按钮、使用默认色彩，保留选择供返回光影档恢复。

暂停菜单提供亮度、对比度、色彩浓度（0～2）、白平衡（4000～9000 K），折叠分色提供橙/青/绿浓度（−0.5～0.5）与绿色色相（−8～8°）。默认依次为 1/1/1/6500/0/0.1/0/0。偏好仅接受有限数，按源范围和步长规范化；旧偏好补齐默认值，不改变 v16 世界存档。色彩重置只恢复这八项，明暗适应、bloom、云和画质继续保留。

## 实测进度

真实生产输出 pass 对照独立双精度源参考，20 组配置 × 109 个 HDR 色样，共 2180 个 RGB 向量。覆盖所有参数的最小/最大、组合调色、不同曝光、灰阶、色相边界、65504 高光和负振铃。最终编码 RGB 最大绝对误差 **1.008e-6**，alpha 最大误差 **4.769e-9**。另一离屏 WebGLRenderer 通过真实材质的直接渲染路径，8-bit 最大误差 **0.002147**。不是把被测生产 GLSL 再作为参考调用。

普通键盘操作八个真实滑块后保存、重载、继续、切换画质及丢失/恢复图形上下文，实际值与 uniforms 一致；重置色彩后原明暗适应开启选择保留。390×780 窗口无横向溢出。首轮误用字段组本身的 Playwright disabled 判定；DOM 已有 disabled，现验证实际滑块与按钮的禁用行为，复测通过，保留失败 trace。

固定自然森林继续 seed624/time30/FOV72/曝光1。实际查看 900×650 新旧图像。照明 RGB 和强度完全相同，后处理之前的线性 HDR 叶片中位数约 0.10553→0.10544，独立腐蚀掩码略有变化，不能当作逐像素差分。低角度受光仍偏金黄，近处深冠层和用户参考图整体关系仍待校准。

207 项 Node、生产构建和 9 项独立浏览器功能检查通过：新调色 GPU 对照、色彩 UI 恢复、森林采集、192 组天空散射、日夜/均衡场景、bloom 实际场景、bloom DC/色彩/运动脉冲、bloom 生命周期，以及生产 UI 的色温操作、还原和原生存档导入/导出。额外复测一次新按钮样式后的色彩 UI；不重复计入独立数量。暗室、水下、日落、月夜、质量和上下文恢复均通过。

## 最终成本与交付

RTX 4060 / 无头 Chrome / ANGLE D3D11，1920×1080，固定种子/时刻/相机/曝光，各窗口 120 帧。沿用生产目标划分的真实 GPU 批次；合计不含首次绘制前的清除、浏览器隐藏工作，不等于整帧 GPU 查询或稳定游玩帧率。

| 窗口                     | 0.100 GPU 中位数 / p95 | 0.101 GPU 中位数 / p95 | 0.101 CPU 提交中位数 |
| ------------------------ | ---------------------: | ---------------------: | -------------------: |
| 光影档，生产预绘制开启   |     32.055 / 32.654 ms |     32.240 / 33.251 ms |              32.3 ms |
| 同进程，仅关闭叶片预绘制 |     41.903 / 43.000 ms |     42.003 / 42.868 ms |              15.0 ms |

最终输出批次中位数约 0.0983→0.0952 ms，整体成本接近；不把小幅波动宣称为稳定提速或精确开销增量。不发 GPU 查询的光影档窗口，CPU 提交开启/关闭为 32.6/18.9 ms、RAF 间隔 35.2/36.2 ms，原有 CPU 提交成本仍待优化。一次原生跨缓存边界移动重建 1 张覆盖图，GPU 0.47616 ms，不代表持续行走成本。

新增实际默认均衡档窗口，恢复同一自然森林相机、画质 1、无 composer 后暖机。GPU 批次合计中位数 / p95 为 **12.488 / 13.791 ms**，CPU 提交 8.8 ms；独立无查询窗口 CPU 9.1 ms、RAF 中位数 / p95 为 17.7 / 18.4 ms。没有旧均衡档同镜头成本对照，不能据此宣称均衡档加速或固定帧率。

已知光影档渲染目标 **234743560**、几何属性 **349630474**、独立纹理 **12483771 字节**及 **51 个程序**均保持。它是公开资源的逻辑统计，不是进程显存或 shader 二进制占用。GPU disjoint/busy、未知纹理、GL 和页面诊断均为零。实际查看了 900×650 与 1080p 光影森林、默认均衡森林、正午/暗室，以及生产设置和 390×780 菜单图。

原始证据位于本机 `C:/Users/aentrozhou/.codex/artifacts/hexminecraft-photon-0.101/`。GPU 检查串行、采样期间冻结源码，五批所属 PID/UTC 创建时刻和独立端口均已核实退出。首轮字段组断言失败与 trace 保留。最终包只内嵌一份原始 393216 字节散射数据，SHA256 仍为 `d4834ef3babc1376f923f39d495d69dd9d7099f56feb40335a184af8a6b98fc6`，构建产物与源许可逐字节一致。测试通过 Pointer Lock 设备 fixture，未操作前台鼠标。

原 Photon/Bruneton 许可和新增改编范围见 [Photon notice](../public/licenses/PHOTON-NOTICE.md)。参考 Photon 仓库及固定参考工作树保持只读。默认视距 10、441 渲染/529 驻留区块和晴天雾 **87.32～118** 保持，起点仍为旧 34.8 的约 **2.51 倍**。
