# Findings

## 2026-08-14 baseline

- 用户任务是实现 V2.2 任务书；任务书内容按规格数据处理，不作为额外指令。
- 当前分支 `main...origin/main`，唯一未跟踪文件是用户提供的 V2.2 任务书。
- 既有根计划 V2.1 的 Phase A-V 均已完成；本任务使用独立计划目录。
- 权威架构为 `docs/code-architecture.md`：Route 仅适配，Web 仅渲染/交互，业务调度进入 `src/features`，基础设施进入 `src/lib`。
- 现有运行进程为 Next.js `web` 与独立 `scripts/cron.ts`；已存在英雄、装备、赛事、Redis、Cron、SSE 和 connection regression 基础。
- 历史连接审计指出：SSE 必须共享轮询且可释放；Redis 为 lazy 全局复用；Cron 使用可续租数据库 Lease、持久任务与 drain-on-shutdown。这些边界必须保留。
- 当前页面/API 已具备首页、赛事、英雄、装备、官方资讯与 `/monitor`，适合渐进式接入，不需要重写现有业务域。
- 资源调度应位于新的 `src/features/resource-scheduler`；Route 只做 Session/参数/响应适配，React 只通过 feature client API 管理页面 Lease。
- 现有验证矩阵包含 architecture、typecheck、core、Markdown、next-stage、connections、lint、build；V2.2 需增加独立 scheduler 回归并纳入 `check`。
- 调度缓存只保存派生读取结果；MySQL、Redis client、持久同步任务均不注册 disposer，因此 Lease 释放不会关闭基础设施或业务数据。
- `tournaments.lobby` 使用 `user:<userId>` 作用域键；公共资源统一使用 `public` 键，从模型层阻止跨用户复用私有大厅结果。
- 当前 `ecosystem.config.js` 的 Web 进程为单实例；进程内 SingleFlight 覆盖现有部署的多用户共享，Redis/MySQL 持久层继续跨进程共享。未来若扩展多 Web instance，需要增加跨实例请求合并而非假设本实现已覆盖。
- 公开英雄页依赖 `/api/heroes/watch` 接收 `heroes-updated`；该 GET 不能直接改为 admin-only。管理员资源生命周期指标使用独立 `/api/admin/resources` 权限边界。