---
lang: zh-CN
mainfont: "Noto Sans CJK SC"
monofont: "Noto Sans Mono CJK SC"
geometry: margin=22mm
fontsize: 10.5pt
---

# 王者演武堂 WZYWT V2.1 全面稳定性、安全与分队算法重构任务书

> 项目：`YunHe-Rocky/wzywt`  
> 目标版本：V2.1  
> 工作基线：当前 `main` 分支  
> 执行对象：Codex / 编码智能体  
> 核心原则：**不得为了“完成任务”而破坏现有业务。所有修改必须保持现有主要功能兼容，并通过测试后再提交。**

---

# 1. 本次任务目标

本次不是 UI 改版，也不是继续堆新功能，而是建立一个可以长期维护、稳定部署、核心算法符合真实产品需求的 V2.1 稳定基线。

本轮必须覆盖：

- 生产安全与默认凭据清理
- Session、权限实时失效与密码重置安全
- Git / 数据库备份泄露风险
- 部署脚本与回滚机制
- PM2 / Cron / Redis 稳定性
- 分队算法彻底重构
- Split API 并发安全
- Tournament 输入校验与数据库索引
- Markdown 渲染统一
- 架构文档、README、环境变量说明统一
- 测试体系增强与 GitHub Actions CI
- 分队结果可解释性

执行原则：

1. 不允许大爆炸式重写。
2. 每个阶段必须独立可运行、可测试、可回退。
3. 不允许静默改变既有业务规则。
4. 不允许为了 CI 通过删除测试、关闭规则或大量使用 `any`。
5. `src/core` 继续保持纯函数层，禁止引入 Prisma / Next / React / Redis / 网络 I/O。

建议执行顺序：

```text
P0 安全
  ↓
P0 部署
  ↓
P1 分队算法
  ↓
P1 Split 并发
  ↓
P1 测试
  ↓
P2 Tournament / DB / Cron / Redis
  ↓
P2 Markdown / 文档
  ↓
P3 长期结构优化
```

---

# 2. 分队算法的产品定义

本项目不是职业电竞 Matchmaking，也不是“战力平均优先”的系统，而是 10 人朋友局 / 内战组织工具。

因此新的产品定义必须是：

> **先让十个人尽可能玩到自己想玩的分路，再让比赛尽可能公平。**

算法最高目标不是绝对战力平均，而是**位置志愿满意度最大化**。只有当两个候选方案的位置满意度完全一致时，才允许比较战力、段位、单路差距等公平性指标。

## 2.1 严禁锁位置

整个系统不得新增以下概念：

- 锁定打野
- 锁定中路
- 锁定射手
- 绝对位置
- 强制位置
- 某玩家拥有位置特权

所有分路都只能是 Soft Preference（软偏好）。

例如四个人第一志愿都为打野，一场比赛只有两个打野位：

```text
A：打野 > 中路 > 对抗路 > 发育路 > 游走
B：打野 > 发育路 > 中路 > 游走 > 对抗路
C：打野 > 游走 > 对抗路 > 中路 > 发育路
D：打野 > 中路 > 游走 > 发育路 > 对抗路
```

算法必须全局决定谁占两个打野位，其余人顺延到第二、第三志愿。不能因“锁定”让问题无解。

## 2.2 禁止简单权重模拟优先级

禁止把位置满意度写成：

```ts
score = first * 100 + second * 70 + third * 40;
```

再与战力混成一个总分。

也禁止：

```ts
score = positionScore * 1000 - teamStrengthDiff;
```

因为这种设计未来可能被权重调整破坏，导致战力再次“反杀”位置志愿。

必须使用**字典序比较（Lexicographical Priority）**。

---

# 3. 位置志愿的严格字典序规则

定义：

```ts
type PreferenceSummary = {
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  unranked: number;
};
```

比较顺序必须固定为：

1. 第一志愿人数更多
2. 第一志愿相同，则第二志愿人数更多
3. 再比较第三志愿人数
4. 再比较第四志愿人数
5. 再比较第五志愿人数
6. 最后比较未命中 / 未填写志愿人数，越少越好
7. 以上全部完全相同，才进入战力平衡比较

示例：

```text
方案 A：第一志愿 8，第二志愿 2，第三志愿 0
方案 B：第一志愿 7，第二志愿 3，第三志愿 0
```

无论 B 的战力多么平均，都必须选择 A。

再例如：

```text
方案 A：第一志愿 8，第二志愿 1，第三志愿 1
方案 B：第一志愿 8，第二志愿 2，第三志愿 0
```

第一志愿相同，必须选择 B。

建议实现独立比较器：

```ts
function comparePreferenceSummary(a: PreferenceSummary, b: PreferenceSummary): number {
  if (a.first !== b.first) return b.first - a.first;
  if (a.second !== b.second) return b.second - a.second;
  if (a.third !== b.third) return b.third - a.third;
  if (a.fourth !== b.fourth) return b.fourth - a.fourth;
  if (a.fifth !== b.fifth) return b.fifth - a.fifth;
  if (a.unranked !== b.unranked) return a.unranked - b.unranked;
  return 0;
}
```

