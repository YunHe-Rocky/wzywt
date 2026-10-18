export interface PlayerInfo {
  userId: number; user: {
    id: number;
    username: string;
    avatar?: string | null;
    gameNickname?: string | null;
  };
  isTemporary: boolean; tempName: string | null; isSpectator: boolean;
}
export interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string; isPublic: boolean;
  announcement?: string;
  playerCount?: number;
  splitResult?: unknown;
  players: PlayerInfo[];
  admins: { userId: number; role: string; user: { id: number; username: string } }[];
  applications: { id: number; tempName: string | null; applicant: { id: number; username: string } }[];
}
export interface SplitResult {
  version?: 2;
  teamRed: { userId: number; roleType: string; assignedRole?: string; preferenceRank?: number }[];
  teamBlue: { userId: number; roleType: string; assignedRole?: string; preferenceRank?: number }[];
  strengthDiff: number;
  preferenceScore: number;
  preferenceSummary?: {
    first: number; second: number; third: number; fourth: number; fifth: number; unranked: number;
  };
  balanceSummary?: {
    redStrength: number; blueStrength: number; totalStrengthDiff: number;
    laneStrengthDiffSum: number; rankDiff: number; maxLaneStrengthDiff: number;
  };
  playerDetails: { userId: number; username: string }[];
  explanation?: {
    algorithmVersion: string; policy: string; caveat: string;
    unknownStrengthCount: number; unknownStrengthRatio: number;
  };
}


export type TeamColor = "red" | "blue";

export interface RoomPermissions {
  isAdmin: boolean;
  isOwner: boolean;
  isPlayer: boolean;
}

export interface RoomCounts {
  playerCount: number;
  tempCount: number;
  spectatorCount: number;
}
