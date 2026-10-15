import RichText from "@/components/ui/rich-text";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import type { ApplicationDraft } from "@/lib/career/simulation/preparation";
import { useApplicationPreparation } from "./ApplicationPreparationContext";
import { PreparationDocumentPicker } from "./ApplicationPreparationComposer";
export function ApplicationDraftReview({
  draft,
  messageId,
}: {
  draft: ApplicationDraft;
  messageId: number;
}) {
  const t = useCareerT();
  const { record, pending, error, command } = useApplicationPreparation();
  const s = record?.state,
    p = s?.preparation;
  const latest =
    record?.messageId === draft.sessionMessageId &&
    p?.draftMessageId === messageId;
  const usable =
    latest &&
    s?.status === "active" &&
    p?.inputRevision === draft.inputRevision &&
    p.generation.status === "ready";
  return (
    <section className="max-w-[740px] space-y-4 rounded-xl border border-neutral-1000-a10 bg-bg-floating p-4">
      <p className="font-medium">
        {t("career.prep.draftTitle", "지원 문서 전체 초안")} · {draft.roleName}{" "}
        · v{draft.draftVersion}
      </p>
      <details open={latest}>
        <summary className="cursor-pointer text-sm">
          {t("career.prep.resumeDraft", "전체 이력서 수정안")}
        </summary>
        <RichText variant="career" content={draft.content.resume} />
      </details>
      {draft.content.materials.map((m) => (
        <details key={m.itemId} open={latest}>
          <summary className="cursor-pointer text-sm">{m.title}</summary>
          <RichText variant="career" content={m.content} />
        </details>
      ))}
      {draft.content.notes && (
        <RichText variant="career" content={draft.content.notes} />
      )}
      {latest && (
        <>
          <p className="text-sm text-neutral-muted">
            {t(
              "career.prep.noSubmission",
              "현재는 초안 검토와 최종 파일 준비까지 지원합니다. 파일 자동 편집·변환 및 실제 지원 제출은 아직 연결되지 않았어요."
            )}
          </p>
          {p?.inputRevision !== draft.inputRevision && (
            <p className="text-sm text-info">
              {t(
                "career.prep.outdated",
                "입력이 변경됐어요. 최신 내용으로 초안을 다시 만들어 주세요."
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <MuteButton
              variant="primary"
              disabled={
                pending || !usable || p?.approvedVersion === draft.draftVersion
              }
              onClick={() =>
                void command({
                  operation: "approve",
                  draftVersion: draft.draftVersion,
                })
              }
            >
              {p?.approvedVersion === draft.draftVersion
                ? t("career.prep.approved", "초안 승인됨")
                : t("career.prep.confirm", "확인하고 지원")}
            </MuteButton>
          </div>
          {p?.approvedVersion === draft.draftVersion && (
            <div className="space-y-3 rounded-lg bg-bg-weak p-3">
              <p className="text-sm">
                {t(
                  "career.prep.finalFile",
                  "수정안을 직접 반영한 최종 이력서를 첨부해 주세요. 파일을 연결해도 지원은 제출되지 않습니다."
                )}
              </p>
              <PreparationDocumentPicker
                resume
                selectedId={p.finalDocumentId ?? undefined}
                disabled={pending}
                onPick={async (id) => {
                  await command({ operation: "attach", documentId: id });
                }}
              />
              {p.finalDocumentId && (
                <p className="text-sm text-positive">
                  {t(
                    "career.prep.fileReady",
                    "최종 파일이 연결됐어요. 실제 지원은 아직 제출되지 않았어요."
                  )}
                </p>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
