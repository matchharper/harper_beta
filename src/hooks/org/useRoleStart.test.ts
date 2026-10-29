import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import type { RoleStartResponse } from "./useRoleStart";

let apiCalls = 0;
let response: RoleStartResponse;
let releaseRead: ((value: RoleStartResponse) => void) | null = null;
let holdRead = false;
let api: typeof import("./useRoleStart");
const snapshot = (revision: number, questionId: string): RoleStartResponse => ({
  role: { name: "Fixture", status: "draft", description: "JD", hasDescription: true,
    salaryRange: null, employmentTypes: [], locationText: null, workMode: null },
  session: { roleId: "r", revision, phase: "questions", refining: false,
    pendingQuestion: { id: questionId }, questions: { history: [] }, firstCandidates: [] } as unknown as RoleStartResponse["session"],
  issues: [], compensation: null,
});

before(async () => {
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function(name, ...args) {
    if (name === "@/lib/internalApiClient") return {
      fetchWithInternalAuth: async (_url: string, init?: RequestInit) => {
        apiCalls++;
        if (holdRead && init?.method !== "POST") return new Promise<RoleStartResponse>(resolve => { releaseRead = resolve; });
        return response;
      },
    };
    return original.call(this, name, ...args);
  };
  try { api = await import("./useRoleStart"); } finally { loader._load = original; }
});

test("observers share one read; saved answer advances without a GET or pending refresh", async () => {
  const client = new QueryClient();
  response = snapshot(1, "q1"); apiCalls = 0;
  const options = api.roleStartQueryOptions("r", "w");
  const one = new QueryObserver(client, options), two = new QueryObserver(client, options);
  const offOne = one.subscribe(() => {}), offTwo = two.subscribe(() => {});
  await client.fetchQuery(options);
  assert.equal(apiCalls, 1);
  response = snapshot(2, "q2");
  const mutation = new MutationObserver(client, api.roleStartMutationOptions(client, "w", "r"));
  await mutation.mutate({ action: "answer", questionId: "q1", text: "경험 중요" });
  assert.equal(mutation.getCurrentResult().isPending, false);
  assert.equal(apiCalls, 2, "one initial GET and one POST, no post-save GET");
  assert.equal(one.getCurrentResult().data?.session?.pendingQuestion?.id, "q2");
  assert.equal(two.getCurrentResult().data?.session?.pendingQuestion?.id, "q2");
  offOne(); offTwo(); client.clear();
});

test("an older GET or mutation cannot put the answered question back", async () => {
  const client = new QueryClient();
  const options = api.roleStartQueryOptions("r", "w");
  client.setQueryData(options.queryKey, snapshot(1, "q1"));
  holdRead = true;
  const oldRead = client.fetchQuery({ ...options, staleTime: 0 }).catch(() => null);
  await Promise.resolve();
  assert.ok(releaseRead);
  await api.applyRoleStartMutation(client, "w", "r", snapshot(2, "q2"));
  releaseRead!(snapshot(1, "q1"));
  await oldRead;
  assert.equal(client.getQueryData<RoleStartResponse>(options.queryKey)?.session?.revision, 2);
  await api.applyRoleStartMutation(client, "w", "r", snapshot(1, "q1"));
  assert.equal(client.getQueryData<RoleStartResponse>(options.queryKey)?.session?.pendingQuestion?.id, "q2");
  holdRead = false; client.clear();
});

test("compensation clears from the saved snapshot; auxiliary refresh does not hold the mutation", async () => {
  const client = new QueryClient();
  const options = api.roleStartQueryOptions("r", "w");
  client.setQueryData(options.queryKey, { ...snapshot(1, "q1"), compensation: { chips: [] } });
  await api.applyRoleStartMutation(client, "w", "r", {
    ...snapshot(2, "q1"), role: { ...snapshot(2, "q1").role, salaryRange: "1억원" }, compensation: null,
  });
  assert.equal(client.getQueryData<RoleStartResponse>(options.queryKey)?.role.salaryRange, "1억원");
  assert.equal(client.getQueryData<RoleStartResponse>(options.queryKey)?.compensation, null);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  holdRead = true;
  await api.applyRoleStartMutation(client, "w", "r", {});
  assert.equal(client.getQueryState(options.queryKey)?.fetchStatus, "fetching");
  releaseRead?.(snapshot(2, "q1"));
  holdRead = false; unsubscribe(); client.clear();
});
