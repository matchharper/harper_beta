import { timingSafeEqual } from "node:crypto";
import { deliverInternalHiringNotification } from "./internalHiringNotifications";

type Admin = { from: (name: string) => any };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Authenticate the DB's event-scoped capability, then send the stored facts. */
export async function dispatchInternalHiringNotification(
  request: Request,
  getAdmin: () => Admin,
  deliver = deliverInternalHiringNotification
) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true" || process.env.HARPER_LOCAL_E2E === "1")
    return Response.json({ status: "isolated" });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || typeof body.token !== "string" || !uuid.test(body.id) || !uuid.test(body.token))
    return Response.json({ error: "Invalid notification capability" }, { status: 400 });
  try {
    const admin = getAdmin();
    const { data, error } = await admin.from("internal_hiring_notifications")
      .select("id,dispatch_token").eq("id", body.id).maybeSingle();
    if (error) throw error;
    // Keep the capability out of the database request URL and its access logs.
    const expected = Buffer.from(data?.dispatch_token ?? "");
    const supplied = Buffer.from(body.token.toLowerCase());
    if (!data || expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      return Response.json({ error: "Invalid notification capability" }, { status: 403 });
    // Ignore caller-supplied text/channel/facts. This can only deliver this row.
    const status = await deliver(admin, data.id);
    return Response.json({ status }, { status: status === "retry" ? 503 : 200 });
  } catch {
    // Never log the capability or request body. Recovery owns the unsent row.
    console.error("[internal-hiring/immediate] delivery failed");
    return Response.json({ error: "Notification delivery failed" }, { status: 503 });
  }
}
