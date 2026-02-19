import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";

const REDIRECT_DELAY_MS = 3000;

export default function BillingSuccessPage() {
  const router = useRouter();

  const checkoutId = useMemo(() => {
    const value = router.query.checkout_id;
    return typeof value === "string" ? value : null;
  }, [router.query.checkout_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace("/my/billing");
    }, REDIRECT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen w-full bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Payment Received</h1>
        <p className="mt-3 text-sm text-white/70">
          Your checkout is complete. We are syncing your subscription and credits.
        </p>
        {checkoutId ? (
          <p className="mt-4 text-xs text-white/50 break-all">
            checkout_id: <span className="text-white/80">{checkoutId}</span>
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="rounded-md bg-white text-black px-4 py-2 text-sm font-medium"
            onClick={() => router.replace("/my/billing")}
          >
            Go to Billing
          </button>
          <button
            type="button"
            className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium"
            onClick={() => router.reload()}
          >
            Refresh
          </button>
        </div>
      </div>
    </main>
  );
}
