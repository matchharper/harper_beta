import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { buildOrgHref } from "@/lib/org/routes";
export function OrgPendingConnectionGate({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { locale } = useOrgLocale();
  return (
    <div className="col-span-full flex flex-col items-start gap-3 py-10">
      <LockKeyhole className="size-5 text-neutral-muted" aria-hidden />
      <h3 className="text-sm font-medium">
        {locale === "ko"
          ? "연결 대기는 유료 슬롯에 연결된 Role에서 이용할 수 있어요."
          : "Ready to connect is available for Roles assigned to a paid slot."}
      </h3>
      <p className="max-w-lg text-sm leading-6 text-neutral-muted">
        {locale === "ko"
          ? "Slots에서 이 Role에 유료 슬롯을 연결하면 Harper가 연결을 준비한 후보자를 확인하고 수락할 수 있어요."
          : "Assign a paid slot to this Role in Slots to review and accept candidates Harper has prepared for connection."}
      </p>
      <MuteButton asChild variant="neutral">
        <Link href={buildOrgHref({ page: "slots", orgId: workspaceId })}>
          {locale === "ko" ? "슬롯 확인" : "View slots"}
        </Link>
      </MuteButton>
    </div>
  );
}
