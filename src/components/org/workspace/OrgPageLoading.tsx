import { Skeleton } from "@/components/ui/skeleton";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgWorkspacePageId } from "@/lib/org/routes";

const titles: Partial<Record<OrgWorkspacePageId, string>> = {
  member: "Members",
  team: "Company",
  settings: "Integrations",
  slots: "Slots",
  billing: "Billing",
  templates: "Templates",
  home: "Home",
  inbox: "Inbox",
  jobs: "Roles",
  documents: "Documents",
};
export function OrgPageLoading({ page }: { page?: OrgWorkspacePageId }) {
  const { locale } = useOrgLocale();
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      {page === "personal-settings" ? (
        <h1 className="text-[20px] font-medium text-neutral-primary">
          {locale === "ko" ? "개인 설정" : "Personal settings"}
        </h1>
      ) : page && titles[page] ? (
        <h1 className="text-[24px] font-medium text-neutral-primary">
          {titles[page]}
        </h1>
      ) : (
        <Skeleton className="h-8 w-36" />
      )}
      <span className="sr-only">
        {locale === "ko" ? "불러오는 중" : "Loading"}
      </span>
      <div className="space-y-5">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