不要把该规则散落在多个循环中。

---

# 4. 分队算法完整两阶段模型

## 4.1 第一阶段：确定十个人的分路

必须最终形成：

```text
对抗路 × 2
打野   × 2
中路   × 2
发育路 × 2
游走   × 2
```

第一阶段唯一主要目标：**最大化位置满意度**。

即：

```text
第一志愿最大化
  ↓
第二志愿最大化
  ↓
第三志愿最大化
  ↓
第四志愿最大化
  ↓
第五志愿最大化
  ↓
未命中最小化
```

战力不能改变这一步的结果优先级。

## 4.2 第二阶段：红蓝分队

在确定每个位置的两名玩家之后，再决定每个位置谁进红方、谁进蓝方。

理论上：

```text
2 ^ 5 = 32
```

种红蓝分法。红蓝镜像方案可以安全去重为 16 种，但去重只能作为性能优化，不能改变最终结果。

只有当候选方案的 `PreferenceSummary` 完全一致时，才比较 `BalanceScore`。

建议：

```ts
type BalanceScore = {
  totalStrengthDiff: number;
  laneStrengthDiffSum: number;
  rankDiff: number;
  maxLaneStrengthDiff: number;
};
```

比较顺序建议：

1. 两队总综合实力差最小
2. 五个对应分路的实力差总和最小
3. 双方段位差最小
4. 最大单路实力差最小
5. 最终使用稳定 deterministic tie-break

全部指标都是越小越好。

---

# 5. 统一 Candidate 比较器

建立统一候选对象：

```ts
type TeamCandidate = {
  assignments: Assignment[];
  preference: PreferenceSummary;
  balance: BalanceScore;
  signature: string;
};
```

建立：

```ts
compareCandidate(a, b)
```

规则：

```text
comparePreferenceSummary
  ↓ 若有胜负立即返回
compareBalanceScore
  ↓ 若仍相同
stable signature
```

必须修复旧算法中“先在 32 个红蓝方案中只按 `strengthDiff` 选一个，再计算其他指标”的问题。

正确做法：每个完整候选都计算完整的 PreferenceSummary 和 BalanceScore，再由统一比较器决定优劣。不得用单一指标提前剪掉可能更优的方案。

---

# 6. 四个打野等冲突场景的规则

例如：

```text
A：打野 > 中路 > 对抗路 > 发育路 > 游走
B：打野 > 发育路 > 中路 > 游走 > 对抗路
C：打野 > 游走 > 对抗路 > 中路 > 发育路
D：打野 > 中路 > 游走 > 发育路 > 对抗路
```

算法不能：

```text
简单选择打野战力最高的两个人
```

而必须分析：

```text
A 不打野时损失多少？
B 不打野时损失多少？
C 不打野时损失多少？
D 不打野时损失多少？
```

以整个十人的全局 PreferenceSummary 为目标。

这属于**全局优化问题**，禁止用逐人贪心替代。

---

# 7. 战力、段位、英雄数据的正确作用

现有数据如：

- 英雄战力
- 分路水平
- 巅峰分
- 段位
- Peak Rank / Role Rank

继续参与 `BalanceScore`，但不得参与 `PreferenceSummary`。

即：

> “谁更强”不能改变“哪个方案让更多人拿到第一志愿”。

只有位置满意度完全相同后，战力数据才作为红蓝公平性决胜项。

---

# 8. 算法性能重构

重点文件：

```text
src/core/team-balancing/index.ts
```

允许拆分为：

```text
src/core/team-balancing/
  index.ts
  types.ts
  metrics.ts
  preference.ts
  balance.ts
  search.ts
```

要求保持纯函数层。

## 8.1 禁止一次性 materialize 全部方案

禁止：

```ts
const allAssignments = [];
generateEverything(allAssignments);
```

改为流式 DFS：

```text
生成候选
  ↓
立即计算
  ↓
和 best 比较
  ↓
丢弃候选对象
```

降低内存和 GC 压力。

## 8.2 预计算 Player × Role 指标

算法开始前预计算 10 × 5 的 `PlayerRoleMetric`：

```ts
type PlayerRoleMetric = {
  playerId: number;
  role: Role;
  preferenceRank: number;
  strength: number;
  roleRank: number;
  peakScore: number;
  heroPowerScore: number;
};
```

不要在数百万候选中重复排序英雄、取 top3、求平均、重复计算段位。

## 8.3 允许的安全剪枝

允许：

- 某位置已有 2 人时停止继续分配该位置
- 剩余玩家不足以填满剩余位置时立即回退
- 使用不会改变最终结果的理论上界剪枝

禁止任何可能改变最终结果的启发式剪枝。

