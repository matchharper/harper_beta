type Task = {
  type: "task_update";
  id: string;
  title: string;
  status: "in_progress" | "complete" | "error";
};

/** Optional Slack presentation only; never changes the agent or reply delivery. */
export function createSlackTaskProgress(args: {
  channelId: string;
  threadTs: string;
  teamId: string;
  userId: string;
  locale?: "ko" | "en";
  call: (method: string, body: Record<string, unknown>) => Promise<{ ts?: string }>;
  onError: (error: unknown) => void;
  intervalMs?: number;
}) {
  const tasks = new Map<string, Task>();
  const pending = new Map<string, Task>();
  let ts: string | undefined;
  let disabled = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain = Promise.resolve();

  function flush() {
    chain = chain.then(async () => {
      if (disabled || !pending.size) return;
      const chunks = [...pending.values()];
      pending.clear();
      try {
        if (!ts) {
          const result = await args.call("chat.startStream", {
            channel: args.channelId,
            thread_ts: args.threadTs,
            recipient_team_id: args.teamId,
            recipient_user_id: args.userId,
            task_display_mode: "plan",
            chunks,
          });
          if (!result.ts) throw new Error("Slack progress stream has no timestamp");
          ts = result.ts;
        } else {
          await args.call("chat.appendStream", { channel: args.channelId, ts, chunks });
        }
      } catch (error) {
        // Do not retry an ambiguous start: Slack may already have created it.
        disabled = true;
        args.onError(error);
      }
    });
    return chain;
  }

  return {
    update(value: unknown) {
      if (closed || disabled || !value || typeof value !== "object") return;
      const log = value as Record<string, unknown>;
      if (typeof log.id !== "string" || !log.id || typeof log.label !== "string" || !log.label) return;
      if (log.status !== "running" && log.status !== "done" && log.status !== "error") return;
      // Only the existing public label crosses this boundary, never arguments,
      // results, debug traces, or model reasoning. Cap Slack's title field.
      const task: Task = {
        type: "task_update",
        id: log.id.slice(0, 128),
        title: Array.from(log.label).slice(0, 256).join(""),
        status: log.status === "running" ? "in_progress" : log.status === "done" ? "complete" : "error",
      };
      tasks.set(task.id, task);
      pending.set(task.id, task);
      if (!ts && tasks.size === 1) void flush();
      if (!timer) {
        timer = setTimeout(() => {
          timer = undefined;
          void flush();
        }, args.intervalMs ?? 3000);
        timer.unref?.();
      }
    },
    async finish(success: boolean) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      await chain;
      // Stop also after an append failure, so a known stream never remains open.
      if (!ts) return;
      const chunks = [...tasks.values()].map(task => ({
        ...task,
        ...(!success && task.id === "response" ? {
          title: args.locale === "en" ? "Work stopped" : "작업 중단",
        } : {}),
        status: !success && task.id === "response" ? "error" : task.status === "in_progress"
          ? (success ? "complete" : "error")
          : task.status,
      }));
      try {
        await args.call("chat.stopStream", { channel: args.channelId, ts, chunks });
      } catch (error) {
        args.onError(error);
      }
    },
  };
}
