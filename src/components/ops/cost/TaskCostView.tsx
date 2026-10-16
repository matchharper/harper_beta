import { Fragment, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { opsTheme } from "@/components/ops/theme";
import {
  TASK_COST_GROUPS,
  summarizeTaskCosts,
  type OpsTaskCostResponse,
} from "@/lib/ops/taskCosts";

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: amount !== 0 && Math.abs(amount) < 0.01 ? 4 : 2,
  }).format(amount);
const percent = (amount: number, total: number) =>
  total === 0 ? "—" : `${((amount / total) * 100).toFixed(1)}%`;
const sourceLabels: Record<string, string> = {
  "career/chat": "Career 채팅",
  "career/realtime": "실시간 음성",
  "career/live": "Live 음성",
  "career/internal-opportunity-call-request": "내부 제안 통화 요청",
  career_tool: "채용공고 검색·임베딩",
  opportunity_discovery: "후보자 추천 Worker",
  company_first_search: "회사 중심 후보자 탐색",
  "career/profile_ingestion": "프로필 수집",
  "career/gmail-career-history": "이메일 경력 정리",
  email_reply: "이메일 답장",
  "org/intro-email": "Intro 이메일",
  "org/auto-intro": "자동 Intro",
  "org/slack-router": "Slack 요청 분류",
  "career_tool:recommend_job_postings": "채용공고 추천",
  "career_tool:update_talent_profile": "프로필 갱신",
  "career_tool:research_company": "회사 조사",
  "career_tool:web_search": "웹 검색",
  "career_tool:open_url": "페이지 읽기",
};

