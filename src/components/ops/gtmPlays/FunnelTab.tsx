import { useCallback, useEffect, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { ApplicationRow, ApplyFunnelRow, CandidatePagePreview } from "@/lib/gtmPlays/demand.server";
import { formatKst, useGtmAction } from "./api";
import { Badge, Button, ErrorNotice, Hint, Panel, Select } from "./ui";

/** Header copy: what each number counts and what it is for. */
const HINTS = {
  company: "하퍼가 후보 대신 지원서를 보낸 회사예요. '고객'은 하퍼 회사 계정이 있는 회사예요. 하퍼 직원·테스트 계정이 보낸 건 빼요(/ops/jobs와 같은 기준).",
  people: "이 회사에 하퍼가 대신 지원한 후보 수(중복 없이)예요.",
  sent: "후보가 승인하면 하퍼가 후보 대신 지원서를 보내요. 지원서 1건 = 후보 1명이 공고 1개에 실제로 낸 것이에요(한 후보가 여러 공고에 내면 여러 건).",
  site: "하퍼 브라우저가 이 회사 채용 사이트에 실제로 낸 지원서 수예요. 후보·공고 1쌍을 1건으로 세요. 실행 보고에 제출 확인이 있거나 후보 기회가 '지원함'이 된 것만 세고, 중간에 멈춘 시도(필수 칸·인증 코드 등)는 세지 않아요.",
  mail: "하퍼가 후보 Gmail로 이 회사 메일 주소에 보낸 메일 중 이력서 같은 첨부 파일이 있는 것만 세요(문의·후속 메일은 빼요). 주소는 회사 홈페이지 도메인(또는 그 하위 도메인)이고, 메일 1통은 회사 1곳에만 세요.",
  total: "회사 사이트 + 회사 메일 지원서 수예요.",
} as const;

function HeaderLabel({ label, hint, align = "right" }: { label: string; hint: string; align?: "left" | "right" | "center" }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap",
      align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start")}
    >
      {/* Right-aligned numbers: ⓘ first, so the label ends where the numbers end. */}
      {align === "right" ? <Hint label={label} text={hint} /> : null}
      {label}
      {align === "right" ? null : <Hint label={label} text={hint} />}
    </span>
  );
}

/** A group label over its columns: underlined, with a gap before the next group (no vertical lines). */
function GroupHeader({ label, hint, span }: { label: string; hint: string; span: number }) {
  return (
    <th colSpan={span} className="px-2 pb-1 pt-1 font-normal">
      <div className="flex justify-center border-b border-neutral-1000-a10 pb-1">
        <HeaderLabel label={label} hint={hint} align="center" />
      </div>
    </th>
  );
}

