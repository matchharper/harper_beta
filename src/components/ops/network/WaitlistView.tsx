import { cx, opsTheme } from "@/components/ops/theme";
import type {
  NetworkLeadDetailResponse,
  NetworkLeadSummary,
} from "@/lib/opsNetwork";
import { getTalentEngagementLabels } from "@/lib/talentNetworkOptions";
import { Mail } from "lucide-react";
import {
  Badge,
  externalLinkValue,
  formatKst,
  formatTalentInsightLabel,
  InfoRow,
  NetworkLeadProgressTrack,
} from "./shared";

type WaitlistViewProps = {
  detail: NetworkLeadDetailResponse | undefined;
  displayedLead: NetworkLeadSummary;
};

export default function WaitlistView({
  detail,
  displayedLead,
}: WaitlistViewProps) {
  return (
    <div className="space-y-4">
      <div className={cx(opsTheme.panelSoft, "p-4")}>
        <div className={opsTheme.eyebrow}>핵심 상태</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge>{displayedLead.hasCv ? "CV 있음" : "CV 없음"}</Badge>
          {displayedLead.selectedRole ? (
            <Badge>{displayedLead.selectedRole}</Badge>
          ) : null}
        </div>
      </div>

      <div className={cx(opsTheme.panelSoft, "p-4")}>
        <div className={opsTheme.eyebrow}>온보딩 단계</div>
        <div className="mt-3">
          <NetworkLeadProgressTrack
            progress={displayedLead.progress}
            structuredReady={displayedLead.hasStructuredProfile}
          />
        </div>
      </div>

      <div className={cx(opsTheme.panelSoft, "px-4 py-2")}>
        <div className="divide-y divide-beige900/10">
          <InfoRow
            label="이메일"
            value={
              displayedLead.email ? (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-beige900/35" />
                  <span>{displayedLead.email}</span>
                </div>
              ) : (
                "-"
              )
            }
          />
          <InfoRow
            label="제출 시각"
            value={formatKst(displayedLead.submittedAt)}
          />
          <InfoRow
            label="생성 시각"
            value={formatKst(displayedLead.createdAt)}
          />
          <InfoRow
            label="Engagement"
            value={
              displayedLead.engagementTypes.length > 0
                ? displayedLead.engagementTypes.join(", ")
                : "-"
            }
          />
          <InfoRow
            label="Profile Inputs"
            value={
              displayedLead.profileInputTypes.length > 0
                ? displayedLead.profileInputTypes.join(", ")
                : "-"
            }
          />
          <InfoRow
            label="LinkedIn"
            value={externalLinkValue(displayedLead.linkedinProfileUrl)}
          />
          <InfoRow
            label="Personal Website"
            value={externalLinkValue(displayedLead.personalWebsiteUrl)}
          />
          <InfoRow
            label="GitHub / HF"
            value={externalLinkValue(displayedLead.githubProfileUrl)}
          />
          <InfoRow
            label="Scholar"
            value={externalLinkValue(displayedLead.scholarProfileUrl)}
          />
          <InfoRow
            label="Impact Summary"
            value={
              displayedLead.impactSummary ? (
                <div className="whitespace-pre-wrap">
                  {displayedLead.impactSummary}
                </div>
              ) : (
                "-"
              )
            }
          />
          <InfoRow
            label="Dream Teams"
            value={
              displayedLead.dreamTeams ? (
                <div className="whitespace-pre-wrap">
                  {displayedLead.dreamTeams}
                </div>
              ) : (
                "-"
              )
            }
          />
          <InfoRow label="Local ID" value={displayedLead.localId ?? "-"} />
        </div>
      </div>

      {detail?.latestTalentSetting || detail?.latestTalentInsights ? (
        <div className={cx(opsTheme.panelSoft, "px-4 py-2")}>
          <div className="divide-y divide-beige900/10">
            <InfoRow
              label="선호 형태"
              value={
                detail?.latestTalentSetting &&
                detail.latestTalentSetting.engagement_types.length > 0
                  ? getTalentEngagementLabels(
                      detail.latestTalentSetting.engagement_types
                    ).join(", ")
                  : "-"
              }
            />
            {detail?.latestTalentInsights &&
            Object.keys(detail.latestTalentInsights).length > 0 ? (
              Object.entries(detail.latestTalentInsights)
                .filter(([, value]) => value?.trim())
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, value]) => (
                  <InfoRow
                    key={key}
                    label={formatTalentInsightLabel(key)}
                    value={<div className="whitespace-pre-wrap">{value}</div>}
                  />
                ))
            ) : (
              <InfoRow label="Harper insight" value="-" />
            )}
          </div>
        </div>
      ) : null}

      <div className={cx(opsTheme.panelSoft, "p-4")}>
        <div className={opsTheme.eyebrow}>원본 payload</div>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-6 text-beige900/70">
          {JSON.stringify(displayedLead.rawPayload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
