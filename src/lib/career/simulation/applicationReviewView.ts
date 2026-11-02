import type { SessionRecord } from "./sessionStore";
import { applicationSubmissionState } from "./applicationExecution";
import { applicationReviewMatchesForm } from "./applicationReview";
import {
  applicationQuestionItems,
  pendingApplicationBatch,
} from "./applicationInput";

export function applicationReviewView(record: SessionRecord) {
  const s = record.state,
    batch = pendingApplicationBatch(s),
    browser = s.browser;
  return {
    messageId: record.messageId,
    revision: s.revision,
    status: s.status,
    roleName: s.roleName,
    roleId: s.activity?.roleId ?? (s.roleRef.startsWith("role:") ? s.roleRef.slice(5) : undefined),
    analysisStatus: s.analysisStatus,
    inspectionStatus: s.applicationInspection?.status,
    submissionAccess: s.applicationForm?.submission?.status ?? "unknown",
    submissionState: applicationSubmissionState(s),
    workingResumeDocumentId: s.preparation?.workingResume?.documentId ?? null,
    review: s.applicationReview ?? null,
    reviewCurrent: applicationReviewMatchesForm(s),
    preparationPending: Boolean(batch && !batch.browser) || Boolean(s.preparation?.applicationFollowUp && s.preparation.applicationFollowUp.status !== "done"),
    ready: Boolean(s.preparation?.finalDocumentId),
    applicationUrl: s.applicationUrl,
    resumeDocumentId:
      s.preparation?.finalDocumentId ??
      s.preparation?.workingResume?.documentId ??
      s.documentId,
    browser: browser
      ? {
          id: browser.id,
          status: browser.status,
          stage: browser.stage,
          result: browser.result,
          updatedAt: browser.updatedAt,
          approval: browser.approval
            ? {
                summary: browser.approval.summary,
                approved: browser.approval.approved,
                executed: browser.approval.executed,
              }
            : undefined,
          progress: browser.progress,
          transmissionAttemptedAt: browser.transmissionAttemptedAt,
          // Credentials, request bodies and browser session tokens stay server-side.
          request: browser.pendingRequest
            ? {
                url: browser.pendingRequest.url,
                fields: browser.pendingRequest.fields,
              }
            : undefined,
          files: browser.files?.map((file) => ({
            documentId: file.documentId,
            name: file.name,
            contentHash: file.contentHash,
          })),
          reviewedApplication: browser.reviewedApplication,
        }
      : null,
    batch: batch?.browser
      ? {
          id: batch.id,
          kind: batch.browser.kind,
          review: batch.review,
          items: applicationQuestionItems(s),
        }
      : null,
  };
}
export type ApplicationReviewView = ReturnType<typeof applicationReviewView>;
