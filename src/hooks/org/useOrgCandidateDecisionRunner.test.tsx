import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgBoardItem } from "@/lib/org/server";

type Toast = { message: string; variant?: string; actions?: { label: string; onClick: () => void }[] };

// The module is loaded once, so every test shares these and resets them.
const toasts: Toast[] = [];
const runs: Array<() => Promise<unknown>> = [];
const pushes: string[] = [];
let sendIntro: (id: string) => Promise<unknown> = async () => true;
let loaded: typeof import("./useOrgCandidateDecisionRunner")["useOrgCandidateDecisionRunner"] | undefined;

async function loadRunner(send: (id: string) => Promise<unknown>) {
  toasts.length = 0;
  runs.length = 0;
  pushes.length = 0;
  sendIntro = send;
  if (loaded) return { pushes, runner: probe(loaded), runs, toasts };
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, ...args) {
    if (name === "next/router") return {
      useRouter: () => ({ query: {}, push: async (href: string) => { pushes.push(href); return true; } }),
    };
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({
        c: (ko: string, _en: string, values?: Record<string, unknown>) =>
          ko.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? "")),
        locale: "ko",
      }),
      useOrgSourceT: () => (text: string) => text,
    };
    if (name === "@/store/useToastStore") return {
      useToastStore: (select: (state: { add: (toast: Toast) => void }) => unknown) =>
        select({ add: (toast) => toasts.push(toast) }),
    };
    if (name === "@/store/useOrgDeferredActionStore") return {
      ORG_UNDO_WINDOW_MS: 5_000,
      useOrgDeferredActionStore: (select: (state: unknown) => unknown) =>
        select({
          cancel: () => false,
          schedule: ({ run }: { run: () => Promise<unknown> }) => {
            runs.push(run);
            return "deferred-1";
          },
        }),
    };
    if (name === "@/hooks/org/useOrg") return {
      usePassOrgCompanyIntro: () => ({ mutateAsync: async () => true }),
      useRequestOrgCompanyIntro: () => ({
        mutateAsync: ({ introCandidateId }: { introCandidateId: string }) => sendIntro(introCandidateId),
      }),
    };
    if (name === "@/hooks/org/useOrgJobs") return { useOrgJobsCandidateActions: () => ({ changeStage: async () => true }) };
    if (name === "@/hooks/org/useOrgCandidateSave") return { useOrgCandidateSave: () => ({ mutateAsync: async () => true }) };
    if (name === "@/components/org/OrgStageMoveDialog") return { toOrgStageMoveCandidate: () => null };
    return original.call(this, name, ...args);
  };
  try {
    ({ useOrgCandidateDecisionRunner: loaded } = await import("./useOrgCandidateDecisionRunner"));
  } finally {
    loader._load = original;
  }
  return { pushes, runner: probe(loaded), runs, toasts };
}

function probe(useRunner: NonNullable<typeof loaded>) {
  let runner: ReturnType<typeof useRunner> | undefined;
  function Probe() {
    runner = useRunner("w");
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return runner!;
}

const candidate = (id: string, name: string) =>
  ({
    companyIntro: { id: `intro-${id}`, status: "ready" },
    recommendationId: `rec-${id}`,
    roleId: "role-1",
    stage: "company_intro",
    talent: { name, email: null },
  }) as unknown as OrgBoardItem;

// Bulk 연결 요청 where the workspace ran out of intros partway: the toast says why.
test("bulk decisions name the people not sent because intros ran out", async () => {
  const { runner, runs, toasts } = await loadRunner(async (id) => {
    if (id === "intro-a") return true;
    if (id === "intro-d") throw new Error("network");
    throw Object.assign(new Error("연결 횟수를 모두 사용했어요."), { billingCode: "credits_exhausted" });
  });
  runner.sendIntros(
    [candidate("a", "김하늘"), candidate("b", "박도윤"), candidate("c", "이서준"), candidate("d", "오세린")],
    { appeals: [], introRecipientEmails: [] }
  );
  assert.equal(runs.length, 1);
  await runs[0]();
  const errors = toasts.filter((toast) => toast.variant === "error").map((toast) => toast.message);
  assert.deepEqual(errors, [
    "연결 횟수가 다해서 2명은 보내지 못했어요: 박도윤, 이서준.",
    "1명은 처리하지 못했어요: 오세린. 후보자 상태를 확인한 뒤 다시 시도해 주세요.",
  ]);
});

// 보기 opens the list the person went to: 진행 종료 after a pass.
test("보기 after a pass opens 진행 종료", async () => {
  const { pushes, runner, toasts } = await loadRunner(async () => true);
  runner.pass([candidate("a", "김하늘")], "");
  const view = toasts[0].actions?.find((action) => action.label === "보기");
  assert.ok(view);
  view.onClick();
  assert.equal(pushes[0], "/org/role?orgId=w&roleId=role-1&pipelineStage=closed&tab=pipeline&highlight=rec-a");
});
