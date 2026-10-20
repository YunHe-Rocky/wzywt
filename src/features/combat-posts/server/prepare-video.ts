import { normalizeCombatVideo } from "@/lib/video-normalization";
import { resourceGovernor, resourceTaskSignal } from "@/lib/resource-governor";
import type { MediaStorage, StreamStoredObjectInfo } from "@/lib/storage";
import type { CombatVideoPolicy } from "@/features/combat-posts/video-policy";
import { reserveMediaUpload } from "@/features/media/server/quota";

export async function prepareCombatVideo(storage: MediaStorage, source: StreamStoredObjectInfo, mimeType: string,
  policy: CombatVideoPolicy, reservationId: string, userId: number, signal: AbortSignal) {
  let prepared: StreamStoredObjectInfo | undefined;
  let onAbort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([cancelled, resourceGovernor.run(`combat-video:${reservationId}`, async () => {
      const taskSignal = resourceTaskSignal();
      const output = await normalizeCombatVideo(storage, source.key, mimeType, {
        ...policy, signal: taskSignal ? AbortSignal.any([signal, taskSignal]) : signal,
      });
      prepared = output;
      try {
        // Small source files can grow when converted. Recheck all quotas in the
        // same serializable transaction rather than bypassing the reservation.
        if (output.size > source.size) await reserveMediaUpload(userId, "combat-video", output.size, new Date(), undefined, reservationId);
        await storage.delete(source.key);
        return output;
      } catch (error) {
        await storage.delete(output.key).catch(() => undefined);
        throw error;
      }
    })]);
  } catch (error) {
    if (prepared) await storage.delete(prepared.key).catch(() => undefined);
    throw error;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
