import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
import { BareButton } from "@/components/ui/button";

const REDIRECT_DELAY_MS = 3000;

export default function BillingSuccessPage() {
  const router = useRouter();

  const checkoutId = useMemo(() => {
    const value = router.query.checkout_id;
    return typeof value === "string" ? value : null;
  }, [router.query.checkout_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ checkout_synced: "1" });
      if (checkoutId) {
        query.set("checkout_id", checkoutId);
      }
      router.replace(`/my/billing?${query.toString()}`);
    }, REDIRECT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [checkoutId, router]);

  return (
    <main className="min-h-screen w-full bg-surface-inverse text-on-inverse flex items-center justify-center px-6 font-sans">
      <div className="w-full max-w-xl rounded-xl border border-bg-floating/10 bg-bg-floating/5 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Subscription Updated
        </h1>
        <p className="mt-3 text-sm text-on-inverse/70">
          Your checkout is complete. We are syncing your subscription details
          now.
        </p>
        {checkoutId ? (
          <p className="mt-4 text-xs text-on-inverse/50 break-all">
            checkout_id: <span className="text-on-inverse/80">{checkoutId}</span>
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <BareButton
            type="button"
            className="rounded-md bg-bg-floating text-neutral-primary px-4 py-2 text-sm font-medium"
            onClick={() => router.replace("/my/billing")}
          >
            Go to Billing
          </BareButton>
          <BareButton
            type="button"
            className="rounded-md border border-bg-floating/30 px-4 py-2 text-sm font-medium"
            onClick={() => router.reload()}
          >
            Refresh
          </BareButton>
        </div>
      </div>
    </main>
  );
}
