import { db } from "@uei/database";
import { DomainError } from "./core";
export class VehicleService {
  catalogue() {
    return db.vehicleMake.findMany({
      include: {
        models: { include: { variants: { include: { connectors: true } } } },
      },
      orderBy: { name: "asc" },
    });
  }
  list(userId: string) {
    return db.userVehicle.findMany({
      where: { userId },
      include: { variant: { include: { model: true, connectors: true } } },
      orderBy: { createdAt: "asc" },
    });
  }
  async save(userId: string, variantId: string, nickname: string) {
    if (!(await db.vehicleVariant.findUnique({ where: { id: variantId } })))
      throw new DomainError(
        "VEHICLE_NOT_SUPPORTED",
        "Choose a vehicle from the catalogue.",
      );
    return db.userVehicle.upsert({
      where: { userId_variantId: { userId, variantId } },
      create: { userId, variantId, nickname },
      update: { nickname },
    });
  }
}
