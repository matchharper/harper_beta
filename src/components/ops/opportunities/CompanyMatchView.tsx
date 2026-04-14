import { cx, opsTheme } from "@/components/ops/theme";
import type {
  OpsOpportunityCandidateRecord,
  OpsOpportunityMatchRecord,
  OpsOpportunityRoleRecord,
} from "@/lib/opsOpportunity";
import { ArrowLeftRight, LoaderCircle } from "lucide-react";
import {
  EmptyState,
  PanelHeader,
  RoleOptionCard,
  SearchInput,
  SelectionSummary,
  STATUS_LABEL,
  TalentOptionCard,
  Token,
  WORK_MODE_LABEL,
} from "./shared";

type CompanyMatchViewProps = {
  companyCandidates: OpsOpportunityCandidateRecord[];
  companyCandidateLoading: boolean;
  companyMemo: string;
  companyRoleSearch: string;
  companyTalentInput: string;
  companyTalentSearchQuery: string;
  internalRoleOptions: OpsOpportunityRoleRecord[];
  onCompanyMemoChange: (value: string) => void;
  onCompanyRoleSearchChange: (value: string) => void;
  onCompanyRoleSelect: (roleId: string) => void;
  onCompanyTalentInputChange: (value: string) => void;
  onCompanyTalentSearch: () => void;
  onCompanyTalentSelect: (talent: OpsOpportunityCandidateRecord) => void;
  onCreateCompanyMatch: () => void;
  onDeleteMatch: (candidId: string, roleId: string) => void;
  onOpenCandidateMailModal: (talent: OpsOpportunityCandidateRecord) => void;
  onResetSelection: () => void;
  roleMatches: OpsOpportunityMatchRecord[];
  roleMatchesLoading: boolean;
  saveMatchPending: boolean;
  selectedCompanyRole: OpsOpportunityRoleRecord | null;
  selectedCompanyRoleId: string | null;
  selectedCompanyTalent: OpsOpportunityCandidateRecord | null;
};

