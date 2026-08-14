import { prisma } from "../src/lib/db";
async function main() {
  const tables = ["user","tournament","tournamentPlayer","internalMatch","combatPost","tacticRoom","hero","equipment","announcement","rolePreference","heroPower","tempPlayerApplication","matchPlayer","matchScreenshot","matchRecognition","matchDispute","combatPostLike","combatPostComment","tacticLayer","tacticRoute","tacticMarker","authRateLimit","passwordResetToken","kvCache","adminOperation","tournamentPick","tournamentAdmin","matchPlayerStat"];
  for (const t of tables) {
    try {
      const n = await (prisma as any)[t].count();
      console.log(`${t}: ${n}`);
    } catch (e: any) { console.log(`${t}: ERR ${e.message?.split("\n")[0]}`); }
  }
  await prisma.$disconnect();
}
main();
