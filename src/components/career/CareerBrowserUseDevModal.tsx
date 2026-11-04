// career-i18n-skip-file: Internal developer controls and synthetic preview copy.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import type { BrowserUseDevEvent } from "@/lib/career/browserUseDev.server";
import { BrowserPreviewFrame } from "./BrowserPreviewFrame";

export default function CareerBrowserUseDevModal({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useCareerApi();
  const taskId = useId();
  const [task, setTask] = useState("https://example.com을 브라우저로 열고, 페이지 제목을 한 문장으로 알려줘.");
  const [running, setRunning] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function run() {
    if (request.current || !task.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setRunning(true);
    setLiveUrl(null);
    setResult("");
    setError("");
    try {
      const response = await fetchWithAuth("/api/talent/dev-browser-use", {
        method: "POST", body: JSON.stringify({ task }), signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "실행을 시작하지 못했습니다.");
      }
      if (!response.body) throw new Error("실행 응답을 받지 못했습니다.");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let pending = "", finished = false;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as BrowserUseDevEvent;
        if (event.type === "preview") setLiveUrl(event.liveUrl);
        if (event.type === "result") setResult(event.text);
        if (event.type === "error") setError(event.message);
        if (event.type === "done") finished = true;
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          pending += value ?? "";
          let end: number;
          while ((end = pending.indexOf("\n")) >= 0) {
            consume(pending.slice(0, end));
            pending = pending.slice(end + 1);
          }
          if (done) { consume(pending); break; }
        }
        if (!finished) throw new Error("연결이 끊겨 실행 완료를 확인하지 못했습니다.");
      } finally {
        reader.releaseLock();
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "실행에 실패했습니다.");
    } finally {
      controller.abort();
      request.current = null;
      setRunning(false);
      setLiveUrl(null);
    }
  }

  return (
    <TalentCareerModal open onClose={onClose} title="Browser Use" bodyClassName="px-4 pb-5 sm:px-5">
      <div data-career-i18n-skip="true" className="space-y-4">
        {/* Reserve room for the same compact, expandable viewer used above chat. */}
        <div className="relative h-[296px]">
          <div className="absolute inset-x-0 bottom-0">
            <BrowserPreviewFrame liveUrl={liveUrl} loading={running} />
          </div>
        </div>
        <label htmlFor={taskId} className="block space-y-2 text-sm">
          <span>명령</span>
          <Textarea id={taskId} rows={3} value={task} disabled={running} onChange={(event) => setTask(event.target.value)} />
        </label>
        <div className="flex items-center gap-2">
          <MuteButton disabled={running || !task.trim()} onClick={() => void run()}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "실행 중" : "실행"}
          </MuteButton>
          {running ? <MuteButton onClick={() => request.current?.abort()}><Square className="size-4" />중단</MuteButton> : null}
        </div>
        {result ? <p role="status" className="whitespace-pre-wrap break-words text-sm text-neutral-primary">{result}</p> : null}
        {error ? <p role="alert" className="whitespace-pre-wrap break-words text-sm text-critical">{error}</p> : null}
      </div>
    </TalentCareerModal>
  );
}
