import { cx, opsTheme } from "@/components/ops/theme";
import type {
  OpsOpportunityCandidateRecord,
  OpsOpportunityRecommendationRecord,
  OpsOpportunityRoleRecord,
  OpsOpportunityType,
} from "@/lib/opsOpportunity";
import { OPPORTUNITY_TYPE_LABEL } from "@/lib/opportunityType";
import { LoaderCircle, Sparkles } from "lucide-react";
import {
  EmptyState,
  formatShortDate,
  PanelHeader,
  RECOMMENDATION_FEEDBACK_LABEL,
  RoleOptionCard,
  SAVED_STAGE_LABEL,
  SearchInput,
  SelectionSummary,
  SOURCE_LABEL,
  STATUS_LABEL,
  TalentOptionCard,
  Token,
} from "./shared";

type TalentRecommendationViewProps = {
  generateRecommendationPending: boolean;
  onCreateRecommendation: () => void;
  onDeleteRecommendation: (recommendationId: string) => void;
  onGenerateRecommendationMemo: () => void;
  onOpenCandidateMailModal: (talent: OpsOpportunityCandidateRecord) => void;
  onOpenRecommendationPromptModal: () => void;
  onRecommendationMemoChange: (value: string) => void;
  onRecommendationOpportunityTypeChange: (type: OpsOpportunityType) => void;
  onRecommendationRoleSearchChange: (value: string) => void;
  onRecommendationRoleSelect: (roleId: string) => void;
  onRecommendationTalentInputChange: (value: string) => void;
  onRecommendationTalentSearch: () => void;
  onRecommendationTalentSelect: (talent: OpsOpportunityCandidateRecord) => void;
  onResetRecommendationSelection: () => void;
  recommendationMemo: string;
  recommendationOpportunityType: OpsOpportunityType;
  recommendationRoleOptions: OpsOpportunityRoleRecord[];
  recommendationRoleSearch: string;
  recommendationTalentInput: string;
  recommendationTalentLoading: boolean;
  recommendationTalentSearchQuery: string;
  recommendationTalents: OpsOpportunityCandidateRecord[];
  saveRecommendationPending: boolean;
  selectedRecommendationRole: OpsOpportunityRoleRecord | null;
  selectedRecommendationRoleId: string | null;
  selectedRecommendationTalent: OpsOpportunityCandidateRecord | null;
  talentRecommendations: OpsOpportunityRecommendationRecord[];
  talentRecommendationsLoading: boolean;
};

