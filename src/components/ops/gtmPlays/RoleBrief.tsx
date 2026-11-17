import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { GtmBrief, GtmJd } from "@/lib/gtmPlays/shared";
import { useGtmAction } from "./api";
import { Button, Label, TextArea, TextInput } from "./ui";

/**
 * Making a GTM Role from a posting for #5 (Role로 사람 찾기): the search criteria editors and the JD → criteria
 * draft → saved Role steps (useRoleStart).
 */

export type Criteria = GtmBrief["criteria"];

/** The server's limits (route.ts briefSchema), so the editor never builds what it would refuse. */
const MAX_CRITERIA = 8;

export function CriteriaEditor({ criteria, onChange }: { criteria: Criteria; onChange: (criteria: Criteria) => void }) {
  const setCriterion = (index: number, patch: Partial<Criteria[number]>) =>
    onChange(criteria.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div>
      <Label>기준</Label>
      <div className="space-y-2">
        {criteria.map((criterion, index) => (
          <div key={criterion.id ?? index} className="grid gap-2 sm:grid-cols-[160px_1fr_auto_auto]">
            <TextInput value={criterion.name} maxLength={80} aria-label="기준 이름" onChange={(event) => setCriterion(index, { name: event.target.value })} />
            <TextInput value={criterion.criteria} maxLength={400} aria-label="기준 설명" onChange={(event) => setCriterion(index, { criteria: event.target.value })} />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={criterion.requirement === "must"}
                onChange={(event) => setCriterion(index, { requirement: event.target.checked ? "must" : "preferred", importance: event.target.checked ? 3 : 2 })}
              />
              필수
            </label>
            <Button aria-label="기준 삭제" onClick={() => onChange(criteria.filter((_, i) => i !== index))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          disabled={criteria.length >= MAX_CRITERIA}
          title={criteria.length >= MAX_CRITERIA ? `기준은 ${MAX_CRITERIA}개까지예요` : undefined}
          onClick={() => onChange([...criteria, { id: `gtm-${Date.now()}`, name: "", criteria: "", requirement: "preferred", importance: 2 }])}
        >
          <Plus className="h-3.5 w-3.5" />기준 추가
        </Button>
      </div>
    </div>
  );
}

export function filledCriteria(criteria: Criteria) {
  return criteria.filter((item) => item.name.trim() && item.criteria.trim());
}

export const EXTRA_PLACEHOLDER = "예: 서울 거주, 초기 스타트업 경험 우선, 현 직장 3년 미만은 제외";

export function BriefEditor({ brief, extra, onChange, onExtraChange, showPublicDescription = false }: {
  brief: GtmBrief; extra: string; onChange: (brief: GtmBrief) => void; onExtraChange: (extra: string) => void;
  /** An outside posting (URL or JD): candidates read its company only by this description. */
  showPublicDescription?: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="block"><Label>Role 이름</Label>
        <TextInput value={brief.roleName} maxLength={160} onChange={(event) => onChange({ ...brief, roleName: event.target.value })} className="w-full" />
      </label>
      {showPublicDescription ? (
        <label className="block"><Label>후보에게 보일 회사 설명</Label>
          <TextInput value={brief.publicDescription ?? ""} maxLength={40} placeholder="예: 결제 스타트업"
            onChange={(event) => onChange({ ...brief, publicDescription: event.target.value })} className="w-full" />
          <span className="mt-1 block text-[12px] text-neutral-muted">
            후보에게는 회사 이름 대신 Harper 고객사(이 설명)으로 보여요. 같은 회사는 처음 정한 설명을 계속 써요.
          </span>
        </label>
      ) : null}
      <label className="block"><Label>요청 (검색이 읽는 설명)</Label>
        <TextArea rows={5} value={brief.request} maxLength={4_000} onChange={(event) => onChange({ ...brief, request: event.target.value })} className="w-full" />
      </label>
      <label className="block"><Label>추가 요청</Label>
        <TextArea rows={3} value={extra} placeholder={EXTRA_PLACEHOLDER} onChange={(event) => onExtraChange(event.target.value)} className="w-full" />
      </label>
      <CriteriaEditor criteria={brief.criteria} onChange={(criteria) => onChange({ ...brief, criteria })} />
    </div>
  );
}

/** The GTM Role already saved for a posting (outreach.findRole). */
export type SavedGtmRole = { roleId: string; name: string; status: string };

/**
 * JD → search criteria (drafted as soon as the JD is read, LLM 1회) → one GTM Role (outreach.createRole). The same
 * posting finds the Role saved before (`savedRole`).
 */
export function useRoleStart() {
  const [jd, setJd] = useState<GtmJd | null>(null);
  const [brief, setBrief] = useState<GtmBrief | null>(null);
  const [extra, setExtra] = useState("");
  const draft = useGtmAction<{ brief: GtmBrief }>();
  const existing = useGtmAction<{ role: SavedGtmRole | null }>();
  const create = useGtmAction<{ dryRun: boolean; reused?: boolean; roleId?: string }>();
  const { run: runDraft } = draft;
  const { run: findRole, setResult: setExisting, setError: setExistingError } = existing;
  const { setResult: setCreated } = create;
  const makeBrief = useCallback(async (forJd: GtmJd) => {
    const result = await runDraft("brief.draft", { jd: forJd });
    if (result) setBrief(result.brief);
  }, [runDraft]);
  /** A new JD on screen: everything after it starts again. */
  const takeJd = useCallback((next: GtmJd | null) => {
    setJd(next); setBrief(null); setExtra(""); setCreated(null); setExisting(null); setExistingError(null);
    if (next) {
      void findRole("outreach.findRole", { jd: next });
      // The criteria draft follows the JD right away (one LLM call), so the next step is ready to check.
      void makeBrief(next);
    }
  }, [findRole, makeBrief, setCreated, setExisting, setExistingError]);
  const cleanBrief = brief ? { ...brief, criteria: filledCriteria(brief.criteria) } : null;
  const briefReady = Boolean(cleanBrief?.roleName.trim() && cleanBrief.request.trim());
  return {
    jd, brief, setBrief, extra, setExtra, draft, existing, create, makeBrief, takeJd, cleanBrief, briefReady,
    savedRole: existing.result?.role ?? null,
    /** An outside posting (URL or pasted JD), not a customer's Role. */
    outside: Boolean(jd && jd.source !== "customer_role"),
    /** Reads the saved Role for the JD again (after a send saved it). */
    refindRole: () => (jd ? findRole("outreach.findRole", { jd }) : Promise.resolve(null)),
    /** Saves the JD and criteria as one GTM Role (the same posting reuses its Role). */
    saveRole: () => (jd && cleanBrief ? create.run("outreach.createRole", { jd, brief: cleanBrief, extraRequest: extra }) : Promise.resolve(null)),
  };
}
