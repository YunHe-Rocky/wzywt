# 贡献指南

感谢关注。当前仓库尚未声明开源许可证；公开可读不等于允许复制、修改或再分发。外部贡献者在开始较大改动前请先通过仓库 Owner 的公开联系方式确认范围与贡献条款。

## 开发约束

1. 使用 Node.js 24 和 `npm ci`，保留 `package-lock.json`。
2. 阅读 `AGENTS.md`、`docs/architecture/code-architecture.md` 与相关产品规则。
3. Schema 变化新增 migration；不得改写既有 migration，生产不得使用 `db push`。
4. 不提交 `.env`、凭据、真实用户数据、原始比赛截图、数据库备份或本地构建物。
5. 变更保持单一目的，并在 PR 中列出实际执行的测试、未执行项和残余风险。

提交前至少运行：

```bash
npm run check
npm run lint
npm run build
```

涉及数据库、浏览器流程或部署脚本时，按 `docs/operations/maintenance.md` 增加相应集成、E2E 或恢复验证。安全问题不要提交公开 Issue，按 `SECURITY.md` 私下报告。