---

# 9. Deterministic：同输入必须同结果

相同 10 人、相同资料、相同志愿、相同英雄战力，每次分队必须完全一致。

禁止因以下因素产生随机结果：

- `Math.random()`
- 不稳定排序
- 对象遍历顺序
- 时间戳

最终完全平局时，可构造稳定 Assignment Signature，例如：

```text
12:jungle:red|18:jungle:blue|...
```

按稳定字符串排序决胜。

---

# 10. 临时玩家 / 缺失数据

临时玩家没有完整资料时：

- 没有位置偏好：`preferenceRank = unranked`
- 没有实力数据：不得直接按 0 战力处理

建议未知实力取本场已知玩家 strength 的中位数；如果全员未知，则使用统一 neutral baseline。

可定义：

```ts
DEFAULT_UNKNOWN_STRENGTH
```

避免把临时玩家错误视为极弱玩家而扭曲红蓝平衡。

后续可允许临时玩家填写第一、第二志愿和大概段位，但此功能属于 P2，不得阻塞主算法。

---

# 11. Split Result V2 与可解释性

建议把结果版本化：

```ts
{
  version: 2,
  redTeam: [...],
  blueTeam: [...],
  preferenceSummary: {
    first: 7,
    second: 2,
    third: 1,
    fourth: 0,
    fifth: 0,
    unranked: 0
  },
  balanceSummary: {
    redStrength: 1234,
    blueStrength: 1201,
    totalStrengthDiff: 33,
    laneStrengthDiffSum: 110,
    rankDiff: 2,
    maxLaneStrengthDiff: 40
  }
}
```

每个玩家增加：

```ts
{
  assignedRole: "jungle",
  preferenceRank: 1
}
```

UI 本轮无需大改，但如果成本较低，应显示：

```text
第一志愿：7 人
第二志愿：2 人
第三志愿：1 人
双方综合实力差：...
```

不要向普通用户展示内部复杂权重。

---

# 12. 分队算法必须新增的测试

至少新增以下回归测试：

## Test 1：标准十人

- 10 名玩家
- 每人唯一分路
- 五个位置各 2 人
- 红蓝各 5 人
- 红蓝各位置恰好 1 人

## Test 2：四人第一志愿打野

- 4 人第一志愿都是打野
- 最终只能 2 人打野
- 另外 2 人自动顺延其他志愿
- 验证算法选择的是全局位置满意度最优方案，而不是按打野战力选人

## Test 3：志愿绝对优先于战力

构造：

```text
方案 A：8 个第一志愿，战力差 200
方案 B：7 个第一志愿，战力差 0
```

必须选择 A。

长期保留核心回归断言：

```ts
expect(candidateWithEightFirstChoices)
  .toBeat(perfectlyBalancedCandidateWithSevenFirstChoices);
```

## Test 4：第二志愿比较

```text
A：8 第一，1 第二，1 第三
B：8 第一，2 第二，0 第三
```

必须选择 B。

## Test 5：志愿完全相同时比较战力

`PreferenceSummary` 完全一致时，必须选择 `BalanceScore` 更优方案。

## Test 6：Deterministic

相同输入连续运行 100 次，结果完全一致。

## Test 7：不允许 mutation

算法不得修改输入的：

- `rolePreferences`
- `heroPowers`
- 原数组顺序

## Test 8：缺失资料

包含：

- 临时玩家
- 无偏好玩家
- 无 HeroPower 玩家

仍需正常输出，不得出现 `NaN`、`Infinity` 或异常。

---

# 13. Split API 并发安全

重点：

```text
src/app/api/tournaments/[id]/split/route.ts
```

必须防止两个管理员同时点击分队造成：

- 两次都成功
- splitResult 相互覆盖
- 重复 AdminOperation

推荐流程：

1. 读取 Tournament / Players / Preferences / HeroPower
2. 在事务外执行纯算法
3. 最终写入使用 transaction + conditional update

示例：

```ts
await prisma.$transaction(async (tx) => {
  const result = await tx.tournament.updateMany({
    where: {
      id,
      status: "recruiting",
      splitResult: null,
    },
    data: {
      status: "completed",
      splitResult,
    },
  });

  if (result.count !== 1) {
    throw new SplitConflictError();
  }

  await tx.adminOperation.create({ ... });
});
```

第二个请求晚到时返回：

```http
409 Conflict
```

不得覆盖第一次结果。

如果当前存在 `$executeRawUnsafe`，本轮应移除并改用 Prisma `update` / `updateMany` / transaction。

新增并发测试：两个管理员同时 POST split，要求一个成功、一个 409，数据库仅一份结果与一次操作记录。

---

# 14. Session / Cookie 安全

重点：

```text
src/lib/session.ts
src/lib/auth.ts
```

## 14.1 生产环境 SESSION_SECRET 必须 fail-fast

生产环境禁止：

