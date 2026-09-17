import { atomic, db } from "@uei/database";
import { getConfig } from "@uei/config";
import { DomainError } from "./core";
import { audit, beginTransaction, enqueue } from "./persistence";
export class DiscoveryService {
  search(
    userId: string,
    input: { vehicleId: string; latitude: number; longitude: number },
  ) {
    return atomic(async (tx) => {
      const vehicle = await tx.userVehicle.findFirst({
        where: { id: input.vehicleId, userId },
        include: { variant: { include: { connectors: true } } },
      });
      if (!vehicle)
        throw new DomainError("NOT_FOUND", "Vehicle not found.", 404);
      const transactionId = await beginTransaction(tx, userId, "SEARCH");
      const search = await tx.discoveryRequest.create({
        data: {
          ...input,
          userId,
          transactionId,
          closesAt: new Date(Date.now() + getConfig().DISCOVERY_WINDOW_MS),
        },
      });
      await enqueue(tx, transactionId, "search", "*", {
        ...input,
        connectors: vehicle.variant.connectors.map((c) => c.connector),
      });
      await audit(
        tx,
        transactionId,
        userId,
        "SEARCH_CREATED",
        null,
        "SEARCHING",
      );
      return search;
    });
  }
  async results(userId: string, id: string) {
    const search = await db.discoveryRequest.findFirst({
      where: { id, userId },
      include: { results: true },
    });
    if (!search) throw new DomainError("NOT_FOUND", "Search not found.", 404);
    const complete = search.closesAt.getTime() <= Date.now();
    return {
      ...search,
      status: complete ? "COMPLETE" : "SEARCHING",
      message:
        complete && search.results.length === 0
          ? "No compatible chargers found. Try searching again."
          : null,
    };
  }
}
