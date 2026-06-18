import { CompanyLogo } from "./CompanyLogo";
import { FollowButton } from "./FollowButton";
import { formatFollowedAt } from "./watchlistFormatters";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import type {
  CompanyFollowClickHandler,
  CompanyWatchlistItem,
  CompanyWatchlistTab,
} from "./watchlistTypes";

export const CompanyCard = ({
  activeTab,
  item,
  onOpen,
  onToggleFollow,
  updating,
}: {
  activeTab: CompanyWatchlistTab;
  item: CompanyWatchlistItem;
  onOpen: (item: CompanyWatchlistItem) => void;
  onToggleFollow: CompanyFollowClickHandler;
  updating: boolean;
}) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const reasonLabel =
    activeTab === "signals"
      ? t("career.company.company_card.1m5x6m1", "최근 시그널")
      : activeTab === "following"
        ? t("career.common.career.0h5494n", "추적중이에요")
        : t("career.company.company_card.1qxewwj", "추천 근거");
  const reason =
    activeTab === "signals"
      ? (item.signalSummary ??
        item.latestSignal ??
        item.shortDescription ??
        t(
          "career.company.company_card.1gncj7z",
          "회사 업데이트를 정리 중입니다."
        ))
      : activeTab === "following"
        ? (item.trackingSummary ??
          item.reasonSummary ??
          item.shortDescription ??
          t(
            "career.company.company_card.1gncj7z",
            "회사 업데이트를 정리 중입니다."
          ))
        : (item.reasonSummary ??
          item.recommendationReasons[0] ??
          item.shortDescription ??
          t(
            "career.company.company_card.17aqd6f",
            "회사 정보를 정리 중입니다."
          ));

  return (
    <BareButton
      type="button"
      onClick={() => onOpen(item)}
      className="w-full cursor-pointer rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-4 text-left transition-colors hover:bg-bg-weak focus:outline-none focus-visible:ring-4 focus-visible:ring-neutral-1000-a05"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 w-full">
          <CompanyLogo logoUrl={item.logoUrl} name={item.name} />
          <div className="flex flex-row items-start justify-between w-full">
            <div className="w-full">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="min-w-0 wrap-break-word text-base font-medium leading-6 text-neutral-primary">
                  {item.name}
                </h3>
                {item.followedAt ? (
                  <span className="rounded-full bg-bg-weak px-2 py-1 text-[11px] leading-none text-neutral-muted">
                    {formatFollowedAt(item.followedAt, locale, t)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] text-neutral-muted">
                {item.shortDescription ??
                  item.location ??
                  t(
                    "career.company.company_card.1n9j2yp",
                    "회사 설명을 정리 중입니다."
                  )}
              </p>
            </div>
            <FollowButton
              disabled={updating}
              following={item.following}
              onClick={(event) => onToggleFollow(item, event)}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 text-[13px]">
        {activeTab === "following" ? (
          <></>
        ) : (
          <div className="min-w-0 rounded-lg border border-neutral-1000-a05 bg-bg-floating px-3 py-2 shadow-sm">
            <div className="text-[12px] font-medium text-neutral-muted">
              {reasonLabel}
            </div>
            <p className="mt-1 line-clamp-3 text-neutral-primary">{reason}</p>
          </div>
        )}
      </div>
    </BareButton>
  );
};