```ts
process.env.SESSION_SECRET || "fallback-secret"
```

正确规则：

```text
production + 缺失 SESSION_SECRET
  ↓
应用启动失败
```

开发环境可以使用明确的 development-only secret。

## 14.2 Cookie 默认安全

生产环境必须：

```text
secure = true
httpOnly = true
sameSite = lax
```

生产安全不能依赖一个容易忘记设置的 `SESSION_SECURE=false/true` 开关。

---

# 15. Session Version 与实时权限校验

Prisma `User` 增加：

```prisma
sessionVersion Int @default(1)
```

Session 保存：

```ts
{
  userId,
  role,
  sessionVersion
}
```

`requireAuth()` 每次关键 authenticated API 必须查询数据库最小字段：

```ts
select: {
  id: true,
  role: true,
  banned: true,
  isTemporary: true,
  sessionVersion: true,
}
```

必须检查：

- 用户存在
- 不是临时账号
- 未 banned
- Cookie sessionVersion 与数据库一致
- 权限以数据库 `role` 为最终来源

否则销毁 Session 并返回 401 / 403。

以下操作后必须 `sessionVersion += 1`：

- 修改密码
- 密码找回
- 管理员封禁用户
- 管理员修改角色
- 强制下线
- 其他安全相关账号变更

普通资料修改（头像、昵称、英雄战力）不需要失效 Session。

如果用户自己在已登录设备修改密码，可 increment 后重新写当前设备的新 sessionVersion，从而保留当前设备、踢掉其他旧设备。

---

# 16. 默认管理员凭据与 Seed 清理

检查：

```text
AGENTS.md
scripts/seed-test-data.ts
其他 seed / docs
```

删除任何固定的：

- 管理员密码
- 管理员安全问题答案
- 生产默认凭据

生产环境必须拒绝执行测试凭据 seed。

开发环境如需 seed，使用环境变量：

```text
SEED_ADMIN_USERNAME
SEED_ADMIN_PASSWORD
SEED_ADMIN_SECURITY_ANSWER
```

真实值不得进入 Git。

---

# 17. 密码找回安全与限流

重点：

```text
src/app/api/auth/reset-password/route.ts
```

必须防止无限暴力猜安全答案。

建议使用数据库持久化限流，而不是单纯进程内 `Map()`。

可设计：

```prisma
model AuthRateLimit {
  id           Int       @id @default(autoincrement())
  scope        String
  keyHash      String
  attempts     Int       @default(0)
  windowStart  DateTime
  blockedUntil DateTime?

  @@unique([scope, keyHash])
}
```

参考限制：

```text
每账号：5 次 / 15 分钟
每 IP：10 次 / 15 分钟
```

超过返回 `429 Too Many Requests`。

POST 错误尽量统一为“账号或答案错误”，避免明显用户名枚举。

如果使用两阶段 reset 流程，第一阶段成功后必须返回短效、一次性 reset token；不得出现“第一次验证成功后第二次请求可任意改密码”的状态漏洞。

如无需两阶段 UX，优先简化为一次请求：

```text
username + answer + newPassword
```

验证成功后立即修改密码并失效旧 Session。

---

# 18. `.gitignore` 与敏感文件

必须在 `.gitignore` 加入：

```gitignore
/data/mysql-bak/
```

并合理检查 `*.sql`、`*.dump` 等数据库导出文件，但不得误忽略 Prisma migration SQL。

搜索仓库当前内容和历史是否曾提交：

- `.env`
- SQL backup
- `SESSION_SECRET`
- `DATABASE_URL`
- 管理员真实密码
- 安全问题答案
- API Token
- GitHub Token

若发现历史 Secret，最终报告必须明确列出需要轮换的内容。不得假装删除文件等于 Secret 已安全，也不得未经确认自动重写 Git 历史。

---

# 19. 部署脚本全面修复

重点：

```text
scripts/deploy.sh
```

## 19.1 分支修复

必须把：

```bash
git pull origin master
```

改为基于当前仓库的 `main`。

## 19.2 禁止生产自动 `git stash`

如果生产工作目录 dirty，部署直接失败并提示人工处理。

## 19.3 依赖安装

使用：

```bash
npm ci
```

而不是 `npm install`。

## 19.4 数据库备份失败必须停止 migration

`mysqldump` 失败时部署直接终止，不能“提示失败后继续”。

## 19.5 禁止 shell `eval` 解析 DATABASE_URL

不得：

```bash
eval $(node ...)
```

建议新增：

```text
scripts/db-backup.mjs
```

使用 `new URL(process.env.DATABASE_URL)` 解析，并通过 Node `spawn()` 调用 mysqldump，避免密码中的 `$`、引号、分号、空格等被 Shell 解释。

## 19.6 不要先停服务再构建

禁止：

```text
先停 PM2
→ pull
→ npm install
→ migration
→ build
→ 中途失败导致网站一直挂
```

目标流程：

