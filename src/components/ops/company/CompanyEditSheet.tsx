import { Dialog } from "@/components/ui/dialog";
import { CompanySidePanelContent } from "./CompanySidePanelContent";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OpsOpportunityWorkspaceRecord } from "@/lib/ops/opportunity";
import { LoaderCircle, Save } from "lucide-react";
import type { FormEvent } from "react";

export type CompanyEditDraft = {
  careerUrl: string;
  companyDescription: string;
  companyName: string;
  homepageUrl: string;
  linkedinUrl: string;
  logoUrl: string;
  pitch: string;
  publishedName: string;
  request: string;
};

export function workspaceToCompanyEditDraft(
  workspace: OpsOpportunityWorkspaceRecord
): CompanyEditDraft {
  return {
    careerUrl: workspace.careerUrl ?? "",
    companyDescription: workspace.companyDescription ?? "",
    companyName: workspace.companyName,
    homepageUrl: workspace.homepageUrl ?? "",
    linkedinUrl: workspace.linkedinUrl ?? "",
    logoUrl: workspace.logoUrl ?? "",
    pitch: workspace.pitch ?? "",
    publishedName: workspace.publishedName ?? "",
    request: workspace.request ?? "",
  };
}

const fieldClassName = "flex flex-col gap-2";

export function CompanyEditSheet({
  draft,
  initialDraft,
  onChange,
  onClose,
  onSubmit,
  open,
  pending,
}: {
  draft: CompanyEditDraft;
  initialDraft: CompanyEditDraft;
  onChange: (draft: CompanyEditDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
}) {
  if (!open) return null;

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const canSubmit = hasChanges && Boolean(draft.companyName.trim()) && !pending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) onClose();
      }}
    >
      <CompanySidePanelContent
        title="회사 정보 수정"
        description={initialDraft.companyName}
        hideCloseButton={pending}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("company-edit-trigger")?.focus();
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
            <section className="space-y-4">
              <div>
                <div className={opsTheme.label}>기본 정보</div>
                <p className="mt-1 text-xs leading-5 text-neutral-muted">
                  회사 목록과 회사 조직 화면에 표시되는 기본 정보입니다.
                </p>
              </div>
              <label className={fieldClassName}>
                <span className={opsTheme.label}>회사명</span>
                <Input
                  value={draft.companyName}
                  onChange={(event) =>
                    onChange({ ...draft, companyName: event.target.value })
                  }
                  autoFocus
                  maxLength={200}
                  required
                />
              </label>
              <label className={fieldClassName}>
                <span className={opsTheme.label}>공개 회사명</span>
                <Input
                  value={draft.publishedName}
                  onChange={(event) =>
                    onChange({ ...draft, publishedName: event.target.value })
                  }
                  maxLength={200}
                  placeholder="외부에 표시할 회사명"
                />
                <span className="text-xs leading-5 text-neutral-muted">
                  비워두면 공개 회사명을 사용하지 않습니다.
                </span>
              </label>
              <label className={fieldClassName}>
                <span className={opsTheme.label}>로고 URL</span>
                <Input
                  value={draft.logoUrl}
                  onChange={(event) =>
                    onChange({ ...draft, logoUrl: event.target.value })
                  }
                  inputMode="url"
                  placeholder="https://example.com/logo.png"
                />
              </label>
            </section>

            <section className="space-y-4 border-t border-neutral-1000-a05 pt-6">
              <div>
                <div className={opsTheme.label}>회사 소개</div>
                <p className="mt-1 text-xs leading-5 text-neutral-muted">
                  인재 추천과 회사 소개에 활용되는 핵심 문구입니다.
                </p>
              </div>
              <label className={fieldClassName}>
                <span className={opsTheme.label}>회사 매력 소개</span>
                <Textarea
                  value={draft.pitch}
                  onChange={(event) =>
                    onChange({ ...draft, pitch: event.target.value })
                  }
                  rows={5}
                  className="resize-y"
                  placeholder="회사의 강점, 성장성, 팀과 제품의 매력을 적어주세요."
                />
                <span className="text-xs leading-5 text-neutral-muted">
                  후보자에게 회사를 매력적으로 소개할 때 사용할 내용입니다.
                </span>
              </label>
              <label className={fieldClassName}>
                <span className={opsTheme.label}>회사 설명</span>
                <Textarea
                  value={draft.companyDescription}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      companyDescription: event.target.value,
                    })
                  }
                  rows={7}
                  className="resize-y"
                  placeholder="회사가 해결하는 문제와 제품, 비즈니스를 설명해 주세요."
                />
                <span className="text-xs leading-5 text-neutral-muted">
                  회사에 대한 객관적인 설명을 3~5문장 정도로 적어주세요.
                </span>
              </label>
            </section>

            <section className="space-y-4 border-t border-neutral-1000-a05 pt-6">
              <div>
                <div className={opsTheme.label}>링크</div>
                <p className="mt-1 text-xs leading-5 text-neutral-muted">
                  공개 회사 정보와 채용 정보를 확인할 수 있는 주소입니다.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>홈페이지 URL</span>
                  <Input
                    value={draft.homepageUrl}
                    onChange={(event) =>
                      onChange({ ...draft, homepageUrl: event.target.value })
                    }
                    inputMode="url"
                    placeholder="https://example.com"
                  />
                </label>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>채용 페이지 URL</span>
                  <Input
                    value={draft.careerUrl}
                    onChange={(event) =>
                      onChange({ ...draft, careerUrl: event.target.value })
                    }
                    inputMode="url"
                    placeholder="https://example.com/careers"
                  />
                </label>
              </div>
              <label className={fieldClassName}>
                <span className={opsTheme.label}>LinkedIn URL</span>
                <Input
                  value={draft.linkedinUrl}
                  onChange={(event) =>
                    onChange({ ...draft, linkedinUrl: event.target.value })
                  }
                  inputMode="url"
                  placeholder="https://www.linkedin.com/company/example"
                />
              </label>
            </section>

            <section className="space-y-4 border-t border-neutral-1000-a05 pt-6">
              <div>
                <div className={opsTheme.label}>내부 메모</div>
                <p className="mt-1 text-xs leading-5 text-neutral-muted">
                  회사가 전달한 요청사항이나 운영 참고 내용을 기록합니다.
                </p>
              </div>
              <label className={fieldClassName}>
                <span className="sr-only">Request</span>
                <Textarea
                  value={draft.request}
                  onChange={(event) =>
                    onChange({ ...draft, request: event.target.value })
                  }
                  rows={5}
                  className="resize-y"
                  placeholder="회사 요청사항 또는 운영 메모"
                />
              </label>
            </section>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-neutral-1000-a05 bg-bg-default px-5 py-4 sm:px-6">
            <span className="text-xs text-neutral-muted">
              {hasChanges
                ? "저장되지 않은 변경사항이 있습니다."
                : "변경사항 없음"}
            </span>
            <div className="flex items-center gap-2">
              <MuteButton
                type="button"
                onClick={onClose}
                disabled={pending}
                className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
              >
                취소
              </MuteButton>
              <MuteButton
                type="submit"
                disabled={!canSubmit}
                className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
              >
                {pending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                저장
              </MuteButton>
            </div>
          </div>
        </form>
      </CompanySidePanelContent>
    </Dialog>
  );
}
