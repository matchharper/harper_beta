import { useState } from "react";
import { BareButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsMatchingReviewItem } from "@/lib/ops/matching";
import { opsTheme } from "@/components/ops/theme";

export function OpsReengagementDialog({ items, roleId, roleName, companyName, onDone }: {
  items: OpsMatchingReviewItem[]; roleId: string; roleName: string; companyName: string; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const archived = items.filter(item => item.stage === "archived" && item.feedback === "like");
  const chosen = archived.filter(item => selected[item.talent.userId]);
  async function send() {
    setBusy(true);
    try {
      for (const item of chosen) {
        const id = item.talent.userId;
        if (results[id] === "접수 완료") continue;
        setResults(previous => ({ ...previous, [id]: "접수 중…" }));
        try {
          await fetchWithInternalAuth("/api/internal/matching/reengagement", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: selected[id], talentId: id, roleId,
              subject: `${companyName} ${roleName} 채용 재개 안내`, body,
            }),
          });
          setResults(previous => ({ ...previous, [id]: "접수 완료" }));
        } catch (error) {
          setResults(previous => ({ ...previous, [id]: error instanceof Error ? error.message : "접수 실패" }));
        }
      }
      onDone();
    } finally { setBusy(false); }
  }
  return <>
    <BareButton className={opsTheme.buttonSecondary} disabled={!archived.length} onClick={() => {
      setSelected({}); setResults({});
      setBody(`안녕하세요. Harper입니다.\n\n이전에 관심을 보여주셨던 ${companyName}의 ${roleName} 포지션에서 채용을 다시 진행하게 되어 연락드렸어요. 아직 이 역할을 살펴보실 의향이 있으실까요?\n\n현재 생각을 편하게 알려주세요.`);
      setOpen(true);
    }}>채용 재개 안내</BareButton>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>아카이브 후보에게 관심 확인</DialogTitle>
          <DialogDescription>선택한 후보에게 아래 안내를 보냅니다. 관심이 확인되면 내부 수락으로 복구하며, 회사 Slack·채팅에는 전달하지 않습니다.</DialogDescription>
        </DialogHeader>
        <Checkbox label={`전체 선택 (${archived.length}명)`} disabled={busy}
          checked={archived.length > 0 && chosen.length === archived.length}
          onChange={event => setSelected(event.target.checked
            ? Object.fromEntries(archived.map(item => [item.talent.userId, selected[item.talent.userId] ?? crypto.randomUUID()])) : {})} />
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {archived.map(item => <div key={item.talent.userId} className="flex items-center justify-between gap-2">
            <Checkbox disabled={busy || results[item.talent.userId] === "접수 완료"}
              checked={Boolean(selected[item.talent.userId])}
              label={item.talent.name || item.talent.email || "이름 미등록"}
              onChange={event => setSelected(previous => {
                const next = { ...previous };
                if (event.target.checked) next[item.talent.userId] = crypto.randomUUID();
                else delete next[item.talent.userId];
                return next;
              })} />
            <span className="text-xs text-neutral-muted">{results[item.talent.userId]}</span>
          </div>)}
        </div>
        <Textarea aria-label="후보자에게 보낼 채용 재개 안내" rows={7} maxLength={5000} value={body} disabled={busy}
          onChange={event => setBody(event.target.value)} />
        <DialogFooter>
          <BareButton className={opsTheme.buttonSecondary} disabled={busy} onClick={() => setOpen(false)}>닫기</BareButton>
          <BareButton className={opsTheme.buttonPrimary} disabled={busy || !chosen.length || !body.trim()}
            onClick={() => void send()}>{busy ? "접수 중…" : `${chosen.length}명에게 안내 보내기`}</BareButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