```text
准备新版本
→ npm ci
→ prisma generate / validate
→ build
→ 数据库备份
→ migrate deploy
→ 切换 / reload
→ health check
→ 失败回滚
```

## 19.7 推荐 Release Directory

如部署条件允许：

```text
/opt/yanwutang/
  current -> releases/20260811xxxx
  shared/
    .env
    data/
  releases/
    20260811xxxx/
    20260810xxxx/
```

保留最近 3-5 个 release 以便代码回滚。

## 19.8 Prisma Migration

生产只允许：

```bash
prisma migrate deploy
```

禁止 `prisma db push`。

若出现 P3005，不应默认自动 baseline。默认失败并要求人工确认；若确有历史兼容需求，必须通过显式环境变量（例如 `ALLOW_MIGRATION_BASELINE=1`）才允许执行自动 baseline。

## 19.9 Hero Sync 与部署解耦

外部 Hero 数据源失败不能导致代码无法发布。部署负责代码、migration、build、restart、health check；Hero Sync 交给 Cron 或管理员手动触发。

---

# 20. Health Check 与回滚

如目前无健康检查，新增：

```text
GET /api/health
```

最少返回：

```json
{ "ok": true }
```

最好检查应用运行与数据库基本连通，但绝不能泄露数据库地址、Redis URL、系统路径、Secret。

部署切换后执行：

```bash
curl localhost:8081/api/health
```

失败时自动恢复上一 release 并 reload PM2。

---

# 21. Cron 稳定性

重点：

```text
src/features/cron/worker.ts
```

必须删除：

```bash
sync && echo 1 > /proc/sys/vm/drop_caches
```

业务应用不得主动管理 Linux Page Cache。

为 Hero Sync / Monitor 等任务增加防重叠机制：

- Redis 可用：优先分布式锁
- 当前单 Cron 进程且 Redis 不可用：至少进程内锁
- 代码结构要支持未来升级为分布式锁

PM2 restart 后不要无条件立即重复大量抓取外部数据。检查最近同步时间，短时间内已同步则跳过。

---

# 22. Redis 稳定性

重点：

```text
src/lib/redis.ts
```

禁止使用阻塞式：

```text
KEYS pattern
```

改用 `SCAN` 分页处理。

继续保留 Redis 故障时 fallback MySQL 的设计，但不能完全静默 `catch {}`。至少使用告警日志或 rate-limited logger，让运维知道 Redis 已失效而不是长期无感。

---

# 23. Tournament API 与邀请码

检查：

```text
POST /api/tournaments
PUT /api/tournaments/[id]
DELETE /api/tournaments/[id]
```

统一做：

- ID 必须为正整数
- 名称 trim
- 名称最大长度
- announcement 最大长度
- deadline 必须为合法日期
- 新建 / 修改 deadline 必须满足业务允许的未来时间规则
- `isPublic` 必须 boolean
- 禁止 `NaN` / `Invalid Date` 进入 Prisma

邀请码不要继续依赖 `Math.random()`。使用 `crypto.randomInt()` 或同等级 CSPRNG，并在数据库 unique 冲突时最多重试若干次。

修改 deadline 后应执行统一 reconcile，避免 deadline 已过但 status 长期仍为 recruiting。

---

# 24. 数据库索引与 Schema 技术债务

在不破坏数据的前提下，为常用查询增加合理索引，例如：

```prisma
// Tournament
@@index([isPublic, status, deadline])

// AdminOperation
@@index([tournamentId, action, createdAt])

// TournamentPlayer
@@index([tournamentId, isSpectator])

// TempPlayerApplication
@@index([tournamentId, status])
```

所有 schema 改动必须生成 Prisma migration，不允许生产 `db push`。

大量 `status` / `role` 若目前使用 String，本轮优先统一 TypeScript 常量与类型，不要求为了 enum 一次性制造高风险数据库迁移。

`Hero.skillsJson` 如果已有替代结构，必须先搜索全部引用并确认生产数据迁移完成后才能删除；否则保留并清楚记录 TODO。

---

# 25. Markdown 渲染统一与安全

当前若存在：

- 首页一套 markdown parser
- changelog 一套 parser
- `MarkdownContent` 又一套 parser

必须统一为单一来源。

建议保留：

```text
src/web/components/content/MarkdownContent.tsx
```

作为唯一 Renderer，并把可复用解析逻辑抽到符合架构规则的位置。

保持禁止 `dangerouslySetInnerHTML`；如果引入 Markdown Library，raw HTML 必须关闭或经过可靠 sanitize。

新增测试覆盖：

- 标题
- 粗体 / 斜体
- 行内代码
- 列表
- 引用
- 分割线
- 链接
- 恶意 HTML
- `<script>`

确保不会执行 HTML / JS。

---

# 26. 架构文档与 AGENTS.md

`docs/code-architecture.md` 作为唯一权威架构说明（Source of Truth）。

检查并清理：

