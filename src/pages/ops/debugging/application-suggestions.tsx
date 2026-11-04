import Head from "next/head";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Download, Upload } from "lucide-react";
import OpsShell from "@/components/ops/OpsShell";
import { InspectionRolePicker } from "@/components/ops/debugging/InspectionRolePicker";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import {
  ApplicationSuggestionsDebugResult,
  readApplicationSuggestionsDebugRecords,
  type ApplicationSuggestionsDebugRecord,
} from "@/components/ops/debugging/ApplicationSuggestionsDebugResult";
import { Input } from "@/components/ui/input";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Typography } from "@/components/ui/typography";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import {
  CAREER_TEXT_CHAT_MODEL_IDS,
  type CareerTextChatModelId,
} from "@/lib/career/textChatModelConfig";
import type { InspectionRole } from "@/lib/ops/applicationFormInspection";
import type {
  ApplicationSuggestionsDebugPreview,
  ApplicationSuggestionsDebugRun,
  ApplicationSuggestionsLookup,
} from "@/lib/ops/applicationSuggestionsDebug";

const endpoint = "/api/internal/debug/application-suggestions";

function downloadJson(value: unknown, name: string) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default function ApplicationSuggestionsDebuggingPage() {
  const canFetch = useCanFetchInternal();
  const [email, setEmail] = useState("daniel@matchharper.com");
  const [lookup, setLookup] = useState<ApplicationSuggestionsLookup | null>(
    null
  );
  const [documentId, setDocumentId] = useState("");
  const [role, setRole] = useState<InspectionRole | null>(null);
  const [model, setModel] = useState<CareerTextChatModelId>(CLAUDE_HAIKU_MODEL);
  const [busy, setBusy] = useState<"lookup" | "preview" | "run" | null>(null);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<ApplicationSuggestionsDebugRecord[]>(
    []
  );
  const [selectedKey, setSelectedKey] = useState("");
  const request = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function appendRecords(next: ApplicationSuggestionsDebugRecord[]) {
    setRecords((current) => [...next, ...current]);
    if (next[0]) setSelectedKey(next[0].key);
  }

  async function findCandidate(event: FormEvent) {
    event.preventDefault();
    if (!canFetch || request.current || !email.trim()) return;
    const abort = new AbortController();
    request.current = abort;
    setBusy("lookup");
    setError("");
    setLookup(null);
    setDocumentId("");
    try {
      const result = await fetchWithInternalAuth<ApplicationSuggestionsLookup>(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lookup", email: email.trim() }),
          signal: abort.signal,
        }
      );
      if (abort.signal.aborted) return;
      setLookup(result);
      setDocumentId(
        result.documents.find(
          (document) => document.isPrimary && document.textAvailable
        )?.id ??
          result.documents.find((document) => document.textAvailable)?.id ??
          ""
      );
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "후보 정보를 불러오지 못했습니다."
        );
    } finally {
      request.current = null;
      setBusy(null);
    }
  }

  async function prepare(action: "preview" | "run") {
    if (!canFetch || request.current || !lookup || !documentId || !role) return;
    const abort = new AbortController();
    request.current = abort;
    setBusy(action);
    setError("");
    try {
      const result = await fetchWithInternalAuth<
        ApplicationSuggestionsDebugPreview | ApplicationSuggestionsDebugRun
      >(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          talentId: lookup.candidate.id,
          documentId,
          roleId: role.id,
          model,
          locale: "ko",
        }),
        signal: abort.signal,
      });
      if (!abort.signal.aborted)
        appendRecords(readApplicationSuggestionsDebugRecords(result));
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "요청을 완료하지 못했습니다."
        );
    } finally {
      request.current = null;
      setBusy(null);
    }
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const results = await Promise.allSettled(
      files.map(async (file) =>
        readApplicationSuggestionsDebugRecords(
          JSON.parse(await file.text()),
          file.name
        )
      )
    );
    const imported: ApplicationSuggestionsDebugRecord[] = [];
    const errors: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") imported.push(...result.value);
      else
        errors.push(
          `${files[index].name}: ${result.reason instanceof Error ? result.reason.message : "읽을 수 없는 JSON 파일입니다."}`
        );
    });
    appendRecords(imported);
    setError(errors.join("\n"));
  }

  const selected = records.find((record) => record.key === selectedKey);
  const canRun = canFetch && !busy && !!lookup && !!documentId && !!role;
  const selectedDocument = lookup?.documents.find(
    (document) => document.id === documentId
  );
  return (
    <OpsShell compactHeader title="이력서 제안">
      <Head>
        <title>이력서 제안 | Harper Ops</title>
      </Head>
      <div className="space-y-6 text-neutral-primary">
        <section className="space-y-5 rounded-xl border border-neutral-1000-a10 bg-bg-floating p-5">
          <form
            onSubmit={findCandidate}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-56 flex-1 space-y-2">
              <Typography asChild variant="label">
                <label htmlFor="suggestion-candidate-email">후보 이메일</label>
              </Typography>
              <Input
                id="suggestion-candidate-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setLookup(null);
                  setDocumentId("");
                }}
                disabled={!!busy}
              />
            </div>
            <MuteButton
              type="submit"
              disabled={!canFetch || !!busy || !email.trim()}
            >
              {busy === "lookup" ? "조회 중…" : "후보 조회"}
            </MuteButton>
          </form>
          {lookup && (
            <div className="space-y-3">
              <Typography variant="title">
                {lookup.candidate.name ?? lookup.candidate.email}
              </Typography>
              {lookup.documents.length ? (
                <div className="space-y-2">
                  <Typography asChild variant="label">
                    <label htmlFor="suggestion-document">이력서</label>
                  </Typography>
                  <Select
                    value={documentId}
                    onValueChange={(value) => setDocumentId(value ?? "")}
                    disabled={!!busy}
                  >
                    <SelectTrigger id="suggestion-document">
                      <SelectValue placeholder="이력서를 선택하세요">
                        {selectedDocument?.fileName}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {lookup.documents.map((document) => (
                        <SelectItem
                          key={document.id}
                          value={document.id}
                          disabled={!document.textAvailable}
                        >
                          {document.fileName}
                          {document.isPrimary ? " · 기본" : ""}
                          {!document.textAvailable ? " · 본문 없음" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Typography variant="description">
                  사용할 수 있는 이력서가 없습니다.
                </Typography>
              )}
            </div>
          )}
          <InspectionRolePicker
            value={role}
            onChange={setRole}
            disabled={!!busy}
            canFetch={canFetch}
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-60 space-y-2">
              <Typography asChild variant="label">
                <label htmlFor="suggestion-model">모델</label>
              </Typography>
              <Select
                value={model}
                onValueChange={(value) => {
                  if (value) setModel(value as CareerTextChatModelId);
                }}
                disabled={!!busy}
              >
                <SelectTrigger id="suggestion-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAREER_TEXT_CHAT_MODEL_IDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <MuteButton
              disabled={!canRun}
              onClick={() => void prepare("preview")}
            >
              {busy === "preview" ? "입력 준비 중…" : "입력 미리보기"}
            </MuteButton>
            <MuteButton
              variant="dark"
              disabled={!canRun}
              onClick={() => void prepare("run")}
            >
              {busy === "run" ? "제안 생성 중…" : "제안 생성"}
            </MuteButton>
          </div>
          <Typography variant="helper">
            저장된 후보 정보·이력서·공고로 제안 LLM만 실행합니다. 이력서
            저장이나 지원 제출은 하지 않습니다.
          </Typography>
        </section>
        {error && (
          <Typography
            role="alert"
            className="whitespace-pre-wrap rounded-lg border border-critical/25 bg-critical-faded p-4 text-critical"
          >
            {error}
          </Typography>
        )}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Typography as="h2" variant="section-title">
              실행 기록{records.length ? ` ${records.length}` : ""}
            </Typography>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                multiple
                className="hidden"
                aria-label="실행 기록 JSON 가져오기"
                onChange={(event) => void importFiles(event)}
              />
              <MuteButton onClick={() => fileInput.current?.click()}>
                <Upload />
                JSON 가져오기
              </MuteButton>
              <MuteButton
                disabled={!records.length}
                onClick={() =>
                  downloadJson(
                    { runs: records.map((record) => record.artifact) },
                    "application-suggestions-runs.json"
                  )
                }
              >
                <Download />
                전체 다운로드
              </MuteButton>
            </div>
          </div>
          <Typography variant="helper">
            새로고침하면 실행 기록이 사라집니다. 보관할 기록은 JSON으로
            내려받으세요.
          </Typography>
          {records.length > 0 && (
            <div className="grid min-w-0 gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
              <nav aria-label="실행 기록 선택" className="flex flex-col gap-2">
                {records.map((record, index) => (
                  <MuteButton
                    key={record.key}
                    variant={
                      selectedKey === record.key ? "neutral" : "transparent"
                    }
                    aria-pressed={selectedKey === record.key}
                    onClick={() => setSelectedKey(record.key)}
                    className="w-full justify-start whitespace-normal text-left"
                  >
                    <span className="space-y-1 py-1">
                      <Typography as="span" className="block" variant="label">
                        {record.kind === "preview"
                          ? "미리보기"
                          : `기록 ${index + 1}`}{" "}
                        · {record.title}
                      </Typography>
                      <Typography as="span" className="block" variant="helper">
                        {record.model}
                        {record.suggestions &&
                          ` · 제안 ${record.suggestions.length}개`}
                        {record.error && " · 오류"}
                      </Typography>
                    </span>
                  </MuteButton>
                ))}
              </nav>
              {selected && (
                <div className="min-w-0 space-y-4">
                  <div className="flex justify-end">
                    <MuteButton
                      onClick={() =>
                        downloadJson(
                          selected.artifact,
                          `application-suggestions-${selected.key}.json`
                        )
                      }
                    >
                      <Download />이 기록 다운로드
                    </MuteButton>
                  </div>
                  <ApplicationSuggestionsDebugResult
                    key={selected.key}
                    record={selected}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </OpsShell>
  );
}
