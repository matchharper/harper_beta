import { CompanyLogo } from "./CompanyLogo";
import { FollowButton } from "./FollowButton";
import { formatFollowedAt } from "./watchlistFormatters";
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
  const reasonLabel =
    activeTab === "signals"
      ? "최근 시그널"
      : activeTab === "following"
        ? "추적중이에요"
        : "추천 근거";
  const reason =
    activeTab === "signals"
      ? (item.signalSummary ??
        item.latestSignal ??
        item.shortDescription ??
        "회사 업데이트를 정리 중입니다.")
      : activeTab === "following"
        ? (item.trackingSummary ??
          item.reasonSummary ??
          item.shortDescription ??
          "회사 업데이트를 정리 중입니다.")
        : (item.reasonSummary ??
          item.recommendationReasons[0] ??
          item.shortDescription ??
          "회사 정보를 정리 중입니다.");

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(item);
      }}
      className="cursor-pointer rounded-2xl border border-black/10 bg-white/45 p-4 text-left transition-colors hover:bg-white/80 focus:outline-none focus-visible:ring-4 focus-visible:ring-beige700/15"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 w-full">
          <CompanyLogo logoUrl={item.logoUrl} name={item.name} />
          <div className="flex flex-row items-start justify-between w-full">
            <div className="w-full">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="min-w-0 wrap-break-word text-base font-medium leading-6 text-black">
                  {item.name}
                </h3>
                {item.followedAt ? (
                  <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[11px] leading-none text-black/60">
                    {formatFollowedAt(item.followedAt)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] text-black/60">
                {item.shortDescription ??
                  item.location ??
                  "회사 설명을 정리 중입니다."}
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
          <div className="min-w-0 rounded-lg bg-black/[0.04] px-3 py-2">
            <div className="text-[12px] font-medium text-black/60">
              {reasonLabel}
            </div>
            <p className="mt-1 line-clamp-3 text-black/90">{reason}</p>
          </div>
        )}
      </div>
    </article>
  );
};
