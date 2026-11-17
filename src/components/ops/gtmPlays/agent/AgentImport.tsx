import { useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { useGtmAction } from "../api";
import { Button, ErrorNotice, Hint, TextArea } from "../ui";

type ImportResult = {
  runId: string | null; added: number; duplicates: number; skipped: Array<{ line: number; reason: string }>; columns: string[];
};

const HINT = "링크드인 Recruiter에서 지원자 목록을 내려받은 CSV를 그대로 붙여 넣거나, 표를 복사해 붙여 넣어요(첫 줄은 열 이름). 이름·이메일·프로필 URL·헤드라인·지역·회사·지원한 공고·지원일 열을 이름으로 알아보고, 나머지 열은 프로필 메모로 남겨요. 이메일도 프로필 URL도 없는 줄은 빼요. 올리면 실행 1개가 생기고, 에이전트가 중복·제외를 확인한 뒤 공고를 고르고 연락해요.";

/** #5 Recruiter 지원자 올리기: pasted applicants become a run. */
export default function AgentImport({ writes, onImported }: { writes: boolean; onImported: () => void }) {
  const [text, setText] = useState("");
  const [isTest, setIsTest] = useState(true);
  const upload = useGtmAction<ImportResult>();
  const result = upload.result;
  const submit = async () => {
    const next = await upload.run("agent.import", { text, isTest });
    if (next?.added) onImported();
  };
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1 text-[12px] text-neutral-muted">CSV 또는 표 붙여넣기 <Hint label="지원자 올리기" text={HINT} /></p>
      <TextArea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        placeholder={"Name,Email,LinkedIn Profile,Headline,Job\n홍길동,gildong@gmail.com,https://www.linkedin.com/in/...,Backend Engineer,Backend Engineer"}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isTest} onChange={(event) => setIsTest(event.target.checked)} />
          테스트로 표시 (숫자에서 빼요)
        </label>
        <Button variant="primary" loading={upload.loading} disabled={!writes || !text.trim()} onClick={() => void submit()}>올리기</Button>
        {!writes ? <span className="text-[12px] text-neutral-muted">이 서버는 쓰기가 꺼져 있어요.</span> : null}
      </div>
      <ErrorNotice message={upload.error} />
      {result ? (
        <div className={cx(opsTheme.panelMuted, "space-y-1 px-3 py-2 text-[12px]")}>
          <p>
            <span className="font-medium">{result.added}명 올림</span>
            {result.duplicates ? ` · 붙여 넣은 목록 안 중복 ${result.duplicates}명` : ""}
            {result.skipped.length ? ` · 뺀 줄 ${result.skipped.length}개` : ""}
          </p>
          {result.columns.length ? <p className="text-neutral-muted">표의 열: {result.columns.join(", ")}</p> : null}
          {result.skipped.length ? (
            <ul className="text-neutral-muted">
              {result.skipped.slice(0, 20).map((row) => <li key={row.line}>{row.line}번째 줄: {row.reason}</li>)}
              {result.skipped.length > 20 ? <li>…외 {result.skipped.length - 20}줄</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
