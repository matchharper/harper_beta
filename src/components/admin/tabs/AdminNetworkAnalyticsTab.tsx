import React from "react";
import type {
  GroupedLogs,
  LandingLog,
  TalentNetworkButtonSummary,
  TalentNetworkFunnelSummary,
  TalentNetworkVariantColumn,
  TalentNetworkVariantFunnelSummary,
} from "@/components/admin/types";
import {
  formatPercent,
  formatTalentNetworkEventName,
} from "@/components/admin/utils";
import { Loading } from "@/components/ui/loading";
import {
  TALENT_NETWORK_ONBOARDING_COMPARISON_STEPS,
  TALENT_NETWORK_PROFILE_IDENTITY_COMPLETED_EVENT,
} from "@/lib/talentNetwork";

type AdminNetworkAnalyticsTabProps = {
  logs: LandingLog[];
  grouped: GroupedLogs[];
  loading: boolean;
  error: string | null;
  funnelSummary: TalentNetworkFunnelSummary | null;
  variantSummaries: TalentNetworkVariantFunnelSummary[];
  variantColumns: TalentNetworkVariantColumn[];
  buttonSummary: TalentNetworkButtonSummary[];
  getVariantDescription: (abtestType: string) => string;
  onRefresh: () => void | Promise<void>;
};

