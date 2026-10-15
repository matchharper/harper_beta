import { logLlmUsageToConsole } from "@/lib/llm/usageLogging";
import { agentsRequest } from "./agentsApi";

/** Request-local snapshots: never sum them with request receipts or with each other. */
export function createAgentUsageLogger(label: string, initialModel?: string) {
  let model = initialModel;
  const snapshots = new Map<string, string>();
  const record = (
    scope: "agent_session" | "agent_turn",
    sessionId: string,
    resource: any,
    force = false
  ) => {
    if (!resource || typeof resource !== "object") return;
    if (scope === "agent_session" && typeof resource.agent?.model === "string")
      model = resource.agent.model;
    if (!resource.usage && !force) return;
    const turnId =
      scope === "agent_turn" && typeof resource.id === "string"
        ? resource.id
        : undefined;
    if (scope === "agent_turn" && !turnId) return;
    const actualModel =
      typeof resource.model === "string" ? resource.model : model;
    const key = `${scope}:${sessionId}:${turnId ?? ""}`;
    // Compare only counters/model, without retaining prompts or page content.
    const fingerprint = JSON.stringify([actualModel, resource.usage ?? null]);
    if (snapshots.get(key) === fingerprint) return;
    snapshots.set(key, fingerprint);
    logLlmUsageToConsole(
      {
        label,
        model: actualModel ?? "unknown",
        response: {
          id: resource.id,
          model: actualModel,
          usage: resource.usage,
        },
      },
      { usageScope: scope, sessionId, turnId }
    );
  };
  return {
    session: (sessionId: string, resource: unknown, force = false) =>
      record("agent_session", sessionId, resource, force),
    turn: (sessionId: string, resource: unknown, force = false) =>
      record("agent_turn", sessionId, resource, force),
    /** Best effort only: telemetry must never interrupt an application or cleanup. */
    collect: async (
      sessionId: string,
      request: typeof agentsRequest = agentsRequest
    ) => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Usage observation timed out"));
          }, 2000);
        });
        const state = await Promise.race([
          request(
            `sessions/${encodeURIComponent(sessionId)}`,
            undefined,
            "GET",
            controller.signal
          ),
          deadline,
        ]);
        record("agent_session", sessionId, state, true);
      } catch {
        if (!snapshots.has(`agent_session:${sessionId}:`))
          record("agent_session", sessionId, { id: sessionId }, true);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
