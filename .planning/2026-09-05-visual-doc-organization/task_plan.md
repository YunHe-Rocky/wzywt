# 比赛档案视觉重做与文档目录治理

## Goal

消除比赛档案页与王者演武堂既有视觉体系的违和感，并把文档按用途迁入稳定子目录，减少仓库根目录和 `docs/` 根层文件数量，同时修复全部本地引用。

## Constraints

- 保留当前工作区全部已有改动，不覆盖、不回退用户文件。
- 页面信息层级、色彩、间距和交互服从现有赛事产品语境；不引入远程字体或与项目无关的新视觉品牌。
- 移动端 375px 无页面横向溢出，关键控件至少 44px，键盘焦点清晰，并尊重 reduced motion。
- 文档只做分类迁移和必要入口整理，不改写历史内容；所有仓库内链接、脚本引用和治理规则必须同步。
- 根目录保留行业惯例入口、协作约定和构建配置；任务过程文档迁入 `.planning/`。

## Phases

- [completed] Phase A：盘点现有视觉系统、档案页问题、文档树和引用图
- [completed] Phase B：重构比赛档案页的信息架构、视觉层级和响应式呈现
- [completed] Phase C：按产品、架构、运维、任务书、评审分类文档并修复引用
- [completed] Phase D：执行链接、架构、类型、测试、构建与浏览器视觉验收

## Acceptance criteria

- 档案页不再使用突兀的英文眉题、堆叠渐变胶囊和等权卡片；核心状态、比赛结果、审核动作层级清楚。
- 桌面端紧凑、对齐稳定；移动端不依赖十列横向滚动即可阅读双方结果和操作。
- 颜色使用项目语义色和红蓝阵营色，装饰克制，正文对比度和交互状态满足可访问性要求。
- `docs/` 仅保留一个分类索引和分类文件夹；根目录不再保留 `task_plan.md`、`findings.md`、`progress.md`。
- 所有本地 Markdown 链接和源码中的文档路径可解析，架构检查、typecheck、相关回归、lint/build 与浏览器检查通过或如实记录。

## Error log

| Error | Attempt | Resolution |
|---|---:|---|
| Managed sandbox could not apply deny-read ACLs on the Chinese workspace path | 1 | Continue with narrowly scoped escalated reads and checked Git patches authored through `apply_patch` |
| Parallel design-system and memory lookup failed because the first child process hit the ACL helper error | 1 | Reran each bounded read separately with the required workspace permission |
| Match patch generator interpolated page template variables before producing a patch | 1 | Escaped nested template placeholders; no repository patch had been generated or applied |
| First document rename patch used incompatible absolute/no-index rename metadata | 3 | Regenerated with relative paths, normalized quoted and unquoted rename fields, then required `git apply --check` before applying |
