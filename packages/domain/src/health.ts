import { db } from "@uei/database";
import { getConfig } from "@uei/config";

export class HealthService {
  async check() {
    const config = getConfig();
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      return { status: "degraded" as const, mode: config.PROTOCOL_MODE, database: "unreachable" as const };
    }
    const openReconciliationIssues = await db.reconciliationIssue.count({
      where: { resolvedAt: null },
    });
    return {
      status: "ok" as const,
      mode: config.PROTOCOL_MODE,
      database: "ok" as const,
      openReconciliationIssues,
    };
  }
}
