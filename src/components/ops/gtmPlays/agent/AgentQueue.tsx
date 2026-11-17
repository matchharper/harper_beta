import { useCallback, useEffect, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { looksLikeStopRequest } from "@/lib/gtmPlays/agent/funnel";
import type { AgentPerson } from "@/lib/gtmPlays/agent/types";
import type { AgentQueue as AgentQueueData } from "@/lib/gtmPlays/agent/views.server";
import { formatKst, useGtmAction } from "../api";
import { Button, ErrorNotice, Label, TextArea, TextInput } from "../ui";
import { PostingList, SignalLine } from "./AgentPeople";

/** A draft waiting for approval: edit, 승인 or 승인 안 함. */
function ApprovalCard({ person, writes, onDone }: { person: AgentPerson; writes: boolean; onDone: () => void }) {
  const [subject, setSubject] = useState(person.draftSubject ?? "");
  const [body, setBody] = useState(person.draftBody ?? "");
  const [reason, setReason] = useState("");
  const action = useGtmAction<{ person: AgentPerson }>();
  const edited = subject !== (person.draftSubject ?? "") || body !== (person.draftBody ?? "");
  const done = async (name: string, data: Record<string, unknown>) => {
    if (await action.run(name, data)) onDone();
  };
  return (
    <div className={cx(opsTheme.panelSoft, "space-y-2 p-4")}>
      <p className="text-sm font-medium">
        {person.name ?? "이름 없음"} <span className="text-[12px] font-normal text-neutral-muted">{person.email ?? ""}</span>
      </p>
      <SignalLine person={person} />
      <PostingList person={person} />
      <label className="block"><Label>제목</Label><TextInput value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="block"><Label>본문</Label><TextArea value={body} onChange={(event) => setBody(event.target.value)} rows={7} /></label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!writes || !body.trim()}
          loading={action.loading}
          onClick={() => void done("agent.person.approve", { id: person.id, ...(edited ? { subject: subject || null, body } : {}) })}
        >
          {edited ? "고쳐서 승인" : "승인"}
        </Button>
        <TextInput value={reason} onChange={(event) => setReason(event.target.value)} placeholder="승인 안 하는 이유" className="w-64" />
        <Button disabled={!writes} onClick={() => void done("agent.person.reject", { id: person.id, reason })}>승인 안 함</Button>
      </div>
      <ErrorNotice message={action.error} />
    </div>
  );
}

/** A sent person: 답장 옴 (pasted), with 연락 그만 pre-checked when the reply reads that way. */
function ReplyRow({ person, writes, onDone }: { person: AgentPerson; writes: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [stop, setStop] = useState(false);
  const [touched, setTouched] = useState(false);
  const action = useGtmAction<{ person: AgentPerson }>();
  const onText = (value: string) => {
    setText(value);
    if (!touched) setStop(looksLikeStopRequest(value));
  };
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span>
          <span className="font-medium">{person.name ?? "이름 없음"}</span>
          <span className="ml-1 text-[12px] text-neutral-muted">
            메일 · {formatKst(person.sentAt)}
            {person.followupDueAt ? ` · 후속 ${formatKst(person.followupDueAt)}` : ""}
          </span>
        </span>
        <Button disabled={!writes} onClick={() => setOpen(!open)}>답장 옴</Button>
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          <TextArea value={text} onChange={(event) => onText(event.target.value)} rows={3} placeholder="받은 답장을 붙여 넣어 주세요" />
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={stop} onChange={(event) => { setTouched(true); setStop(event.target.checked); }} />
            연락 그만 요청이에요 (이 주소로 하퍼 연락을 모두 막아요)
          </label>
          <Button
            variant="primary"
            loading={action.loading}
            disabled={!writes}
            onClick={async () => { if (await action.run("agent.person.replied", { id: person.id, text, stop })) onDone(); }}
          >
            저장
          </Button>
          <ErrorNotice message={action.error} />
        </div>
      ) : null}
    </li>
  );
}

/** #5 승인 기다리는 메일 · 답장 기록. */
export default function AgentQueue({ includeTest, writes, refreshKey, onChanged }: {
  includeTest: boolean; writes: boolean; refreshKey: number; onChanged: () => void;
}) {
  const queue = useGtmAction<AgentQueueData>();
  const { run } = queue;
  const load = useCallback(() => { void run("agent.queue", { includeTest }); }, [run, includeTest]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const data = queue.result;
  const changed = () => { load(); onChanged(); };
  return (
    <div className="space-y-5">
      <ErrorNotice message={queue.error} />
      {!writes ? <p className="text-[12px] text-neutral-muted">이 서버는 쓰기가 꺼져 있어서 보기만 돼요.</p> : null}
      <div>
        <p className="mb-2 text-[13px] font-medium">
          승인 기다리는 메일 <span className="text-[12px] font-normal text-neutral-muted">{data?.approval.length ?? 0}명{data?.sendMode === "auto" ? " · 지금은 자동으로 보내요(Role의 '찾기만'은 여기서 기다려요)" : ""}</span>
        </p>
        <div className="space-y-2">
          {(data?.approval ?? []).map((person) => <ApprovalCard key={person.id} person={person} writes={writes} onDone={changed} />)}
        </div>
        {data && !data.approval.length ? <p className="text-[12px] text-neutral-muted">승인을 기다리는 메일이 없어요.</p> : null}
      </div>
      <div>
        <p className="mb-1 text-[13px] font-medium">보낸 사람 (최근 30일, 답장 전)</p>
        <ul className="divide-y divide-neutral-1000-a05">
          {(data?.sent ?? []).map((person) => <ReplyRow key={person.id} person={person} writes={writes} onDone={changed} />)}
        </ul>
        {data && !data.sent.length ? <p className="text-[12px] text-neutral-muted">답장을 기다리는 사람이 없어요.</p> : null}
      </div>
    </div>
  );
}
