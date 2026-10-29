import { inspectManagedApplicationForm } from "@/lib/ops/applicationQuestionsAgents.server";
import {
  FORM_INSPECTION_TIMEOUT_MS,
} from "./applicationFormInspection";
import {
  isApplicationInspectionPending,
  type ApplicationForm,
} from "./applicationForm";
import {
  sessionOperation,
  saveSession,
  type SessionStoreArgs,
  type SessionRecord,
} from "./sessionStore";

// Persist the external inspection in the existing activity. A lease prevents two
// reloads from launching the same browser; results merge with the latest answers.
const LEASE_MS = 300_000;
export async function inspectCareerApplicationForm(rawUrl: unknown, signal = AbortSignal.timeout(FORM_INSPECTION_TIMEOUT_MS)): Promise<ApplicationForm> {
  const { inspectionHttpsUrl } = await import("@/lib/ops/applicationLinkResolution.server");
  if (typeof rawUrl !== "string") throw new Error("Application URL is required");
  return inspectManagedApplicationForm(inspectionHttpsUrl(rawUrl), signal);
}
export function needsApplicationInspection(
  record: SessionRecord,
  now = Date.now()
) {
  const job = record.state.applicationInspection;
  return (
    record.state.status === "active" &&
    record.state.analysisStatus !== "failed" && record.state.analysisStatus !== "cancelled" &&
    (job?.status === "queued" ||
      (job?.status === "running" &&
        now - Date.parse(job.startedAt ?? "1970-01-01") > (job.resolveOfficialLink ? LEASE_MS : FORM_INSPECTION_TIMEOUT_MS + 60_000)))
  );
}

async function mutateInspection(
  store: SessionStoreArgs,
  messageId: number,
  key: string,
  mutate: (record: SessionRecord) => boolean
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await sessionOperation({
      ...store,
      operation: "read",
      messageId,
    });
    if (!current || current.state.status !== "active") return current;
    const next = structuredClone(current);
    if (!mutate(next)) return current;
    try {
      return await saveSession(
        store,
        current,
        next.state,
        `${key}:${current.state.revision}`
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "Session revision conflict" ||
        attempt === 4
      )
        throw error;
    }
  }
  throw new Error("Application inspection update conflicted");
}

// An explicit read of the live form can refresh failed or stale observations.
// Reuse the existing lease for concurrent reads; never launch a submission.
export async function refreshApplicationInspection(
  store: SessionStoreArgs,
  messageId: number,
  sourceMessageId: number,
  inspect = inspectCareerApplicationForm
) {
  const runId = crypto.randomUUID();
  const key = `inspection:refresh:${sourceMessageId}:${runId}`;
  const queued = await mutateInspection(store, messageId, key, (record) => {
    const s = record.state;
    if (s.browser && ["queued", "running", "waiting"].includes(s.browser.status))
      throw new Error("Finish or stop the application browser before rechecking requirements");
    if (isApplicationInspectionPending(s)) return false;
    s.applicationInspection = { status: "queued", runId, resolveOfficialLink: false };
    if (s.preparation) {
      s.preparation.inputRevision++;
      s.preparation.finalDocumentId = null;
      s.preparation.finalDocumentFingerprint = null;
    }
    return true;
  });
  if (!queued || queued.state.status !== "active")
    throw new Error("Active application preparation required");
  const latest = await awaitApplicationInspection(store, queued, inspect);
  if (!latest || latest.state.status !== "active")
    throw new Error("Application preparation ended during inspection");
  return latest;
}

