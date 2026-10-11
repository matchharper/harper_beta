import { requestedSlotId } from "@/lib/org/billing/compat";
import { canUseWorkspaceBilling } from "@/lib/org/billing/rollout";
import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import {
  billingDb,
  billingRpc,
  getBillingSummary,
  throwBillingDbError,
} from "@/lib/org/billing/store";
import { getBillingCatalog } from "@/lib/org/billing/stripe";
import {
  confirmSlotCheckout,
  createSlotCheckout,
  createBillingPortal,
  listBillingInvoices,
  syncWorkspaceSubscriptions,
  updateSlotCancellation,
  withSlotPrices,
} from "@/lib/org/billing/service";
import { billingErrorResponse } from "@/lib/org/billing/http";
import {
  WorkspaceBillingError,
  isSlotPurchaseQuantity,
} from "@/lib/org/billing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  const billing = billingErrorResponse(error);
  if (billing) return billing;
  if (error instanceof OrgHttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  if (error instanceof Error && error.message === "Unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.error("[org/billing]", error);
  return billingErrorResponse(
    new WorkspaceBillingError("billing_unavailable", 503)
  )!;
}
function workspaceId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
  )
    throw new OrgHttpError(400, "Invalid workspace");
  return value;
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const id = workspaceId(req.nextUrl.searchParams.get("workspaceId"));
    const authority = await assertOrgWorkspacePermission({
      admin: getSupabaseAdmin(),
      user,
      workspaceId: id,
      permission: "view",
    });
    const canManage = authority === "owner" || authority === "admin";
    const view = req.nextUrl.searchParams.get("view") ?? "summary";
    // Capacity remains available to ordinary hiring flows; payment screens are gated.
    if (view !== "capacity" && !canUseWorkspaceBilling(id))
      throw new WorkspaceBillingError("billing_forbidden", 403);
    if (!["summary", "capacity", "usage", "invoices"].includes(view))
      throw new OrgHttpError(400, "Invalid billing view");
    if (view === "invoices" && authority !== "owner")
      throw new WorkspaceBillingError("billing_owner_required", 403);
    if (view === "invoices")
      return NextResponse.json(
        await listBillingInvoices(
          id,
          req.nextUrl.searchParams.get("after") ?? undefined
        )
      );
    if (view === "usage") {
      const before = req.nextUrl.searchParams.get("before");
      const page = Number(req.nextUrl.searchParams.get("page") ?? 0);
      if (!Number.isSafeInteger(page) || page < 0 || page > 100_000)
        throw new OrgHttpError(400, "Invalid page");
      let query = billingDb()
        .from("company_workspace_credit_events")
        .select(
          "id,action_code,created_at,delta,period_id,company_roles(name),company_workspace_credit_periods(slot_id)",
          { count: "exact" }
        )
        .eq("company_workspace_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (before) {
        const { data: cursor, error } = await billingDb()
          .from("company_workspace_credit_events")
          .select("created_at,id")
          .eq("company_workspace_id", id)
          .eq("id", before)
          .single();
        throwBillingDbError(error);
        if (!cursor) throw new OrgHttpError(400, "Invalid cursor");
        query = query.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
        );
      }
      const { data, error, count } = await query.range(
        page * 20,
        page * 20 + 19
      );
      throwBillingDbError(error);
      // Historical usage belongs to the debited period's slot, even after a
      // Role changes Slots. Never infer this from the current assignment.
      const { slots } = await getBillingSummary(id);
      const slotLabels = new Map(slots.map((slot) => [slot.id, slot.label]));
      return NextResponse.json({
        usage: (data ?? []).slice(0, 20).map((row: any) => ({
          id: row.id,
          action: row.action_code,
          createdAt: row.created_at,
          delta: row.delta,
          roleName: row.company_roles?.name ?? null,
          slotLabel: row.company_workspace_credit_periods?.slot_id
            ? (slotLabels.get(row.company_workspace_credit_periods.slot_id) ??
              null)
            : row.period_id
              ? "Shared credits"
              : null,
        })),
        total: count ?? 0,
        page,
        hasMore: (page + 1) * 20 < (count ?? 0),
      });
    }
    const summary = await getBillingSummary(id);
    if (view === "capacity")
      return NextResponse.json({
        capacity: summary.capacity,
        activeRoles: summary.activeRoles,
        pendingConnections: summary.model !== "free",
        creditSlots: summary.creditSlots,
      });
    const [slots, catalog] = await Promise.all([
      withSlotPrices(id, summary.slots),
      getBillingCatalog().catch((error) => {
        console.error("[billing/catalog]", error);
        return {
          available: false,
          amount: null,
          annualAmount: null,
          testMode: false,
          currency: null,
          taxBehavior: "unspecified",
        };
      }),
    ]);
    return NextResponse.json({
      summary: { ...summary, slots, canManage },
      catalog,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    const slotId = requestedSlotId(body);
    const id = workspaceId(body.workspaceId);
    if (!canUseWorkspaceBilling(id))
      throw new WorkspaceBillingError("billing_forbidden", 403);
    const authority = await assertOrgWorkspacePermission({
      admin: getSupabaseAdmin(),
      user,
      workspaceId: id,
      permission: "manage_workspace",
    });
    switch (body.action) {
      case "checkout":
        if (body.interval !== "month" && body.interval !== "year")
          throw new OrgHttpError(400, "Invalid billing interval");
        if (
          !isSlotPurchaseQuantity(
            body.quantity === undefined ? 1 : body.quantity
          )
        )
          throw new OrgHttpError(400, "Invalid slot quantity");
        return NextResponse.json(
          await createSlotCheckout(
            id,
            user.id,
            user.email,
            body.locale,
            body.interval,
            body.quantity === undefined ? 1 : body.quantity
          )
        );
      case "confirm": {
        if (
          typeof body.sessionId !== "string" ||
          !body.sessionId.startsWith("cs_")
        )
          throw new OrgHttpError(400, "Invalid checkout");
        return NextResponse.json(await confirmSlotCheckout(id, body.sessionId));
      }
      case "portal":
        if (authority !== "owner")
          throw new WorkspaceBillingError("billing_owner_required", 403);
        return NextResponse.json(await createBillingPortal(id));
      case "refresh":
        await syncWorkspaceSubscriptions(id);
        return NextResponse.json({ ok: true });
      case "cancel":
      case "resume": {
        if (typeof slotId !== "string" || !Number.isSafeInteger(body.revision))
          throw new OrgHttpError(400, "Invalid Slot");
        return NextResponse.json(
          await updateSlotCancellation(
            id,
            slotId,
            body.revision,
            body.action === "cancel"
          )
        );
      }
      case "assign": {
        if (
          typeof slotId !== "string" ||
          !Number.isSafeInteger(body.revision) ||
          (body.roleId !== null && typeof body.roleId !== "string")
        )
          throw new OrgHttpError(400, "Invalid assignment");
        await billingRpc("workspace_billing_assign_slot_v1", {
          p_workspace: id,
          p_slot: slotId,
          p_role: body.roleId,
          p_revision: body.revision,
        });
        return NextResponse.json({ ok: true });
      }
      default:
        throw new OrgHttpError(400, "Unknown action");
    }
  } catch (error) {
    return failure(error);
  }
}
