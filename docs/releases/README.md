# 正式版本登记

`docs/releases/releases.json` 是王者演武堂正式版本的权威登记表。正式体系从 `v1.0.0` / `WZYWT-REL-0001` 起算；旧更新日志中的版本文字仅作为历史开发阶段记录。

## 编号规则

- 公开版本号使用 `vX.Y.Z`。
- 大版本记录为 `releaseType: "major"`；下一个大版本通常使用 `v1.1.0`，不兼容变更使用 `v2.0.0`。
- 小版本记录为 `releaseType: "minor"`，通常递增修订号，例如 `v1.0.1`。
- 内部编号对大小版本统一递增：`WZYWT-REL-0001`、`WZYWT-REL-0002`、……，永不复用。
- `releasedAt` 使用上海时区 ISO 8601 格式，必须精确到秒。

## 每次发布必填

1. 公开版本号、内部编号、大/小版本类型和精确发布时间。
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

- [`v1.0.0`](v1.0.0.md) / `WZYWT-REL-0001` / 大版本
