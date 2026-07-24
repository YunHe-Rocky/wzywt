"use client";

import { TournamentList } from "@/web/components/tournament/TournamentList";
import { PageEntrance } from "@/web/components/layout/PageEntrance";

export default function TournamentsPage() {
  return (
    <PageEntrance>
      <TournamentList />
    </PageEntrance>
  );
}