/** The candidate behind an application (internal view). */
function CandidatePage({ preview }: { preview: CandidatePagePreview }) {
  return (
    <div className="rounded-lg bg-bg-default p-5 shadow-sm">
      <h3 className="text-lg font-semibold">{preview.name ?? "-"}</h3>
      <p className="text-sm text-neutral-muted">{[preview.headline, preview.location].filter(Boolean).join(" · ")}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {preview.experiences.map((row, index) => (
          <li key={`${row.company}-${index}`}>
            <span className="font-medium">{row.role ?? "-"}</span> · {row.company ?? "-"}
            <span className="text-neutral-muted"> ({row.start?.slice(0, 7) ?? "?"} ~ {row.end?.slice(0, 7) ?? "현재"})</span>
          </li>
        ))}
      </ul>
      {preview.educations.length ? (
        <ul className="mt-2 space-y-1 text-sm text-neutral-muted">
          {preview.educations.map((row, index) => <li key={index}>{[row.school, row.degree, row.field].filter(Boolean).join(" · ")}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function Applications({ workspaceId, days }: { workspaceId: string; days: number }) {
  const list = useGtmAction<{ applications: ApplicationRow[]; total: number }>();
  const page = useGtmAction<{ preview: CandidatePagePreview }>();
  const [talentId, setTalentId] = useState<string | null>(null);
  const { run } = list;
  // Remounted per company (key), so the picked application starts empty.
  useEffect(() => { void run("funnel.applications", { workspaceId, days }); }, [run, workspaceId, days]);
  return (
    <div className="space-y-4">
      <Panel title={`보낸 지원서${list.result ? ` ${list.result.total}건` : ""}`}>
        <ErrorNotice message={list.error} />
        {list.loading && !list.result ? <p className="text-sm text-neutral-muted">지원서 목록을 읽고 있어요 (몇 초 걸려요)</p> : null}
        {list.result && list.result.total > list.result.applications.length ? (
          <p className="mb-2 text-[12px] text-neutral-muted">최근 {list.result.applications.length}건만 보여요 (전체 {list.result.total}건)</p>
        ) : null}
        <ul className="space-y-1">
          {(list.result?.applications ?? []).map((application, index) => (
            <li key={`${application.talentId}-${application.at}-${index}`}>
              <button
                type="button"
                onClick={() => { setTalentId(application.talentId); void page.run("funnel.candidate", { talentId: application.talentId }); }}
                className={cx("w-full rounded-md px-3 py-2 text-left text-sm", talentId === application.talentId ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{application.talentName ?? "-"}</span>
                  <Badge>{application.via === "web" ? "회사 사이트로 제출" : "회사 메일로 (첨부 있음)"}</Badge>
                  <span className="text-[12px] text-neutral-muted">
                    {formatKst(application.at)}{application.attempts > 1 ? ` · 시도 ${application.attempts}번` : ""}
                  </span>
                </div>
                <div className="text-[12px] text-neutral-muted">{application.roleName ?? ""}{application.summary ? ` · ${application.summary}` : ""}</div>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {talentId ? (
        <Panel title="후보 프로필">
          <ErrorNotice message={page.error} />
          {page.result ? <CandidatePage preview={page.result.preview} /> : null}
        </Panel>
      ) : null}
    </div>
  );
}

/** #1 대신 지원: 회사별로 하퍼가 보낸 지원서 수. 회사가 열어봤는지는 아직 세지 않아요(미완성). */
export default function FunnelTab() {
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useGtmAction<{ companies: ApplyFunnelRow[] }>();
  const { run } = list;
  const load = useCallback(() => { void run("funnel.list", { days }); }, [run, days]);
  useEffect(() => { load(); }, [load]);
  const companies = list.result?.companies ?? [];
  return (
    <div className={cx("grid gap-4", selected && "2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]")}>
      <Panel
        title={`회사 ${companies.length}곳`}
        actions={(
          <>
            <label className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[12px] text-neutral-muted">기간</span>
              <Select value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-32">
                {[7, 30, 90].map((value) => <option key={value} value={value}>최근 {value}일</option>)}
              </Select>
            </label>
            <Button onClick={load} loading={list.loading}>새로고침</Button>
          </>
        )}
      >
        <ErrorNotice message={list.error} />
        {list.loading && !list.result ? (
          <p className="text-sm text-neutral-muted">회사별로 보낸 지원서를 세고 있어요 (5초쯤 걸려요)</p>
        ) : null}
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[560px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-20" />
              <col className="w-32" />
              <col className="w-36" />
              <col className="w-20" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-bg-default text-left text-[12px] text-neutral-muted">
              <tr>
                <th colSpan={2} />
                <GroupHeader label="하퍼가 대신 보낸 지원서" hint={HINTS.sent} span={3} />
              </tr>
              <tr>
                <th className="py-1.5 pr-3 font-normal"><HeaderLabel label="회사" hint={HINTS.company} align="left" /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="후보" hint={HINTS.people} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="회사 사이트로" hint={HINTS.site} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="회사 메일로 (첨부)" hint={HINTS.mail} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="합계" hint={HINTS.total} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-1000-a05">
              {companies.map((company) => (
                <tr
                  key={company.workspaceId}
                  onClick={() => setSelected(company.workspaceId)}
                  className={cx("cursor-pointer", selected === company.workspaceId ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
                >
                  <td className="truncate py-1.5 pr-3" title={company.companyName}>
                    {company.companyName}
                    {company.isCustomer ? <span className="ml-1 text-[12px] text-neutral-muted">고객</span> : null}
                  </td>
                  <td className="px-2 text-right tabular-nums text-neutral-muted">{company.people}</td>
                  <td className="px-2 text-right tabular-nums">{company.siteApplications}</td>
                  <td className="px-2 text-right tabular-nums">{company.mailApplications}</td>
                  <td className="px-2 text-right font-medium tabular-nums">{company.siteApplications + company.mailApplications}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div>{selected ? <Applications key={selected} workspaceId={selected} days={days} /> : null}</div>
    </div>
  );
}
