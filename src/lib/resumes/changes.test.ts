import assert from "node:assert/strict";
import test from "node:test";
import {
  parseResumeInput,
  structureResume,
  type StructuredResume,
} from "./schema";
import type { ResumeChange } from "./changes";

const initial = () =>
  structureResume(
    parseResumeInput({
      action: "create",
      document_name: "resume",
      content: {
        language: "en",
        basics: { name: "Test Person", email: "test@example.com" },
        experience: [
          {
            title: "Engineer",
            organization: "First",
            description: "Original",
            bullets: ["One", "Two"],
          },
          {
            title: "Researcher",
            organization: "Second",
            bullets: ["Keep this"],
          },
        ],
        education: [{ title: "Degree" }],
        skills: [{ title: "Languages", items: ["English", "Korean"] }],
        additional_sections: [
          { title: "Awards", entries: [{ title: "Finalist" }] },
        ],
      },
    })
  );
const edit = (previous: StructuredResume, changes: ResumeChange[]) =>
  structureResume(
    parseResumeInput({
      action: "update",
      document_id: "b00f9944-e939-4d66-93e5-7f44f2655ba4",
      expected_revision: 1,
      changes,
    }),
    previous
  );

test("one entry field changes while all other fields, IDs and metadata are preserved", () => {
  const original = initial();
  const snapshot = structuredClone(original);
  const expected = structuredClone(original);
  expected.content.experience![0].description = "Revised";
  assert.deepEqual(
    edit(original, [
      {
        op: "set",
        path: `/experience/${original.content.experience![0].id}/description`,
        value: "Revised",
      },
    ]),
    expected
  );
  assert.deepEqual(original, snapshot);
});

test("multiple changes target stable entry IDs, individual bullets and nested sections", () => {
  const original = initial();
  const [first, second] = original.content.experience!;
  const section = original.content.additional_sections![0];
  const result = edit(original, [
    { op: "remove", path: `/experience/${first.id}` },
    {
      op: "set",
      path: `/experience/${second.id}/bullets/0`,
      value: "Edited bullet",
    },
    {
      op: "set",
      path: `/additional_sections/${section.id}/entries/${section.entries[0].id}/title`,
      value: "Winner",
    },
    { op: "remove", path: "/basics/email" },
    {
      op: "add",
      path: "/projects",
      value: { title: "New project", description: "Known fact" },
    },
    { op: "add", path: "/experience", value: { title: "New role" } },
  ]);
  assert.equal(result.content.experience![0].id, second.id);
  assert.deepEqual(result.content.experience![0].bullets, ["Edited bullet"]);
  assert.equal(
    result.content.additional_sections![0].entries[0].title,
    "Winner"
  );
  assert.equal(result.content.basics.email, undefined);
  assert.ok(result.content.projects![0].id);
  assert.ok(result.content.experience![1].id);
  assert.deepEqual(result.content.education, original.content.education);
  assert.deepEqual(result.content.skills, original.content.skills);
});

test("invalid edits never mutate the source and the complete result is validated", () => {
  const original = initial();
  const snapshot = structuredClone(original);
  const id = original.content.experience![0].id;
  const invalid: ResumeChange[][] = [
    [{ op: "set", path: "/", value: {} }],
    [{ op: "set", path: "/__proto__/polluted", value: true }],
    [{ op: "set", path: "/constructor/prototype/polluted", value: true }],
    [{ op: "set", path: `/experience/${id}/id`, value: id }],
    [{ op: "set", path: `/experience/${id}`, value: { title: "Replacement" } }],
    [{ op: "set", path: "/experience", value: [] }],
    [{ op: "set", path: "/experience/0/title", value: "Use ID" }],
    [{ op: "remove", path: "/experience/missing" }],
    [{ op: "remove", path: "/basics/name" }],
    [{ op: "set", path: "/basics/email" }],
    [{ op: "remove", path: "/basics/email", value: "unexpected" }],
    [{ op: "remove", path: "/basics/email", value: null }],
    [{ op: "set", path: "/unknown", value: "field" }],
    [{ op: "add", path: "/projects", value: { title: "Injected ID", id } }],
    [
      {
        op: "add",
        path: "/projects",
        value: { title: "Unsafe link", url: "javascript:alert(1)" },
      },
    ],
    [
      { op: "set", path: "/basics/name", value: "Changed" },
      { op: "remove", path: "/missing" },
    ],
  ];
  for (const changes of invalid) {
    assert.throws(() => edit(original, changes));
    assert.deepEqual(original, snapshot);
  }
});

test("update rejects full replacement content, empty changes and missing revision", () => {
  const base = {
    action: "update",
    document_id: "b00f9944-e939-4d66-93e5-7f44f2655ba4",
    expected_revision: 1,
  };
  assert.throws(() =>
    parseResumeInput({ ...base, content: initial().content })
  );
  assert.throws(() => parseResumeInput({ ...base, changes: [] }));
  assert.throws(() =>
    parseResumeInput({
      ...base,
      changes: [{ op: "set", path: "/basics/name", value: "X" }],
      expected_revision: undefined,
    })
  );
});
