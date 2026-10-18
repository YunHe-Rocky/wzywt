import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { ServiceError } from "./service-error";

export async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options: { retryUnique?: boolean } = {}): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || (error.code !== "P2034" && !(options.retryUnique && error.code === "P2002"))) throw error;
      if (attempt === 2) throw new ServiceError("CONFLICT", "数据正在被更新，请刷新后重试");
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  throw new Error("Unreachable transaction retry");
}
