export const ADMIN_NAVIGATION = [
  { path: "/admin", label: "工作台", description: "数据概览与常用操作", group: "概览" },
  { path: "/admin/users", label: "用户管理", description: "成员状态与账号管理", group: "运营管理" },
  { path: "/admin/tournaments", label: "赛事管理", description: "房间、报名与比赛记录", group: "运营管理" },
  { path: "/admin/combat", label: "动态管理", description: "视频复盘、隐藏与恢复", group: "内容管理" },
  { path: "/admin/announcements", label: "公告管理", description: "发布与维护站内公告", group: "内容管理" },
  { path: "/admin/history-themes", label: "历史主题", description: "编辑内容与界面预览", group: "内容管理" },
  { path: "/admin/heroes", label: "英雄管理", description: "英雄资料与同步状态", group: "系统管理" },
  { path: "/admin/monitor", label: "运行监控", description: "数据同步与服务状态", group: "系统管理" },
  { path: "/admin/settings", label: "系统设置", description: "数据源与同步操作", group: "系统管理" },
] as const;

export function adminRoutePrefix(pathname: string) {
  return /^\/m(?:\/|$)/.test(pathname) ? "/m" : "";
}

export function isAdminRouteActive(pathname: string, route: string) {
  const path = pathname.replace(/^\/m(?=\/|$)/, "");
  return route === "/admin" ? path === route : path === route || path.startsWith(`${route}/`);
}
