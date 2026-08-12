# Findings

## 2026-08-12 基线

- 当前分支为 `main`，HEAD `84a3f5c`。
- 工作区已有 14 个用户侧文档/旧 planning 文件删除，另有未跟踪 `docs/wzywt_v2.1_codex_refactor.md`；本轮必须避开这些既有改动。
- 任务书共 47 节，要求按 Phase A-H 执行。
- `package.json` 尚无 `typecheck`、统一 `check`、CI 脚本；Playwright 当前在 `dependencies`。
- 项目已有 `src/core/team-balancing`、`features/tournaments/server/capacity.ts`、`MarkdownContent.tsx` 与架构检查脚本，可优先增量修复。
- 根目录存在 `.env` 和 `.env.gh_token`；只检查跟踪状态与 ignore 规则，不读取或输出 Secret 内容。
- `requireAuth()` 原先仅在 Session 缺少 role 时查询数据库，是封禁、降权与改密后旧 Session 不失效的根因。
- 固定管理员凭据出现在多个 Git 历史 commit 中；当前代码清理后仍必须人工轮换生产管理员密码和安全答案。
- Git 历史文件名未发现 `.env` 或数据库备份被跟踪；`.env` 与 `.env.gh_token` 当前均被 ignore。
- 旧分队算法用单一权重混合志愿和战力，并一次性 materialize 113,400 个分路方案；其 32 个红蓝方案还只按总战力差提前筛选。
- 新算法使用流式 DFS、10×5 指标预计算、严格字典序志愿比较、完整 BalanceScore、稳定 signature；未知实力采用本场已知实力中位数。
## 最终验证补充

- Next.js 15.5.23 的动态 route params 需 Promise，官方 codemod 修改 17 个动态 API route；移动端 re-export 保持原样。
- 安全公告通过 Next.js 15.5.23 + postcss 8.5.23 + sharp 0.35.3 + nanoid 3.3.18 + undici 7.29.0 清零，无需引入 Next.js 16 的全仓迁移风险。
- Git 历史仍包含旧固定管理员凭据文本，代码清理不能撤销已泄露凭据；生产环境必须轮换管理员密码与安全答案。
- `package.json` 的 0.1.0 与产品 CHANGELOG 版本体系不同，按任务书保留，避免制造第二套发布版本。
- 历史数据库曾依赖 `prisma db push`，现有 migration 无法从空库重建当前 schema；reconciliation migration 是 fresh install 与既有库 baseline 兼容的必要桥梁。
- production Secure Cookie 在 `http://127.0.0.1` 的 Chrome E2E 中不会随 API 请求发送；本地 E2E 改用可信来源 `http://localhost:8001`。
- 本机没有生产 SSH alias、目标参数或轮换值；线上 Secret、管理员凭据、Firewall 和 release 属于需要明确目标与凭据的外部操作。
