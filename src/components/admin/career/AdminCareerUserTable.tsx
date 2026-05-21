import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltips } from "@/components/ui/tooltip";
import type { AdminCareerUserRow } from "@/lib/adminCareerAnalytics/types";
import { ExternalLink, Info } from "lucide-react";

type AdminCareerUserTableProps = {
  users: AdminCareerUserRow[];
};

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const USER_TABLE_TOOLTIPS: Record<string, string> = {
  user: "talent_users의 name/email입니다. email이 없으면 user_id를 보조로 표시합니다.",
  createdAt:
    "talent_users.created_at입니다. 가입 날짜 확인용으로 추가한 컬럼입니다.",
  lastActive:
    "login_completed, talent_users.last_logined_at, career 로그, 유저 메시지, 추천 열람/클릭/피드백/status 변경 중 가장 최신값입니다. 시스템 추천 생성이나 talent_setting.updated_at만으로는 활동으로 보지 않습니다.",
  message:
    "talent_messages에서 role='user'인 메시지 수입니다. 유저가 실제로 대화한 정도를 봅니다.",
  recommendation:
    "talent_opportunity_recommendation에서 해당 유저가 받은 추천 레코드 수입니다.",
  viewed:
    "talent_opportunity_recommendation.viewed_at이 있는 추천 수입니다. 추천을 실제로 열람했는지 봅니다.",
  jd: "career 로그의 *_open_jd 또는 recommendation.clicked_at 기준 JD 클릭/열람 수입니다.",
  company: "career 로그의 *_open_company 기준 회사 정보 클릭/열람 수입니다.",
  feedback:
    "talent_opportunity_recommendation.feedback의 like / dislike 개수입니다. 화면에서는 positive / negative로 표시됩니다.",
  flags:
    "done은 talent_setting.is_onboarding_done=true입니다. returned는 첫 추천 이후 login_completed, career 로그, 유저 메시지, 추천 열람/클릭/피드백/status 변경, 또는 last_logined_at이 있다는 뜻입니다.",
  lastSignal:
    "가장 최근에 확인된 의미 있는 행동입니다. 메시지, 추천 열람, JD 클릭, 피드백, 상태 변경, 프로필 저장 등을 봅니다.",
  ops: "해당 유저의 /ops/career 상세 화면으로 이동합니다.",
};

function HeaderCell({
  align = "left",
  label,
  tooltip,
}: {
  align?: "left" | "right";
  label: string;
  tooltip: string;
}) {
  return (
    <Tooltips text={tooltip}>
      <button
        type="button"
        className={
          align === "right"
            ? "inline-flex cursor-help items-center justify-end gap-1 bg-transparent p-0 text-right"
            : "inline-flex cursor-help items-center gap-1 bg-transparent p-0 text-left"
        }
      >
        {label}
        <Info className="h-3 w-3 text-black/35" aria-hidden />
      </button>
    </Tooltips>
  );
}

