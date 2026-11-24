import { ArrowUpRight } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useCareerCompanyProfile } from "@/hooks/career/useCareerCompanyProfile";
import { useCareerT } from "@/i18n/useCareerT";
import CompanyFactsGrid from "../company/CompanyFactsGrid";
import {
  CompanyHeader,
  CompanyProfileSections,
  useCareerCompanyDetail,
} from "../company/CareerCompanyPage";
import type { CareerHistoryOpportunity } from "../types";
import { OpportunityFacts } from "./OpportunityCard";
import OpportunityCompanySummary from "./OpportunityCompanySummary";

/** The 회사 정보 tab of an opportunity: the same company view as the company page. */
export default function OpportunityCompanyTab({
  item,
  onOpenCompanyInfo,
  onOpenLink,
}: {
  item: CareerHistoryOpportunity;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenLink: (url: string) => void;
}) {
  const t = useCareerT();
  const companyDbId = item.companyDbId ?? null;
  const detailQuery = useCareerCompanyDetail(companyDbId);
  const profileQuery = useCareerCompanyProfile(companyDbId);
  const company = detailQuery.data ?? null;
  const companyUrl = item.companyHomepageUrl ?? item.companyLinkedinUrl;

  if (!companyDbId) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium">{item.companyName}</h2>
          {companyUrl ? (
            <MuteButton
              variant="transparent"
              onClick={() => onOpenLink(companyUrl)}
            >
              {t("career.common.career.09c4j2c", "링크 열기")}
              <ArrowUpRight aria-hidden className="size-4" />
            </MuteButton>
          ) : null}
        </div>
        <OpportunityFacts item={item} section="company" />
        <OpportunityCompanySummary item={item} />
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <CompanyHeader
        fallback={{
          description: item.companyDescription,
          logoUrl: item.companyLogoUrl,
          name: item.companyName,
        }}
        item={company}
        onOpenCompany={
          onOpenCompanyInfo ? () => onOpenCompanyInfo(item) : undefined
        }
        showLinks
      />
      <CompanyFactsGrid
        className="mt-6"
        profile={profileQuery.data}
        basics={{
          employeeCountRange:
            company?.employeeCountRange ?? item.companyEmployeeCountRange,
          foundedYear: company?.foundedYear ?? item.companyFoundedYear,
          location: company?.location ?? item.companyHqLocation,
        }}
      />
      <CompanyProfileSections
        companyDbId={companyDbId}
        companyName={company?.name ?? item.companyName}
        excludeRoleId={item.roleId}
        item={company}
      />
    </section>
  );
}
