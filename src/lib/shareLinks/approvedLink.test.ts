import assert from "node:assert/strict";
import test from "node:test";
import { approvedProfileLinkChoice, profileLinkItem, roleProfileLink } from "./approvedLink.server";

const role = "00000000-0000-4000-8000-000000000010";
const form = (formId: number, value: boolean, roleId = role) => ({
  formId, revision: 1, kind: "form", title: "지원 확인",
  items: [{ id: "answer", label: "지원 동기", type: "textarea", content: "" },
    { id: "harper_candidate_link", label: "Harper 후보 요약 링크 넣기", type: "checkbox", content: { value } }],
  positive: { id: "submit", label: "지원", message: "지원해줘" },
  relatedRefs: [{ type: "role", id: roleId }, { type: "browser_session", id: "00000000-0000-4000-8000-000000000020" }],
});
const response = (snapshot: ReturnType<typeof form>, link: boolean) => ({
  formId: snapshot.formId, revision: 1, requestId: "r", actionId: "submit", formSnapshot: snapshot,
  values: { answer: "", harper_candidate_link: link },
});

/** talent_messages rows: career_form payloads and career_form_response payloads, newest last. */
function admin(rows: { message_type: string; payload: any }[], roleRow: any = null) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let contains: any = null;
      const pick = () => rows.filter(row => row.message_type === filters.message_type && (!contains
        || (contains.relatedRefs ? (row.payload.relatedRefs ?? []).some((ref: any) => ref.id === contains.relatedRefs[0].id)
          : row.payload.formId === contains.formId))).reverse();
      const chain: any = {
        select: () => chain, order: () => chain, limit: () => chain,
        eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
        contains: (_key: string, value: unknown) => { contains = value; return chain; },
        maybeSingle: async () => table === "company_roles" ? { data: roleRow, error: null } : { data: pick()[0] ?? null, error: null },
        then: (resolve: (value: unknown) => void) => resolve({ data: pick(), error: null }),
      };
      return chain;
    },
  } as any;
}
const scope = (rows: { message_type: string; payload: any }[]) => ({ admin: admin(rows), userId: "u", conversationId: "c" });

test("the link follows the box on the form that approved the application", async () => {
  const on = form(41, true), off = form(42, true);
  assert.deepEqual(await approvedProfileLinkChoice(scope([]), { roleRefs: [role], authorization: [{ payload: response(on, true) }] }), { include: true, roleId: role });
  assert.deepEqual(await approvedProfileLinkChoice(scope([]), { roleRefs: [role], authorization: [{ payload: { responses: [response(off, false)] } }] }), { include: false, roleId: role });
});

test("a chat approval follows the box as the newest review form for the role holds it", async () => {
  const untouched = form(51, true);
  assert.deepEqual(await approvedProfileLinkChoice(scope([{ message_type: "career_form", payload: untouched }]),
    { roleRefs: [role], authorization: [{ payload: {} }] }), { include: true, roleId: role }, "left as it was: checked by default");
  const unchecked = form(52, true);
  assert.deepEqual(await approvedProfileLinkChoice(scope([
    { message_type: "career_form", payload: unchecked },
    { message_type: "career_form_response", payload: response(unchecked, false) },
  ]), { roleRefs: [role], authorization: [{ payload: {} }] }), { include: false, roleId: role }, "the person's last answer wins");
});

test("no role or no box on any form for the role leaves the decision to nothing", async () => {
  assert.equal(await approvedProfileLinkChoice(scope([]), { roleRefs: [], authorization: [] }), null);
  const plain = { ...form(61, true), items: [{ id: "answer", label: "지원 동기", type: "textarea", content: "" }] };
  assert.equal(await approvedProfileLinkChoice(scope([{ message_type: "career_form", payload: plain }]), { roleRefs: [role], authorization: [] }), null);
  assert.equal(profileLinkItem(plain as any), undefined);
});

test("the link names the role's company and posting", async () => {
  assert.deepEqual(await roleProfileLink({ admin: admin([], { name: "Backend Engineer", external_jd_url: "https://jobs.example.test/1", company_workspace: { company_name: "Example" } }) }, role),
    { company_name: "Example", posting_title: "Backend Engineer", posting_url: "https://jobs.example.test/1" });
  assert.equal(await roleProfileLink({ admin: admin([], null) }, role), null);
});

test("a submission delegated with no form for the role keeps the box's default: the link goes in", async () => {
  // Nothing was left to ask, so no review form was ever made for this role.
  assert.deepEqual(await approvedProfileLinkChoice(scope([]), { roleRefs: [role], authorization: [{ payload: {} }] }), { include: true, roleId: role });
  // A form for the role without the box still decides nothing.
  const plain = { ...form(81, true), items: [{ id: "answer", label: "지원 동기", type: "textarea", content: "" }] };
  assert.equal(await approvedProfileLinkChoice(scope([{ message_type: "career_form", payload: plain }]), { roleRefs: [role], authorization: [] }), null);
});
