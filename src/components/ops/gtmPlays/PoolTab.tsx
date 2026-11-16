import { useRef, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { MemberFacts } from "@/lib/gtmPlays/pool.server";
import { cardLeaks, identifyingTokens, type CardPrivacyFacts } from "@/lib/gtmPlays/cardPrivacy";
import {
  CARD_LIMIT, POOL_DEFAULT_PICKS, cardText, readCardText, type AnonymousCard, type CompanyMailDraft, type GtmJd,
} from "@/lib/gtmPlays/shared";
import { gtmCall, useGtmAction } from "./api";
import { CompanyMail } from "./CompanyMail";
import { JdInput } from "./JdInput";
import { MemberTable } from "./MemberTable";
import {
  ActionBar, Button, ErrorNotice, Panel, Select, StepBar, StepTitle, TextArea, scrollToStep, stepAnchor, type FlowStep,
} from "./ui";

type MatchResult = {
  eligibleCount: number;
  members: MemberFacts[];
  companyNames: string[];
  excludedEmployees: number;
};

/** What on an edited card would identify the member (their name, an employer, a school, a link or an address). */
export function cardProblem(card: AnonymousCard, member: CardPrivacyFacts | undefined) {
  if (!card.title.trim()) return "제목이 비어 있어요";
  if (!card.highlights.some((line) => line.trim())) return "강점을 한 줄 이상 적어 주세요";
  const leaks = member ? cardLeaks(card, identifyingTokens(member)) : [];
  return leaks.length ? `후보를 알아볼 수 있는 말이 있어요: ${[...new Set(leaks)].join(", ")}` : null;
}

/** One box for the title, highlights and fit, filled with the card as made; the box text is kept as typed. */
function CardEditor({ card, onChange, onDone }: {
  card: AnonymousCard; onChange: (next: AnonymousCard) => void; onDone: () => void;
}) {
  const [text, setText] = useState(() => cardText(card));
  const { cut } = readCardText(text);
  return (
    <div className="mt-2 space-y-2">
      <TextArea value={text} rows={12} className="w-full" aria-label="카드 내용"
        onChange={(event) => {
          setText(event.target.value);
          onChange({ ...card, ...readCardText(event.target.value).fields });
        }} />
      <p className="text-[12px] text-neutral-muted">첫 줄은 제목, ‘-’로 시작하는 줄은 강점({CARD_LIMIT.highlights}줄까지), 나머지는 맞는 이유예요.</p>
      {cut.length ? <p className="text-[12px] text-critical">{cut.join(" · ")}</p> : null}
      <Button onClick={onDone}>다 고쳤어요</Button>
    </div>
  );
}

/**
 * The cards as the company sees them (no names, employers or links). With onChange each card can be rewritten
 * by hand; the same check as the generated cards (name, employer, school, link, address) runs on every edit.
 */
export function AnonymousCards({ cards, members, onChange }: {
  cards: AnonymousCard[];
  members?: Map<string, CardPrivacyFacts>;
  onChange?: (next: AnonymousCard) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card, index) => {
        const problem = onChange ? cardProblem(card, members?.get(card.talentId)) : null;
        return (
          <article key={card.talentId} className={cx(opsTheme.panelSoft, "p-4")}>
            <div className="flex items-center gap-2 text-[12px] text-neutral-muted">
              <span>후보 {index + 1}{card.years ? ` · ${card.years}` : ""}</span>
              {onChange && editing !== card.talentId ? (
                <button type="button" className="ml-auto underline hover:text-neutral-primary" onClick={() => setEditing(card.talentId)}>
                  고치기
                </button>
              ) : null}
            </div>
            {onChange && editing === card.talentId ? (
              <CardEditor card={card} onChange={onChange} onDone={() => setEditing(null)} />
            ) : (
              <>
                <h3 className="mt-1 font-semibold">{card.title}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6">
                  {card.highlights.map((line, lineIndex) => <li key={`${lineIndex}:${line}`}>{line}</li>)}
                </ul>
                <p className="mt-2 text-sm text-neutral-muted">{card.fit}</p>
              </>
            )}
            {problem ? <p className="mt-2 text-[12px] text-critical">{problem}</p> : null}
          </article>
        );
      })}
    </div>
  );
}

