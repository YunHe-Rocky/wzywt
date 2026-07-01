import { prisma } from "../src/lib/db";

async function main() {
  const announcements = [
    {
      title: "王者演武堂 V2.0 更新公告",
      version: "2.0.0",
      slug: "v2-update",
      brief: "装备图鉴上线，英雄技能数据解析，统一引擎架构",
      content: `## 新增功能
- 装备图鉴：121件装备，支持等级/特性筛选
- 技能伤害解析：英雄技能描述自动提取伤害公式
- 统一引擎架构：英雄与装备数据统一管理

## 优化
- Dock栏图鉴入口，英雄/装备二级导航
- 页面过渡动画统一`,
      published: true,
    },
    {
      title: "装备系统上线",
      version: "1.5.0",
      slug: "equipment-launch",
      brief: "全量装备入库，支持多维度筛选与被动效果查看",
      content: `所有121件装备已入库，包含：
- 等级筛选（一级/二级/三级）
- 特性筛选（物理/法术/防御/打野/辅助/移速）
- 被动效果结构化展示
- 统一属性标签体系`,
      published: true,
    },
    {
      title: "英雄命格系统",
      version: "1.3.0",
      slug: "mingge-system",
      brief: "支持命格形态切换，孙悟空-心魔六耳双向转换",
      content: `命格系统允许拥有命格的英雄在详情页切换形态：
- 本命形态：默认展示
- 命格形态：点击切换按钮查看关联英雄`,
      published: true,
    },
  ];

  for (const a of announcements) {
    await prisma.announcement.upsert({
      where: { slug: a.slug },
      create: a,
      update: a,
    });
    console.log(`[seed] ${a.title}`);
  }

  console.log(`\nDone: ${announcements.length} announcements seeded`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
