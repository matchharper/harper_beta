import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import { SlotPurchaseDialog } from "@/components/org/billing/SlotPurchaseDialog";
import { WorkspacePlans } from "@/components/org/billing/WorkspacePlans";
import { MuteButton } from "@/components/ui/button";
import { billingRequest, useOrgBilling } from "@/hooks/org/useOrgBilling";
import { signupErrorMessage } from "@/lib/org/signup";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { signupRequest } from "./signupClient";
import type { BillingInterval } from "@/lib/org/billing/types";

export function OrgSignupPlan({
  workspaceId,
  locale,
  onSelected,
  onBusyChange,
}: {
  workspaceId: string;
  locale: "ko" | "en";
  onSelected: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const billing = useOrgBilling(workspaceId, true);
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const [purchaseInterval, setPurchaseInterval] =
    useState<BillingInterval | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const session =
    typeof router.query.session_id === "string" ? router.query.session_id : "";
  useEffect(() => {
    onBusyChange(busy || confirming);
    return () => onBusyChange(false);
  }, [busy, confirming, onBusyChange]);
  const select = useCallback(
    async (plan: "free" | "slot") => {
      await signupRequest(workspaceId, "plan", { plan });
      await client.invalidateQueries({ queryKey: ["org", "bootstrap"] });
      onSelected();
    },
    [client, onSelected, workspaceId]
  );
  useEffect(() => {
    if (!session || router.query.checkout !== "success") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setConfirming(true);
    async function confirm(attempt = 0) {
      try {
        const result = await billingRequest<{ confirmed: boolean }>(
          workspaceId,
          "confirm",
          { sessionId: session }
        );
        if (stopped) return;
        if (result.confirmed) {
          await select("slot");
          if (!stopped) setConfirming(false);
          return;
        }
        if (attempt < 5) {
          timer = setTimeout(() => void confirm(attempt + 1), 3000);
          return;
        }
        setError(
          signupErrorMessage(new Error("signup_payment_pending"), locale)
        );
      } catch (e) {
        if (!stopped) setError(signupErrorMessage(e, locale));
      }
      if (!stopped) setConfirming(false);
    }
    void confirm();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [session, router.query.checkout, workspaceId, locale, select]);
  async function act(
    plan: "free" | "slot",
    interval?: BillingInterval,
    quantity = 1
  ) {
    if (busy || confirming) return;
    setBusy(true);
    setError("");
    try {
      if (plan === "slot" && billing.data?.summary.model !== "slot") {
        const result = await billingRequest<{ url: string }>(
          workspaceId,
          "checkout",
          { locale, interval: interval ?? "year", quantity }
        );
        window.location.assign(result.url);
      } else await select(plan);
    } catch (e) {
      setError(
        localizedOrgErrorMessage(e, locale, signupErrorMessage(e, locale))
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {router.query.checkout === "cancelled" ? (
        <p className="text-sm text-neutral-muted" role="status">
          {c(
            "결제를 완료하지 않았어요. 다시 선택하거나 무료로 시작할 수 있어요.",
            "Checkout wasn’t completed. Choose a plan again or start free."
          )}
        </p>
      ) : null}
      {confirming ? (
        <p className="text-sm text-neutral-muted" role="status">
          {c("결제를 확인하고 있어요…", "Confirming your payment…")}
        </p>
      ) : null}
      {error && !purchaseInterval ? (
        <p className="text-sm text-critical" role="alert">
          {error}
        </p>
      ) : null}
      {billing.data?.summary.model === "slot" ? (
        <MuteButton
          size="lg"
          variant="dark"
          disabled={busy || confirming}
          onClick={() => void act("slot")}
        >
          {c("결제 확인하고 계속하기", "Continue with your subscription")}
        </MuteButton>
      ) : (
        <WorkspacePlans
          locale={locale}
          catalog={billing.data?.catalog}
          initialInterval={router.query.interval === "month" ? "month" : "year"}
          busy={busy || confirming}
          onFree={() => void act("free")}
          onAddSlot={(interval) => {
            setError("");
            setPurchaseInterval(interval);
          }}
        />
      )}
      <SlotPurchaseDialog
        open={purchaseInterval !== null}
        onOpenChange={(open) => {
          if (!open) setPurchaseInterval(null);
        }}
        locale={locale}
        catalog={billing.data?.catalog}
        initialInterval={purchaseInterval ?? "year"}
        initialQuantity={Number(router.query.quantity ?? 1)}
        busy={busy || confirming}
        error={error}
        onCheckout={(interval, quantity) =>
          void act("slot", interval, quantity)
        }
      />
    </div>
  );
}
