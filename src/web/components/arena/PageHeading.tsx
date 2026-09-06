import type { ReactNode } from "react";
import { ArenaIcon, type ArenaIconName } from "./ArenaIcon";

export function PageHeading({ eyebrow, title, description, icon = "swords", children }: { eyebrow: string; title: string; description: ReactNode; icon?: ArenaIconName; children?: ReactNode }) {
  return <div className="arena-page-heading">
    <div><div className="arena-eyebrow"><span />{eyebrow}</div><h1>{title}</h1><p>{description}</p>{children}</div>
    <div className="arena-heading-seal"><ArenaIcon name={icon} /></div>
  </div>;
}
