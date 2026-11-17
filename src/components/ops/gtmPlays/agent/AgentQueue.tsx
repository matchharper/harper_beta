import { useCallback, useEffect, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
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

/** #5 승인 기다리는 메일 (보내는 방식이 "보내기 전 승인"일 때): 고쳐서 승인 · 승인 안 함. */
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
        {data?.sendMode === "auto" ? <p className="mb-2 text-[12px] text-neutral-muted">지금은 자동으로 보내요. 설정에서 ‘보내기 전 승인’을 고르면 메일이 여기서 기다려요.</p> : null}
        <div className="space-y-2">
          {(data?.approval ?? []).map((person) => <ApprovalCard key={person.id} person={person} writes={writes} onDone={changed} />)}
        </div>
        {data && !data.approval.length ? <p className="text-[12px] text-neutral-muted">승인을 기다리는 메일이 없어요.</p> : null}
      </div>
    </div>
  );
}
