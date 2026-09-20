# 五分钟视频上传与完整主题预览

## 视频上传

已在隔离 Next.js 实例复现：超过 10 MiB 的视频请求进入 Middleware 后被当前 Next.js 的请求体克隆截断，日志显示 `Request body exceeded 10MB`，后端报 multipart 格式错误。原测试直接调用上传解析器，因此没有覆盖这一层。

修复将 `/api/combat-posts` 精确排除在 Middleware matcher 外，继续使用原流式保存和大小、时长、配额校验。POST 的 `requireAuth` 与 GET 用例的身份校验保留；其他动态子路由继续经过中间件。

同时将可选 Nginx 站点模板从 260m 修正为 516m，完整示例的响应超时从 300s 修正为 960s。项目可以直接访问 Next.js 的 8001 端口，不要求部署 Nginx；本次已复现的请求体截断来自 Next.js，与是否使用 Nginx 无关。仅在实际经过 Nginx 的部署中，才需要独立核对代理配置、`nginx -t` 和重载。

验证覆盖：真实可播放 300 秒 MP4 加合法 padding 使文件超过 12 MiB，浏览器读取时长、XHR、Next.js 入口、原流式解析和临时文件保存全部通过；文件字节数完整。301 秒视频被拒绝。该测试隔离登录、配额和业务数据库，不代表已经在生产创建视频动态。

`npm run test:e2e:combat-streaming` 默认使用无需编码器的容器测试；设置 `FFMPEG_BIN` 和可用的 `E2E_BROWSER_PATH` 后会生成真实五分钟视频并执行浏览器上传。常规入口测试已加入 CI。

## 超管完整风格预览

入口：后台 → 历史主题 → 选择主题分类和语调、编辑内容 → **在首页临时预览**。

完整应用全站背景、文字、导航、Dock、控件、工作区、主题卡片、详情和开屏风格。通过真实 `/api/auth/me` 核验当前超管与快照所有者；预览不修改任何全站发布状态。

| 风格 | 适用内容 | 设计 | 桌面 | 手机 |
|---|---|---|---|---|
| 灯火良辰 | 传统节日、节庆语调 | 暖纸、朱砂、灯窗与金线 | [1440px](../../test-results/history-theme-ui/chromium/session-festival-1440.png) | [390px](../../test-results/history-theme-ui/chromium/session-festival-390.png) |
| 山河兵略 | 古代战役 | 青绿、铜色、地形线与方形结构 | [1440px](../../test-results/history-theme-ui/chromium/session-campaign-1440.png) | [390px](../../test-results/history-theme-ui/chromium/session-campaign-390.png) |
| 静水铭记 | 近现代纪念、庄重语调 | 蓝灰、留白、静态阅读，无开屏 | [1440px](../../test-results/history-theme-ui/chromium/session-memorial-1440.png) | [390px](../../test-results/history-theme-ui/chromium/session-memorial-390.png) |
| 青简人物 | 历史人物 | 米纸、青墨、书页纹理与卷窗 | [1440px](../../test-results/history-theme-ui/chromium/session-scholar-1440.png) | [390px](../../test-results/history-theme-ui/chromium/session-scholar-390.png) |

预览快照使用当前标签页的 sessionStorage，跨页和刷新保留；手动结束、退出、身份变化会清除，标签页会话结束后失效。未开启预览的新标签页保持正常样式。工作室中尚未应用的编辑仍属于运行期临时草稿，刷新会丢失；预览快照与永久保存有明确区别。

浏览器回归覆盖四套风格各 1440/390/320px，实际首页、主题详情、后台工作区、刷新恢复、跨页、结束、新标签页隔离、身份切换、降权、损坏存储，以及庄重模式抑制动画。截图已人工检查。

## 完成范围

四套会话预览风格已实现。历史主题系统尚未整体完成：草稿落库、史实审核、发布、自动排期、公共详情路由及问题反馈仍未接通，相关按钮继续标明不可用。当前不能据此宣称所有历史内容已上线。

生产视频链路尚待部署后验证；代理设置只在实际使用代理时核对。代码上传状态以 Git 远端提交为准，上传不等于已经部署。

## 本地验证结果

- `npm run check:architecture`、`npm run typecheck`、`npm run test:core`：通过。
- `npm run test:history-theme:core`：45 项通过。
- `npm run test:device-routing`：精确排除上传入口及保留其他路由检查通过。
- `npm run test:combat-video`：容器、300/301 秒、大小、超时与失败清理通过。
- `npm run test:e2e:combat-streaming`：配置 FFmpeg/Edge 的真实五分钟视频上传通过；测试结束后 8001 端口已释放。
- `npm run test:e2e:history-theme`：四套完整主题、12 组尺寸、三套开屏与跳过恢复、庄重静态及会话边界通过。
- `npm run lint`：0 错误，18 条既有图片提示；`npm run build`：通过。
- 独立只读代码复核：无待修复发现。上述结果为本地结果，不代表远端 CI 已执行。