export async function runApplicationInspection(
  store: SessionStoreArgs,
  messageId: number,
  inspect = inspectCareerApplicationForm
) {
  const token = crypto.randomUUID();
  const claimed = await mutateInspection(
    store,
    messageId,
    `inspection:claim:${token}`,
    (record) => {
      if (!needsApplicationInspection(record)) return false;
      if (record.state.applicationInspection?.resolveOfficialLink && record.state.applicationInspection.status === "running") {
        // A lost worker must not silently restart the entire single-search budget.
        record.state.applicationInspection.status = "failed";
        record.state.applicationInspection.finishedAt = new Date().toISOString();
        record.state.applicationForm = {
          status: "unavailable", url: record.state.applicationUrl ?? "", checkedAt: new Date().toISOString(),
          fields: [], limitations: ["The application inspection was interrupted before its result was saved."],
          submission: { status: "unknown", reason: "Application access could not be verified." },
        };
        return true;
      }
      record.state.applicationInspection = {
        ...record.state.applicationInspection,
        status: "running",
        runId: token,
        startedAt: new Date().toISOString(),
      };
      return true;
    }
  );
  if (!claimed || claimed.state.applicationInspection?.runId !== token)
    return claimed;
  const started = Date.now();
  let form: ApplicationForm;
  try {
    // Browser lifetime belongs to the persisted job, not to a chat connection.
    if (claimed.state.applicationInspection?.resolveOfficialLink && claimed.state.applicationUrl && inspect === inspectCareerApplicationForm) {
      // Use the same single-search resolver exercised in Ops, including its
      // conditional company_roles URL update. No extra search/retry layer.
      const { runResolvedInspectionDebug } = await import("@/lib/ops/applicationLinkResolution.server");
      const result = await runResolvedInspectionDebug(claimed.state.applicationUrl, AbortSignal.timeout(240_000), () => {}, { inspect });
      form = result.form;
    } else form = await inspect(claimed.state.applicationUrl, AbortSignal.timeout(FORM_INSPECTION_TIMEOUT_MS));
  } catch (error) {
    console.error(
      "[application-inspection] failed",
      JSON.stringify({
        messageId,
        durationMs: Date.now() - started,
        name: error instanceof Error ? error.name : "Error",
        reason: error instanceof Error ? error.message : String(error),
      })
    );
    form = {
      status: "unavailable",
      url: claimed.state.applicationUrl ?? "",
      checkedAt: new Date().toISOString(),
      fields: [],
      limitations: ["The application requirements could not be verified."],
      submission: {
        status: "unknown",
        reason: "Public application access could not be verified.",
      },
    };
  }
  const saved = await mutateInspection(
    store,
    messageId,
    `inspection:result:${token}`,
    (record) => {
      if (record.state.applicationInspection?.runId !== token) return false;
      record.state.applicationForm = form;
      if (form.url) record.state.applicationUrl = form.url;
      record.state.applicationInspection = {
        ...record.state.applicationInspection,
        status:
          form.status === "unavailable" &&
          form.submission?.status !== "unsupported"
            ? "failed"
            : "completed",
        finishedAt: new Date().toISOString(),
      };
      return true;
    }
  );
  console.info(
    "[application-inspection] finished",
    JSON.stringify({
      messageId,
      durationMs: Date.now() - started,
      status: form.status,
      submission: form.submission?.status,
      fieldCount: form.fields.length,
    })
  );
  return saved;
}

// A submitted batch is durably saved before this wait. The caller refreshes its
// context with the returned record, so a faster user never outruns the inventory.
export async function awaitApplicationInspection<T extends SessionRecord>(
  store: SessionStoreArgs,
  record: T,
  inspect = inspectCareerApplicationForm
) {
  const deadline = Date.now() + LEASE_MS + 10_000;
  let latest: T | Awaited<ReturnType<typeof sessionOperation>> = record;
  while (
    latest?.state.status === "active" &&
    isApplicationInspectionPending(latest.state)
  ) {
    if (needsApplicationInspection(latest))
      await runApplicationInspection(store, latest.messageId, inspect);
    else await new Promise<void>((resolve) => setTimeout(resolve, 750));
    latest = await sessionOperation({
      ...store,
      operation: "read",
      messageId: record.messageId,
    });
    if (
      Date.now() > deadline &&
      latest &&
      isApplicationInspectionPending(latest.state)
    ) {
      throw new Error(
        "Application inspection is still pending; the submitted answers are saved"
      );
    }
  }
  return latest;
}
