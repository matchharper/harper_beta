import { useEffect, useMemo, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { CustomerRoleOption } from "@/lib/gtmPlays/jd.server";
import type { GtmJd } from "@/lib/gtmPlays/shared";
import { gtmCall, useGtmAction } from "./api";
import { Badge, Button, ErrorNotice, Label, Select, TextArea, TextInput } from "./ui";

type Source = GtmJd["source"];

// Same order on #2 and #4 (Shaun 11/12): Harper customers first, then a posting from outside.
const SOURCES: Array<{ id: Source; label: string }> = [
  { id: "customer_role", label: "하퍼 고객사 Role" },
  { id: "url", label: "외부 공고 URL" },
  { id: "text", label: "외부 JD 붙여넣기" },
];

let customerRolesCache: CustomerRoleOption[] | null = null;

export function useCustomerRoles() {
  const [roles, setRoles] = useState<CustomerRoleOption[]>(customerRolesCache ?? []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (customerRolesCache) return;
    gtmCall<{ roles: CustomerRoleOption[] }>("jd.customerRoles")
      .then((result) => { customerRolesCache = result.roles; setRoles(result.roles); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "고객 Role을 불러오지 못했어요."));
  }, []);
  return { roles, error };
}

export function CustomerRoleSelect({ value, onChange }: { value: string; onChange: (roleId: string) => void }) {
  const { roles, error } = useCustomerRoles();
  const grouped = useMemo(() => {
    const map = new Map<string, CustomerRoleOption[]>();
    for (const role of roles) map.set(role.companyName, [...(map.get(role.companyName) ?? []), role]);
    return [...map.entries()];
  }, [roles]);
  return (
    <>
      <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label="고객 Role">
        <option value="">고객 Role 선택</option>
        {grouped.map(([company, list]) => (
          <optgroup key={company} label={`${company} · 진행 중 ${list[0]?.activeRoles ?? 0}`}>
            {list.map((role) => (
              <option key={role.roleId} value={role.roleId}>{role.name} ({role.status})</option>
            ))}
          </optgroup>
        ))}
      </Select>
      <ErrorNotice message={error} />
    </>
  );
}

export function JdSummary({ jd }: { jd: GtmJd }) {
  return (
    <div className={cx(opsTheme.panelMuted, "mt-3 space-y-1 p-3 text-sm")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{jd.companyName || "회사 이름 없음"}</span>
        <span>·</span>
        <span>{jd.title || "직함 없음"}</span>
        {jd.location ? <Badge>{jd.location}</Badge> : null}
        {jd.url ? <a className={opsTheme.link} href={jd.url} target="_blank" rel="noreferrer">원문</a> : null}
      </div>
      {jd.contactEmails.length ? (
        <div className="text-[12px] text-neutral-muted">공고에 적힌 메일: {jd.contactEmails.join(", ")}</div>
      ) : null}
      <details>
        <summary className="cursor-pointer text-[12px] text-neutral-muted">본문 {jd.description.length.toLocaleString()}자</summary>
        <p className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-[12px] leading-5">{jd.description}</p>
      </details>
    </div>
  );
}

/** JD from a posting URL (LinkedIn included), pasted text, or a customer's own Role. */
export function JdInput({ onJd, sources = SOURCES.map((item) => item.id) }: {
  onJd: (jd: GtmJd | null) => void; sources?: Source[];
}) {
  const [source, setSource] = useState<Source>(sources[0] ?? "customer_role");
  const [url, setUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [roleId, setRoleId] = useState("");
  const action = useGtmAction<{ jd: GtmJd }>();

  const read = async () => {
    onJd(null);
    const data = source === "url" ? { source, url }
      : source === "text" ? { source, companyName, title, text, url: url || undefined }
      : { source, roleId };
    const result = await action.run("jd.read", data);
    if (result) onJd(result.jd);
  };

  const ready = source === "url" ? url.trim().length > 8
    : source === "text" ? companyName.trim() && title.trim() && text.trim().length >= 20
    : Boolean(roleId);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {sources.map((id) => SOURCES.find((item) => item.id === id)).filter((item): item is (typeof SOURCES)[number] => Boolean(item)).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSource(item.id)}
            className={cx("h-8 rounded-md px-3 text-sm", source === item.id ? "bg-surface-inverse text-neutral-00" : "bg-bg-weak")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {source === "url" ? (
        <label className="block">
          <Label>공고 URL (채용 사이트·LinkedIn 글)</Label>
          <TextInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
        </label>
      ) : null}
      {source === "text" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block"><Label>회사</Label><TextInput value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
          <label className="block"><Label>직함</Label><TextInput value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="block sm:col-span-2"><Label>원문 URL (선택)</Label><TextInput value={url} onChange={(event) => setUrl(event.target.value)} /></label>
          <label className="block sm:col-span-2"><Label>본문</Label><TextArea rows={8} value={text} onChange={(event) => setText(event.target.value)} /></label>
        </div>
      ) : null}
      {source === "customer_role" ? <CustomerRoleSelect value={roleId} onChange={setRoleId} /> : null}
      <div className="mt-3">
        <Button variant="primary" onClick={read} loading={action.loading} disabled={!ready}>JD 읽기</Button>
      </div>
      <ErrorNotice message={action.error} />
      {action.result?.jd ? <JdSummary jd={action.result.jd} /> : null}
    </div>
  );
}