export default function CompanyMatchView({
  companyCandidates,
  companyCandidateLoading,
  companyMemo,
  companyRoleSearch,
  companyTalentInput,
  companyTalentSearchQuery,
  internalRoleOptions,
  onCompanyMemoChange,
  onCompanyRoleSearchChange,
  onCompanyRoleSelect,
  onCompanyTalentInputChange,
  onCompanyTalentSearch,
  onCompanyTalentSelect,
  onCreateCompanyMatch,
  onDeleteMatch,
  onOpenCandidateMailModal,
  onResetSelection,
  roleMatches,
  roleMatchesLoading,
  saveMatchPending,
  selectedCompanyRole,
  selectedCompanyRoleId,
  selectedCompanyTalent,
}: CompanyMatchViewProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[320px_1fr_360px]">
      <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
        <PanelHeader title="내부 기회" />
        <div className="relative">
          <input
            value={companyRoleSearch}
            onChange={(event) => onCompanyRoleSearchChange(event.target.value)}
            placeholder="internal role 검색"
            className={opsTheme.input}
          />
        </div>
        <div className="space-y-2">
          {internalRoleOptions.length === 0 ? (
            <EmptyState copy="선택 가능한 내부 기회가 없습니다." />
          ) : (
            internalRoleOptions.map((role) => (
              <RoleOptionCard
                key={role.roleId}
                role={role}
                active={role.roleId === selectedCompanyRoleId}
                onSelect={() => onCompanyRoleSelect(role.roleId)}
              />
            ))
          )}
        </div>
      </div>

      <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
        <PanelHeader title="talent 검색" />
        <SearchInput
          value={companyTalentInput}
          onChange={onCompanyTalentInputChange}
          onEnter={onCompanyTalentSearch}
          placeholder="talent 검색 후 Enter"
        />
        {!companyTalentSearchQuery ? (
          <EmptyState copy="검색어를 입력하고 Enter를 누르면 talent 목록이 나옵니다." />
        ) : companyCandidateLoading ? (
          <EmptyState copy="talent 목록을 불러오는 중입니다." />
        ) : companyCandidates.length === 0 ? (
          <EmptyState copy="조건에 맞는 talent가 없습니다." />
        ) : (
          <div className="space-y-2">
            {companyCandidates.map((item) => (
              <TalentOptionCard
                key={item.talentId}
                item={item}
                active={item.talentId === selectedCompanyTalent?.talentId}
                onSendMail={() => onOpenCandidateMailModal(item)}
                onSelect={() => onCompanyTalentSelect(item)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
          <PanelHeader title="현재 선택" />
          <SelectionSummary title="기회">
            {selectedCompanyRole ? (
              <>
                <div className="font-geist text-sm font-medium text-beige900">
                  {selectedCompanyRole.name}
                </div>
                <div className="text-xs text-beige900/55">
                  {selectedCompanyRole.companyName}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Token>{STATUS_LABEL[selectedCompanyRole.status]}</Token>
                  {selectedCompanyRole.workMode ? (
                    <Token>{WORK_MODE_LABEL[selectedCompanyRole.workMode]}</Token>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="font-geist text-sm text-beige900/55">
                내부 기회를 고르세요.
              </div>
            )}
          </SelectionSummary>
          <SelectionSummary title="talent">
            {selectedCompanyTalent ? (
              <>
                <div className="font-geist text-sm font-medium text-beige900">
                  {selectedCompanyTalent.name ?? "Unnamed talent"}
                </div>
                <div className="text-xs text-beige900/55">
                  {selectedCompanyTalent.headline ??
                    selectedCompanyTalent.location ??
                    "-"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCompanyTalent.candidId ? (
                    <Token>candid 연결됨</Token>
                  ) : (
                    <Token>candid 없음</Token>
                  )}
                </div>
                {selectedCompanyTalent.linkedinUrl ? (
                  <a
                    href={selectedCompanyTalent.linkedinUrl}
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
          <textarea
            value={companyMemo}
            onChange={(event) => onCompanyMemoChange(event.target.value)}
            placeholder="회사에게 전달되는 메모"
            className={cx(opsTheme.textarea, "min-h-[108px] px-3 py-3")}
          />
          {!selectedCompanyTalent?.candidId && selectedCompanyTalent ? (
            <div className="text-xs leading-5 text-beige900/50">
              이 talent는 linkedin 기반 candid 연결을 찾지 못해서 회사 전달용
              매칭으로는 아직 저장할 수 없습니다.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreateCompanyMatch}
              disabled={
                !selectedCompanyRole ||
                !selectedCompanyTalent?.candidId ||
                saveMatchPending
              }
              className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
            >
              {saveMatchPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-4 w-4" />
              )}
              매칭 추가
            </button>
            <button
              type="button"
              onClick={onResetSelection}
              className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      <div className={cx(opsTheme.panel, "space-y-3 p-4 xl:col-span-3")}>
        <PanelHeader title="선택된 role의 매칭들" />
        {!selectedCompanyRoleId ? (
          <EmptyState copy="기회를 선택하면 여기에 연결된 후보자가 보입니다." />
        ) : roleMatchesLoading ? (
          <EmptyState copy="매칭 목록을 불러오는 중입니다." />
        ) : roleMatches.length === 0 ? (
          <EmptyState copy="아직 연결된 후보자가 없습니다." />
        ) : (
          <div className="space-y-2">
            {roleMatches.map((item) => (
              <div
                key={`${item.roleId}-${item.candidateId}`}
                className={cx(opsTheme.panelSoft, "space-y-2 px-3 py-3")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-geist text-sm font-medium text-beige900">
                      {item.candidateName ?? "Unnamed candidate"}
                    </div>
                    <div className="mt-1 text-xs text-beige900/55">
                      {item.candidateHeadline ?? item.candidateLocation ?? "-"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteMatch(item.candidateId, item.roleId)}
                    className="rounded-md bg-white/80 px-2 py-1 text-[11px] text-beige900/75 transition hover:bg-white"
                  >
                    제거
                  </button>
                </div>
                {item.harperMemo && (
                  <div className="text-xs leading-5 text-beige900/60">
                    {item.harperMemo}
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