```text
docs/architecture.md
AGENTS.md
```

删除仍描述旧 `src/engine`、旧 hooks、旧 components 层级的内容。其他文档只链接到权威架构说明，不要复制一份容易再次过时的架构。

`AGENTS.md` 应只保留：

- 项目简介
- 架构边界
- 常用运行命令
- 测试命令
- 禁止跨层依赖规则
- 数据库 migration 原则
- Secret 禁止提交原则
- 部署注意事项

不得包含任何真实管理员密码、安全答案或 Secret。

---

# 27. README / `.env.example` / LICENSE

如果根目录目前没有 `README.md`，创建并包含：

- 项目简介
- 核心功能
- 技术栈
- 本地启动
- 环境变量说明
- 数据库 migration
- 测试
- 架构文档链接
- 部署说明链接

不得放入：

- 生产数据库 IP
- 真实管理员凭据
- 服务器密码
- Secret

允许增加 `.env.example`：

```text
SESSION_SECRET=
DATABASE_URL=
REDIS_URL=
```

只写变量名和说明，不写真实值。

如果仓库没有 LICENSE，不要替项目所有者擅自选择。最终报告注明由 Owner 决定是否采用开源许可证。

---

# 28. package.json 与测试脚本

如果 Playwright 仅用于测试，移动到 `devDependencies`。

建议统一脚本：

```json
{
  "typecheck": "tsc --noEmit",
  "test:core": "...",
  "test:e2e": "...",
  "check:architecture": "...",
  "check": "..."
}
```

最终至少能够运行：

```bash
npm run check:architecture
npm run typecheck
npm run test:core
npm run lint
npm run build
```

---

# 29. GitHub Actions CI

新增：

```text
.github/workflows/ci.yml
```

至少执行：

```text
checkout
setup-node
npm ci
prisma generate
prisma validate
npm run check:architecture
npm run typecheck
npm run test:core
npm run lint
npm run build
```

如果 lint 因历史配置失败，修复配置；不得通过删除 lint 或永久 `continue-on-error` 来掩盖问题。

现有 Playwright regression 若放在 `.planning`，整理到：

```text
tests/e2e/
```

临时截图、调试输出加入 `.gitignore`。

---

# 30. Auth / Capacity / Split 测试矩阵

API 权限至少覆盖：

- 未登录
- 普通用户
- 赛事成员
- owner
- co_owner
- admin
- banned 用户
- 角色被降级后的旧 Session
- 修改密码后的旧 Session

Capacity 必须保留并增强当前 Serializable + P2034 retry 逻辑。

新增并发测试：

```text
当前 9 人
两个用户同时加入
```

最终只允许一个成功，总人数必须为 10。

Split 并发测试要求：

```text
两个管理员同时 POST split
→ 一个 200
→ 一个 409
→ 数据库仅一个 splitResult
→ 仅一次 split AdminOperation
```

---

# 31. Anti-Bot / SSRF / Combat 可测试性

如果 `src/lib/anti-bot.ts` 注释声称有 Playwright fallback，但代码实际上没有：要么实现，要么修改注释。若普通 fetch 已够用，优先修正文档而不是引入复杂浏览器抓取。

任何管理员可配置外部 URL 的功能都要检查 SSRF：禁止 `localhost`、`127.0.0.1`、链路本地地址、内网地址、`file://` 等；优先使用 http/https + 域名 allowlist。

如果 `src/core/game/combat.ts` 使用 `Math.random()`，改为可注入：

```ts
rng?: () => number
```

默认仍为 `Math.random`，测试传固定 RNG。不得改变既有伤害公式。

---

# 32. 错误处理与日志

不要大量使用：

```ts
.catch(() => ({ userId: 0 }))
```

把数据库错误、认证错误、业务冲突全部吞成一个结果。

至少在 auth / tournament / split / capacity 路径区分：

- Unauthorized
- Forbidden
- Validation Error
- Conflict
- Database Error

日志禁止输出：

- 密码
- securityAnswer
- SESSION_SECRET
- DATABASE_URL
- 完整 Cookie

生产日志可以包含 request ID、user ID、tournament ID、error type 等非敏感诊断信息。

---

# 33. 公开接口与文档信息暴露

复核公共 Tournament API / Visitor Detail，游客不得获得：

- 非必要玩家真实身份
- gameId
- 管理信息
- 申请列表
- 后台操作记录

公开仓库文档中删除真实生产 MySQL IP、3306 暴露地址、SSH 信息，统一改为 `<DB_HOST>`、`<APP_SERVER>`、`example.com` 等占位符。

最终报告提醒运维：MySQL 3306 应通过防火墙只允许应用服务器来源。Codex 不负责假装修改云防火墙。

---

# 34. `/m` 路由（P3，可后置）

当前 `/m` 若只是主路由镜像，本轮不允许为删除 `/m` 阻塞 P0 / P1。

