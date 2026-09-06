import { parentPort } from "node:worker_threads";
import { splitTeams } from "../core/team-balancing/search";
import type { Player } from "../core/team-balancing/types";

interface SplitWorkerRequest {
  id: number;
  players: Player[];
}

if (!parentPort) throw new Error("team-balancing worker requires a parent port");

parentPort.on("message", (request: SplitWorkerRequest) => {
  try {
    parentPort!.postMessage({ id: request.id, result: splitTeams(request.players) });
  } catch (error) {
    parentPort!.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : "unknown worker error",
    });
  }
});
