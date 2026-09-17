import { db } from "../packages/database/src";

async function seed() {
  await db.taxPolicy.upsert({
    where: { id: "simulator-zero-tax" }, update: {},
    create: { id: "simulator-zero-tax", effectiveFrom: new Date("2020-01-01T00:00:00Z"), rateBps: 0, mode: "SIMULATOR" },
  });
  // Illustrative local fixtures; not a verified vehicle specification catalogue.
  for (const [makeId, makeName, modelId, modelName, variantId, battery] of [
    ["tata", "Tata", "nexon", "Nexon EV", "nexon-demo", "40.5"],
    ["mg", "MG", "zsev", "ZS EV", "zsev-demo", "50.3"],
  ]) {
    await db.vehicleMake.upsert({
      where: { id: makeId! },
      update: {},
      create: { id: makeId!, name: makeName! },
    });
    await db.vehicleModel.upsert({
      where: { id: modelId! },
      update: {},
      create: { id: modelId!, name: modelName!, makeId: makeId! },
    });
    await db.vehicleVariant.upsert({
      where: { id: variantId! },
      update: {},
      create: {
        id: variantId!,
        name: "Demo variant",
        modelId: modelId!,
        batteryKwh: battery!,
        connectors: {
          create: [
            { connector: "CCS2", maxKw: "50" },
            { connector: "TYPE2", maxKw: "7.2" },
          ],
        },
      },
    });
  }
  for (const id of ["sim-a", "sim-b"])
    await db.networkParticipant.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: `Simulated network ${id}`,
        uri: `https://${id}.invalid`,
      },
    });
}
seed().finally(() => db.$disconnect());
