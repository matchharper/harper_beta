import { create } from "zustand";
import { supabase } from "@/lib/supabase";

type BillingPeriod = "monthly" | "yearly";
type PlanKey = "pro" | "max" | "enterprise" | "free" | null;

type PlanState = {
  loading: boolean;
  initialized: boolean;
  planKey: PlanKey;
  billing: BillingPeriod | null;
  planId: string | null;
  planName: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  load: (userId: string) => Promise<void>;
  clear: () => void;
};

function normalizePlanValue(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "")
    .trim();
}

function inferPlanKeyFromText(planLabel?: string | null, planId?: string | null) {
  const hay = normalizePlanValue(`${planLabel ?? ""} ${planId ?? ""}`);
  if (hay.includes("free") || hay.includes("프리")) return "free";
  if (hay.includes("max")) return "max";
  if (hay.includes("pro")) return "pro";
  if (hay.includes("enterprise")) return "enterprise";
  return null;
}

export const usePlanStore = create<PlanState>((set) => ({
  loading: false,
  initialized: false,
  planKey: null,
  billing: null,
  planId: null,
  planName: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: null,

  load: async (userId) => {
    if (!userId) return;
    set({ loading: true });
    const nowIso = new Date().toISOString();

    const { data: activePayment, error } = await supabase
      .from("payments")
      .select(
        `
          plan_id,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          plans (
            plan_id,
            name,
            display_name,
            cycle
          )
        `
      )
      .eq("user_id", userId)
      .gte("current_period_end", nowIso)
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      set({ loading: false, initialized: true });
      throw error;
    }

    if (!activePayment) {
      const { data: freePlan, error: freeError } = await supabase
        .from("plans")
        .select("plan_id, name, display_name")
        .eq("ls_variant_id", "0000000")
        .maybeSingle();

      if (freeError) {
        set({ loading: false, initialized: true });
        throw freeError;
      }

      const freeName = freePlan?.display_name ?? freePlan?.name ?? "Free";
      set({
        loading: false,
        initialized: true,
        planKey: "free",
        billing: "monthly",
        planId: freePlan?.plan_id ?? null,
        planName: freeName,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: null,
      });
      return;
    }

    const planName =
      (activePayment as any)?.plans?.display_name ??
      (activePayment as any)?.plans?.name ??
      null;
    const planKey = inferPlanKeyFromText(planName, activePayment.plan_id ?? null);
    const cycle = (activePayment as any)?.plans?.cycle ?? null;
    const billing =
      cycle === 1 ? "yearly" : cycle === 0 ? "monthly" : null;

    set({
      loading: false,
      initialized: true,
      planKey,
      billing,
      planId: activePayment.plan_id ?? null,
      planName,
      currentPeriodStart: activePayment.current_period_start ?? null,
      currentPeriodEnd: activePayment.current_period_end ?? null,
      cancelAtPeriodEnd: activePayment.cancel_at_period_end ?? null,
    });
  },

  clear: () =>
    set({
      loading: false,
      initialized: false,
      planKey: null,
      billing: null,
      planId: null,
      planName: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: null,
    }),
}));
