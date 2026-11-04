# 2026-11-04 main WebKit 视频 CI 排查与本地修复

## 基线与远端状态

本次基于远端与本地一致的 `ef9842d978fece2549aba7d63e02cf032eeb6393`。
[PR #3](https://github.com/YunHe-Rocky/wzywt/pull/3) 已合并为 `ccc321e338c917de9a8e5b5f7730be466d86b0b9`，其后的 main 清理提交未改变播放器。

[最新 CI 41760509327](https://github.com/YunHe-Rocky/wzywt/actions/runs/41760509327) 的四个 Node 24/26 × local/proxy 任务均在 `Phone video conversion and playback regression` 失败。已读取四个任务的日志，均进入 WebKit 五个样本的检查，最终失败在 `player must not leave uncaught playback errors`，错误栈指向 `inspectCombatVideoSource`。后续浏览器步骤均为 skipped。

此 CI 的 containers、MySQL 8.0/8.4、OCR、Redis 任务成功；同一 SHA 的[依赖审计 41760509270](https://github.com/YunHe-Rocky/wzywt/actions/runs/41760509270) 成功。不能沿用更早一次 CI 的容器故障结论。

## 缺陷与因果边界

CI 出错 URL 与页面使用相同的 `http://127.0.0.1:<fixture-port>` 源；完整视频测试自建 HTTP 服务，没有经过部署用的 Nginx、HTTPS 或真实数据库。四个部署模式任务都在进入各自部署模式之前失败。没有证据支持通过开放 CORS 或修改代理配置修复本问题。

旧播放器仅在 React effect cleanup 中中止异步任务。整页导航不保证执行 React 卸载清理；在文档离开时，尚未结束的 `video.play()` 可以拒绝，媒体也可以继续发出 `error`，并且媒体取消可能早于 `pagehide`。旧回调会把这类过期事件作为当前播放故障，并立即从正在离开的文档发 HEAD。

本地使用实际 React 18 StrictMode、实际播放器和客户端 API 源码、隔离 HTTP 视频/HEAD 404，在 Edge 中受控触发 `pagehide`，再拒绝旧 `play()` Promise 并发出媒体错误。修复前断言失败：预期新增 HEAD 为 0，实际为 2；修复后同一断言通过。恢复 `pageshow` 后再触发正常播放错误，仍能发送 HEAD 并显示文件不存在。

这是已复现的产品生命周期缺陷。CI 的错误恰好出现在最后一个正常样本和卡顿样本的诊断链，符合离开这些页面时仍处理旧媒体事件的机制。上传后的第一次 [PR #4 CI 41764267495](https://github.com/YunHe-Rocky/wzywt/actions/runs/41764267495) 证实：只在 pagehide 使播放器失活还不足以消除错误。新增制品记录到媒体 GET 取消、没有产生网络请求的同步 HEAD 拒绝，随后才是下一页导航提交；原 pageerror 断言仍失败。

据此补充第二个受控复现：在同一事件任务内先触发媒体错误、再 pagehide。同步诊断时额外 HEAD 为 1；把诊断放入可取消的下一事件任务后为 0。通用播放错误仍立即显示，正常 HEAD 状态仍在下一任务请求；页面离开、重试、卸载可以取消尚未开始的请求。**本机仍无法启动 WebKit，最终 Linux 验证以 PR 最新提交的 Actions 为准。**

[后续 CI 41766485101](https://github.com/YunHe-Rocky/wzywt/actions/runs/41766485101) 中 Node 26/local 的完整视频、系统设置、流式上传、赛事/英雄/视频诊断、历史主题、复盘后台均通过，另外三个视频任务仍有过期诊断，说明延后单个任务仍存在竞争。因此在 `beforeunload` 导航开始阶段就取消诊断；该监听器不触发确认提示或暂停媒体，若其他逻辑取消导航，用户显式重试会重置离开标记。新增跨任务窗口复现从 1 次额外 HEAD 降为 0，取消导航后的显式重试仍能获取 HEAD 404。

已通过视频的 Node 26/local 随后暴露独立的测试契约问题：Next 返回 `/login?...` 相对 Location，入口冒烟测试只接受绝对字符串。HTTP 允许相对 Location，本次按实际请求 URL 解析后与完整预期 URL 精确比较，仍校验协议、主机、端口、路径和参数；新增相对地址通过，以及外部/协议相对外部地址、缺失 Location、相对地址丢失参数的拒绝用例。没有修改应用跳转或放开外部地址。

此外，[WebKit 的 ThreadableLoader 错误记录实现](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/ThreadableLoader.cpp) 会主动生成该 Fetch 诊断消息；捕获 Promise 拒绝并不等于阻止浏览器生成诊断。因此原有 catch 已存在，继续加 catch 不能解决任务仍被启动的问题。报错文字本身不足以证明生产 CORS 漏洞。

## 本地修改

- `CombatVideoPlayer` 在 `pagehide` 时先标记播放器失活、递增播放尝试编号，取消缓冲定时器和 HEAD，暂停媒体。旧播放拒绝及媒体事件不再启动新诊断或更新已离开的界面。
- HEAD 诊断安排到下一事件任务，不在媒体错误/播放拒绝回调中同步启动；同一生命周期任务内发生的页面离开、重试或卸载同时取消这个待执行任务。
- `beforeunload` 取消导航开始后尚未完成/启动的诊断，覆盖媒体停止和 pagehide 之间的多任务窗口；取消导航后显式重试可恢复诊断。
- React 卸载及源变化复用同一失效处理；保留 StrictMode 清理后恢复媒体源的行为。
- `pageshow.persisted` 恢复播放器可交互状态，允许用户重新点击播放及正常故障诊断。
- 原完整视频回归增加离开页面后的延迟拒绝/媒体错误、缓存页面恢复、挂起 HEAD 的取消和过期结果、源替换/卸载测试。原 pageerror 断言和所有视频样本保留。
- 保存隔离 fixture 的导航、视频请求方法、Origin/Referer、响应状态、requestfailed 和 pageerror 到 `.cache/ci-diagnostics/video-compatibility/`，由 CI 现有的 `if: always()` 制品步骤收集。数据仅来自测试自建服务，没有业务身份和生产媒体。

入口冒烟与其单元回归另修改 `scripts/public-entry-smoke.mjs` 和 `scripts/test-public-entry-smoke.mjs`。没有修改 API 授权、CORS、视频编码参数、工作流门禁或依赖锁文件。原有 `src/instrumentation.ts` 未提交修改保留在工作区，不属于本次修复。

## 本地验证与限制

本机标准 Node 为 26.10.0，另有 24.22.1；浏览器为 Edge 156.0.4314.58，FFmpeg 7.1。

标准视频回归在 esbuild 子进程启动时遇到 `spawn UNKNOWN`，沙箱外相同；已安装的 WebKit 2311 启动同样返回 `spawn UNKNOWN`，沙箱外也失败。曾尝试独立缓存目录中的 esbuild-wasm，但 Node 24/26 的 WebAssembly 服务因 `ERR_OSSL_ENTROPY_SOURCE_STRENGTH_TOO_WEAK` 失败，未修改系统策略或随机数实现。

为取得有限但实际的浏览器证据，`.cache/register-typescript.mjs` 执行服务端 TS，临时的 `.cache/register-video-typescript.mjs` 和 `.cache/video-typescript-bundle.mjs` 用 TypeScript 编译实际播放器/客户端代码、加载已安装的 React/ReactDOM 开发版。完整回归脚本和所有断言保持原样；仅组件 fixture 的构建方式不同。这不等于标准 esbuild 构建或 WebKit 通过。

| 检查 | 结果及边界 |
| --- | --- |
| 受控生命周期复现 | pagehide 后迟到事件从 2 次过期 HEAD 降为 0；同一事件任务内 error 后 pagehide 从 1 次降为 0；Edge、实际 React/源码，合成 pagehide/pageshow，未证明真实 BFCache 接纳 |
| 完整视频脚本，Node 26 | 五种格式上传/转码/完整解码、五分钟保留、MP4 progressive metadata，以及 Edge 所有播放/恢复/生命周期/pageerror 断言通过；随后 WebKit 启动受阻，整体退出 1 |
| 完整视频脚本，Node 24 | 五种格式转码/完整解码及 Edge 全部断言同样通过，新增请求/响应诊断制品已写出；随后 WebKit 启动受阻，整体退出 1 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 0 error，18 条既有图片警告；修改文件的定向 lint 通过 |
| 架构检查、core、视频上传/时长边界 | 通过，使用临时 TS 执行器；视频用例在沙箱外执行，含 300/301 秒、畸形媒体、上传超时/取消和文件清理 |
| 赛事边界 | Edge 的 1280/320px 失败、重试、登录边界通过 |
| 英雄刷新 | Edge 列表及 1280/390px 详情的更新、租约顺序、重试、订阅稳定性通过 |
| 视频诊断 | Edge 实际手机页面的 HEAD 404、重试和断网且无 pageerror 通过；该已有脚本在 Windows 选择 Edge，未据此推断 WebKit |
| 上述三项 Next UI | 使用隔离 Next dev 服务，所有 API 为测试拦截；数据库指向不可达的本机测试地址，不能替代真实登录/数据集成或生产构建验收 |
| 系统设置、完整 Next 流式上传、历史主题、复盘/后台 | 已逐项尝试标准命令，均在 esbuild 编译阶段 `spawn UNKNOWN`，未执行到浏览器断言 |
| local 部署浏览器集合 | 缺少隔离测试 MySQL；使用明确不可达的 loopback 测试地址验证，连接失败，未使用任何业务数据库替代 |
| proxy 部署浏览器集合 | `spawn openssl ENOENT`，另无 Nginx 与隔离测试 MySQL，无法执行完整 HTTPS/会话集合 |
| `npm run build` | 沙箱外编译及类型检查完成，收集页面数据时 Application Control 阻止 `sharp-win32-x64-0.35.5.node`，整体失败 |

本次创建的 Next 开发服务已停止，没有遗留本任务的 8001 监听。测试使用独立 `.cache` 媒体和 fixture 数据，没有迁移或操作生产数据。

本地日志包括 `.cache/player-lifecycle-before.log`、`.cache/player-lifecycle-after.log`、`.cache/ci-video-typescript.log`、`.cache/ci-video-node24.log`、`.cache/ci-fix-next-browser-results.json` 以及 `.cache/ci-fix-*.log`。临时构建辅助脚本及媒体均在忽略目录，没有进入项目依赖或发布流程。

补充时序复现见 `.cache/player-lifecycle-before-deferred.log` 和 `.cache/player-lifecycle-after-deferred.log`。第一次 PR 的 Linux 标准检查、生产构建、容器迁入、数据库矩阵、OCR、Redis 及依赖审计均已通过；完整视频仍失败，后续浏览器步骤因此尚未执行。不能把这次上传或部分成功描述为 CI 全通过。

导航开始跨任务窗口的修复前后日志为 `.cache/player-before-navigation-guard.log`、`.cache/player-after-navigation-guard.log`；入口 Location 单元回归为 `.cache/ci-public-entry-relative.log`。最新类型检查与修改文件 lint 通过。完整部署浏览器集合尚须在最新提交上重新执行。

## 尚需完成的验证

在允许 esbuild、sharp 和 Playwright WebKit 运行的环境，按现有 CI 顺序执行 `test:e2e:video-compatibility`、`test:e2e:settings`、`test:e2e:combat-streaming`、赛事边界/英雄刷新/视频诊断、`test:e2e:history-theme`、`test:e2e:combat-admin`，并用隔离 `_ci`/`_test` MySQL、Nginx/OpenSSL 分别运行 `test:e2e:local` 和 `test:e2e:proxy`。保留 Node 24/26 及 WebKit，不关闭断言。新诊断制品用于进一步核对真实导航时序。

本报告记录本地排查与验证结果。修复提交后的远端 CI 结果以对应 PR / Actions 为准；本地验证不能替代 Linux WebKit 验收。未部署或操作生产数据。
