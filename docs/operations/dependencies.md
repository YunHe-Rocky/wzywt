# 依赖与 overrides 治理

## 安装与审计原则

`package-lock.json` 是构建和发布的解析依据，CI/部署统一使用 `npm ci`，不得删除 lockfile 或在生产使用 `npm install` 漂移依赖。生产依赖审计命令为 `npm run audit:prod`；独立的每周工作流执行同一命令。审计结论以当次 registry 数据为准，不能只看版本号猜测漏洞，也不能为消除数量而盲目执行破坏性 major 升级。

升级流程：创建小范围依赖变更，更新 lockfile，记录上游变更与风险，依次运行 `npm run check`、`npm run lint`、`npm run build`；涉及浏览器/数据库时再运行对应 E2E 与 MySQL 矩阵。若 audit 报告无法在兼容版本内修复，单独记录受影响调用链、缓解措施和升级决策，不用 override 掩盖运行失败。

## 当前 overrides

下列原因来自当前 lockfile 的实际依赖链，不代表永久版本策略：

| override | 当前依赖链与目的 | 移除条件 | 最低验证 |
| --- | --- | --- | --- |
| `nanoid=3.3.18` | `postcss` 的传递依赖统一到仓库审查过的解析版本 | PostCSS/Next/Tailwind 自然解析到经审计的同版或更高兼容版 | audit、lint、build、CSS 页面回归 |
| `postcss=$postcss` | Next、Tailwind、Autoprefixer 共用根依赖 `postcss=8.5.23`，避免多份处理器漂移 | 上游 peer/直接依赖能在无 override 时解析为同一兼容版本 | lint、build、桌面/移动样式截图 |
| `sharp=0.35.3` | 覆盖 Next 的 optional 图像运行时版本，统一原生包解析 | 锁定 Next 自带同版或经过图片页验证的更高兼容版 | Linux `npm ci`、build、英雄/装备图片页 |
| `undici=7.29.0` | 覆盖 Cheerio 的 HTTP 传递依赖，统一服务端解析 | Cheerio 自然解析到经审计的同版或更高兼容版 | audit、连接测试、英雄/装备同步 smoke |

每项移除必须独立提交，先删除单项 override 并重建 lockfile，再按表中用例验证；不要一次移除全部后靠失败反推。

## 第三方与游戏素材

仓库未声明开源许可证，游戏名称、图片和第三方数据也不因代码可见而自动取得再分发许可。对外发布前由 Owner 分别确认代码许可证、贡献条款、素材来源和商标/接口使用条件。本说明是工程治理边界，不构成法律意见。