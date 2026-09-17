-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "capturedPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "releasedPaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Fulfillment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'START_PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargingSession" (
    "id" UUID NOT NULL,
    "fulfillmentId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'START_PENDING',
    "pendingRequestId" UUID,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "energyWh" INTEGER NOT NULL DEFAULT 0,
    "measuredAt" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "energyWh" INTEGER NOT NULL,
    "messageId" UUID NOT NULL,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPolicy" (
    "id" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "rateBps" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SIMULATOR',

    CONSTRAINT "TaxPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "taxPolicyId" TEXT NOT NULL,
    "energyWh" INTEGER NOT NULL,
    "ratePaiseKwh" INTEGER NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'SIMULATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fulfillment_orderId_key" ON "Fulfillment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargingSession_fulfillmentId_key" ON "ChargingSession"("fulfillmentId");

-- CreateIndex
CREATE INDEX "ChargingSession_state_nextPollAt_idx" ON "ChargingSession"("state", "nextPollAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeterReading_messageId_key" ON "MeterReading"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MeterReading_sessionId_measuredAt_key" ON "MeterReading"("sessionId", "measuredAt");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_createdAt_idx" ON "SessionEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taxPolicyId_fkey" FOREIGN KEY ("taxPolicyId") REFERENCES "TaxPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
