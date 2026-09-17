import { atomic, db } from "@uei/database";
import { DomainError, transition } from "./core";
import {
  audit,
  beginTransaction,
  enqueue,
  existingCommand,
  rememberCommand,
} from "./persistence";
export class OrderService {
  async create(
    userId: string,
    input: { discoveryResultId: string; vehicleId: string },
    key: string,
  ) {
    const id = await atomic(async (tx) => {
      const previous = await existingCommand(tx, userId, "select", key, input);
      if (previous) return previous;
      const result = await tx.discoveryResult.findUnique({
        where: { id: input.discoveryResultId },
        include: { search: true },
      });
      const vehicle = await tx.userVehicle.findFirst({
        where: { id: input.vehicleId, userId },
        include: { variant: { include: { connectors: true } } },
      });
      if (!result || result.search.userId !== userId || !vehicle)
        throw new DomainError(
          "NOT_FOUND",
          "Charger or vehicle not found.",
          404,
        );
      if (
        result.search.vehicleId !== vehicle.id ||
        !vehicle.variant.connectors.some(
          (c) => c.connector === result.connector,
        )
      )
        throw new DomainError(
          "VEHICLE_NOT_SUPPORTED",
          "This charger is not compatible with your selected vehicle.",
        );
      if (result.createdAt.getTime() < Date.now() - 300000)
        throw new DomainError(
          "DISCOVERY_EXPIRED",
          "Search again for current charger availability.",
          409,
        );
      const transactionId = await beginTransaction(tx, userId, "ORDER");
      const order = await tx.order.create({
        data: {
          ...input,
          userId,
          transactionId,
          providerId: result.providerId,
          state: "SELECT_PENDING",
        },
      });
      await enqueue(tx, transactionId, "select", result.providerId, {
        orderId: order.id,
        itemId: result.itemId,
        vehicleId: vehicle.id,
      });
      await audit(
        tx,
        transactionId,
        userId,
        "SELECT_REQUESTED",
        null,
        order.state,
      );
      await rememberCommand(tx, userId, "select", key, input, order.id);
      return order.id;
    });
    return this.get(userId, id);
  }
  async init(userId: string, id: string, key: string) {
    await atomic(async (tx) => {
      if (await existingCommand(tx, userId, "init", key, { id })) return;
      const order = await tx.order.findFirst({
        where: { id, userId },
        include: { quotes: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!order) throw new DomainError("NOT_FOUND", "Order not found.", 404);
      const state = transition(order.state, "init");
      const quote = order.quotes[0];
      if (!quote || quote.expiresAt.getTime() <= Date.now())
        throw new DomainError(
          "QUOTE_EXPIRED",
          "The quote has expired. Select the charger again.",
          409,
        );
      await tx.order.update({ where: { id }, data: { state } });
      await enqueue(tx, order.transactionId, "init", order.providerId, {
        orderId: id,
        quoteId: quote.id,
        amountPaise: quote.amountPaise,
      });
      await audit(
        tx,
        order.transactionId,
        userId,
        "INIT_REQUESTED",
        order.state,
        state,
      );
      await rememberCommand(tx, userId, "init", key, { id }, id);
    });
    return this.get(userId, id);
  }
  async get(userId: string, id: string) {
    const order = await db.order.findFirst({
      where: { id, userId },
      include: {
        quotes: { orderBy: { createdAt: "desc" } },
        payment: { include: { attempts: { orderBy: { createdAt: "asc" } } } },
      },
    });
    if (!order) throw new DomainError("NOT_FOUND", "Order not found.", 404);
    const issues = await db.reconciliationIssue.findMany({
      where: { transactionId: order.transactionId, resolvedAt: null },
    });
    return { ...order, needsReconciliation: issues.length > 0 };
  }
  list(userId: string) {
    return db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
