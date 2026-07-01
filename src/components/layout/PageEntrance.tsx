"use client";

import { pageEnter } from "@/engine";

interface Props {
  children: React.ReactNode;
  stagger?: number;
}

export function PageEntrance({ children, stagger = 0 }: Props) {
  return <div style={pageEnter(stagger)}>{children}</div>;
}