export function TaskCostView({ data }: { data: OpsTaskCostResponse }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const selected =
    selectedDate && selectedDate >= data.from && selectedDate <= data.through
      ? selectedDate
      : null;
  const groups = useMemo(
    () => summarizeTaskCosts(data.rows, selected),
    [data.rows, selected]
  );
  const total = groups.reduce((sum, group) => sum + group.amount, 0);
  const unpriced = groups.reduce(
    (sum, group) => sum + group.unpricedRecords,
    0
  );
  const chartRows = useMemo(() => {
    const days = new Map<string, Record<string, number | string>>();
    for (
      let cursor = new Date(`${data.from}T00:00:00Z`);
      cursor.toISOString().slice(0, 10) <= data.through;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const date = cursor.toISOString().slice(0, 10);
      days.set(date, {
        date,
        total: 0,
        ...Object.fromEntries(TASK_COST_GROUPS.map((g) => [g.id, 0])),
      });
    }
    for (const row of data.rows) {
      const day = days.get(row.date);
      if (day) {
        day[row.taskId] = Number(day[row.taskId]) + row.amount;
        day.total = Number(day.total) + row.amount;
      }
    }
    return [...days.values()];
  }, [data]);
  const activeGroups = TASK_COST_GROUPS.filter((group) =>
    data.rows.some((row) => row.taskId === group.id)
  );
  return (
    <div className="space-y-4">
      <section
        className={`${opsTheme.panel} p-4`}
        aria-label="태스크별 일별 비용"
      >
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-muted">
          {activeGroups.map((group) => (
            <span key={group.id} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: group.color }}
              />
              {group.label}
            </span>
          ))}
        </div>
        <div className="h-[260px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              stackOffset="sign"
              margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
              onClick={(state) => {
                const date = String(state?.activeLabel ?? "");
                if (chartRows.some((row) => row.date === date))
                  setSelectedDate(date);
              }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--color-neutral-1000-a05)"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(date) =>
                  String(date).slice(5).replace("-", ".")
                }
                tickLine={false}
                axisLine={false}
                fontSize={11}
                minTickGap={20}
              />
              <YAxis
                tickFormatter={(value) => `$${value}`}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={55}
              />
              <Tooltip
                cursor={{ fill: "var(--color-neutral-1000-a05)" }}
                content={({ active, label, payload }) => {
                  if (!active || !payload?.length) return null;
                  const items = payload
                    .filter((item) => Number(item.value) !== 0)
                    .sort((a, b) => Number(b.value) - Number(a.value));
                  const dayTotal = items.reduce(
                    (sum, item) => sum + Number(item.value),
                    0
                  );
                  return (
                    <div className="min-w-[250px] rounded-md border border-neutral-1000-a10 bg-bg-floating p-3 text-xs text-neutral-primary shadow-lg">
                      <div className="mb-2 flex justify-between gap-4 font-medium">
                        <span>{String(label)}</span>
                        <span>{money(dayTotal)}</span>
                      </div>
                      {items.map((item) => (
                        <div
                          key={String(item.name)}
                          className="mt-1 flex justify-between gap-4"
                        >
                          <span>{item.name}</span>
                          <span className="tabular-nums">
                            {money(Number(item.value))} (
                            {percent(Number(item.value), dayTotal)})
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {activeGroups.map((group) => (
                <Bar
                  key={group.id}
                  dataKey={group.id}
                  name={group.label}
                  fill={group.color}
                  stackId="tasks"
                  maxBarSize={40}
                  cursor="pointer"
                >
                  {chartRows.map((row) => (
                    <Cell
                      key={String(row.date)}
                      fillOpacity={selected && row.date !== selected ? 0.4 : 1}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section
        className={`${opsTheme.panel} p-4`}
        aria-label="태스크 비용 내역"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-neutral-primary">
              {selected ?? "전체 기간"}
            </h3>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {money(total)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="비용 조회 날짜"
              min={data.from}
              max={data.through}
              value={selected ?? ""}
              onChange={(event) => setSelectedDate(event.target.value || null)}
              className="w-[155px]"
            />
            <MuteButton
              onClick={() => setSelectedDate(null)}
              disabled={!selected}
            >
              전체 기간
            </MuteButton>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-neutral-1000-a05">
              <TableHead>태스크</TableHead>
              <TableHead className="text-right">비용</TableHead>
              <TableHead className="text-right">비중</TableHead>
              <TableHead className="text-right">비용 기록</TableHead>
              <TableHead className="text-right">미산정 포함</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <Fragment key={group.id}>
                <TableRow className="border-neutral-1000-a05">
                  <TableCell>
                    <MuteButton
                      variant="transparent"
                      aria-expanded={expanded === group.id}
                      aria-controls={`cost-details-${group.id}`}
                      onClick={() =>
                        setExpanded(expanded === group.id ? null : group.id)
                      }
                    >
                      {expanded === group.id ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: group.color }}
                      />
                      {group.label}
                    </MuteButton>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(group.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percent(group.amount, total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {group.records.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {group.unpricedRecords
                      ? group.unpricedRecords.toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
                {expanded === group.id ? (
                  <TableRow
                    id={`cost-details-${group.id}`}
                    className="border-neutral-1000-a05 bg-bg-weak"
                  >
                    <TableCell colSpan={5}>
                      <div className="mb-2 text-xs text-neutral-muted">
                        {group.description}
                      </div>
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow>
                            <TableHead>작업</TableHead>
                            <TableHead>모델</TableHead>
                            <TableHead className="text-right">비용</TableHead>
                            <TableHead className="text-right">
                              비용 기록
                            </TableHead>
                            <TableHead className="text-right">
                              미산정 포함
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.details.map((detail) => (
                            <TableRow
                              key={JSON.stringify([
                                detail.source,
                                detail.model,
                              ])}
                              className="border-neutral-1000-a05"
                            >
                              <TableCell>
                                {sourceLabels[detail.source] ?? detail.source}
                              </TableCell>
                              <TableCell>{detail.model}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {money(detail.amount)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {detail.records.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {detail.unpricedRecords || "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
            {!groups.length ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-neutral-soft"
                >
                  비용 기록 없음
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <div className="mt-3 space-y-1 text-[11px] text-neutral-muted">
          <p>
            DB에 기록된 AI 비용 · UTC 기록일 기준 · 추천 Worker는 실행 생성일
            기준
          </p>
          <p>
            토큰 단가 추정과 제공사 보고 금액을 합산합니다. 인프라·미기록
            호출·회사 대화 전체 비용은 포함하지 않습니다.
          </p>
          {unpriced > 0 ? (
            <p className="text-critical">
              {unpriced.toLocaleString()}개 기록의 비용이 전부 또는 일부
              미산정되어 합계에서 빠져 있습니다.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