如果执行长期整理：目标是单一 responsive 页面树。旧 `/m/...` 链接必须 301/308 到主路由，不能直接失效。

---

# 35. CHANGELOG 与版本

全部修改完成并通过测试后更新 CHANGELOG，按类别记录：

- Security
- Team Balancing
- Deployment
- Reliability
- Testing

不要只写“minor fixes”。

`package.json` 当前版本若与项目正式版本体系不一致，应先确认仓库实际发布策略。若 package version 就是正式版本，本轮可设为 `2.1.0`；否则保留并在最终报告说明，不要制造两个互相冲突的版本系统。

---

# 36. 分阶段执行计划

## Phase A - 安全紧急修复

重点文件：

```text
.gitignore
prisma/schema.prisma
src/lib/session.ts
src/lib/auth.ts
login / reset-password / admin users routes
seed scripts
AGENTS.md
```

完成：

- SESSION_SECRET fail-fast
- secure cookie 默认策略
- sessionVersion migration
- 权限数据库实时校验
- banned / 降权 / 密码修改实时失效
- reset 限流
- 默认管理员凭据删除
- mysql backup ignore

阶段校验：

```bash
npx prisma validate
npx prisma generate
npm run typecheck
npm run test:core
npm run build
```

## Phase B - 部署

重点：

```text
scripts/deploy.sh
scripts/db-backup.mjs（如需要）
/api/health
ecosystem config
```

完成：

- master -> main
- npm ci
- 禁止 git stash
- backup failure abort
- 去 shell eval
- build before reload
- migrate deploy
- health check
- rollback
- hero sync 解耦

## Phase C - 分队算法

重点：

```text
src/core/team-balancing/*
```

实现：

- PreferenceSummary
- BalanceScore
- comparePreferenceSummary
- compareBalanceScore
- compareCandidate
- 预计算指标
- 流式 DFS
- Deterministic tie breaker
- Unknown strength neutral baseline

## Phase D - Split API

重点：

```text
src/app/api/tournaments/[id]/split/route.ts
```

完成：

- 移除 rawUnsafe
- conditional update
- transaction
- 409 conflict
- splitResult V2

## Phase E - Tournament / DB

完成：

- crypto invite code
- 输入校验
- deadline reconcile
- DB indexes
- 临时玩家处理

## Phase F - Cron / Redis

完成：

- 删除 drop_caches
- 任务锁
- Redis SCAN
- Redis error observability
- Hero Sync 避免 PM2 重启重复

## Phase G - 内容与文档

完成：

- Markdown 单一 Renderer
- docs 统一
- AGENTS 清理
- README
- `.env.example`

## Phase H - CI / Tests

完成：

- GitHub Actions
- 算法回归测试
- Auth 测试
- Split 并发测试
- Capacity 并发测试
- E2E 整理

---

# 37. 算法验收标准

最终必须满足：

- [ ] 一定是 10 人
- [ ] 每人只分配一个位置
- [ ] 每个位置正好两个人
- [ ] 红蓝各一个对应位置
- [ ] 第一志愿人数全局最大化
- [ ] 第一志愿相同才比较第二志愿
- [ ] 第二相同才比较第三志愿
- [ ] 依次比较到第五志愿与 unranked
- [ ] 位置满意度完全相同后才比较战力
- [ ] 战力永远不能推翻更优的志愿方案
- [ ] 不存在锁位置
- [ ] 四个人都想打野仍能得到有效结果
- [ ] 输入相同结果永远相同
- [ ] 算法不修改输入对象
- [ ] 临时玩家资料缺失仍能计算
- [ ] 不出现 NaN / Infinity

---

# 38. 安全验收标准

- [ ] 生产无 SESSION_SECRET 无法启动
- [ ] 仓库没有固定管理员密码
- [ ] 仓库没有固定管理员安全问题答案
- [ ] banned 用户旧 Cookie 立即失效
- [ ] admin 降级后旧 Cookie 立即失效
- [ ] 修改 / 重置密码后旧 Session 失效
- [ ] Reset 有持久化限流
- [ ] Reset 无无限答案暴力尝试
- [ ] 数据库 backup 不会被 `git add .`
- [ ] 日志不记录 Secret
- [ ] 文档无真实生产敏感地址 / 凭据

---

# 39. 部署验收标准

- [ ] 部署目标分支为 main
- [ ] dirty production tree 拒绝部署
- [ ] 使用 npm ci
- [ ] backup 失败停止部署
- [ ] migration 使用 migrate deploy
- [ ] build 失败旧版本继续运行
- [ ] 新版本 health check 失败可恢复
- [ ] Hero Sync 失败不影响发布
- [ ] 不使用 shell eval 解析 DB 密码
- [ ] 不主动 drop Linux page cache

---

# 40. CI 验收标准

Pull Request 至少通过：

```bash
npm ci
npx prisma validate
npx prisma generate
npm run check:architecture
npm run typecheck
npm run test:core
npm run lint
npm run build
```

