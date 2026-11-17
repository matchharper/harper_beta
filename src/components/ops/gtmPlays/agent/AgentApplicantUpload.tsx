import { useRef, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { ApplicantFileImport } from "@/lib/gtmPlays/agent/applicantUpload.server";
import type { AgentLastUpload } from "@/lib/gtmPlays/agent/views.server";
import { formatKst, useGtmAction } from "../api";
import { Button, ErrorNotice, Hint } from "../ui";

/** Same as APPLICANT_FILE_MAX_BYTES (applicantSheet.ts reads files with zlib, so it stays on the server). */
const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";
const SOURCE = "받는 곳: 링크드인 Recruiter → 공고 → Apply starters → Export all to XLSX";
const HINT = "링크드인 Recruiter에서 공고를 열고 Apply starters 탭 → Export all to XLSX로 받은 파일을 그대로 올려요. 매번 전체 목록이어도 괜찮아요: 이미 있는 사람은 빼고 새 사람만 에이전트가 처리해요. 이메일이 비어 있으면 에이전트가 이메일을 찾아봐요.";

/** "파일 지원자.xlsx · 37명 중 새 사람 5명 · 이메일 있음 3명" */
export function applicantUploadLine(result: Pick<ApplicantFileImport, "fileName" | "rows" | "newPeople" | "withEmail">) {
  const parts = [`파일 ${result.fileName}`, `${result.rows}명 중 새 사람 ${result.newPeople}명`];
  if (result.newPeople) parts.push(`이메일 있음 ${result.withEmail}명`);
  return parts.join(" · ");
}

async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/**
 * 링크드인 지원자 파일: a LinkedIn Recruiter export (.xlsx/.csv) dropped on the dashed zone (or picked) becomes a run of
 * the new people. Its own panel above the settings, with the last file it got (Shaun 11/17); uploads always count.
 */
export default function AgentApplicantUpload({ writes, onImported, lastUpload }: {
  writes: boolean; onImported: () => void; lastUpload: AgentLastUpload | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const upload = useGtmAction<ApplicantFileImport>();
  const result = upload.result;

  const send = async (file: File) => {
    if (!writes || upload.loading) return;
    upload.setResult(null);
    if (!/\.(xlsx|csv)$/i.test(file.name)) { upload.setError("엑셀(.xlsx)이나 CSV 파일만 올릴 수 있어요."); return; }
    if (file.size > MAX_BYTES) { upload.setError("파일이 너무 커요. 3MB까지 올릴 수 있어요."); return; }
    setFileName(file.name);
    const next = await upload.run("agent.applicants.upload", { fileName: file.name, base64: await fileBase64(file), isTest: false });
    if (next?.newPeople) onImported();
  };

  return (
    <section className={cx(opsTheme.panel, "space-y-3 p-5 shadow-sm")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 text-[15px] font-semibold tracking-[-0.02em]">
          링크드인 지원자 파일 <Hint label="링크드인 지원자 파일 올리기" text={HINT} />
        </span>
        {lastUpload ? (
          <span className="text-[12px] text-neutral-muted">
            마지막 파일 {formatKst(lastUpload.at)} · {lastUpload.rows ?? lastUpload.newPeople}명 (새 {lastUpload.newPeople})
          </span>
        ) : null}
      </div>
      <div
        onDragOver={(event) => { event.preventDefault(); if (writes) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void send(file);
        }}
        className={cx(
          "flex min-h-[60px] flex-wrap items-center gap-3 rounded-lg border-2 border-dashed px-4 py-2 transition-colors",
          dragging ? "border-neutral-primary bg-bg-weak" : "border-neutral-1000-a10",
        )}
      >
        <Button className="whitespace-nowrap" disabled={!writes} loading={upload.loading} onClick={() => input.current?.click()}>파일 고르기</Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void send(file);
          }}
        />
        <span className="text-[13px] text-neutral-muted">
          {upload.loading && fileName ? `${fileName} 읽는 중…` : dragging ? "여기에 놓으세요" : "또는 여기에 끌어다 놓기 · .xlsx/.csv"}
        </span>
        {!writes ? <span className="text-[12px] text-neutral-muted">이 서버는 쓰기가 꺼져 있어요.</span> : null}
      </div>
      <p className="text-[12px] text-neutral-muted">{SOURCE}</p>
      {result ? (
        <p className="text-[12px]">
          <span className="font-medium">{applicantUploadLine(result)}</span>
          {!result.hasEmailColumn ? <span className="text-neutral-muted"> · 이메일 열이 없어서 프로필 URL로만 올렸어요</span> : null}
          {result.skipped.length ? <span className="text-neutral-muted"> · 뺀 줄 {result.skipped.length}개 ({result.skipped[0].line}번째 줄: {result.skipped[0].reason})</span> : null}
        </p>
      ) : null}
      <ErrorNotice message={upload.error} />
    </section>
  );
}
