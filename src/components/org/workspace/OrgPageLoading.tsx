import { Skeleton } from "@/components/ui/skeleton";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { COMPANY_TERMS, companyTerm, type CompanyTerm } from "@/lib/org/terms";
import type { OrgWorkspacePageId } from "@/lib/org/routes";

const nav = COMPANY_TERMS.nav;
const titles: Partial<Record<OrgWorkspacePageId, CompanyTerm>> = {
  member: nav.members,
  team: nav.company,
  settings: nav.integrations,
  slots: nav.slots,
  billing: nav.billing,
  templates: nav.templates,
  home: nav.home,
  inbox: COMPANY_TERMS.tab.inbox,
  jobs: nav.roles,
  documents: nav.help,
};
export function OrgPageLoading({ page }: { page?: OrgWorkspacePageId }) {
  const { locale } = useOrgLocale();
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      {page === "personal-settings" ? (
        <h1 className="text-[20px] font-medium text-neutral-primary">
          {locale === "ko" ? "개인 설정" : "Settings"}
        </h1>
      ) : page && titles[page] ? (
        <h1 className="text-[24px] font-medium text-neutral-primary">
          {companyTerm(titles[page], locale)}
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