任何失败不得通过删除测试、关闭架构检查或大面积绕过 TypeScript 来“解决”。

---

# 41. 明确禁止事项

Codex 禁止：

```text
禁止引入锁位置
禁止让战力优先于分路志愿
禁止使用随机数决定最终分队
禁止直接覆盖 main
禁止删除现有 migration
禁止生产 db push
禁止 hardcode Secret
禁止提交 .env
禁止提交 SQL backup
禁止吞掉所有异常
禁止为了 CI 通过删除测试
禁止为了方便大量使用 any
禁止把业务逻辑放回 API Route
禁止 core 引用 Prisma / Next / React / Redis
禁止 deploy git stash
禁止数据库备份失败后继续 migration
```

遇到未在任务书中明确的新问题：优先保持现有业务行为。若现有实现与本任务书明确规则冲突，则以本任务书为准，尤其是分队算法规则。

---

# 42. Commit 建议

不要形成一个巨大 Commit。建议按阶段拆分：

```text
fix: harden session and authentication security
fix: secure password reset and seed credentials
refactor: make deployment fail-safe and main-based
refactor: prioritize role preferences in team balancing
fix: make tournament split concurrency-safe
refactor: improve cron and redis reliability
refactor: unify markdown rendering and architecture docs
test: expand auth balancing and tournament coverage
ci: add project validation workflow
```

---

# 43. 最终交付报告要求

Codex 全部执行完成后必须输出：

## 43.1 修改文件列表

列出 `M / A / D` 文件，不得只说“已完成”。

## 43.2 安全修改摘要

分别说明：

- Session
- Reset
- Admin credentials
- Database backups
- Secret handling

## 43.3 算法修改摘要

至少说明：

- 旧算法核心问题
- 新 PreferenceSummary
- 新字典序比较器
- BalanceScore
- DFS / 预计算优化
- Deterministic 设计

## 43.4 测试结果

必须提供真实 PASS / FAIL，不能写“应该没问题”。

## 43.5 未完成事项

任何未完成任务必须明确：

```text
未完成项
原因
当前风险
下一步建议
```

不得静默跳过。

---

# 44. 生产环境必须人工执行的事项

以下操作 Codex 只能提醒，不能假装已经完成：

- 修改生产 admin 当前密码
- 修改 admin 当前安全问题答案
- 轮换生产 `SESSION_SECRET`
- 检查真实生产 `.env`
- 检查 MySQL 3306 防火墙
- 检查历史 Secret 是否需要 rotate
- 执行正式数据库 migration
- 执行正式生产 release

这些项目必须在最终报告单独列出。

---

# 45. Definition of Done

只有全部满足才允许宣称 V2.1 重构完成：

- [ ] 安全项完成
- [ ] SessionVersion migration 完成
- [ ] Password Reset 限流完成
- [ ] 默认管理员凭据清理
- [ ] deploy main 分支修复
- [ ] 数据库 backup gitignore 修复
- [ ] fail-safe deployment 完成
- [ ] Linux drop_caches 删除
- [ ] Redis KEYS 替换 SCAN
- [ ] 分队算法重构完成
- [ ] 明确禁止锁位置
- [ ] 字典序偏好算法测试完成
- [ ] Split 并发修复
- [ ] rawUnsafe 移除
- [ ] Tournament validation 完成
- [ ] DB indexes 完成
- [ ] Markdown 统一
- [ ] 架构文档统一
- [ ] README 完成
- [ ] CI 完成
- [ ] typecheck 通过
- [ ] architecture check 通过
- [ ] tests 通过
- [ ] production build 通过
- [ ] 最终变更报告完成

---

# 46. 开始执行命令

开始修改前执行：

```bash
git status
git branch --show-current
git log --oneline -5
```

确认基于最新 `main`，且工作区没有混入未知修改。

新建独立工作分支，例如：

```bash
git switch main
git pull --ff-only origin main
git switch -c worktree-v2.1-stability
```

然后严格按照：

```text
Phase A
→ Phase B
→ Phase C
→ Phase D
→ Phase E
→ Phase F
→ Phase G
→ Phase H
```

执行。

不得跳过测试，不得在未验证情况下直接上线。

---

# 47. 本任务的最高业务原则

最终实现必须始终遵守：

> **先让十个人尽可能玩到自己想玩的分路，再让这场比赛尽可能公平。**

严格顺序：

```text
第一志愿最大化
  ↓
第二志愿最大化
  ↓
第三志愿最大化
  ↓
第四志愿最大化
  ↓
第五志愿最大化
  ↓
未命中最少
  ↓
最后才优化红蓝实力
```

没有锁位置。

没有特权玩家。

没有“打野战力最高所以必须打野”。

所有位置通过十名玩家整体偏好进行全局优化。

这就是 WZYWT V2.1 分队算法的正式产品定义。
