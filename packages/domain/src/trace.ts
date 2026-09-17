import { db } from "@uei/database";
import { DomainError } from "./core";
export class TraceService {
  list() {
    return db.becknTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  async detail(id: string) {
    const transaction = await db.becknTransaction.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!transaction)
      throw new DomainError("NOT_FOUND", "Transaction not found.", 404);
    const [audit, issues, outbox, payment] = await Promise.all([
      db.auditLog.findMany({
        where: { transactionId: id },
        orderBy: { id: "asc" },
      }),
      db.reconciliationIssue.findMany({ where: { transactionId: id } }),
      db.outboxEvent.findMany({
        where: { transactionId: id },
        select: {
          id: true,
          kind: true,
          state: true,
          messageId: true,
          createdAt: true,
        },
      }),
      db.payment.findUnique({
        where: { transactionId: id },
        include: {
          attempts: { orderBy: { createdAt: "asc" } },
          events: { orderBy: { createdAt: "asc" } },
        },
      }),
    ]);
    return { ...transaction, audit, issues, outbox, payment };
  }
  async events(userId: string, transactionId: string, after: number) {
    if (
      !(await db.becknTransaction.findFirst({
        where: { id: transactionId, userId },
      }))
    )
      throw new DomainError("NOT_FOUND", "Transaction not found.", 404);
    return db.auditLog.findMany({
      where: { transactionId, id: { gt: after } },
      orderBy: { id: "asc" },
      take: 100,
    });
  }
}
