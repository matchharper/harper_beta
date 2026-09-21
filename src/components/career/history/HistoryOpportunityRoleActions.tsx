import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import MockInterviewStart from "@/components/career/MockInterviewStart";
import type {
  CareerCallStartRequest,
  CareerHistoryOpportunity,
} from "@/components/career/types";
import { MuteButton } from "@/components/ui/button";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { getHistoryOpportunityBucket } from "@/hooks/career/careerSessionData";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import Image from "next/image";
import { type ReactNode } from "react";

type HistoryOpportunityRoleActionsProps = {
  className?: string;
  item: CareerHistoryOpportunity;
  onOpenChat?: () => void;
  onShowCompanyJobs?: () => void;
  onStartMockInterview?: (
    request: CareerCallStartRequest
  ) => boolean | Promise<boolean>;
  visibleActions?: readonly HistoryOpportunityRoleActionId[];
  variant?: "list" | "tags";
};

export type HistoryOpportunityRoleActionId =
  | "similar"
  | "same_company"
  | "company_overview"
  | "mock_interview";

const ALL_ROLE_ACTIONS: readonly HistoryOpportunityRoleActionId[] = [
  "similar",
  "same_company",
  "company_overview",
  "mock_interview",
];

export const COMPANY_DETAIL_ROLE_ACTIONS = [
  "same_company",
  "company_overview",
] as const satisfies readonly HistoryOpportunityRoleActionId[];

function RoleActionIcon({
  emoji,
  pending = false,
}: {
  emoji: string;
  pending?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center"
    >
      <Image
        src="/svgs/face.svg"
        alt=""
        aria-hidden="true"
        width={16}
        height={16}
        className="absolute h-4 w-4 translate-x-0 object-contain opacity-100 blur-[0px] transition-[translate,opacity,filter] duration-500 ease-in-out group-hover/action:translate-x-1.5 group-hover/action:opacity-0 group-hover/action:blur-[3px] group-focus-visible/action:translate-x-1.5 group-focus-visible/action:opacity-0 group-focus-visible/action:blur-[3px] motion-reduce:transition-none"
      />
      <span
        className={cn(
          "absolute -translate-x-1.5 text-[16px] leading-none opacity-0 blur-[3px] transition-[translate,opacity,filter] duration-500 ease-in-out group-hover/action:translate-x-0 group-hover/action:opacity-100 group-hover/action:blur-[0px] group-focus-visible/action:translate-x-0 group-focus-visible/action:opacity-100 group-focus-visible/action:blur-[0px] motion-reduce:transition-none",
          pending && "animate-pulse"
        )}
      >
        {pending ? "⏳" : emoji}
      </span>
    </span>
  );
}

function RoleActionButton({
  children,
  disabled,
  emoji,
  onClick,
  pending,
  variant,
}: {
  children: ReactNode;
  disabled?: boolean;
  emoji: string;
  onClick: () => void;
  pending?: boolean;
  variant: "list" | "tags";
}) {
  return (
    <MuteButton
      type="button"
      variant={variant === "tags" ? "default" : "transparent"}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-busy={pending || undefined}
      className={
        variant === "tags"
          ? "shrink-0 whitespace-nowrap hover:bg-neutral-100"
          : "group/action w-full justify-start !gap-1.5 !rounded-none !border-0 !px-0 !py-0.5 text-left text-[13px] font-normal text-neutral-soft hover:!bg-transparent hover:text-neutral-primary active:!bg-transparent sm:text-[14px]"
      }
    >
      {variant === "list" ? (
        <RoleActionIcon emoji={emoji} pending={pending} />
      ) : null}
      <span
        className={
          variant === "list"
            ? "min-w-0 flex-1 whitespace-normal leading-5"
            : undefined
        }
      >
        {children}
      </span>
    </MuteButton>
  );
}

