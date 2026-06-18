import OpsShell from "@/components/ops/OpsShell";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsAnswerExampleItem,
  OpsAnswerExampleSaveResponse,
  OpsAnswerExamplesResponse,
} from "@/lib/ops/answerExamplesServer";
import {
  CheckCircle2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import Head from "next/head";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";

type Draft = {
  answerExampleText: string;
  enabled: boolean;
  id: string | null;
  notes: string;
  tagsText: string;
  userExampleText: string;
};

const EMPTY_DRAFT: Draft = {
  answerExampleText: "",
  enabled: true,
  id: null,
  notes: "",
  tagsText: "",
  userExampleText: "",
};

function exampleToDraft(example: OpsAnswerExampleItem): Draft {
  return {
    answerExampleText: example.answerExampleText,
    enabled: example.enabled,
    id: example.id,
    notes: example.notes ?? "",
    tagsText: example.tags.join(", "),
    userExampleText: example.userExampleText,
  };
}

function getDraftPayload(draft: Draft) {
  return {
    answerExampleText: draft.answerExampleText,
    enabled: draft.enabled,
    id: draft.id ?? undefined,
    notes: draft.notes,
    tags: draft.tagsText
      .split(/[,\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    userExampleText: draft.userExampleText,
  };
}

export default function OpsAnswerExamplesPage() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [examples, setExamples] = useState<OpsAnswerExampleItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const loadExamples = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchWithInternalAuth<OpsAnswerExamplesResponse>(
        "/api/internal/answer-examples"
      );
      setExamples(payload.examples);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "답변 예시를 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadExamples();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadExamples]);

  const selectedExample = useMemo(
    () => examples.find((example) => example.id === draft.id) ?? null,
    [draft.id, examples]
  );

  const filteredExamples = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return examples;
    return examples.filter((example) =>
      [
        example.userExampleText,
        example.answerExampleText,
        example.notes ?? "",
        example.tags.join(" "),
      ]
        .join("\n")
        .toLowerCase()
        .includes(normalized)
    );
  }, [examples, query]);

  const selectExample = useCallback((example: OpsAnswerExampleItem) => {
    setDraft(exampleToDraft(example));
    setError("");
    setNotice("");
  }, []);

  const startNewExample = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setError("");
    setNotice("");
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchWithInternalAuth<OpsAnswerExampleSaveResponse>(
        "/api/internal/answer-examples",
        {
          body: JSON.stringify(getDraftPayload(draft)),
          headers: { "Content-Type": "application/json" },
          method: draft.id ? "PATCH" : "POST",
        }
      );

      setExamples((current) => {
        const next = current.filter(
          (example) => example.id !== payload.example.id
        );
        return [payload.example, ...next].sort((a, b) => {
          if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        });
      });
      setDraft(exampleToDraft(payload.example));
      setNotice(
        payload.embeddingUpdated
          ? "저장했습니다. user example 또는 embedding model 변경으로 임베딩도 새로 만들었습니다."
          : "저장했습니다. user example이 그대로라 임베딩은 유지했습니다."
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "답변 예시를 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const handleDelete = useCallback(async () => {
    if (!draft.id) return;
    const ok = window.confirm("이 답변 예시를 삭제할까요?");
    if (!ok) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await fetchWithInternalAuth(
        `/api/internal/answer-examples?id=${encodeURIComponent(draft.id)}`,
        { method: "DELETE" }
      );
      setExamples((current) =>
        current.filter((example) => example.id !== draft.id)
      );
      setDraft(EMPTY_DRAFT);
      setNotice("삭제했습니다.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "답변 예시를 삭제하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }, [draft.id]);

  const canSave =
    draft.userExampleText.trim().length > 0 &&
    draft.answerExampleText.trim().length > 0 &&
    !saving;

  return (
    <>
      <Head>
        <title>Answer Examples · Harper Ops</title>
      </Head>

      <OpsShell
        title="Answer Examples"
        actions={
          <>
            <BareButton
              type="button"
              onClick={() => void loadExamples()}
              disabled={loading}
              className={cx(opsTheme.buttonSecondary, "h-10")}
            >
              <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
              새로고침
            </BareButton>
            <BareButton
              type="button"
              onClick={startNewExample}
              className={cx(opsTheme.buttonPrimary, "h-10")}
            >
              <Plus className="h-4 w-4" />새 예시
            </BareButton>
          </>
        }
      >
        <section className="grid gap-5 xl:grid-cols-[minmax(360px,0.92fr)_minmax(540px,1.08fr)]">
          <div className={cx(opsTheme.panel, "min-w-0 p-5")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mt-1 text-lg font-medium text-neutral-primary">
                  {examples.length}개 등록
                </div>
              </div>
              <div className="relative min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                <UiInput
                  unstyled
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="질문, 답변, 태그 검색"
                  className={cx(opsTheme.input, "pl-9")}
                />
              </div>
            </div>

            <div className={cx(opsTheme.panelMuted, "mt-4 px-4 py-3")}>
              <div className="text-xs leading-5 text-neutral-muted">
                `User example`를 바꾸면 저장 시 임베딩을 새로 만듭니다. 답변
                예시, 태그, 활성 여부만 바꾸면 기존 임베딩을 유지합니다.
              </div>
            </div>

            <div className="mt-4 max-h-[calc(100vh)] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center gap-2 rounded-md bg-bg-default/50 px-4 py-5 text-sm text-neutral-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : filteredExamples.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-default/40 px-4 py-8 text-center text-sm text-neutral-muted">
                  표시할 답변 예시가 없습니다.
                </div>
              ) : (
                filteredExamples.map((example) => {
                  const active = example.id === draft.id;
                  return (
                    <BareButton
                      key={example.id}
                      type="button"
                      onClick={() => selectExample(example)}
                      className={cx(
                        "block w-full rounded-md px-4 py-3 text-left transition",
                        active
                          ? "bg-black text-neutral-00"
                          : "bg-bg-default/65 text-neutral-primary hover:bg-bg-default"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-medium leading-5">
                            {example.userExampleText}
                          </div>
                          <div
                            className={cx(
                              "mt-1 line-clamp-2 text-xs leading-5",
                              active
                                ? "text-neutral-00/65"
                                : "text-neutral-muted"
                            )}
                          >
                            {example.answerExampleText}
                          </div>
                        </div>
                        <span
                          className={cx(
                            "shrink-0 rounded px-2 py-1 text-[11px] font-medium",
                            example.enabled
                              ? active
                                ? "bg-neutral-00/15 text-neutral-00"
                                : "bg-positive-faded text-positive"
                              : active
                                ? "bg-neutral-00/10 text-neutral-00/65"
                                : "bg-bg-weak text-neutral-muted"
                          )}
                        >
                          {example.enabled ? "ON" : "OFF"}
                        </span>
                      </div>
                      <div
                        className={cx(
                          "mt-3 flex flex-wrap items-center gap-2 text-[11px]",
                          active ? "text-neutral-00/55" : "text-neutral-muted"
                        )}
                      >
                        <span>
                          {formatKstRelativeDateTime(example.updatedAt)}
                        </span>
                      </div>
                    </BareButton>
                  );
                })
              )}
            </div>
          </div>

          <form
            className={cx(opsTheme.panel, "min-w-0 p-5")}
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) void handleSave();
            }}
          >
            <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mt-1 text-lg font-medium text-neutral-primary">
                  답변 예시
                </div>
                {selectedExample ? (
                  <div className="mt-1 text-xs text-neutral-muted">
                    updated{" "}
                    {formatKstRelativeDateTime(selectedExample.updatedAt)} ·{" "}
                    {selectedExample.embeddingModel}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {draft.id ? (
                  <BareButton
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        enabled: !current.enabled,
                      }))
                    }
                    className={cx(opsTheme.buttonSecondary, "h-10")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {draft.enabled ? "활성" : "비활성"}
                  </BareButton>
                ) : null}
                {draft.id ? (
                  <BareButton
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={saving}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-critical-faded px-4 text-sm font-medium text-critical transition hover:bg-critical-faded disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </BareButton>
                ) : null}
                <BareButton
                  type="submit"
                  disabled={!canSave}
                  className={cx(opsTheme.buttonPrimary, "h-10")}
                >
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  저장
                </BareButton>
              </div>
            </div>

            {error ? (
              <div className={cx(opsTheme.errorNotice, "mt-4")}>{error}</div>
            ) : null}
            {notice ? (
              <div className={cx(opsTheme.successNotice, "mt-4")}>{notice}</div>
            ) : null}

            <div className="mt-5 grid gap-4">
              <div>
                <label className={opsTheme.label} htmlFor="user-example-text">
                  User example
                </label>
                <UiTextarea
                  unstyled
                  id="user-example-text"
                  value={draft.userExampleText}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      userExampleText: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="예: 우측 별 버튼 누르면 어떻게 돼?"
                  className={cx(opsTheme.textarea, "mt-2 min-h-[120px]")}
                />
              </div>

              <div>
                <label className={opsTheme.label} htmlFor="answer-example-text">
                  Answer example
                </label>
                <UiTextarea
                  unstyled
                  id="answer-example-text"
                  value={draft.answerExampleText}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      answerExampleText: event.target.value,
                    }))
                  }
                  rows={7}
                  placeholder="유저에게 보여주고 싶은 답변 예시를 적어주세요."
                  className={cx(opsTheme.textarea, "mt-2 min-h-[220px]")}
                />
              </div>

              <div>
                <label className="inline-flex h-11 items-center gap-2 rounded-md bg-bg-default/65 px-3 text-sm font-medium text-neutral-muted">
                  <UiCheckbox
                    unstyled
                    checked={draft.enabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-black"
                  />
                  Enabled
                </label>
              </div>

              <div>
                <label className={opsTheme.label} htmlFor="tags">
                  Tags (optional)
                </label>
                <UiInput
                  unstyled
                  id="tags"
                  value={draft.tagsText}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      tagsText: event.target.value,
                    }))
                  }
                  placeholder="쉼표로 구분"
                  className={cx(opsTheme.input, "mt-2")}
                />
              </div>

              <div>
                <label className={opsTheme.label} htmlFor="notes">
                  Notes
                </label>
                <UiTextarea
                  unstyled
                  id="notes"
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="내부 메모"
                  className={cx(opsTheme.textarea, "mt-2 min-h-[96px]")}
                />
              </div>
            </div>
          </form>
        </section>
      </OpsShell>
    </>
  );
}
