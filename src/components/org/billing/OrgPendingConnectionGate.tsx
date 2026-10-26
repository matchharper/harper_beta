import Link from "next/link";
import { CalendarCheck2, MessagesSquare, Search } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { buildOrgHref } from "@/lib/org/routes";
import { PendingConnectionPreview } from "./PendingConnectionPreview";
export function OrgPendingConnectionGate({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const purchaseHref = `${buildOrgHref({ page: "slots", orgId: workspaceId })}&purchase=slot`;
  return (
    <section className="col-span-full mx-auto w-full max-w-[560px] py-7 sm:py-10">
      <header className="mb-6 text-center">
        <h3 className="text-lg font-normal text-neutral-primary sm:text-xl">
          {c("Harper에게 전부 맡기세요.", "Hand over everything to Harper.")}
        </h3>
      </header>
      <ul className="mb-6 md:mt-12 mt-6 space-y-4">
        {[
          {
            icon: Search,
            title: c("직접 연락할 필요 없습니다.", "No need to reach out"),
            description: c(
              "직접 연락을 보내지 않아도, Harper가 우리 팀에 맞는 사람을 꾸준히 찾아서 알려드려요.",
              "Harper keeps looking for people who fit your team, without you having to reach out."
            ),
          },
          {
            icon: MessagesSquare,
            title: c("수락시 바로 연결", "Connect immediately when you accept"),
            description: c(
              "적절한 후보자에게 우리 팀을 소개하고, 만나보고 싶다는 답을 받은 뒤 보여드려요.",
              "Harper introduces your team first, then brings you people who want to meet."
            ),
          },
        ].map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex gap-3">
            <div
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-primary"
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-normal text-neutral-primary">
                {title}
              </h4>
              <p className="mt-0.5 break-keep text-[13px] font-normal text-neutral-muted">
                {description}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <PendingConnectionPreview />
      <div className="mt-6 md:mt-12">
        <MuteButton asChild variant="dark" size="md" className="w-full py-2">
          <Link href={purchaseHref}>
            {c("이 역할을 Harper에게 맡기기", "Hand over to Harper")}
          </Link>
        </MuteButton>
      </div>
    </section>
  );
}
