# Photon 雨后材质统一

0.134 将雨后地面的吸水暗化、粗糙度、日月高光、雨滴法线和环境反射接入同一套材质响应。保存仍为 v16，沿用天气、资源包和反射设置；默认视距与雾距保持。整体森林参考图与完整 Photon 迁移仍未完成。

## 来源与宿主适配

固定参考为 Photon `6e67b36e818bacde0304edd49f28e2bb70e33f04` 的 [rain_puddles.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/surface/rain_puddles.glsl)、[deferred shading](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/program/d4_deferred_shading.fsh) 与 [specular_lighting.glsl](https://github.com/sixthsurge/photon/blob/6e67b36e818bacde0304edd49f28e2bb70e33f04/shaders/include/lighting/specular_lighting.glsl)。派生函数与许可范围见 `public/licenses/PHOTON-NOTICE.md`。

保留源吸水暗化 `1 - 0.67 × porosity × puddle`，再按未吸收的覆盖量暗化 `1 - 0.33 × coverage`；湿面使用粗糙度 0.002、F0 的源下限合并规则及 SSR 覆盖量。雨滴法线与平面法线按覆盖、雨强和掠射角混合。宿主继续使用既有世界坐标噪声和雨滴圆环，不将其声称为源 noisetex 的逐像素复现，颜色工作空间仍为线性 Rec.709。

沿用真实屋顶、群系与表面朝向数据，并按源规则过滤强方块光和不足的天空光。宿主体素光属性储存平方后的强度，先还原到光照等级再判断。树叶、草花及未标记为地表湿面的独立模型不加入该路径。labPBR 的孔隙率和法线先解码，再应用湿面响应。

## 共享渲染路径

材质暗化发生在反射光计算前，移除原生几何在最终合成时再次统一变暗的旧路径；自发光保持独立。日月高光读取湿面粗糙度和法线，反射 MRT 写入同一份湿面颜色、法线和覆盖量。积水不再用另一套固定天空色与平面 Fresnel 混合，改用已有环境图、实际场景追踪和材质 Fresnel。

粗糙面保留 GGX VNDF 多射线与既有 HDR 颜色 mip。粗糙度低于 0.003 的表面使用稳定的镜面极限和固定追踪抖动，不构建其不需要的颜色 mip；实际雨滴仍由模拟时间驱动。该平滑极限是宿主适配，避免暂停和晴天水洼发生随机跳动。

复用现有 MRT 的三个附件；有 labPBR 高光通道时沿用第四个附件。没有新增生产 pass、渲染目标、顶点属性或存档字段。受雨地形会使用包含图集采样的光学材质变体，比原来的简单遮罩需要更多着色工作；本批没有测得可泛化的 FPS 或总显存结论。

## 验证与画面

一项原生材质流程用真实地形、纹理和照明属性比较干湿颜色、源光学参数和共享 MRT，包含石材、泥土、木板、金属与屋顶下的地面。独立 CPU 运算核对实际像素输入，初次及显卡恢复后的参数误差约 `4.17e-10`，颜色、覆盖与法线的最大读回差约 `2.21e-3`，包含八位 MRT 的量化误差。没有将像素采样数量计作独立测试场景。页面无错误或警告，GL 错误为零。

四项既有回归通过，覆盖彩色建筑倒影，吸水性与屋顶/墙面/干燥天气，labPBR ZIP 导入、原生通道、保存与恢复，以及干燥金属和宝石反射。雨滴流程另外通过暂停/模拟时间、停雨、画质切换、尺寸变化与水下停用检查。发布包有两项实际界面流程，分别导入发光与湿面样片；没有开发 API，真实设备恢复后继续绘制，导出有效 v16，时间、库存、方块、状态、炉具与湿面天气数据保持。

画面对照为相同人工样片、固定镜头、导入时间 120 与固定曝光；关闭云、抗锯齿、AO 和泛光以检查材质。旧着色代码来自 `27a7f7a`，两次启动有少量正常模拟差异，不作整图冻结差分。原始 PNG 未编辑，证据目录的 `comparison.html` 可拖动对照。这不是自然森林或自然洞穴验收。

## 证据与边界

证据目录 `C:/Users/aentrozhou/.codex/artifacts/hexminecraft-wet-material-0.134/`：旧实现画面 `baseline`，最终原生流程 `native-final`，稳定雨滴 `ripple-stable`，资源包/干燥反射/两项湿面回归 `integration-final`，发布包 `production`。最终原生、集成与发布流程的 906 个受审计输入文件无漂移；稳定雨滴之后仅清理了不使用的变量与包装函数。所有 GPU 流程串行、后台运行，使用 Pointer Lock mock，不操作前台鼠标及用户的 5173 服务；每批结束核对所属 PID/创建时刻及 5191/5193 监听均为空。Photon 与参考场景 worktree 保持固定提交与干净状态。文档和许可说明在 GPU 检查全部结束后补充；交付构建通过，主包与远景 Worker 的 SHA-256 与验证运行包一致。

保留失败记录：GLSL 参数名误用了保留字；样片角色在初始化时落出悬空地面，改用悬停存档与固定镜头；恢复后在 MRT 实际重绘前读取了空数据，改为等待一次真实重绘；普通多射线随机采样使镜面水洼在晴天跳动，产品加入稳定镜面路径后通过雨滴检查。没有降低颜色、遮雨、暂停或设备恢复门槛。

远景简化材质、完整离屏反射、反射专用历史、自然场景成本及更多独立模型仍需完善。源噪声、源色彩空间和全部水/玻璃层合成也没有在本批完成。

复跑入口如下，浏览器均使用后台 Pointer Lock fixture；发布流程需先构建，并设置 `PHOTON_REFERENCE_PRODUCTION=1`：

```powershell
node node_modules/@playwright/test/cli.js test --config tests/photon-wet-material.config.js
node node_modules/@playwright/test/cli.js test --config tests/photon-integration.config.js tests/wet-surfaces.spec.js tests/material-pack.spec.js tests/surface-reflections.spec.js --grep "ZIP controls|native metal and gems|real colored buildings|actual exposed top|rain ripples"
npm run build
$env:PHOTON_REFERENCE_PRODUCTION = '1'
node node_modules/@playwright/test/cli.js test --config tests/photon-emission-production.config.js
```