/** #2 공고 URL → 내부 후보: JD → 가까운 회원 50명 (읽기만) → Chris가 고른 사람 → 익명 카드 → 담당자 메일. */
export default function PoolTab({ writes }: { writes: boolean }) {
  const [jd, setJd] = useState<GtmJd | null>(null);
  const [language, setLanguage] = useState<"ko" | "en">("ko");
  const [picked, setPicked] = useState<string[]>([]);
  const match = useGtmAction<MatchResult>();
  // Cards are kept here (not in useGtmAction) so an answer for picks, a language or a JD that has since changed
  // is dropped instead of landing in the mail.
  const [madeCards, setMadeCards] = useState<AnonymousCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const cardRequest = useRef(0);
  const members = match.result?.members ?? [];
  // Cards follow the list order (closest first), whatever order the boxes were ticked in.
  const pickedMembers = members.filter((member) => picked.includes(member.talentId));

  const dropCards = () => {
    cardRequest.current += 1;
    setMadeCards([]);
    setCardsError(null);
    setCardsLoading(false);
  };

  const makeCards = async () => {
    const request = ++cardRequest.current;
    setMadeCards([]);
    setCardsError(null);
    setCardsLoading(true);
    try {
      const result = await gtmCall<{ cards: AnonymousCard[] }>("pool.cards", { jd, members: pickedMembers, language });
      if (request === cardRequest.current) setMadeCards(result.cards);
    } catch (error) {
      if (request === cardRequest.current) setCardsError(error instanceof Error ? error.message : "카드를 만들지 못했어요.");
    } finally {
      if (request === cardRequest.current) setCardsLoading(false);
    }
  };

  // Runs as soon as the JD is read (one embedding, read only); "다시 찾기" runs it again.
  const findMembers = async (forJd: GtmJd | null = jd) => {
    if (!forJd) return;
    dropCards();
    const result = await match.run("pool.match", { jd: forJd });
    if (result) setPicked(result.members.slice(0, POOL_DEFAULT_PICKS).map((member) => member.talentId));
  };

  const memberFacts = new Map<string, CardPrivacyFacts>(members.map((member) => [member.talentId, member]));
  // Chris's edits replace the card in place (same person, same order), so the mail below keeps its draft.
  const editCard = (next: AnonymousCard) => setMadeCards((current) => current.map((card) => (card.talentId === next.talentId ? next : card)));
  const cardsProblem = madeCards
    .map((card, index) => {
      const problem = cardProblem(card, memberFacts.get(card.talentId));
      return problem ? `후보 ${index + 1} 카드: ${problem}` : null;
    })
    .find(Boolean) ?? null;

  const toggle = (talentId: string) => {
    dropCards();
    setPicked((current) => current.includes(talentId)
      ? current.filter((id) => id !== talentId)
      : [...current, talentId]);
  };

  const steps: FlowStep[] = [
    { id: "jd", label: "공고 고르기", done: Boolean(jd), available: true },
    { id: "pick", label: "후보 고르기", done: picked.length > 0, available: Boolean(match.result) },
    { id: "cards", label: "익명 카드", done: madeCards.length > 0 && !cardsProblem, available: Boolean(match.result) },
    { id: "mail", label: "회사 메일 보내기", done: false, available: madeCards.length > 0 },
  ];

  return (
    <div className="space-y-4">
      <StepBar steps={steps} />
      <Panel id={stepAnchor("jd")} title={<StepTitle n={1} label="공고 고르기" hint="회사의 공고 URL·JD를 넣고 ‘JD 읽기’ (읽으면 바로 후보를 찾아요)" />}>
        <JdInput onJd={(next) => {
          setJd(next); match.setResult(null); dropCards(); setPicked([]);
          if (next) void findMembers(next);
        }} />
      </Panel>
      {jd ? (
        <Panel
          id={stepAnchor("pick")}
          title={<StepTitle n={2} label="후보 고르기" hint={`카드에 넣을 하퍼 회원을 체크해요 (처음엔 가까운 ${POOL_DEFAULT_PICKS}명)`} />}
          actions={(
            <Button
              loading={match.loading}
              disabled={cardsLoading}
              title="임베딩 1회"
              onClick={() => void findMembers()}
            >
              {match.result ? "다시 찾기" : "후보 찾기"}
            </Button>
          )}
        >
          <ErrorNotice message={match.error} />
          {match.loading && !match.result ? <p className="text-sm text-neutral-muted">JD에 가까운 하퍼 회원을 찾고 있어요</p> : null}
          {match.result ? (
            <div className="space-y-4">
              <div className="text-sm text-neutral-muted">
                매칭 가능한 회원 {match.result.eligibleCount.toLocaleString()}명 중 가까운 {members.length}명
                {match.result.excludedEmployees ? ` · 지금 이 회사에 다니는 ${match.result.excludedEmployees}명은 뺐어요` : ""}
                {match.result.companyNames.length > 1 ? ` · 차단 확인한 회사 이름: ${match.result.companyNames.join(", ")}` : ""}
              </div>
              <MemberTable members={members} picked={picked} onToggle={toggle} cards={madeCards} disabled={cardsLoading} />
            </div>
          ) : null}
        </Panel>
      ) : null}
      {jd && match.result ? (
        <Panel id={stepAnchor("cards")} title={<StepTitle n={3} label="익명 카드" hint="회사에 갈 카드예요. 이름·회사·학교·링크는 빠져요. ‘고치기’로 직접 고칠 수 있어요" />}>
          <ErrorNotice message={cardsError} />
          {madeCards.length ? <AnonymousCards cards={madeCards} members={memberFacts} onChange={editCard} /> : (
            <p className="text-sm text-neutral-muted">
              {cardsLoading ? "카드를 만들고 있어요 (만드는 동안에는 선택을 바꿀 수 없어요)" : "후보를 고르고 아래 ‘카드 만들기’를 눌러요."}
            </p>
          )}
        </Panel>
      ) : null}
      {jd && madeCards.length ? (
        <CompanyMail
          key={`${jd.companyName}|${jd.title}|${jd.url ?? ""}|${language}|${madeCards.map((card) => card.talentId).join(",")}`}
          campaign="pool"
          companyName={jd.companyName}
          homepageUrl={null}
          postingEmails={jd.contactEmails.map((email) => ({ email, url: jd.url }))}
          cards={madeCards}
          postingTitle={jd.title}
          postingUrl={jd.url}
          posting={{ title: jd.title, companyName: jd.companyName || null, location: jd.location, description: jd.description, url: jd.url }}
          fixedLanguage={language}
          writes={writes}
          step={4}
          sendBlocked={cardsProblem}
          draft={async (mailLanguage) => (await gtmCall<{ draft: CompanyMailDraft }>("pool.mail", {
            jd, cardCount: madeCards.length, language: mailLanguage,
          })).draft}
        />
      ) : null}
      {jd && match.result ? (
        <ActionBar>
          <span className="text-sm">
            선택 <b className="tabular-nums">{picked.length}명</b>
            {madeCards.length ? <span className="text-neutral-muted"> · 카드 {madeCards.length}장</span> : null}
            {cardsProblem ? <span className="ml-2 text-[12px] text-critical">{cardsProblem}</span> : null}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={language}
              disabled={cardsLoading}
              onChange={(event) => { setLanguage(event.target.value as "ko" | "en"); dropCards(); }}
              className="w-28"
              aria-label="카드 언어"
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </Select>
            <Button
              variant={madeCards.length ? "secondary" : "primary"}
              loading={cardsLoading}
              disabled={!pickedMembers.length}
              title="LLM 1회 (이름·회사·학교·링크가 들어간 카드만 한 번 더)"
              onClick={() => { scrollToStep("cards"); void makeCards(); }}
            >
              {madeCards.length ? "카드 다시 만들기" : "3. 카드 만들기"}
            </Button>
            {madeCards.length ? (
              <Button variant="primary" onClick={() => scrollToStep("mail")}>4. 회사 메일로 ↓</Button>
            ) : null}
          </div>
        </ActionBar>
      ) : null}
    </div>
  );
}
