import TalentCareerModal from "@/components/common/TalentCareerModal";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT,
  OPS_TALENT_RECOMMENDATION_PROMPT_PLACEHOLDERS,
} from "@/lib/opsOpportunityRecommendationPrompt";
import type {
  OpsOpportunityCandidateRecord,
  OpportunityEmploymentType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/opsOpportunity";
import { LoaderCircle, Mail, Save } from "lucide-react";
import {
  ActionButton,
  type CandidateMailDraft,
  EMPLOYMENT_LABEL,
  type RoleDraft,
  STATUS_LABEL,
  toggleEmploymentType,
  ToggleGrid,
  WORK_MODE_LABEL,
  type WorkspaceDraft,
} from "./shared";

export function CandidateMailModal({
  draft,
  onChange,
  onClose,
  onSubmit,
  pending,
  talent,
}: {
  draft: CandidateMailDraft;
  onChange: (next: CandidateMailDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  talent: OpsOpportunityCandidateRecord | null;
}) {
  if (!talent) return null;

  return (
    <TalentCareerModal
      open={Boolean(talent)}
      onClose={onClose}
      title="후보자에게 메일 보내기"
      description=""
      panelClassName="max-w-[720px] border border-beige900/10 bg-beige50"
      bodyClassName="bg-beige50 px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={
              pending ||
              !draft.fromEmail.trim() ||
              !draft.subject.trim() ||
              !draft.content.trim()
            }
            className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
          >
            {pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            보내기
          </button>
        </div>
      }
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
    >
      <div className="space-y-4">
        <div className={cx(opsTheme.panelSoft, "space-y-2 px-4 py-4")}>
          <div className="font-geist text-[11px] text-beige900/40">
            받는 사람
          </div>
          <div className="font-geist text-sm text-beige900">
            {talent.name ?? "Unnamed talent"}
          </div>
          <div className="font-geist text-xs text-beige900/55">
            {talent.email ?? "등록된 이메일 없음"}
          </div>
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>보내는 사람</div>
          <input
            value={draft.fromEmail}
            onChange={(event) =>
              onChange({
                ...draft,
                fromEmail: event.target.value,
              })
            }
            className={opsTheme.input}
            placeholder="sender@matchharper.com"
          />
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>제목</div>
          <input
            value={draft.subject}
            onChange={(event) =>
              onChange({
                ...draft,
                subject: event.target.value,
              })
            }
            className={opsTheme.input}
            placeholder="메일 제목"
          />
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>내용</div>
          <textarea
            value={draft.content}
            onChange={(event) =>
              onChange({
                ...draft,
                content: event.target.value,
              })
            }
            className={cx(opsTheme.textarea, "min-h-[220px]")}
            placeholder="보낼 내용을 입력하세요."
          />
        </div>
      </div>
    </TalentCareerModal>
  );
}

export function RecommendationPromptModal({
  onChange,
  onClose,
  onReset,
  onSave,
  open,
  value,
}: {
  onChange: (value: string) => void;
  onClose: () => void;
  onReset: () => void;
  onSave: () => void;
  open: boolean;
  value: string;
}) {
  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      title="추천 문구 프롬프트 수정"
      description=""
      panelClassName="max-w-[880px] border border-beige900/10 bg-beige50"
      bodyClassName="bg-beige50 px-5 py-5"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onReset}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
          >
            기본값 복원
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
            >
              취소
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!value.trim()}
              className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
            >
              저장
            </button>
          </div>
        </div>
      }
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
    >
      <div className="space-y-4">
        <div className={cx(opsTheme.panelSoft, "space-y-2 px-4 py-4")}>
          <div className="font-geist text-sm text-beige900/75">
            프롬프트는 브라우저 로컬 스토리지에 저장됩니다.
          </div>
          <div className="text-xs leading-5 text-beige900/55">
            아래 placeholder를 유지하면 선택된 후보자/role 정보가 자동으로
            들어갑니다.
          </div>
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>프롬프트</div>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={cx(opsTheme.textarea, "min-h-[320px]")}
            placeholder={DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT}
          />
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>사용 가능한 placeholder</div>
          <div className="grid gap-2 md:grid-cols-2">
            {OPS_TALENT_RECOMMENDATION_PROMPT_PLACEHOLDERS.map((item) => (
              <div
                key={item.key}
                className={cx(opsTheme.panelSoft, "space-y-1 px-3 py-3")}
              >
                <div className="font-geist text-xs font-medium text-beige900">
                  {item.key}
                </div>
                <div className="text-xs leading-5 text-beige900/55">
                  {item.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TalentCareerModal>
  );
}

export function WorkspaceCreateModal({
  draft,
  onChange,
  onClose,
  onSubmit,
  open,
  pending,
}: {
  draft: WorkspaceDraft;
  onChange: (next: WorkspaceDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
}) {
  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      title="회사 추가"
      description=""
      panelClassName="max-w-[720px] border border-beige900/10 bg-beige50"
      bodyClassName="bg-beige50 px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || !draft.companyName.trim()}
            className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
          >
            {pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            저장
          </button>
        </div>
      }
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>회사명</div>
          <input
            value={draft.companyName}
            onChange={(event) =>
              onChange({
                ...draft,
                companyName: event.target.value,
              })
            }
            placeholder="회사명"
            className={opsTheme.input}
          />
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>홈페이지</div>
          <input
            value={draft.homepageUrl}
            onChange={(event) =>
              onChange({
                ...draft,
                homepageUrl: event.target.value,
              })
            }
            placeholder="homepage"
            className={opsTheme.input}
          />
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>LinkedIn</div>
          <input
            value={draft.linkedinUrl}
            onChange={(event) =>
              onChange({
                ...draft,
                linkedinUrl: event.target.value,
              })
            }
            placeholder="linkedin company url"
            className={opsTheme.input}
          />
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>소개</div>
          <textarea
            value={draft.companyDescription}
            onChange={(event) =>
              onChange({
                ...draft,
                companyDescription: event.target.value,
              })
            }
            placeholder="간단한 소개"
            className={cx(opsTheme.textarea, "min-h-[140px] px-3 py-3")}
          />
        </div>
      </div>
    </TalentCareerModal>
  );
}

export function RoleCreateModal({
  draft,
  onChange,
  onClose,
  onSubmit,
  open,
  pending,
  workspaceName,
}: {
  draft: RoleDraft;
  onChange: (next: RoleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
  workspaceName: string | null;
}) {
  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      title="기회 추가"
      description=""
      panelClassName="max-w-[860px] border border-beige900/10 bg-beige50"
      bodyClassName="bg-beige50 px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || !draft.name.trim()}
            className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
          >
            {pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            저장
          </button>
        </div>
      }
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
    >
      <div className="space-y-4">
        <div className={cx(opsTheme.panelSoft, "space-y-1 px-4 py-3")}>
          <div className="font-geist text-[11px] text-beige900/40">
            연결 회사
          </div>
          <div className="font-geist text-sm text-beige900">
            {workspaceName ?? "선택된 회사 없음"}
          </div>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Role Title</div>
          <input
            value={draft.name}
            onChange={(event) =>
              onChange({
                ...draft,
                name: event.target.value,
              })
            }
            placeholder="role title"
            className={opsTheme.input}
          />
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Source Type</div>
          <ToggleGrid>
            <ActionButton
              active={draft.sourceType === "internal"}
              onClick={() =>
                onChange({
                  ...draft,
                  sourceType: "internal",
                })
              }
            >
              내부
            </ActionButton>
            <ActionButton
              active={draft.sourceType === "external"}
              onClick={() =>
                onChange({
                  ...draft,
                  sourceType: "external",
                })
              }
            >
              외부
            </ActionButton>
          </ToggleGrid>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Status</div>
          <ToggleGrid>
            {(Object.keys(STATUS_LABEL) as OpportunityStatus[]).map(
              (status) => (
                <ActionButton
                  key={status}
                  active={draft.status === status}
                  onClick={() =>
                    onChange({
                      ...draft,
                      status,
                    })
                  }
                >
                  {STATUS_LABEL[status]}
                </ActionButton>
              )
            )}
          </ToggleGrid>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Employment Type</div>
          <ToggleGrid>
            {(Object.keys(EMPLOYMENT_LABEL) as OpportunityEmploymentType[]).map(
              (type) => (
                <ActionButton
                  key={type}
                  active={draft.employmentTypes.includes(type)}
                  onClick={() =>
                    onChange({
                      ...draft,
                      employmentTypes: toggleEmploymentType(
                        draft.employmentTypes,
                        type
                      ),
                    })
                  }
                >
                  {EMPLOYMENT_LABEL[type]}
                </ActionButton>
              )
            )}
          </ToggleGrid>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Work Mode</div>
          <ToggleGrid>
            <ActionButton
              active={draft.workMode === null}
              onClick={() =>
                onChange({
                  ...draft,
                  workMode: null,
                })
              }
            >
              미정
            </ActionButton>
            {(Object.keys(WORK_MODE_LABEL) as OpportunityWorkMode[]).map(
              (mode) => (
                <ActionButton
                  key={mode}
                  active={draft.workMode === mode}
                  onClick={() =>
                    onChange({
                      ...draft,
                      workMode: mode,
                    })
                  }
                >
                  {WORK_MODE_LABEL[mode]}
                </ActionButton>
              )
            )}
          </ToggleGrid>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Source Provider</div>
            <input
              value={draft.sourceProvider}
              onChange={(event) =>
                onChange({
                  ...draft,
                  sourceProvider: event.target.value,
                })
              }
              placeholder="source provider"
              className={opsTheme.input}
            />
          </div>
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Source Job ID</div>
            <input
              value={draft.sourceJobId}
              onChange={(event) =>
                onChange({
                  ...draft,
                  sourceJobId: event.target.value,
                })
              }
              placeholder="source job id"
              className={opsTheme.input}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>External JD URL</div>
          <input
            value={draft.externalJdUrl}
            onChange={(event) =>
              onChange({
                ...draft,
                externalJdUrl: event.target.value,
              })
            }
            placeholder="external jd url"
            className={opsTheme.input}
          />
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Location</div>
            <input
              value={draft.locationText}
              onChange={(event) =>
                onChange({
                  ...draft,
                  locationText: event.target.value,
                })
              }
              placeholder="location"
              className={opsTheme.input}
            />
          </div>
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Posted At</div>
            <input
              value={draft.postedAt}
              onChange={(event) =>
                onChange({
                  ...draft,
                  postedAt: event.target.value,
                })
              }
              placeholder="posted at / YYYY-MM-DD"
              className={opsTheme.input}
            />
          </div>
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Expires At</div>
            <input
              value={draft.expiresAt}
              onChange={(event) =>
                onChange({
                  ...draft,
                  expiresAt: event.target.value,
                })
              }
              placeholder="expires at / YYYY-MM-DD"
              className={opsTheme.input}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Description</div>
          <textarea
            value={draft.description}
            onChange={(event) =>
              onChange({
                ...draft,
                description: event.target.value,
              })
            }
            placeholder="role description"
            className={cx(opsTheme.textarea, "min-h-[220px] px-3 py-3")}
          />
        </div>
      </div>
    </TalentCareerModal>
  );
}
