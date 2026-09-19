const stamp = "2026-09-19T08:00:00.000Z";
export function makeAdminFixture(scenario = "default", userId = 1) {
  const long = scenario === "long";
  const user = { userId, username: "松风堂主", role: "admin", avatar: null };
  const posts = [{ id: 1, title: long ? "松风演武复盘".repeat(18) : "松风演武 · 协作复盘", status: "published", size: 4300000, createdAt: stamp, author: { username: "听雨客" }, _count: { likes: 3, comments: 2 } }];
  return {
    user, posts,
    users: [{ id: 1, username: "松风堂主", role: "admin", banned: false, avatar: null, createdAt: stamp, _count: { tournamentPlayers: 8 } }, { id: 7, username: long ? "云中同游".repeat(20) : "听雨客", role: "user", banned: false, avatar: null, createdAt: stamp, _count: { tournamentPlayers: 3 } }],
    rooms: [{ id: 101, name: long ? "山河同游演武".repeat(18) : "周末松风演武", code: "628319", status: "recruiting", playerCount: 6, createdAt: stamp, deadline: stamp }, { id: 102, name: "灯下再会", code: "326918", status: "completed", playerCount: 10, createdAt: stamp, deadline: stamp }],
    announcements: [{ id: 1, title: long ? "演武堂秋日更新".repeat(18) : "秋日演武 · 协作与记录", version: "2.1.0", content: "## 本次更新\n\n我们一起整理对局记录，让每次演武都有所收获。\n\n- 完善房间信息\n- 整理复盘与交流\n\n### 阅读说明\n\n这是隔离测试使用的虚构公告。", brief: "整理对局记录，完善协作体验。", slug: "秋日演武", published: true, createdAt: stamp, updatedAt: stamp, date: "2026-09-19" }, { id: 2, title: "周末活动安排", version: "2.1.1", content: "待完善的活动安排。", brief: "活动内容草稿", slug: "周末安排", published: false, createdAt: stamp, updatedAt: stamp, date: "2026-09-19" }],
    heroes: [{ heroId: 105, name: "廉颇", title: "正义爆轰", roleType: "top", secondaryRoleTypes: ["support"], heroType: 3, heroType2: 1 }, { heroId: 106, name: "小乔", title: "恋之微风", roleType: "mid", secondaryRoleTypes: [], heroType: 2, heroType2: 0 }],
    settings: { hero_list_page: "https://example.org/fixture/heroes", hero_list_json: "https://example.org/fixture/heroes.json", hero_detail_base: "https://example.org/fixture/details", hero_img_base: "https://example.org/fixture/images/{id}.jpg", skin_img_base: "https://example.org/fixture/skins/{id}/{idx}.jpg" },
  };
}
