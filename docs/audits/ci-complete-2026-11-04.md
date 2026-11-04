# 2026-11-04 完整 CI 浏览器集合修复

## 基线

在 PR #4 的 `74a7e47f7e1b336638c1962a82df67cb416b5c5f` 上，[CI 41767843397](https://github.com/YunHe-Rocky/wzywt/actions/runs/41767843397) 四个 Node 24/26 × local/proxy 任务均通过完整手机视频、系统设置、Next 流式上传、赛事边界/英雄刷新/视频诊断、历史主题和复盘后台。失败集中在最后的完整部署模式浏览器集合。容器/真实迁入、MySQL 8.0/8.4、Redis、OCR 和依赖审计通过。

本轮继续保留所有矩阵、浏览器、业务用例及失败门禁，不使用跳过、错误过滤或重跑掩盖确定失败。

## 逐项根因与修改

| 失败 | 证据 | 修改与验证契约 |
| --- | --- | --- |
| 赛事大厅标题超时 | CI 截图显示大厅和登录用户正常，当前 h1 是“找到队友，准备开局。”；测试仍等待旧 h1“赛事大厅” | 用精确的当前 h1 定位加载完成；真实登录、Cookie、资源租约、退出、撤销版本和丢失 Cookie 检查保留。相对登录 Location 按完整基址解析，并新增路径与 redirect 参数精确检查 |
| 登录动画过快 | AuthForm 与 CSS 均为 180ms 卡片退出，测试却要求至少 900ms；“个人空间”已移至用户菜单 | 测量实际离开 class 的计算样式与浏览器 history 导航时间，明确要求 180ms 过渡完成（允许一个渲染帧的观察误差），保留正常 2 秒、减少动态效果 700ms 上限；从当前用户菜单进入个人空间，并增加展开菜单不得预取受保护页面检查。未改变产品动画或延迟 |
| 复制房间号控件超时 | 按钮现有 `aria-label="复制房间号 628319"`，测试仍用已删除的 title | 以精确 role/name 触发复制；仍核验实际复制内容、加入、头像、英雄选择、排序/排除、焦点和宽度 |
| 空白战术图层残留草稿 | 生产 CI 的 1440/390/320px 均在点击空白图层后立即看到旧草稿；开发模式通过。普通 effect 的草稿/撤销重置落后于新图层提交 | 改为 layout effect，在绘制前重置草稿、指针、撤销/重做。原立即断言保留，不增加等待；源图层/路线 revision 身份判断仍保留，避免刷新或保存元数据误清未保存编辑 |
| HTTPS 更新日志证书错误 | 仅 proxy 模式 `ERR_CERT_AUTHORITY_INVALID`，该用例没有像其他隔离 proxy 用例一样处理自签名证书 | 仅为 HTTPS loopback fixture 设置浏览器 context 的证书例外，非 loopback HTTPS 继续验证证书；页面、导航、空态、失败重试和 1280/390/320px 宽度检查全部保留 |

## 本地验证

使用隔离 Next dev 服务和 Edge 156，实际源码/页面运行，相关 API 由原用例拦截；不使用业务数据库，辅助启动器使用不可达 loopback 测试地址。

- 房间/个人资料：1280、390、320px 全部通过。
- 战术图层：1440、390、320px 全部既有场景通过，含空白层切换、撤销清理、创建层、元数据保存不清草稿、刷新保留选择、拒绝状态、真实地图与只读边界。生产模式的修复结果仍需最新 Linux CI 证实。
- 更新日志：1280、390、320px 列表、详情、空态、失败重试通过；本机只验证 HTTP，HTTPS 自签名 fixture 由 Linux proxy CI 验证。
- 登录：普通/减少动态效果、用户菜单不预取、个人空间导航、丢失 Session、过期 Session 的原回归通过。临时启动器的 Cookie 值修正为本地配置契约的 `0`，没有修改项目 `.env`。
- `npm run typecheck`、修改文件 lint、`git diff --check` 通过。

本地证据位于忽略目录 `.cache/ci-green-baseline-*.log`、`.cache/ci-fix-tactic-layer-regression.log`、`.cache/ci-fix-room-profile-regression.log`、`.cache/ci-fix-login-transition-regression.log`、`.cache/ci-fix-changelog-regression.log`。真实 MySQL、完整 HTTPS、Chromium/WebKit 会话和生产构建仍以同一最新提交的 Linux Actions 为准。

## 验收边界

只在同一最新提交的完整 CI 和依赖审计均成功后声明全绿；不能由局部视频通过、开发模式、上传成功或旧提交的通过结果替代。不会合并 main、部署或发布 Release；原有 `src/instrumentation.ts` 工作区改动继续排除。
