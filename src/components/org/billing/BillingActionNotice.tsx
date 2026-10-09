import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  billingActionNoticeView,
  readBillingActionNotice,
} from "@/lib/org/billing/notice";

export function BillingActionNotice({ metadata }: { metadata: unknown }) {
  const { locale } = useOrgLocale();
  const notice = readBillingActionNotice(metadata);
  if (!notice) return null;
  const view = billingActionNoticeView(notice, locale);
  return (
    <div
      role="status"
      className="mt-3 space-y-2 rounded-md bg-info-faded px-3 py-3 text-[13px] leading-6"
    >
      <p>{view.message}</p>
      <MuteButton asChild size="sm">
        <a href={view.href}>{view.label}</a>
      </MuteButton>
    </div>
  );
}