export default function HistoryOpportunityRoleActions({
  className,
  item,
  onOpenChat,
  onShowCompanyJobs,
  onStartMockInterview,
  visibleActions = ALL_ROLE_ACTIONS,
  variant = "list",
}: HistoryOpportunityRoleActionsProps) {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const { onPrepareChatDraft, onShowSameCompanyRoles, onStartCallMode } =
    useCareerChatPanelContext();
  const mention = {
    label: `${item.companyName} · ${item.title}`,
    roleId: item.roleId,
  };
  const roleActionMetadata = {
    roleId: item.roleId,
    ...(item.companyDbId != null ? { companyId: item.companyDbId } : {}),
  };
  const showsAction = (action: HistoryOpportunityRoleActionId) =>
    visibleActions.includes(action) &&
    (action !== "mock_interview" ||
      getHistoryOpportunityBucket(item) === "saved");
  const entrance = (delay: number) =>
    variant === "tags"
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 5 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.24, delay, ease: "easeOut" as const },
        };

  const prepareDraft = (text: string) => {
    if (!onPrepareChatDraft) return;
    onPrepareChatDraft({ opportunityMention: mention, text });
    onOpenChat?.();
  };

  const handleSameCompanyRoles = () => {
    logCareerEvent(
      "click_history_role_action_same_company",
      roleActionMetadata
    );
    if (onShowCompanyJobs) onShowCompanyJobs();
    else onShowSameCompanyRoles?.(item, onOpenChat);
  };

  const startMockInterview = async (request: CareerCallStartRequest) => {
    const start = onStartMockInterview ?? onStartCallMode;
    if (!start) return false;
    const started = await start(request);
    if (started) onOpenChat?.();
    return started;
  };

  return (
    <section
      aria-label={t(
        "career.history.job_actions.aria_label",
        "이 포지션으로 할 수 있는 일"
      )}
      className={cn("", className)}
    >
      <div
        className={
          variant === "tags"
            ? "flex flex-wrap items-center gap-1.5"
            : "flex flex-col gap-0"
        }
      >
        {showsAction("similar") ? (
          <motion.div {...entrance(0.02)}>
            <RoleActionButton
              variant={variant}
              emoji="🔎"
              disabled={!onPrepareChatDraft}
              onClick={() => {
                logCareerEvent(
                  "click_history_role_action_similar",
                  roleActionMetadata
                );
                prepareDraft(
                  `${mention.label}\n${t(
                    "career.history.job_actions.similar_draft",
                    "이 포지션과 비슷한 포지션을 찾아줘."
                  )}`
                );
              }}
            >
              {t("career.history.job_actions.similar", "비슷한 포지션 찾아줘.")}
            </RoleActionButton>
          </motion.div>
        ) : null}

        {showsAction("same_company") ? (
          <motion.div {...entrance(0.06)}>
            <RoleActionButton
              variant={variant}
              emoji="🏢"
              disabled={!onShowCompanyJobs && !onShowSameCompanyRoles}
              onClick={handleSameCompanyRoles}
            >
              {t(
                "career.history.job_actions.same_company",
                "같은 회사의 다른 포지션도 보여줘."
              )}
            </RoleActionButton>
          </motion.div>
        ) : null}

        {showsAction("company_overview") ? (
          <motion.div {...entrance(0.1)}>
            <RoleActionButton
              variant={variant}
              emoji="💬"
              disabled={!onPrepareChatDraft}
              onClick={() => {
                logCareerEvent(
                  "click_history_role_action_company_overview",
                  roleActionMetadata
                );
                prepareDraft(
                  `${mention.label}\n${t(
                    "career.history.job_actions.company_overview_draft",
                    "이 회사가 어떤 곳인지 가볍게 설명해줘."
                  )}`
                );
              }}
            >
              {t(
                "career.history.job_actions.company_overview",
                "이 회사 어때? 가볍게 알려줘."
              )}
            </RoleActionButton>
          </motion.div>
        ) : null}

        {showsAction("mock_interview") ? (
          <motion.div {...entrance(0.14)}>
            <MockInterviewStart
              item={item}
              onStart={startMockInterview}
              renderTrigger={({ disabled, onClick }) => (
                <RoleActionButton
                  variant={variant}
                  emoji="🎙️"
                  disabled={disabled}
                  onClick={() => {
                    logCareerEvent(
                      "click_history_role_action_mock_interview",
                      roleActionMetadata
                    );
                    onClick();
                  }}
                >
                  {t(
                    "career.history.job_actions.mock_interview",
                    "이 포지션으로 모의 인터뷰 해볼래."
                  )}
                </RoleActionButton>
              )}
            />
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
