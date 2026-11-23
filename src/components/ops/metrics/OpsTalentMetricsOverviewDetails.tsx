import { Info } from "lucide-react";
import { cx } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltips } from "@/components/ui/tooltip";
import type { OpsTalentMetricsOverviewResponse } from "@/lib/ops/talentMetricsOverview";

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

function DetailTitle({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <h2 className="text-sm font-semibold text-neutral-primary">{title}</h2>
      <Tooltips side="top" text={description}>
        <MuteButton
          aria-label={`${title} 설명`}
          className="-my-1"
          size="sm"
          variant="transparent"
        >
          <Info className="h-3 w-3" aria-hidden />
        </MuteButton>
      </Tooltips>
    </div>
  );
}

function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "min-w-0 border-t border-neutral-1000-a05 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0",
        className
      )}
    >
      {children}
    </section>
  );
}

function BarRow({
  count,
  emphasis = false,
  label,
  share,
  suffix,
}: {
  count: number;
  emphasis?: boolean;
  label: string;
  share: number | null;
  suffix: string;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)_112px] items-center gap-3 text-sm">
      <span className="text-neutral-muted">{label}</span>
      <div className="h-5 overflow-hidden rounded bg-bg-weak">
        <div
          className={cx("h-full", emphasis ? "bg-primary" : "bg-neutral-1000-a10")}
          style={{ width: `${Math.max((share ?? 0) * 100, share ? 1.5 : 0)}%` }}
        />
      </div>
      <span className="text-right tabular-nums text-neutral-muted">
        <span className="font-medium text-neutral-primary">
          {formatPercent(share)}
        </span>{" "}
        · {formatCount(count)}
        {suffix}
      </span>
    </div>
  );
}

function FunnelSection({
  funnel,
}: {
  funnel: OpsTalentMetricsOverviewResponse["funnel"];
}) {
  const base = funnel.steps[0]?.count ?? 0;
  const narrowest = funnel.steps
    .slice(1)
    .reduce<number | null>((lowest, step, index, steps) => {
      const previous = index === 0 ? base : steps[index - 1].count;
      const conversion = previous > 0 ? step.count / previous : 0;
      return lowest === null || conversion < lowest ? conversion : lowest;
    }, null);
  return (
    <Section>
      <div className="flex items-baseline justify-between gap-3">
        <DetailTitle
          description="선택 기간에서 마지막으로 끝난 7일(오늘 제외) 동안 가입한 사람이 가입 후 7일 안에 각 단계에 도달한 비율입니다. 아직 7일이 지나지 않은 사람은 지금까지 도달한 단계만 셉니다. 맡김은 'Harper와 지원하기'를 누르거나 내부 연결 요청을 제출한 것(채팅으로 맡겨 바로 컨펌·전달된 경우 포함), 연결은 외부 지원의 Gmail 발송·사이트 제출 완료 또는 contact_company 전달입니다. 바로 앞 단계 대비 전환이 가장 낮은 단계를 강조합니다."
          title="최근 7일 가입 퍼널"
        />
        <span className="shrink-0 text-xs tabular-nums text-neutral-soft">
          {funnel.from.slice(5).replace("-", ".")} ~ {funnel.to.slice(5).replace("-", ".")}
        </span>
      </div>
      {base === 0 ? (
        <p className="mt-4 text-sm text-neutral-muted">
          이 기간에 가입한 사람이 없습니다.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {funnel.steps.map((step, index) => {
            const previous =
              index === 0 ? base : funnel.steps[index - 1].count;
            const conversion = previous > 0 ? step.count / previous : 0;
            return (
              <BarRow
                count={step.count}
                emphasis={index > 0 && conversion === narrowest}
                key={step.key}
                label={step.label}
                share={step.count / base}
                suffix="명"
              />
            );
          })}
          {funnel.medianDaysToConnection !== null ? (
            <p className="pt-1 text-xs text-neutral-soft">
              첫 연결까지 중앙값{" "}
              {funnel.medianDaysToConnection.toLocaleString("ko-KR", {
                maximumFractionDigits: 1,
              })}
              일
            </p>
          ) : null}
        </div>
      )}
    </Section>
  );
}

function PendingSection({
  pending,
}: {
  pending: OpsTalentMetricsOverviewResponse["pendingConnections"];
}) {
  return (
    <Section>
      <DetailTitle
        description="talent가 연결을 요청해 Harper 고객사의 답을 기다리는 talent·Role 쌍입니다. 기간과 상관없이 지금 상태이며, 기다린 날수로 나눕니다."
        title="연결 요청 대기"
      />
      <div className="mt-3 text-[26px] font-semibold tracking-[-0.04em] text-neutral-primary">
        {formatCount(pending.requests)}건
        <span className="ml-2 text-sm font-normal tracking-normal text-neutral-muted">
          {formatCount(pending.talents)}명
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {pending.buckets.map((bucket, index) => (
          <BarRow
            count={bucket.count}
            emphasis={index === pending.buckets.length - 1}
            key={bucket.label}
            label={bucket.label}
            share={pending.requests > 0 ? bucket.count / pending.requests : null}
            suffix="건"
          />
        ))}
      </div>
    </Section>
  );
}

