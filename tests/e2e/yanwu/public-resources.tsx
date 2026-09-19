import { useCallback, useMemo, useState } from "react";
import { equipment, heroes, rooms, entries } from "./public-fixtures";
export function usePageResources(page: string) {
  const scenario = new URLSearchParams(location.search).get("case") ?? "default";
  const [attempt, setAttempt] = useState(0);
  const error = scenario === "error" && attempt === 0 ? "数据暂时无法加载" : null;
  const empty = scenario === "empty";
  const immediate = useMemo(() => {
    const data = page === "home" ? { "home.public-tournaments": empty ? [] : rooms, "home.announcements": empty ? [] : entries.map(e => ({ ...e, brief: e.desc, content: "## 演武新章\n一起相聚，下一局见。" })) } : page === "heroes" ? { "heroes.list": empty ? [] : heroes } : { "equipment.list": empty ? [] : equipment };
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, { data: value, version: "fixture-v1" }]));
  }, [page, empty]);
  const loadResource = useCallback(async (name: string, refresh = false) => {
    if (name === "home.official-news") {
      if (scenario === "news-error" && !refresh) throw new Error("官方资讯暂时无法加载");
      return empty ? [] : [{ title: "峡谷新资讯，与好友一起了解", date: "2026-09-19", url: "https://pvp.qq.com/" }];
    }
    if (name === "heroes.list") return heroes;
    if (name === "equipment.list") return equipment;
    throw new Error(`Undeclared resource ${name}`);
  }, [empty, scenario]);
  return { leaseId: "public-fixture-v1", immediate, loading: scenario === "loading", error, loadResource, retry: () => setAttempt(v => v + 1) };
}
