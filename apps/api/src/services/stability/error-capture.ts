import type { ErrorSource } from "@nebula/database";
import { errorMonitorService } from "./error-monitor.service";

/** Fire-and-forget error capture for route handlers. */
export function captureRouteError(
  source: ErrorSource,
  err: unknown,
  context?: { userId?: string; projectId?: string; code?: string }
) {
  void errorMonitorService.captureFromUnknown(source, err, context).catch((e) => {
    console.warn("[stability] error capture failed:", e);
  });
}
