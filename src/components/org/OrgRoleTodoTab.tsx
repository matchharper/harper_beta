import { useEffect, useState } from "react";
import {
  useOrgAgentChat,
  useOrgAgentMessageHistory,
  useOrgMatchingSearchStatus,
} from "@/hooks/org/useOrgAgent";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { migrateOrgAgentModel } from "@/lib/org/agent/modelConfig";
import {
  ORG_ROLE_QUICK_ACTION_IDLE_MS,
  ORG_ROLE_RUN_SEARCH_ACTION,
  shouldShowOrgRoleQuickActions,
} from "@/lib/org/roleQuickActions";
import { ORG_TODO_COLUMNS } from "@/lib/org/todo";
import { OrgTodoList, useOrgTodoShortcuts } from "./OrgTodoChip";

/**
 * The Role's To-do tab: the same 할 일, 제안 and 진행 중인 일 as the chip
 * above the chat, plus everything Harper finished and every update, with no
 * time limit. Approving a suggestion sends it to this Role's chat.
 */
export function OrgRoleTodoTab({
  roleId,
  workspaceId,
}: {
  roleId: string;
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const { user } = useOrgWorkspace();
  const history = useOrgAgentMessageHistory({
    enabled: Boolean(roleId),
    mode: "role",
    roleId,
    workspaceId,
  });
  const chat = useOrgAgentChat({
    appendMessagesToCache: history.appendMessagesToCache,
    currentUserId: user.id,
    mode: "role",
    roleId,
    workspaceId,
  });
  const [model] = useState(() => {
    try {
      return migrateOrgAgentModel(
        window.localStorage.getItem("harper:org-agent:model")
      );
    } catch {
      return null;
    }
  });
  const matching = useOrgMatchingSearchStatus({ roleId, workspaceId });
  // The same rule as above the chat: after an hour with no team message.
  const [clock, setClock] = useState(0);
  const latestUserMessageAt =
    chat.optimisticUserMessage?.createdAt ??
    history.latestUserMessageAt ??
    null;
  useEffect(() => {
    const sentAt = Date.parse(latestUserMessageAt ?? "");
    if (!Number.isFinite(sentAt)) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.max(
        0,
        Math.min(
          sentAt + ORG_ROLE_QUICK_ACTION_IDLE_MS - Date.now() + 50,
          ORG_ROLE_QUICK_ACTION_IDLE_MS
        )
      )
    );
    return () => window.clearTimeout(timer);
  }, [latestUserMessageAt]);
  const showQuickActions =
    !history.isLoading &&
    shouldShowOrgRoleQuickActions({
      isStreaming: chat.isStreaming,
      latestUserMessageAt,
      now: clock,
    });
  const send = (message: string) => void chat.sendMessage({ message, model });
  const shortcuts = useOrgTodoShortcuts({
    onRunSearch: () =>
      void chat
        .sendMessage({
          message: c(
            ORG_ROLE_RUN_SEARCH_ACTION.message,
            "Find more candidates for this role we might want to send an intro request to."
          ),
          model,
        })
        .finally(() => void matching.refetch()),
    onSend: send,
    searching: Boolean(matching.data?.active),
  });
  return (
    <div className="mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-neutral-1000-a10 bg-bg-floating">
      <OrgTodoList
        columns={ORG_TODO_COLUMNS}
        onApprove={send}
        range="all"
        roleId={roleId}
        shortcuts={shortcuts.filter(
          (shortcut) =>
            showQuickActions || (shortcut.id === "run_search" && shortcut.busy)
        )}
        workspaceId={workspaceId}
      />
    </div>
  );
}
