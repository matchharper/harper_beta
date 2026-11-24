import type { Metadata } from "next";
import UnsubscribeForm from "./UnsubscribeForm";

export const metadata: Metadata = {
  title: "Harper",
  robots: { index: false, follow: false },
};

function firstParam(value: string | string[] | undefined) {
  return ((Array.isArray(value) ? value[0] : value) ?? "").slice(0, 64);
}

/**
 * Where the unsubscribe link in a CRM group email (/ops/crm) lands, through /api/email/crm-unsubscribe.
 * Opening it only shows a confirmation, so mail scanners that follow links do not unsubscribe anyone.
 */
export default async function CrmUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto w-full max-w-[400px] px-6 pt-[18vh]">
      <UnsubscribeForm token={firstParam(params.t)} userId={firstParam(params.u)} />
    </main>
  );
}
