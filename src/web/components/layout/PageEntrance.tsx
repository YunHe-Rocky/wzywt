"use client";

interface Props {
  children: React.ReactNode;
  stagger?: number;
}

export function PageEntrance({ children }: Props) {
  return <div>{children}</div>;
}
