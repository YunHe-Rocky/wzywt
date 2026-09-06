import type { SVGProps } from "react";

const paths = {
  crest: "M12 2 21 6v7l-9 9-9-9V6l9-4Zm0 4v12M7 8l5 5 5-5M7 13l5 5 5-5",
  swords: "m3 3 6 2 11 11-4 4L5 9 3 3Zm12 2 6-2-2 6-4 4M3 21l5-5m8-8 2 2M14 18l4-4M4 14l6 6",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  home: "m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7",
  book: "M12 6C8 3 4 4 2 5v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-2-1-6-2-10 1Zm0 0v14",
  shield: "M12 2 21 6v6c0 5-5 8-9 10-4-2-9-5-9-10V6l9-4Zm-4 9 3 3 5-5",
  user: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-3a4 4 0 0 1 0 8m2 3a4 4 0 0 1 3 4v2",
  copy: "M9 9h12v12H9V9Zm6-4V2H2v13h3",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  news: "M3 3h18v18H3V3Zm4 4h10M7 11h10M7 15h4M7 18h10",
  search: "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-2 6 6 6",
  plus: "M12 4v16M4 12h16",
} as const;

export type ArenaIconName = keyof typeof paths;
export function ArenaIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: ArenaIconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
