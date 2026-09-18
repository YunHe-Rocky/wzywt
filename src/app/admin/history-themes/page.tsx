import type { Metadata } from "next";
import { HistoryThemeStudio } from "@/web/components/history-theme/HistoryThemeStudio";

export const metadata: Metadata = {
  title: "历史主题工作室 | 演武管理中心",
  robots: { index: false, follow: false },
};

export default function HistoryThemesAdminPage() {
  return <HistoryThemeStudio />;
}
