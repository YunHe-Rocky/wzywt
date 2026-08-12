export type Role = "top" | "jungle" | "mid" | "adc" | "support";
export type Team = "red" | "blue";

export interface RolePreference {
  roleType: string;
  preferenceRank: number;
  roleRank: number;
  peakScore: number;
  peakRank: number;
}

export interface Player {
  userId: number;
  rolePreferences: RolePreference[];
  heroPowers: Record<string, number[]>;
}

export interface PlayerRoleMetric {
  playerId: number;
  role: Role;
  preferenceRank: number;
  strength: number;
  roleRank: number;
  peakScore: number;
  heroPowerScore: number;
  hasKnownStrength: boolean;
  hasKnownRank: boolean;
}

export interface PreferenceSummary {
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  unranked: number;
}

export interface BalanceScore {
  totalStrengthDiff: number;
  laneStrengthDiffSum: number;
  rankDiff: number;
  maxLaneStrengthDiff: number;
}

export interface Assignment {
  playerIndex: number;
  userId: number;
  role: Role;
  team: Team;
}

export interface TeamCandidate {
  assignments: Assignment[];
  preference: PreferenceSummary;
  balance: BalanceScore;
  redStrength: number;
  blueStrength: number;
  rankCoverage: number;
  signature: string;
}

export interface TeamMember {
  userId: number;
  roleType: Role;
  assignedRole: Role;
  preferenceRank: number;
}

export interface SplitResult {
  version: 2;
  teamRed: TeamMember[];
  teamBlue: TeamMember[];
  preferenceSummary: PreferenceSummary;
  balanceSummary: BalanceScore & { redStrength: number; blueStrength: number };
  // 兼容旧 UI；不参与候选比较。
  score: number;
  strengthDiff: number;
  preferenceScore: number;
  rankDiff: number;
  rankCoverage: number;
}
