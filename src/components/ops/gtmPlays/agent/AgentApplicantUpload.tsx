import { useRef, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { ApplicantFileImport } from "@/lib/gtmPlays/agent/applicantUpload.server";
import { useGtmAction } from "../api";
import { Button, ErrorNotice, Hint } from "../ui";

/** Same as APPLICANT_FILE_MAX_BYTES (applicantSheet.ts reads files with zlib, so it stays on the server). */
const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";
const SOURCE = "링크드인 Recruiter → 공고 → Apply starters → Export all to XLSX";
const HINT = "링크드인 Recruiter의 공고에서 Apply starters 탭을 열고 Export all to XLSX로 받은 파일을 그대로 올려요. 매번 전체 목록이어도 괜찮아요: 이미 있는 사람은 빼고 새 사람만 실행에 넣어요. 이름·이메일·프로필 URL·헤드라인·지역·지원일 열을 이름으로 알아보고, 나머지 열은 프로필 메모로 남겨요.";

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

/** #5 지원자 파일 올리기: a LinkedIn Recruiter export (.xlsx/.csv) dropped here becomes a run of the new people. */
export default function AgentApplicantUpload({ writes, onImported }: { writes: boolean; onImported: () => void }) {
  const [isTest, setIsTest] = useState(true);
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
    const next = await upload.run("agent.applicants.upload", { fileName: file.name, base64: await fileBase64(file), isTest });
    if (next?.newPeople) onImported();
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1 text-[12px] text-neutral-muted">{SOURCE} <Hint label="지원자 파일 올리기" text={HINT} /></p>
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
          "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition",
          dragging ? "border-stroke-strong bg-bg-weak" : "border-stroke",
        )}
      >
        <p className="text-sm">{upload.loading && fileName ? `${fileName} 읽는 중…` : "파일을 여기에 끌어다 놓거나"}</p>
        <Button disabled={!writes} loading={upload.loading} onClick={() => input.current?.click()}>파일 고르기</Button>
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
        <p className="text-[12px] text-neutral-muted">.xlsx 또는 .csv · 3MB까지</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isTest} onChange={(event) => setIsTest(event.target.checked)} />
          테스트로 표시 (숫자에서 빼요)
        </label>
        {!writes ? <span className="text-[12px] text-neutral-muted">이 서버는 쓰기가 꺼져 있어요.</span> : null}
      </div>
      <ErrorNotice message={upload.error} />
      {result ? (
        <div className={cx(opsTheme.panelMuted, "space-y-1 px-3 py-2 text-[12px]")}>
          <p className="font-medium">{applicantUploadLine(result)}</p>
          {!result.hasEmailColumn ? <p className="text-neutral-muted">이 파일에는 이메일 열이 없어서 프로필 URL로만 올렸어요.</p> : null}
          {result.skipped.length ? (
            <p className="text-neutral-muted">뺀 줄 {result.skipped.length}개 ({result.skipped[0].line}번째 줄: {result.skipped[0].reason})</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