function ApplySection({
  failures,
  sites,
}: {
  failures: OpsTalentMetricsOverviewResponse["applyFailures"];
  sites: OpsTalentMetricsOverviewResponse["applySites"];
}) {
  return (
    <Section>
      <DetailTitle
        description="선택 기간에 talent가 최종 컨펌한 지원을 사이트(공고 주소의 도메인)별로 묶었습니다. 메일 지원은 'Gmail 메일' 한 줄입니다. 성공률이 낮은 사이트부터 보여 줍니다. 아래는 컨펌했지만 제출되지 않은 최근 지원의 실행 보고 첫 문장입니다."
        title="사이트별 대신 지원"
      />
      {sites.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-muted">대신 지원이 없습니다.</p>
      ) : (
        <div className="mt-3 max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>사이트</TableHead>
                <TableHead className="text-right">지원</TableHead>
                <TableHead className="text-right">성공</TableHead>
                <TableHead className="text-right">성공률</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow className="hover:bg-transparent" key={site.host}>
                  <TableCell className="max-w-48 truncate">{site.host}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(site.attempts)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(site.submitted)}
                  </TableCell>
                  <TableCell
                    className={cx(
                      "text-right tabular-nums",
                      site.submitted === 0 && "text-critical"
                    )}
                  >
                    {formatPercent(site.submitted / site.attempts)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {failures.length > 0 ? (
        <ul className="mt-4 space-y-2 text-xs">
          {failures.map((failure) => (
            <li className="leading-5" key={`${failure.at}-${failure.host}`}>
              <span className="text-neutral-soft">
                {failure.at.slice(5, 10).replace("-", ".")} · {failure.host ?? "알 수 없음"}
                {failure.status === "reserved"
                  ? " · 실행 전"
                  : failure.status !== "completed"
                    ? ` · ${failure.status}`
                    : ""}
              </span>
              <p className="text-neutral-muted">
                {failure.sentence ?? "실행 보고가 없습니다."}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function ChannelSection({
  channels,
}: {
  channels: OpsTalentMetricsOverviewResponse["channels"];
}) {
  return (
    <Section>
      <DetailTitle
        description="선택 기간 가입자를 채널별로 나눴습니다. 비율은 그중 가입 후 7일이 지난 사람이 7일 안에 각 단계에 도달한 비율입니다. 7일이 지난 사람이 아직 없는 채널은 지금까지 도달한 비율이고 '지금까지'로 표시합니다. 맡김·연결의 정의는 퍼널과 같습니다."
        title="채널별 전환"
      />
      <div className="mt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>채널</TableHead>
              <TableHead className="text-right">가입</TableHead>
              <TableHead className="text-right">첫 대화</TableHead>
              <TableHead className="text-right">Gmail 연동</TableHead>
              <TableHead className="text-right">맡김</TableHead>
              <TableHead className="text-right">연결</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => (
              <TableRow className="hover:bg-transparent" key={channel.key}>
                <TableCell>
                  {channel.label}
                  {/* No sign-up 7 days old yet: the rates are so far (talentMetricsOverview.ts ratesSoFar). */}
                  {channel.ratesSoFar ? <span className="ml-1.5 text-xs text-neutral-muted">지금까지</span> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(channel.signups)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(channel.firstChatRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(channel.gmailRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(channel.delegatedRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(channel.connectedRate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}

function PostingSection({
  postings,
}: {
  postings: OpsTalentMetricsOverviewResponse["postings"];
}) {
  return (
    <Section>
      <DetailTitle
        description="선택 기간에 /jobs 공고를 보고 가입한 사람을 공고별로 셌습니다(UTM 채널과 상관없이). 맡김은 그 가입자 중 지금까지 Harper에 지원이나 연결 요청을 맡긴 사람입니다. 내려간 공고는 흐리게 표시합니다."
        title="공고별 가입"
      />
      {postings.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-muted">
          공고로 가입한 사람이 없습니다.
        </p>
      ) : (
        <div className="mt-3 max-h-80 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>공고</TableHead>
                <TableHead className="text-right">가입</TableHead>
                <TableHead className="text-right">맡김</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {postings.map((posting) => (
                <TableRow
                  className={cx(
                    "hover:bg-transparent",
                    !posting.isPublished && "text-neutral-soft"
                  )}
                  key={posting.slug}
                >
                  <TableCell className="max-w-96 whitespace-normal">
                    {posting.companyName ? `${posting.companyName} · ` : ""}
                    {posting.roleTitle}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(posting.signups)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(posting.delegated)} (
                    {formatPercent(posting.delegated / posting.signups)})
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

export default function OpsTalentMetricsOverviewDetails({
  overview,
}: {
  overview: OpsTalentMetricsOverviewResponse;
}) {
  return (
    <>
      <div className="grid lg:grid-cols-3 lg:gap-x-8">
        <FunnelSection funnel={overview.funnel} />
        <ApplySection
          failures={overview.applyFailures}
          sites={overview.applySites}
        />
        <PendingSection pending={overview.pendingConnections} />
      </div>
      <div className="grid lg:grid-cols-2 lg:gap-x-8">
        <ChannelSection channels={overview.channels} />
        <PostingSection postings={overview.postings} />
      </div>
    </>
  );
}
