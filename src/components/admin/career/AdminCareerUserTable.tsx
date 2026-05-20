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
import { Info } from "lucide-react";

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
    "talent_users.last_logined_at, 최신 career 로그 시각, talent_setting.updated_at 중 가장 최신값입니다.",
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
    "done은 talent_setting.is_onboarding_done=true입니다. returned는 첫 추천 이후 career_app_opened 로그가 있거나 last_logined_at이 첫 추천보다 늦다는 뜻입니다.",
  lastSignal:
    "가장 최근에 확인된 의미 있는 행동입니다. 메시지, 추천 열람, JD 클릭, 피드백, 상태 변경, 프로필 저장 등을 봅니다.",
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
        <Table className="min-w-[1080px] table-fixed">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11}
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
                    {user.messageCount.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {user.recommendationCount.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {user.viewedRecommendationCount.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {user.jdOpenCount.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {user.companyOpenCount.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-[12px]">
                    {user.positiveFeedbackCount.toLocaleString("ko-KR")} /{" "}
                    {user.negativeFeedbackCount.toLocaleString("ko-KR")}
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