export default function AdminNetworkAnalyticsTab({
  logs,
  grouped,
  loading,
  error,
  funnelSummary,
  variantSummaries,
  variantColumns,
  buttonSummary,
  getVariantDescription,
  onRefresh,
}: AdminNetworkAnalyticsTabProps) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between w-full">
        <div className="text-[12px] text-black/55">
          Loaded logs: <span className="text-black">{logs.length}</span> · Users:{" "}
          <span className="text-black">{grouped.length}</span>
        </div>

        {loading && (
          <Loading
            size="sm"
            label="Loading…"
            className="text-[12px] text-black/55"
            inline={true}
          />
        )}
      </div>

      {error ? (
        <div
          className="mb-4 border border-black/15 bg-black/[0.02] p-4 text-[13px] flex items-start justify-between gap-4"
          style={{ borderRadius: 0 }}
        >
          <div>
            <div className="font-semibold">Error</div>
            <div className="text-black/70 mt-1">{error}</div>
          </div>
          <button
            onClick={onRefresh}
            className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
            style={{ borderRadius: 0 }}
          >
            Retry
          </button>
        </div>
      ) : !funnelSummary ? (
        <div
          className="border border-black/10 p-8 text-center text-[13px] text-black/55"
          style={{ borderRadius: 0 }}
        >
          No Talent Network data.
        </div>
      ) : (
        <>
          <div
            className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
            style={{ borderRadius: 0 }}
          >
            <div className="font-semibold text-black mb-2">
              Talent Network overview
            </div>
            <div className="leading-6">
              유입 유저:{" "}
              <span className="font-medium text-black">{funnelSummary.totalUsers}</span>{" "}
              · 시작 화면 도달:{" "}
              <span className="font-medium text-black">
                {funnelSummary.onboardingStartUsers}
              </span>{" "}
              (
              {formatPercent(
                funnelSummary.onboardingStartUsers,
                funnelSummary.totalUsers
              )}
              ) · 제출 완료:{" "}
              <span className="font-medium text-black">
                {funnelSummary.submittedUsers}
              </span>{" "}
              (
              {formatPercent(
                funnelSummary.submittedUsers,
                funnelSummary.totalUsers
              )}
              )
            </div>
          </div>

          <div
            className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
            style={{ borderRadius: 0 }}
          >
            <div className="font-semibold text-black mb-2">
              A/B variant comparison
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-black/10 text-black">
                    <th className="py-2 pr-3 font-semibold">Variant</th>
                    <th className="py-2 pr-3 font-semibold">UI</th>
                    <th className="py-2 pr-3 text-right font-semibold">Users</th>
                    <th className="py-2 pr-3 text-right font-semibold">Start</th>
                    <th className="py-2 pr-3 text-right font-semibold">Submit</th>
                    <th className="py-2 text-right font-semibold">
                      Submit / Start
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {variantSummaries.map((item) => (
                    <tr
                      key={item.abtestType}
                      className="border-b border-black/5 align-top last:border-b-0"
                    >
                      <td className="py-2 pr-3 font-medium text-black">
                        {item.label}
                        <div className="text-[11px] font-normal text-black/45">
                          {item.abtestType}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-black/65">
                        {getVariantDescription(item.abtestType) || "-"}
                      </td>
                      <td className="py-2 pr-3 text-right">{item.totalUsers}</td>
                      <td className="py-2 pr-3 text-right">
                        {item.onboardingStartUsers} (
                        {formatPercent(
                          item.onboardingStartUsers,
                          item.totalUsers
                        )}
                        )
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {item.submittedUsers} (
                        {formatPercent(item.submittedUsers, item.totalUsers)})
                        )
                      </td>
                      <td className="py-2 text-right">
                        {formatPercent(
                          item.submittedUsers,
                          item.onboardingStartUsers
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
            style={{ borderRadius: 0 }}
          >
            <div className="font-semibold text-black mb-2">
              Onboarding step comparison
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-black/10 text-black">
                    <th className="py-2 pr-3 font-semibold">Step</th>
                    {variantColumns.map((variant) => (
                      <th
                        key={variant.abtestType}
                        className="py-2 pr-3 text-right font-semibold"
                      >
                        {variant.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TALENT_NETWORK_ONBOARDING_COMPARISON_STEPS.map((step) => {
                    const isProfileIdentityRow =
                      step.eventType ===
                      TALENT_NETWORK_PROFILE_IDENTITY_COMPLETED_EVENT;

                    return (
                      <tr
                        key={step.key}
                        className="border-b border-black/5 last:border-b-0"
                      >
                        <td
                          className={`py-2 pr-3 ${isProfileIdentityRow ? "pl-6" : ""}`}
                        >
                          <span className="font-medium text-black">
                            Step {step.step}
                          </span>{" "}
                          {step.label}
                        </td>
                        {variantColumns.map((variant) => {
                          const summary = variantSummaries.find(
                            (item) => item.abtestType === variant.abtestType
                          );
                          const stepSummary = summary?.steps.find(
                            (item) => item.eventType === step.eventType
                          );

                          return (
                            <td
                              key={`${step.key}-${variant.abtestType}`}
                              className="py-2 pr-3 text-right"
                            >
                              {stepSummary?.userCount ?? 0} (
                              {formatPercent(
                                stepSummary?.userCount ?? 0,
                                summary?.totalUsers ?? 0
                              )}
                              )
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
            style={{ borderRadius: 0 }}
          >
            <div className="font-semibold text-black mb-2">
              Button clicks by variant
            </div>
            {buttonSummary.length === 0 ? (
              <div className="text-black/55">No button click data.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead>
                    <tr className="border-b border-black/10 text-black">
                      <th className="py-2 pr-3 font-semibold">Event</th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        Total Users
                      </th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        Total Clicks
                      </th>
                      {variantColumns.map((variant) => (
                        <th
                          key={variant.abtestType}
                          className="py-2 pr-3 text-right font-semibold"
                        >
                          {variant.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buttonSummary.map((item) => (
                      <tr
                        key={item.eventType}
                        className="border-b border-black/5 align-top last:border-b-0"
                      >
                        <td className="py-2 pr-3">
                          <div className="break-all">
                            <div className="text-black">
                              {formatTalentNetworkEventName(item.eventType)}
                            </div>
                            <div className="text-[11px] text-black/45">
                              {item.eventType}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {item.uniqueUsers}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {item.totalClicks}
                        </td>
                        {variantColumns.map((variant) => {
                          const breakdown = item.variantBreakdown.find(
                            (entry) => entry.abtestType === variant.abtestType
                          );

                          return (
                            <td
                              key={`${item.eventType}-${variant.abtestType}`}
                              className="py-2 pr-3 text-right"
                            >
                              {breakdown
                                ? `${breakdown.uniqueUsers} / ${breakdown.totalClicks}`
                                : "0 / 0"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