export default function TalentRecommendationView({
  generateRecommendationPending,
  onCreateRecommendation,
  onDeleteRecommendation,
  onGenerateRecommendationMemo,
  onOpenCandidateMailModal,
  onOpenRecommendationPromptModal,
  onRecommendationMemoChange,
  onRecommendationOpportunityTypeChange,
  onRecommendationRoleSearchChange,
  onRecommendationRoleSelect,
  onRecommendationTalentInputChange,
  onRecommendationTalentSearch,
  onRecommendationTalentSelect,
  onResetRecommendationSelection,
  recommendationMemo,
  recommendationOpportunityType,
  recommendationRoleOptions,
  recommendationRoleSearch,
  recommendationTalentInput,
  recommendationTalentLoading,
  recommendationTalentSearchQuery,
  recommendationTalents,
  saveRecommendationPending,
  selectedRecommendationRole,
  selectedRecommendationRoleId,
  selectedRecommendationTalent,
  talentRecommendations,
  talentRecommendationsLoading,
}: TalentRecommendationViewProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[320px_1fr_360px]">
      <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
        <PanelHeader title="talent 검색" />
        <SearchInput
          value={recommendationTalentInput}
          onChange={onRecommendationTalentInputChange}
          onEnter={onRecommendationTalentSearch}
          placeholder="talent 검색 후 Enter"
        />
        {!recommendationTalentSearchQuery ? (
          <EmptyState copy="검색어를 입력하고 Enter를 누르면 talent 목록이 나옵니다." />
        ) : recommendationTalentLoading ? (
          <EmptyState copy="talent 목록을 불러오는 중입니다." />
        ) : recommendationTalents.length === 0 ? (
          <EmptyState copy="조건에 맞는 talent가 없습니다." />
        ) : (
          <div className="space-y-2">
            {recommendationTalents.map((item) => (
              <TalentOptionCard
                key={item.talentId}
                item={item}
                active={item.talentId === selectedRecommendationTalent?.talentId}
                onSendMail={() => onOpenCandidateMailModal(item)}
                onSelect={() => onRecommendationTalentSelect(item)}
              />
            ))}
          </div>
        )}
      </div>

      <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
        <PanelHeader title="기회" />
        <div className="relative">
          <input
            value={recommendationRoleSearch}
            onChange={(event) =>
              onRecommendationRoleSearchChange(event.target.value)
            }
            placeholder="내부 / 외부 전체 기회 검색"
            className={opsTheme.input}
          />
        </div>
        <div className="space-y-2">
          {recommendationRoleOptions.length === 0 ? (
            <EmptyState copy="선택 가능한 기회가 없습니다." />
          ) : (
            recommendationRoleOptions.map((role) => (
              <RoleOptionCard
                key={role.roleId}
                role={role}
                active={role.roleId === selectedRecommendationRoleId}
                onSelect={() => onRecommendationRoleSelect(role.roleId)}
              />
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
          <PanelHeader title="현재 선택" />
          <SelectionSummary title="talent">
            {selectedRecommendationTalent ? (
              <>
                <div className="font-geist text-sm font-medium text-beige900">
                  {selectedRecommendationTalent.name ?? "Unnamed talent"}
                </div>
                <div className="text-xs text-beige900/55">
                  {selectedRecommendationTalent.headline ??
                    selectedRecommendationTalent.location ??
                    "-"}
                </div>
                {selectedRecommendationTalent.linkedinUrl ? (
                  <a
                    href={selectedRecommendationTalent.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cx(opsTheme.link, "text-xs")}
                  >
                    LinkedIn
                  </a>
                ) : null}
              </>
            ) : (
              <div className="font-geist text-sm text-beige900/55">
                talent를 고르세요.
              </div>
            )}
          </SelectionSummary>
          <SelectionSummary title="기회">
            {selectedRecommendationRole ? (
              <>
                <div className="font-geist text-sm font-medium text-beige900">
                  {selectedRecommendationRole.name}
                </div>
                <div className="text-xs text-beige900/55">
                  {selectedRecommendationRole.companyName}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Token>{SOURCE_LABEL[selectedRecommendationRole.sourceType]}</Token>
                  <Token>{STATUS_LABEL[selectedRecommendationRole.status]}</Token>
                </div>
              </>
            ) : (
              <div className="font-geist text-sm text-beige900/55">
                기회를 고르세요.
              </div>
            )}
          </SelectionSummary>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onGenerateRecommendationMemo}
              disabled={
                !selectedRecommendationRole ||
                !selectedRecommendationTalent ||
                generateRecommendationPending
              }
              className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
            >
              {generateRecommendationPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              추천 내용 작성
            </button>
            <button
              type="button"
              onClick={onOpenRecommendationPromptModal}
              className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
            >
              프롬프트 수정
            </button>
          </div>
          <textarea
            value={recommendationMemo}
            onChange={(event) => onRecommendationMemoChange(event.target.value)}
            placeholder="후보자에게 전달되는 메모"
            className={cx(opsTheme.textarea, "min-h-[108px] px-3 py-3")}
          />
          <div className="space-y-2">
            <div className="font-geist text-xs font-medium uppercase tracking-[0.12em] text-beige900/45">
              추천 타입
            </div>
            <div className="grid gap-2">
              {(Object.keys(OPPORTUNITY_TYPE_LABEL) as OpsOpportunityType[]).map(
                (type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onRecommendationOpportunityTypeChange(type)}
                    className={cx(
                      opsTheme.buttonSecondary,
                      "h-auto justify-start px-3 py-3 text-left",
                      recommendationOpportunityType === type &&
                        "border-beige900 bg-beige900 text-beige50 hover:bg-beige900/90"
                    )}
                  >
                    {OPPORTUNITY_TYPE_LABEL[type]}
                  </button>
                )
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreateRecommendation}
              disabled={
                !selectedRecommendationRole ||
                !selectedRecommendationTalent ||
                saveRecommendationPending
              }
              className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
            >
              {saveRecommendationPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              추천 추가
            </button>
            <button
              type="button"
              onClick={onResetRecommendationSelection}
              className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      <div className={cx(opsTheme.panel, "space-y-3 p-4 xl:col-span-3")}>
        <PanelHeader title="선택된 talent의 추천들" />
        {!selectedRecommendationTalent?.talentId ? (
          <EmptyState copy="talent를 선택하면 여기에 추천한 기회가 보입니다." />
        ) : talentRecommendationsLoading ? (
          <EmptyState copy="추천 목록을 불러오는 중입니다." />
        ) : talentRecommendations.length === 0 ? (
          <EmptyState copy="아직 추천된 기회가 없습니다." />
        ) : (
          <div className="space-y-2">
            {talentRecommendations.map((item) => (
              <div
                key={item.recommendationId}
                className={cx(opsTheme.panelSoft, "space-y-2 px-3 py-3")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-geist text-sm font-medium text-beige900">
                      {item.roleName}
                    </div>
                    <div className="mt-1 text-xs text-beige900/55">
                      {item.companyName}
                      {item.locationText ? ` · ${item.locationText}` : ""}
                      {item.postedAt ? ` · ${formatShortDate(item.postedAt)}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteRecommendation(item.recommendationId)}
                    className="rounded-md bg-white/80 px-2 py-1 text-[11px] text-beige900/75 transition hover:bg-white"
                  >
                    제거
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Token>{SOURCE_LABEL[item.sourceType]}</Token>
                  <Token>{OPPORTUNITY_TYPE_LABEL[item.opportunityType]}</Token>
                  {item.savedStage && <Token>{SAVED_STAGE_LABEL[item.savedStage]}</Token>}
                  {item.feedback && (
                    <Token>{RECOMMENDATION_FEEDBACK_LABEL[item.feedback]}</Token>
                  )}
                </div>
                {item.recommendationReasons.length > 0 && (
                  <div className="space-y-1 text-xs leading-5 text-beige900/60">
                    {item.recommendationReasons.map((reason, index) => (
                      <div
                        key={`${item.recommendationId}-${index}`}
                        className="whitespace-pre-wrap"
                      >
                        - {reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
