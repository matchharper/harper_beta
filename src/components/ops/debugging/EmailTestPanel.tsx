import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useOpsEmailTests,
  useRunOpsEmailTest,
  useSendOpsEmailTest,
} from "@/hooks/ops/useOpsEmailTest";
import {
  opsCareerMessagesKey,
  opsCareerProfileKey,
} from "@/hooks/ops/useOpsCareer";
import type { OpsEmailTestCommand } from "@/lib/ops/careerEmailTest.server";
import { formatAbsoluteKst } from "./shared";
import { opsTheme } from "@/components/ops/theme";

const statusLabels = {
  queued: "처리 대기",
  processing: "답장 생성 중",
  completed: "답장 완료 · 미발송",
  failed: "처리 실패",
};

export function EmailTestPanel({ userId }: { userId: string }) {
  const history = useOpsEmailTests(userId);
  const send = useSendOpsEmailTest(userId);
  const run = useRunOpsEmailTest(userId);
  const client = useQueryClient();
  const [subject, setSubject] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const pendingCommand = useRef<OpsEmailTestCommand | null>(null);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const latest = items[0];
  const busy =
    send.isPending ||
    run.isPending ||
    items.some(
      (item) => item.status === "queued" || item.status === "processing"
    );
  const currentSubject = subject ?? latest?.subject ?? "";

  useEffect(() => {
    if (latest?.status !== "completed") return;
    void client.invalidateQueries({ queryKey: opsCareerMessagesKey(userId) });
    void client.invalidateQueries({ queryKey: opsCareerProfileKey(userId) });
  }, [client, latest?.id, latest?.status, userId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !content.trim()) return;
    const previous = pendingCommand.current;
    // A network retry must adopt the same durable job, not submit a second email.
    const command =
      previous &&
      previous.content === content.trim() &&
      previous.subject === currentSubject.trim()
        ? previous
        : {
            userId,
            requestId: crypto.randomUUID(),
            previousJobId: latest?.id,
            subject: currentSubject.trim(),
            content: content.trim(),
          };
    pendingCommand.current = command;
    try {
      const { jobId } = await send.mutateAsync(command);
      pendingCommand.current = null;
      setContent("");
      run.mutate(jobId);
    } catch {
      /* The mutation error and saved job remain visible. */
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-muted">
        대화·이력서는 실제 계정에 저장됩니다. 이메일·회사 연락·지원 제출과 자동
        연락을 유발하는 변경은 차단됩니다.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1.5">
          <span className={opsTheme.label}>이메일 제목</span>
          <Input
            value={currentSubject}
            onChange={(event) => setSubject(event.target.value)}
            disabled={send.isPending}
          />
        </label>
        <label className="block space-y-1.5">
          <span className={opsTheme.label}>사용자가 보낸 메시지</span>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={send.isPending}
            className="min-h-32"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <MuteButton
            type="submit"
            variant="dark"
            disabled={
              busy ||
              history.isLoading ||
              Boolean(history.error) ||
              !content.trim()
            }
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {busy ? "처리 중" : "이메일로 테스트"}
          </MuteButton>
          <MuteButton
            onClick={() => void history.refetch()}
            disabled={history.isFetching}
          >
            새로고침
          </MuteButton>
        </div>
      </form>
      {history.error || send.error || run.error ? (
        <div role="alert" className={opsTheme.errorNotice}>
          {(run.error ?? send.error ?? history.error)?.message}
        </div>
      ) : null}
      <div className="space-y-3" aria-live="polite">
        {items.map((item, index) => (
          <details
            key={item.id}
            open={index === 0}
            className="rounded-lg border border-neutral-1000-a10"
          >
            <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-muted">
              {formatAbsoluteKst(item.createdAt)} · {statusLabels[item.status]}
            </summary>
            <div className="space-y-3 border-t border-neutral-1000-a05 p-3">
              {item.subject ? (
                <div className="text-sm font-medium">{item.subject}</div>
              ) : null}
              <div className="whitespace-pre-wrap text-sm text-neutral-muted">
                {item.content}
              </div>
              {item.error ? (
                <div role="alert" className={opsTheme.errorNotice}>
                  {item.error}
                </div>
              ) : null}
              {(item.status === "queued" || item.status === "processing") &&
              !run.isPending ? (
                <MuteButton
                  onClick={() => run.mutate(item.id)}
                  disabled={send.isPending}
                >
                  이어서 실행
                </MuteButton>
              ) : null}
              {item.replyHtml ? (
                <iframe
                  title={`Harper 이메일 답장 ${formatAbsoluteKst(item.createdAt)}`}
                  srcDoc={item.replyHtml.replace(
                    "<head>",
                    '<head><base target="_blank">'
                  )}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  className="h-[440px] w-full rounded-md border border-neutral-1000-a10 bg-white"
                />
              ) : item.reply ? (
                <div className="whitespace-pre-wrap text-sm">{item.reply}</div>
              ) : null}
            </div>
          </details>
        ))}
      </div>
      {history.hasNextPage ? (
        <MuteButton
          onClick={() => void history.fetchNextPage()}
          disabled={history.isFetchingNextPage}
        >
          이전 테스트 더 보기
        </MuteButton>
      ) : null}
    </div>
  );
}
