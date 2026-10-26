import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { compensationChips } from "@/lib/org/roleStart/compensation";
import { getOrgAgentLiveChatKey, useOrgAgentLiveChatStore } from "@/store/useOrgAgentLiveChatStore";
import {
  createFixtures,
  previewDetail,
  FIXTURE_TIME,
  PREVIEW_STAGES,
  ROLE_ID,
  USER_ID,
  WORKSPACE_ID,
  type PreviewStep,
} from "./fixtures";

/** API fixtures only; the production components, hooks and layouts are unchanged. */
export function createPreviewRuntime(
  queryClient: QueryClient,
  changed: () => void
) {
  let fixtures = createFixtures();
  let step: PreviewStep = "setup";
  let compensationAnswered = false;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const creationKey = getOrgAgentLiveChatKey({ mode: "role_creation", roleId: ROLE_ID, workspaceId: WORKSPACE_ID });
  const initialNotifications = () => ({
    roleId: ROLE_ID,
    channels: [
      { channelId: "preview-hiring", channelName: "hiring", enabled: true },
    ],
    assigneeUserIds: [USER_ID],
    emailEnabled: true,
  });
  let notifications = initialNotifications();
  const roleStartResponse = () => ({
    ...fixtures.response,
    compensation:
      ["questions", "review"].includes(fixtures.response.session!.phase) &&
      !compensationAnswered &&
      !fixtures.response.role.salaryRange?.trim()
        ? { chips: compensationChips() }
        : null,
  });
  const touch = () => {
    if (!disposed) {
      changed();
      void queryClient.invalidateQueries();
    }
  };
  const later = (fn: () => void, delay = 900) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) {
        fn();
        touch();
      }
    }, delay);
    timers.add(timer);
  };
  const select = (next: PreviewStep) => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    useOrgAgentLiveChatStore.getState().finish(creationKey);
    step = next;
    const session = fixtures.response.session!;
    session.phase =
      next === "setup" || next === "compensation" || next === "questions"
        ? "questions"
        : next === "brief"
          ? "review"
          : ["inbox", "pipeline", "email"].includes(next)
            ? "done"
            : "evaluating";
    fixtures.role.status = session.phase === "done" ? "active" : "draft";
    fixtures.response.role.status = fixtures.role.status;
    if (next === "compensation") {
      compensationAnswered = false;
      fixtures.role.salaryRange = null;
      fixtures.response.role.salaryRange = null;
    } else if (next !== "setup") {
      // Direct links to later steps start after compensation was answered or skipped.
      compensationAnswered = true;
    }
    if (next === "setup" || next === "compensation" || next === "questions") {
      session.pendingQuestion =
        createFixtures().response.session!.pendingQuestion;
      session.questions.history = [];
    }
    if (next === "align") session.evaluations = {};
    if (next === "finalize" || session.phase === "done") {
      for (const candidate of session.firstCandidates)
        session.evaluations[candidate.talentId] ??= {
          rating: "good",
          answer: null,
          note: null,
          reasons: [],
          reasonText: null,
          reasonsSkipped: false,
        };
    }
    if (session.phase === "done")
      session.batch = {
        status: "done",
        candidates: [session.firstCandidates[1]],
        kept: [session.firstCandidates[0].name!],
      };
    if (next === "inbox" || next === "pipeline")
      fixtures.items = createFixtures().items;
    if (next === "pipeline") {
      fixtures.items[0].stage = "connected";
      fixtures.items[0].stageTag = "connected";
      fixtures.items[1].stage = "intro_requested";
      Object.assign(fixtures.items[1].companyIntro!, {
        status: "awaiting_talent",
        requestedAt: FIXTURE_TIME,
        candidateSentAt: FIXTURE_TIME,
      });
      fixtures.items[1].capabilities.requestIntro = false;
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        `role-start-setup:${ROLE_ID}`,
        next === "setup" || next === "preparing" ? "0" : "1"
      );
      window.sessionStorage.setItem(
        `role-start-finalize:${ROLE_ID}`,
        next === "finalize" ? "1" : "0"
      );
    }
    queryClient.setQueryData(
      ["org-role-start", WORKSPACE_ID, ROLE_ID],
      structuredClone(roleStartResponse())
    );
    if (next === "preparing") {
      const store = useOrgAgentLiveChatStore.getState();
      store.patch(creationKey, { isCreatingRole: true, isStreaming: true, assistantStatus: "pending" });
      later(() => store.patch(creationKey, { thinkingLogs: [
        { id: "reference", at: FIXTURE_TIME, icon: "read", label: "회사의 기존 역할 정보를 확인하고 있어요", status: "running" },
      ] }), 1000);
      later(() => store.patch(creationKey, { thinkingLogs: [
        { id: "reference", at: FIXTURE_TIME, icon: "read", label: "회사의 기존 역할 정보를 확인했어요", status: "done" },
        { id: "draft", at: FIXTURE_TIME, icon: "write", label: "역할 정보를 작성하고 있어요", status: "running" },
      ] }), 2500);
      later(() => select("setup"), 6000);
    }
    touch();
  };
  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const request = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      window.location.origin
    );
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith("/api/org/")
    )
      return json({ error: "프리뷰에서는 외부 요청을 실행하지 않아요." }, 403);
    const session = fixtures.response.session!;
    switch (url.pathname) {
      case "/api/org/role-start": {
        if (method === "GET") return json(roleStartResponse());
        switch (body.action) {
          case "compensation":
            if (!body.skip) {
              const salary = String(body.text ?? "").trim();
              if (!salary) return json({ error: "연봉을 적거나 골라 주세요." }, 400);
              fixtures.role.salaryRange = salary;
              fixtures.response.role.salaryRange = salary;
            }
            compensationAnswered = true;
            break;
          case "answer":
            if (session.pendingQuestion)
              session.questions.history.push({
                ...session.pendingQuestion,
                status: body.skip ? "skipped" : "answered",
                answer: {
                  chipId: body.chipId ?? null,
                  text: body.text ?? null,
                  applied: null,
                },
              });
            session.pendingQuestion = null;
            session.phase = "review";
            break;
          case "finish_questions":
            session.pendingQuestion = null;
            session.phase = "review";
            break;
          case "confirm":
            session.phase = "searching";
            later(() => {
              session.phase = "evaluating";
            });
            break;
          case "evaluate":
            session.evaluations[body.talentId] = {
              rating: body.rating,
              answer: body.answer ?? null,
              note: body.note ?? null,
              reasons: (session.firstCandidates.find(candidate => candidate.talentId === body.talentId)?.verdict?.reasonChips ?? []).filter(chip => body.reasonIds?.includes(chip.id)).map(chip => ({ chipId: chip.id, label: chip.label })),
              reasonText: body.reasonText ?? null,
              reasonsSkipped: body.reasonsSkipped ?? false,
            };
            break;
          case "reopen_review":
            session.phase = "review";
            break;
          case "edit":
            if (!body.brief)
              return json(
                {
                  error:
                    "자유 입력의 AI 수정은 프리뷰에서 실행하지 않아요. 직접 편집으로 확인할 수 있어요.",
                },
                422
              );
            session.brief = structuredClone(body.brief);
            break;
          case "register":
            notifications.emailEnabled =
              body.emailEnabled ?? notifications.emailEnabled;
            notifications.channels = notifications.channels.map((channel) => ({
              ...channel,
              enabled:
                body.channelIds?.includes(channel.channelId) ?? channel.enabled,
            }));
            session.phase = "registering";
            later(() => {
              select("inbox");
            });
            break;
          case "prewarm":
          case "role_info":
            break;
          case "start":
          case "retry":
            session.phase = "questions";
            break;
          default:
            return json(
              {
                error:
                  "이 작업은 프리뷰에서 실행하지 않아요. 위에서 다음 화면으로 이동할 수 있어요.",
              },
              422
            );
        }
        touch();
        return json({ session, issues: [] });
      }
      case "/api/org/role":
        if (method !== "GET") {
          Object.assign(fixtures.role, body.fields ?? body);
          Object.assign(fixtures.response.role, fixtures.role);
          touch();
        }
        return json({ ok: true, role: fixtures.role });
      case "/api/org/bootstrap":
        return json(fixtures.bootstrap);
      case "/api/org/role-notifications":
        if (method !== "GET") {
          Object.assign(notifications, body);
          touch();
        }
        return json(notifications);
      case "/api/org/slack":
        return json({
          connected: true,
          availableChannels: [],
          channels: [
            {
              channelId: "preview-hiring",
              channelName: "hiring",
              defaultRoleId: ROLE_ID,
              isEnabled: true,
              isPrivate: false,
              replyToHarperThreads: true,
              respondToMentions: true,
            },
          ],
          canCreateChannels: false,
          needsReinstall: false,
          teamId: "preview-team",
          teamName: "스튜디오 예시",
        });
      case "/api/org/board":
      case "/api/org/inbox":
        return json({
          items: fixtures.items,
          stages: PREVIEW_STAGES,
          totalCount: fixtures.items.length,
          roleId: ROLE_ID,
          workspaceId: WORKSPACE_ID,
        });
      case "/api/org/board/profile-labels":
        return json({
          items: fixtures.items.map((item) => ({
            talentId: item.talentId,
            recentCompanies: item.talent.recentCompanies,
            recentSchools: [],
          })),
        });
      case "/api/org/detail":
        return json(
          previewDetail(fixtures, url.searchParams.get("talentId") ?? "")
        );
      case "/api/org/billing":
        return json({
          capacity: 1,
          activeRoles: 1,
          pendingConnections: true,
          creditSlots: [],
        });
      case "/api/org/company-intro": {
        const item = fixtures.items.find(
          (item) => item.companyIntro?.id === body.introCandidateId
        );
        if (!item?.companyIntro || !["request", "pass"].includes(body.action))
          return json({ error: "예시 후보를 찾을 수 없어요." }, 422);
        item.companyIntro.status =
          body.action === "request" ? "awaiting_talent" : "passed";
        item.companyIntro.requestedAt =
          body.action === "request" ? FIXTURE_TIME : null;
        item.companyIntro.companyAppeal = body.companyAppeal ?? null;
        item.stage =
          body.action === "request" ? "intro_requested" : "process_stopped";
        item.capabilities.requestIntro = false;
        touch();
        return json({
          ok: true,
          introCandidateId: item.companyIntro.id,
          status: item.companyIntro.status,
          candidateUpdate: {
            ...item.companyIntro,
            roleId: ROLE_ID,
            talentId: item.talentId,
            talentDecisionAt: null,
            closeReason: null,
            updatedAt: FIXTURE_TIME,
          },
        });
      }
      case "/api/org/stage": {
        const item = fixtures.items.find(
          (item) => item.talentId === body.talentId
        );
        if (!item || !PREVIEW_STAGES.some((stage) => stage.id === body.stage))
          return json({ error: "예시 후보 또는 단계를 찾을 수 없어요." }, 422);
        item.stage = body.stage;
        item.stageTag = body.stage;
        touch();
        return json({
          ok: true,
          roleId: ROLE_ID,
          talentId: item.talentId,
          stage: item.stage,
          stageTag: item.stageTag,
        });
      }
      case "/api/org/agent/chat":
        return json({ error: "자유 입력의 AI 수정은 프리뷰에서 실행하지 않아요. 오른쪽에서 직접 편집할 수 있어요." }, 422);
      case "/api/org/agent/messages":
        return json({
          ok: true,
          conversation: {
            conversationId: "preview-conversation",
            roleId: ROLE_ID,
            title: fixtures.role.name,
            workspaceId: WORKSPACE_ID,
          },
          messages: [],
          hasMore: false,
          nextCursor: null,
          latestUserMessageAt: null,
        });
      case "/api/org/agent/matching-search-status":
        return json({ ok: true, active: false });
      case "/api/org/role/matching-history":
        return json({ items: [], totalCount: 0, hasMore: false });
      case "/api/org/role/hiring-brief-history":
        return json({ items: [], hasMore: false });
      case "/api/org/search-history":
        return json({ items: [], nextOffset: null });
      case "/api/org/activity":
        return json({ items: [], hasMore: false, nextCursor: null });
      default:
        return json({ error: "이 작업은 프리뷰에서 실행하지 않아요." }, 422);
    }
  };
  return {
    get fixtures() {
      return fixtures;
    },
    get step() {
      return step;
    },
    request,
    select,
    reset() {
      fixtures = createFixtures();
      compensationAnswered = false;
      notifications = initialNotifications();
      select("setup");
    },
    install() {
      if (
        process.env.NODE_ENV !== "development" ||
        window.location.pathname !== "/dev/role-start"
      )
        throw new Error("Local preview only");
      disposed = false;
      const fetchBefore = window.fetch;
      const getSessionBefore = supabase.auth.getSession;
      const refreshBefore = supabase.auth.refreshSession;
      const syntheticSession = {
        access_token: "local-preview-no-access",
        token_type: "bearer",
        refresh_token: "",
        expires_in: 3600,
        user: {
          id: USER_ID,
          aud: "authenticated",
          email: "jisoo@example.invalid",
          app_metadata: {},
          user_metadata: {},
          created_at: fixtures.role.createdAt,
        },
      } satisfies Session;
      supabase.auth.getSession = async () => ({
        data: { session: syntheticSession },
        error: null,
      });
      supabase.auth.refreshSession = async () => ({
        data: { session: syntheticSession, user: syntheticSession.user },
        error: null,
      });
      window.fetch = (input, init) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
          window.location.origin
        );
        // Only Next dev assets retain real network access. No API fallthrough.
        if (
          url.origin === window.location.origin &&
          url.pathname.startsWith("/_next/")
        )
          return fetchBefore(input, init);
        return request(input, init);
      };
      return () => {
        disposed = true;
        useOrgAgentLiveChatStore.getState().finish(creationKey);
        timers.forEach(clearTimeout);
        timers.clear();
        window.fetch = fetchBefore;
        supabase.auth.getSession = getSessionBefore;
        supabase.auth.refreshSession = refreshBefore;
        queryClient.clear();
      };
    },
  };
}
