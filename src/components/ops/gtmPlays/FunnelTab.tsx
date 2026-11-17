import { useCallback, useEffect, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { ApplicationRow, ApplyFunnelRow, CandidatePagePreview } from "@/lib/gtmPlays/demand.server";
import { formatKst, useGtmAction } from "./api";
import { Badge, Button, ErrorNotice, Hint, Panel, Select } from "./ui";

/** Header copy: what each number counts and what it is for. */
const HINTS = {
  company: "하퍼가 후보 대신 지원서를 보낸 회사예요. '고객'은 하퍼 회사 계정이 있는 회사예요. 하퍼에 없는 회사는 메일 도메인으로 보여요(링크에 회사 이름이 있으면 그 이름). 하퍼 직원·테스트 계정이 보낸 건 빼요(/ops/jobs와 같은 기준).",
  people: "이 회사에 하퍼가 대신 지원한 후보 수(중복 없이)예요.",
  sent: "후보가 승인하면 하퍼가 후보 대신 지원서를 보내요. 지원서 1건 = 후보 1명이 공고 1개에 실제로 낸 것이에요(한 후보가 여러 공고에 내면 여러 건).",
  site: "하퍼 브라우저가 이 회사 채용 사이트에 실제로 낸 지원서 수예요. 후보·공고 1쌍을 1건으로 세요. 실행 보고에 제출 확인이 있거나 후보 기회가 '지원함'이 된 것만 세고, 중간에 멈춘 시도(필수 칸·인증 코드 등)는 세지 않아요.",
  mail: "하퍼가 후보 Gmail로 이 회사 메일 주소에 보낸 지원 메일 수예요. 이력서 같은 첨부 파일이 있거나 후보 요약 링크를 넣은 메일만 세요(문의·후속 메일은 빼요). 받는 주소의 도메인이 홈페이지인 회사에 세고, 하퍼에 그런 회사가 없으면 그 도메인을 회사 1곳으로 세요. 개인 메일(gmail 등)로 간 건 빼고, 메일 1통은 회사 1곳에만 세요.",
  total: "회사 사이트 + 회사 메일 지원서 수예요.",
  links: "후보가 지원서를 승인할 때 'Harper 후보 요약 링크 넣기'에 체크하면 지원서에 후보 요약 링크가 들어가요. 메일 지원은 메일 끝 상자로, 회사 사이트 지원서는 비어 있는 링크 칸(없으면 커버레터 같은 자유 입력 칸 끝 한 줄)에 넣고, 넣을 칸이 없으면 빼요. 이 기능이 나간 뒤(괄호 안 날짜, 첫 링크가 생긴 날)에 보낸 지원서부터 들어가서, 그 전 지원서는 링크 0으로 보여요. 링크 1개 = 후보 1명 · 공고 1개.",
  linkSent: "지원서에 실제로 들어간 후보 요약 링크 수예요. 링크 1개 = 후보 1명 · 공고 1개라서, 같은 공고에 지원서를 다시 보내도 링크는 1개로 세요. 메일은 보낸 본문에 링크가 있는 것, 회사 사이트는 하퍼 브라우저가 링크를 넣었다고 보고한 것만 세요.",
  linkOpened: "그 링크 중 회사가 연 링크 수예요. 화면에 1초 넘게 열려 있었던 것만 세고, 하퍼 직원·후보 본인이 연 건 빼요.",
  linkPressed: "그 링크 중 회사가 질문(희망 연봉은?·언제부터 가능?·직접 쓴 질문)·일정 잡기·후보 더 검토하기 중 하나를 누른 링크 수예요. 누르면 가입 창이 떠요.",
  linkClaimed: "그 링크 중 회사가 그 링크로 가입·로그인해서 그 공고 Role에 후보를 받은 링크 수예요.",
} as const;

/** "11/16": the day (KST) the first link was made. */
const kstDay = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" })
  .format(new Date(value)).replace("-", "/");

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

function Applications({ companyKey, days }: { companyKey: string; days: number }) {
  const list = useGtmAction<{ applications: ApplicationRow[]; total: number }>();
  const page = useGtmAction<{ preview: CandidatePagePreview }>();
  const [talentId, setTalentId] = useState<string | null>(null);
  const { run } = list;
  // Remounted per company (key), so the picked application starts empty.
  useEffect(() => { void run("funnel.applications", { key: companyKey, days }); }, [run, companyKey, days]);
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
                  <Badge>{application.via === "web" ? "회사 사이트로 제출" : "회사 메일로 보냄"}</Badge>
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

/** #1 후보자 링크: 회사별로 하퍼가 대신 보낸 지원서 수와, 지원서에 넣은 후보 요약 링크를 회사가 어떻게 했는지. */
export default function FunnelTab() {
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useGtmAction<{ companies: ApplyFunnelRow[]; linksSince: string | null }>();
  const { run } = list;
  const load = useCallback(() => { void run("funnel.list", { days }); }, [run, days]);
  useEffect(() => { load(); }, [load]);
  const companies = list.result?.companies ?? [];
  const linksSince = list.result?.linksSince ?? null;
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
          <table className="w-full min-w-[880px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-16" />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-16" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-16" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-bg-default text-left text-[12px] text-neutral-muted">
              <tr>
                <th colSpan={2} />
                <GroupHeader label="하퍼가 대신 보낸 지원서" hint={HINTS.sent} span={3} />
                <GroupHeader
                  label={linksSince ? `후보자 링크 (${kstDay(linksSince)}부터)` : "후보자 링크 (아직 없음)"}
                  hint={HINTS.links}
                  span={4}
                />
              </tr>
              <tr>
                <th className="py-1.5 pr-3 font-normal"><HeaderLabel label="회사" hint={HINTS.company} align="left" /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="후보" hint={HINTS.people} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="회사 사이트로" hint={HINTS.site} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="회사 메일로" hint={HINTS.mail} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="합계" hint={HINTS.total} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="링크 넣음" hint={HINTS.linkSent} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="열어봄" hint={HINTS.linkOpened} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="버튼 누름" hint={HINTS.linkPressed} /></th>
                <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="가입" hint={HINTS.linkClaimed} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-1000-a05">
              {companies.map((company) => (
                <tr
                  key={company.key}
                  onClick={() => setSelected(company.key)}
                  className={cx("cursor-pointer", selected === company.key ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
                >
                  <td className="truncate py-1.5 pr-3" title={company.mailDomain ? `${company.companyName} (${company.mailDomain}, 하퍼에 없는 회사)` : company.companyName}>
                    {company.companyName}
                    {company.isCustomer ? <span className="ml-1 text-[12px] text-neutral-muted">고객</span> : null}
                    {company.mailDomain && company.companyName !== company.mailDomain
                      ? <span className="ml-1 text-[12px] text-neutral-muted">{company.mailDomain}</span> : null}
                  </td>
                  <td className="px-2 text-right tabular-nums text-neutral-muted">{company.people}</td>
                  <td className="px-2 text-right tabular-nums">{company.siteApplications}</td>
                  <td className="px-2 text-right tabular-nums">{company.mailApplications}</td>
                  <td className="px-2 text-right font-medium tabular-nums">{company.siteApplications + company.mailApplications}</td>
                  <td className="px-2 text-right tabular-nums">{company.links.sent}</td>
                  <td className="px-2 text-right tabular-nums">{company.links.opened}</td>
                  <td className="px-2 text-right tabular-nums">{company.links.pressed}</td>
                  <td className="px-2 text-right font-medium tabular-nums">{company.links.claimed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div>{selected ? <Applications key={selected} companyKey={selected} days={days} /> : null}</div>
    </div>
  );
}