function StatusPill({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white"
          : "inline-flex rounded-full border border-black/10 px-2 py-0.5 text-[10px] text-black/40"
      }
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

function getOpsCareerHref(userId: string) {
  return `/ops/career?userId=${encodeURIComponent(userId)}`;
}

function OpsCareerLink({ user }: { user: AdminCareerUserRow }) {
  return (
    <a
      href={getOpsCareerHref(user.userId)}
      aria-label={`${user.name || user.email || user.userId} ops career 상세로 이동`}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-black/10 px-2 text-[11px] font-medium text-black/55 transition hover:border-black/25 hover:text-black"
    >
      이동
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-black/10 bg-white/45 px-2.5 py-2">
      <div className="truncate text-[10px] font-medium uppercase tracking-normal text-black/35">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold text-black">
        {value}
      </div>
    </div>
  );
}

function MobileUserCard({ user }: { user: AdminCareerUserRow }) {
  return (
    <div className="border-t border-black/10 p-3 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-black">
            {user.name || "(이름 없음)"}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-black/45">
            {user.email || user.userId}
          </div>
        </div>
        <OpsCareerLink user={user} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <StatusPill
          active={user.onboardingDone}
          activeLabel="done"
          inactiveLabel="not done"
        />
        <StatusPill
          active={user.returnedAfterFirstRecommendation}
          activeLabel="returned"
          inactiveLabel="no return"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MobileMetric label="Msg" value={formatCount(user.messageCount)} />
        <MobileMetric
          label="Rec"
          value={formatCount(user.recommendationCount)}
        />
        <MobileMetric
          label="Viewed"
          value={formatCount(user.viewedRecommendationCount)}
        />
        <MobileMetric label="JD" value={formatCount(user.jdOpenCount)} />
        <MobileMetric
          label="Company"
          value={formatCount(user.companyOpenCount)}
        />
        <MobileMetric
          label="+ / -"
          value={`${formatCount(user.positiveFeedbackCount)} / ${formatCount(
            user.negativeFeedbackCount
          )}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] leading-4 text-black/40">
        <div className="min-w-0">
          <span className="font-medium text-black/55">가입</span>{" "}
          <span>{formatDate(user.createdAt)}</span>
        </div>
        <div className="min-w-0 text-right">
          <span className="font-medium text-black/55">Active</span>{" "}
          <span>{formatDateTime(user.lastActiveAt)}</span>
        </div>
        <div className="min-w-0 truncate">
          <span className="font-medium text-black/55">Signal</span>{" "}
          <span>{user.lastMeaningfulAction || "-"}</span>
        </div>
        <div className="min-w-0 text-right">
          <span className="font-medium text-black/55">First rec</span>{" "}
          <span>{formatDate(user.firstRecommendationAt)}</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminCareerUserTable({
  users,
}: AdminCareerUserTableProps) {
  return (
    <Card className="rounded-md border-black/10 shadow-none">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-[14px] font-semibold text-black">
          Users
        </CardTitle>
        <CardDescription className="text-[12px] leading-5 text-black/50">
          가입 날짜, 추천 소비, 피드백 신호를 유저별로 봅니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="md:hidden">
          {users.length === 0 ? (
            <div className="border-t border-black/10 px-3 py-8 text-center text-[12px] text-black/45">
              표시할 유저가 없습니다.
            </div>
          ) : (
            users.map((user) => (
              <MobileUserCard key={user.userId} user={user} />
            ))
          )}
        </div>
        <Table className="hidden min-w-[1140px] table-fixed md:table">
          <TableHeader>
            <TableRow className="border-black/10 hover:bg-transparent">
              <TableHead className="h-9 w-[210px] px-3 text-[11px]">
                <HeaderCell label="User" tooltip={USER_TABLE_TOOLTIPS.user} />
              </TableHead>
              <TableHead className="h-9 w-[82px] px-3 text-[11px]">
                <HeaderCell
                  label="가입 날짜"
                  tooltip={USER_TABLE_TOOLTIPS.createdAt}
                />
              </TableHead>
              <TableHead className="h-9 w-[104px] px-3 text-[11px]">
                <HeaderCell
                  label="Last active"
                  tooltip={USER_TABLE_TOOLTIPS.lastActive}
                />
              </TableHead>
              <TableHead className="h-9 w-[58px] px-3 text-right text-[11px]">
                <HeaderCell
                  align="right"
                  label="Msg"
                  tooltip={USER_TABLE_TOOLTIPS.message}
                />
              </TableHead>
              <TableHead className="h-9 w-[58px] px-3 text-right text-[11px]">
                <HeaderCell
                  align="right"
                  label="Rec"
                  tooltip={USER_TABLE_TOOLTIPS.recommendation}
                />
              </TableHead>
              <TableHead className="h-9 w-[72px] px-3 text-right text-[11px]">
                <HeaderCell
                  align="right"
                  label="Viewed"
                  tooltip={USER_TABLE_TOOLTIPS.viewed}
                />
              </TableHead>
              <TableHead className="h-9 w-[54px] px-3 text-right text-[11px]">
                <HeaderCell
                  align="right"
                  label="JD"
                  tooltip={USER_TABLE_TOOLTIPS.jd}
                />
              </TableHead>
              <TableHead className="h-9 w-[82px] px-3 text-right text-[11px]">
                <HeaderCell
                  align="right"
                  label="Company"
                  tooltip={USER_TABLE_TOOLTIPS.company}
                />
              </TableHead>
              <TableHead className="h-9 w-[72px] px-3 text-right text-[11px]">
                <HeaderCell
                  align="right"
                  label="+ / -"
                  tooltip={USER_TABLE_TOOLTIPS.feedback}
                />
              </TableHead>
              <TableHead className="h-9 w-[128px] px-3 text-[11px]">
                <HeaderCell label="Flags" tooltip={USER_TABLE_TOOLTIPS.flags} />
              </TableHead>
              <TableHead className="h-9 w-[160px] px-3 text-[11px]">
                <HeaderCell
                  label="Last signal"
                  tooltip={USER_TABLE_TOOLTIPS.lastSignal}
                />
              </TableHead>
              <TableHead className="h-9 w-[60px] px-3 text-right text-[11px]">
                <HeaderCell
                  align="right"
                  label="Ops"
                  tooltip={USER_TABLE_TOOLTIPS.ops}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="px-3 py-8 text-center text-[12px] text-black/45"
                >
                  표시할 유저가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.userId} className="border-black/10">
                  <TableCell className="max-w-[240px] px-3 py-2">
                    <div className="truncate text-[12px] font-medium text-black">
                      {user.name || "(이름 없음)"}
                    </div>
                    <div className="truncate text-[11px] text-black/45">
                      {user.email || user.userId}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-[11px] text-black/60">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-[11px] text-black/60">
                    {formatDateTime(user.lastActiveAt)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {formatCount(user.messageCount)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {formatCount(user.recommendationCount)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {formatCount(user.viewedRecommendationCount)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {formatCount(user.jdOpenCount)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {formatCount(user.companyOpenCount)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {formatCount(user.positiveFeedbackCount)} /{" "}
                    {formatCount(user.negativeFeedbackCount)}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <StatusPill
                        active={user.onboardingDone}
                        activeLabel="done"
                        inactiveLabel="not done"
                      />
                      <StatusPill
                        active={user.returnedAfterFirstRecommendation}
                        activeLabel="returned"
                        inactiveLabel="no return"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[180px] px-3 py-2">
                    <div className="truncate text-[11px] text-black/55">
                      {user.lastMeaningfulAction || "-"}
                    </div>
                    <div className="truncate text-[10px] text-black/35">
                      first rec {formatDate(user.firstRecommendationAt)}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right">
                    <OpsCareerLink user={user} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
