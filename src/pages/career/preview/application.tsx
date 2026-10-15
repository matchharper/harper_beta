import fixture from "@/lib/career/simulation/fixtures/applicationPreview.json";
import React, { useState } from "react";
import type { GetServerSideProps } from "next";
import { MessagesProvider } from "@/i18n/useMessage";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApplicationPreparationContext } from "@/components/career/chat/ApplicationPreparationContext";
import {
  ApplicationPreparationComposer,
  ApplicationPreparationReopen,
} from "@/components/career/chat/ApplicationPreparationComposer";
import { ApplicationQuestionHistoryRow } from "@/components/career/chat/ApplicationQuestionHistoryRow";
import { ApplicationStartCard } from "@/components/career/chat/ApplicationStartCard";
import { ApplicationSimulationCard } from "@/components/career/chat/elements/ApplicationSimulationCard";
import { createSimulationSession, mutateSimulationSession } from "@/lib/career/simulation/session";
import { createPreparation } from "@/lib/career/simulation/preparation";
import {
  suggestionAction,
  suggestionBatchSchema,
  type ApplicationSuggestion,
} from "@/lib/career/simulation/suggestionSchema";
import {
  askApplicationInput,
  pendingApplicationBatch,
} from "@/lib/career/simulation/applicationInput";
import {
  projectLocalAnswers,
  type LocalQuestionAnswers,
} from "@/lib/career/simulation/localQuestionAnswers";
function initial(suggestions?: ApplicationSuggestion[]) {
  const s = createSimulationSession({
    roleName: "Example Labs · Software Engineer",
    roleRef: "job:local-preview",
    documentId: "preview-resume",
    documentName: fixture.text0,
  });
  s.analysisStatus = "completed";
  s.preparation = createPreparation();
  s.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  s.actions = suggestions
    ? suggestions.map((s) => suggestionAction(s))
    : [
        suggestionAction(
          {
            kind: "change",
            title: fixture.text1,
            reason: fixture.text2,
            edits: [
              {
                target: fixture.text3,
                originalText: fixture.text4,
                suggestedText: fixture.text5,
              },
            ],
          },
          "change"
        ),
        suggestionAction(
          { kind: "question", title: fixture.text6, reason: fixture.text7 },
          "question"
        ),
        suggestionAction(
          {
            kind: "material",
            title: fixture.text8,
            reason: fixture.text9,
            applicationField: "Why this role?",
            draftText: fixture.text10,
          },
          "material"
        ),
      ];
  return {
    messageId: 10,
    state: s.actions.length
      ? askApplicationInput(
          s,
          {
            purpose: "suggestions",
            items: s.actions.map((a) => ({ actionId: a.id })),
          },
          "preview"
        )
      : { ...s, preparation: { ...s.preparation!, showInputs: false } },
  };
}
function Preview() {
  const [source, setSource] = useState(initial),
    [local, setLocal] = useState<LocalQuestionAnswers | null>(null),
    [view, setView] = useState<
      "start" | "progress" | "suggestions" | "history"
    >("suggestions"),
    [phase, setPhase] = useState(0),
    [loadError, setLoadError] = useState("");
  const record = projectLocalAnswers(source, local),
    batch = pendingApplicationBatch(source.state);
  return (
    <main className="min-h-dvh bg-bg-basement text-neutral-primary px-4 py-6">
      <div className="mx-auto flex max-w-[740px] flex-col gap-5">
        <nav className="flex flex-wrap gap-2">
          {(["start", "progress", "suggestions", "history"] as const).map(
            (v) => (
              <MuteButton key={v} onClick={() => setView(v)}>
                {v}
              </MuteButton>
            )
          )}
          <MuteButton
            onClick={() => {
              setSource(initial());
              setLocal(null);
            }}
          >
            Reset
          </MuteButton>
          {view === "progress" && (
            <MuteButton onClick={() => setPhase((p) => (p + 1) % 5)}>
              Next phase
            </MuteButton>
          )}
        </nav>
        <p className="text-sm text-neutral-muted">
          Local UI preview · synthetic data only.
        </p>
        <label className="text-xs text-neutral-muted">
          Load evaluated suggestions (JSON)
          <Input
            type="file"
            accept=".json"
            aria-label="Load evaluated suggestions"
            className="mt-1 max-w-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const parsed = JSON.parse(await file.text());
                setSource(
                  initial(
                    suggestionBatchSchema.parse(parsed.suggestions)
                  )
                );
                setLocal(null);
                setView("suggestions");
                setLoadError("");
              } catch {
                setLoadError("Choose a valid synthetic suggestions JSON file.");
              }
            }}
          />
        </label>
        {loadError && (
          <p role="alert" className="text-sm text-critical">
            {loadError}
          </p>
        )}
        {view === "start" && (
          <ApplicationStartCard
            disabled={false}
            messageId={1}
            offer={{
              version: 1,
              status: "ready",
              roleName: "Example Labs · Software Engineer",
              roleTitle: "Software Engineer",
              companyName: "Example Labs",
              roleId: "preview-role",
              selectedDocumentId: "preview-resume",
              resumes: [
                { id: "preview-resume", name: fixture.text0, primary: true },
              ],
            }}
            onAction={() => setView("progress")}
          />
        )}
        {view === "progress" && (
          <ApplicationSimulationCard
            messageId={1}
            simulation={{
              version: 6,
              status: phase === 3 ? "completed" : phase === 4 ? "failed" : "running",
              suggestions: phase === 3 ? [] : undefined,
              progress: (
                ["candidate", "role", "suggestions", "suggestions", "suggestions"] as const
              )[phase],
              roleName: "Example Labs",
              documentName: fixture.text0,
              updatedAt: new Date().toISOString(),
              steps: [{ key: "review", status: phase === 3 ? "completed" : phase === 4 ? "failed" : "running" }],
            }}
          />
        )}
        {view === "history" && batch && (
          <div className="mt-24">
            <p className="mb-6">{fixture.introduction}</p>
            <ApplicationQuestionHistoryRow
              batch={{
                ...batch,
                status: "submitted",
                responses: {
                  change: {
                    decision: "accept",
                    edits: [
                      {
                        target: fixture.text3,
                        originalText: fixture.text4,
                        suggestedText: fixture.text5,
                      },
                    ],
                  },
                  question: { decision: "answer", text: fixture.answer },
                  material: { decision: "ignore" },
                },
              }}
            />
          </div>
        )}
        {view === "suggestions" && (
          <div className="flex min-h-[70dvh] flex-col justify-end">
            <p className="mb-6">{fixture.introduction}</p>
            <ApplicationPreparationContext.Provider
              value={{
                record,
                drafts: [],
                pending: false,
                error: "",
                command: async (input) => {
                  if (input.operation === "end") {
                    setSource({ ...source, state: mutateSimulationSession(source.state, { action: "end" }, 0) });
                    setLocal(null);
                    return true;
                  }
                  if (!batch) return false;
                  const next: LocalQuestionAnswers = structuredClone(
                    local ?? {
                      batchId: batch.id,
                      requestId: "local",
                      responses: {},
                    }
                  );
                  if (
                    input.operation === "respond" &&
                    input.itemId &&
                    input.response
                  ) {
                    next.responses[input.itemId] = input.response;
                    const i = batch.itemIds.indexOf(input.itemId);
                    next.currentItemId = batch.itemIds[i + 1] ?? input.itemId;
                    if (i === batch.itemIds.length - 1)
                      for (const id of batch.itemIds)
                        next.responses[id] ??= { decision: "skip" };
                  }
                  if (input.operation === "navigate")
                    next.currentItemId = input.itemId;
                  if (input.operation === "clear" && input.itemId)
                    delete next.responses[input.itemId];
                  if (input.operation === "hide") next.showInputs = false;
                  if (input.operation === "show") next.showInputs = true;
                  setLocal(next);
                  return true;
                },
              }}
            >
              {record.state.status !== "active" ? (
                <p role="status">Application ended · ordinary chat is available.</p>
              ) : record.state.preparation?.showInputs ? (
                <ApplicationPreparationComposer />
              ) : pendingApplicationBatch(record.state) ? (
                <ApplicationPreparationReopen />
              ) : record.state.activity!.batches.length ? (
                <ApplicationQuestionHistoryRow
                  batch={record.state.activity!.batches.at(-1)!}
                />
              ) : (
                <p>No suggestions required.</p>
              )}
            </ApplicationPreparationContext.Provider>
          </div>
        )}
        <output className="sr-only" data-preview-responses>
          {JSON.stringify(local?.responses ?? {})}
        </output>
      </div>
    </main>
  );
}
export default function ApplicationPreview() {
  return (
    <MessagesProvider locale="ko">
      <Preview />
    </MessagesProvider>
  );
}
export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === "production" ? { notFound: true } : { props: {} };
