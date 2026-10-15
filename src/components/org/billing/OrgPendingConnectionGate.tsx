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
          ? "연결 대기는 슬롯이 할당된 Role에서 이용할 수 있어요."
          : "Ready to connect is available for Roles with an assigned slot."}
      </h3>
      <p className="max-w-lg text-sm leading-6 text-neutral-muted">
        {locale === "ko"
          ? "이 Role에 슬롯을 할당하면 Harper가 먼저 후보자에게 역할을 소개하고 연결이 준비된채로 추천해드려요."
          : "Assign a slot to this Role, and Harper will introduce it to candidates first, then recommend them to you once they're ready to connect."}
      </p>
      <MuteButton asChild variant="neutral">
        <Link href={buildOrgHref({ page: "slots", orgId: workspaceId })}>
          {locale === "ko" ? "슬롯 확인" : "View slots"}
        </Link>
      </MuteButton>
    </div>
  );
}
