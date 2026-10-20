# 版本登记

`docs/releases/releases.json` 是王者演武堂版本的权威登记表。`currentDevelopment` 表示当前内部开发版本，`releases` 保留已完成代码登记的历史；两者都不代表生产已经部署。正式体系从 `v1.0.0` / `WZYWT-REL-0001` 起算；旧更新日志中的版本文字仅作为历史开发阶段记录。

## 编号规则

- 从 2026-10-20 的本轮内部登记开始，版本号使用 `vX.Y.Z`，依次表示「大更新.小更新.子更新」。
- 第一位为大更新，记录为 `releaseType: "major"`，递增第一位并将后两位归零，例如 `v2.0.0`。
- 第二位为小更新，记录为 `releaseType: "minor"`，递增第二位并将第三位归零，例如本轮 `v1.1.0`。
- 第三位为子更新，记录为 `releaseType: "patch"`，递增第三位，例如后续 `v1.1.1`。
- `v1.0.0` 至 `v1.0.3` 的历史编号、分类和标签按旧记录保留，不回改历史。
- 内部编号对大更新、小更新和子更新统一递增：`WZYWT-REL-0001`、`WZYWT-REL-0002`、……，永不复用；同一内部版转为正式代码登记时保留原内部编号。
- `releasedAt` 使用上海时区 ISO 8601 格式，必须精确到秒。

## 内部版本

在 `currentDevelopment` 记录版本、内部编号、更新类型、`status: "internal"`、精确到秒的上海时区 `registeredAt`、上一版本和真实 `source.baseCommit`。源码未提交时使用 `source.state: "working-tree"`；形成实现提交后改为 `source.state: "committed"`，并用 `source.commit` 记录实际实现提交。版本登记可以在后续提交中维护，不虚构末提交或已创建的标签。

包版本和锁文件优先与 `currentDevelopment.version` 保持一致；没有内部版本时才与 `releases[0].version` 保持一致。内部登记同时更新 README、CHANGELOG 和详细版本文档，不创建公开站内公告或 Git Tag。后续转为正式代码登记时，移除 `currentDevelopment` 并将同一版本补全后置于 `releases` 首项。

## 每次发布必填

1. 公开版本号、内部编号、更新类型和精确发布时间。
2. Git Tag、上一版本及本次源码提交范围。
3. 对应 PR 的编号、标题、链接、Merge Commit 和覆盖范围。
4. 本版变化摘要。没有通过 PR 的变更必须在 `notes` 中说明，并保留可比较的提交范围。
5. `CHANGELOG.md`、对应的详细版本文档、`package.json` 与 `package-lock.json`。

## 发布顺序

1. 在 `releases.json` 最前面加入新记录，并新建 `vX.Y.Z.md`。
2. 更新包版本、更新日志和站内版本公告。
3. 运行 `npm run test:release` 及与变更对应的项目检查。
4. 创建版本提交，再创建 annotated Git Tag `vX.Y.Z`，使 Tag 指向包含版本记录的提交。
5. 推送提交和 Tag 后，使用 `previous-tag...current-tag` 在 GitHub 对照大小版本。

## 当前版本

- 当前内部版：[`v1.1.0`](v1.1.0.md) / `WZYWT-REL-0005` / 小更新；下一子更新为 `v1.1.1`，尚未登记。
- 上一已登记代码版本：[`v1.0.3`](v1.0.3.md) / `WZYWT-REL-0004`（环境验收见详细记录）
- 更早版本：[`v1.0.2`](v1.0.2.md) / `WZYWT-REL-0003`
- 上一正式基线：[`v1.0.0`](v1.0.0.md) / `WZYWT-REL-0001` / 大版本
