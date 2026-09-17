import { PrismaClient, Prisma } from "@prisma/client";
export { Prisma } from "@prisma/client";
export const db = new PrismaClient();
export type Tx = Prisma.TransactionClient;

// Retry complete serializable transactions only; callbacks must contain no external I/O.
export async function atomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: "Serializable", maxWait: 10000 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code) &&
        attempt < 3
      )
        continue;
      throw error;
    }
  }
}
