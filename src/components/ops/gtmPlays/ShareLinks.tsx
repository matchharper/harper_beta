import { useCallback, useEffect, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { GtmJd } from "@/lib/gtmPlays/shared";
import type { ShareLinkListItem } from "@/lib/shareLinks/server";
import type { ShareLinkSnapshot, ShareLinkSource } from "@/lib/shareLinks/shared";
import { formatKst, useGtmAction } from "./api";
import { JdInput, JdSummary } from "./JdInput";
import { Badge, Button, ErrorNotice, Hint, Label, Panel, Select, Stat, TextInput } from "./ui";

const SOURCE_LABEL: Record<ShareLinkSource, string> = {
  site_application: "회사 사이트 지원서",
  mail_application: "회사 메일 지원",
  outreach_mail: "먼저 보낸 메일",
  follow_up: "후속 메일",
  ops_manual: "직접 만든 링크",
};

const CTA_LABEL: Record<string, string> = {
  salary: "희망 연봉",
  start: "가능 시점",
  schedule: "일정 잡기",
  more: "비슷한 후보",
  ask: "직접 질문",
};

const HINTS = {
  made: "후보 1명 · 회사 1곳 · 공고 1개마다 링크 1개예요(후속 메일도 같은 링크). 기간 안에 만든 링크만 세요.",
  opened: "회사 쪽에서 링크 페이지가 1초 넘게 열려 있던 링크 수예요. 메일 보안 검사기가 미리 여는 건 세지 않아요. 후보 본인·하퍼 직원이 로그인한 채 연 것도 빼요.",
  cta: "질문 버튼(희망 연봉·가능 시점·일정 잡기·비슷한 후보)을 누르거나 직접 질문을 쓴 링크 수예요. 누르면 가입 창이 떠요.",
  claimed: "가입·로그인해서 그 공고 Role에 후보가 들어간 링크 수예요(/org '연결을 요청할 후보').",
  create: "후보·회사·공고를 고르면 링크와 메일에 붙일 상자를 만들어요. 같은 후보·회사·공고로 이미 만든 링크가 있으면 그 링크를 다시 보여 줘요. 받는 사람이 개인 메일(gmail 등)이면 만들지 않아요. 후보가 차단한 회사도 안 돼요.",
} as const;

type CreateResult = {
  url: string;
  created: boolean;
  snapshot: ShareLinkSnapshot;
  language: "ko" | "en";
  mailText: string;
  mailHtml: string;
};

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

/** 링크 만들기: one link by hand, with the box to paste into a mail. */
function CreateLink({ writes, onCreated }: { writes: boolean; onCreated: () => void }) {
  const [talent, setTalent] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const [jd, setJd] = useState<GtmJd | null>(null);
  const create = useGtmAction<CreateResult>();
  const result = create.result;
  const submit = async () => {
    const next = await create.run("share.create", {
      talent,
      companyName: companyName || jd?.companyName || "",
      recipientEmail: recipientEmail.trim() || null,
      companyDomain: companyDomain.trim() || null,
      jd,
    });
    if (next) onCreated();
  };
  return (
    <Panel title={<span className="inline-flex items-center gap-1">링크 만들기<Hint label="링크 만들기" text={HINTS.create} /></span>}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <Label>후보 (하퍼 회원 이메일 또는 id)</Label>
          <TextInput value={talent} onChange={(event) => setTalent(event.target.value)} placeholder="name@example.com" />
        </label>
        <label className="block">
          <Label>회사 이름</Label>
          <TextInput value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder={jd?.companyName || "회사 이름"} />
        </label>
        <label className="block">
          <Label>받는 사람 메일 (선택)</Label>
          <TextInput value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="recruit@company.com" />
        </label>
        <label className="block">
          <Label>회사 도메인 (선택, 받는 사람 메일이 없을 때)</Label>
          <TextInput value={companyDomain} onChange={(event) => setCompanyDomain(event.target.value)} placeholder="company.com" />
        </label>
      </div>
      <div className="mt-4">
        <Label>공고 (없으면 공고 없는 메일로 만들어요. 가입해도 Role은 만들지 않아요)</Label>
        {jd ? (
          <div className="space-y-2">
            <JdSummary jd={jd} />
            <Button onClick={() => setJd(null)}>공고 빼기</Button>
          </div>
        ) : <JdInput onJd={setJd} />}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="primary"
          disabled={!writes || !talent.trim() || !(companyName.trim() || jd?.companyName)}
          loading={create.loading}
          onClick={() => void submit()}
        >
          링크 만들기
        </Button>
        {!writes ? <span className="text-[12px] text-neutral-muted">쓰기 켜진 서버에서만 돼요</span> : null}
      </div>
      <ErrorNotice message={create.error} />
      {result ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={result.created ? "positive" : "default"}>{result.created ? "새로 만듦" : "전에 만든 링크"}</Badge>
            <a className={cx(opsTheme.link, "break-all")} href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
            <Button onClick={() => copy(result.url)}>링크 복사</Button>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Label>메일에 붙일 상자</Label>
              <Button onClick={() => copy(result.mailHtml)}>HTML 복사</Button>
              <Button onClick={() => copy(result.mailText)}>글자만 복사</Button>
            </div>
            {/* The same HTML the mail carries (built from escaped text by the server). */}
            <div className="rounded-md bg-bg-default p-4" dangerouslySetInnerHTML={{ __html: result.mailHtml }} />
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/** 후보 공유 링크: links made, opened, a button pressed, taken into /org — by where the link went out. */
export function ShareLinks({ writes }: { writes: boolean }) {
  const [days, setDays] = useState(30);
  const list = useGtmAction<{ links: ShareLinkListItem[] }>();
  const { run } = list;
  const load = useCallback(() => { void run("share.list", { days }); }, [run, days]);
  useEffect(() => { load(); }, [load]);
  const links = list.result?.links ?? [];
  const count = (pick: (link: ShareLinkListItem) => boolean) => links.filter(pick).length;
  const bySource = Object.entries(SOURCE_LABEL)
    .map(([source, label]) => ({ source, label, links: links.filter((link) => link.source === source) }))
    .filter((group) => group.links.length);
  return (
    <div className="space-y-4">
      <Panel
        title={`후보 공유 링크 ${links.length}개`}
        actions={(
          <>
            <label className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[12px] text-neutral-muted">만든 기간</span>
              <Select value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-32">
                {[7, 30, 90].map((value) => <option key={value} value={value}>최근 {value}일</option>)}
              </Select>
            </label>
            <Button onClick={load} loading={list.loading}>새로고침</Button>
          </>
        )}
      >
        <ErrorNotice message={list.error} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="만든 링크" value={links.length} />
          <Stat label="열어봄" value={count((link) => Boolean(link.openedAt))} />
          <Stat label="버튼 누름" value={count((link) => Boolean(link.cta))} />
          <Stat label="가입해서 받음" value={count((link) => Boolean(link.claimedAt))} />
        </div>
        <p className="mt-2 flex flex-wrap gap-3 text-[12px] text-neutral-muted">
          <span className="inline-flex items-center gap-1">만든 링크<Hint label="만든 링크" text={HINTS.made} /></span>
          <span className="inline-flex items-center gap-1">열어봄<Hint label="열어봄" text={HINTS.opened} /></span>
          <span className="inline-flex items-center gap-1">버튼 누름<Hint label="버튼 누름" text={HINTS.cta} /></span>
          <span className="inline-flex items-center gap-1">가입해서 받음<Hint label="가입해서 받음" text={HINTS.claimed} /></span>
        </p>
        {bySource.length ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-[12px] text-neutral-muted">
              <tr>
                <th className="py-1.5 pr-3 font-normal">출처</th>
                <th className="px-2 text-right font-normal">만든</th>
                <th className="px-2 text-right font-normal">열어봄</th>
                <th className="px-2 text-right font-normal">버튼</th>
                <th className="px-2 text-right font-normal">받음</th>
              </tr>
            </thead>
            <tbody className={cx("divide-y", opsTheme.divider)}>
              {bySource.map((group) => (
                <tr key={group.source}>
                  <td className="py-1.5 pr-3">{group.label}</td>
                  <td className="px-2 text-right tabular-nums">{group.links.length}</td>
                  <td className="px-2 text-right tabular-nums">{group.links.filter((link) => link.openedAt).length}</td>
                  <td className="px-2 text-right tabular-nums">{group.links.filter((link) => link.cta).length}</td>
                  <td className="px-2 text-right tabular-nums">{group.links.filter((link) => link.claimedAt).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {links.length ? (
          <ul className={cx("mt-4 max-h-[50vh] divide-y overflow-auto text-sm", opsTheme.divider)}>
            {links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="min-w-0">
                  <span className="font-medium">{link.name || "-"}</span>
                  <span className="text-neutral-muted"> → {link.companyName}{link.postingTitle ? ` · ${link.postingTitle}` : ""}</span>
                  <span className="ml-2 text-[11px] text-neutral-soft">{SOURCE_LABEL[link.source]} · {formatKst(link.createdAt)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-neutral-muted">
                  {link.openedAt ? <Badge>열어봄 {link.openCount}번</Badge> : <span>안 열어봄</span>}
                  {link.cta ? <Badge tone="strong">{CTA_LABEL[link.cta] ?? link.cta}</Badge> : null}
                  {link.claimedAt ? <Badge tone="positive">받음</Badge> : null}
                  <a className={opsTheme.link} href={link.url} target="_blank" rel="noreferrer">링크</a>
                </span>
              </li>
            ))}
          </ul>
        ) : list.result ? <p className="mt-4 text-sm text-neutral-muted">기간 안에 만든 링크가 없어요.</p> : null}
      </Panel>
      <CreateLink writes={writes} onCreated={load} />
    </div>
  );
}
