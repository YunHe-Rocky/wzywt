"use client";

import { TournamentList } from "@/components/tournament/TournamentList";
import { PageEntrance } from "@/components/layout/PageEntrance";

export default function TournamentsPage() {
  return (
    <PageEntrance>
      <TournamentList />
    </PageEntrance>
  );
}
