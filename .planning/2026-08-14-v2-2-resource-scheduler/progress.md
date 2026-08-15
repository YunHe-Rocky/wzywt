# Progress

## 2026-08-14

- 读取 V2.2 任务书、权威架构、既有 planning 记录与 Git 状态。
- 确认任务书是产品规格数据，不把其中内容当作额外代理指令。
- 复用既有隔离计划 `.planning/2026-08-14-v2-2-resource-scheduler`，不覆盖已完成的根 V2.1 计划。
- 开始 Phase 1：枚举首页、赛事、英雄、装备、Cron、Redis、SSE 和现有测试入口。
- Phase 1 完成：确认最小接入面为首页、赛事大厅、英雄/装备列表、监控页和独立 Cron。
- Phase 2 已实现调度内核：五态状态机、90 秒 Lease、SingleFlight、stale-while-revalidate、用户/公共作用域、自动 sweep/evict 与监控快照。
- 抽取公告、赛事、英雄、装备、官方资讯服务，使 Route 保持参数/权限/响应适配；公共赛事仍使用最小字段白名单。
- 新增 Lease/Data/管理员资源监控 API；首次 `npm run typecheck` PASS。
- 首页立即加载公告/公开赛事、延迟加载官方资讯；赛事大厅使用用户作用域资源；英雄/装备 Hook 使用公共页面资源。
- Client Lease Hook 支持 30 秒续租、unmount 主动释放和异常退出 90 秒过期兜底。
- `/monitor` 增加五态、Lease、加载/复用/命中/释放/版本监控；管理员资源快照 API 与手动检查 POST 保持 super-admin 权限。
- Cron 新增独立 equipment daily sync 和 official-news 30 分钟刷新；英雄原有独立 pipeline 保持不依赖页面。
- `test:resources` 覆盖 SingleFlight、用户隔离、主动释放、续租/过期、evict 和 stale-while-revalidate，PASS；typecheck PASS。
## 2026-08-15

- 恢复昨晚中断的 Phase 6/7 验收；未覆盖任何无关工作。
- 最终 `npm run check` PASS：architecture、typecheck、core、Markdown、next-stage、connections、resources 全部通过。
- 最终 lint PASS：0 error、18 个既有 warning，无新增 warning。
- 最终 production build PASS，40 个静态页面生成完成，资源 API 和管理员监控 API 均进入路由产物。
- Headless Chrome production smoke PASS：首页立即公告/公开赛事、延迟官方资讯、英雄/装备页面真实 Dock 导航、3 次 Lease acquire、2 次 unmount release、0 console/page error。
- 浏览器回归发现并修复 HeroGrid 公共 SSE 因误加管理员校验导致的 401；管理员手动监控 POST 和资源快照 API 权限保持不变。
- `git diff --check` PASS；8014 测试服务已精确停止，无残留 listener。
- 未执行生产部署、真实外部英雄/装备同步或生产数据库验证；这些需要授权的生产目标和运行窗口。
