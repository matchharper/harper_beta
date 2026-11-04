import assert from "node:assert/strict";
import test from "node:test";
import { applyProfileEdits, formatProfileToolResult } from "./tools";
import {
  projectRoleMaterialDocuments,
  type RoleMaterial,
} from "../roleMaterials/store";
import { projectReadTalentProfile } from "@/lib/org/agent/readTalentInput";
import type { ProfileSnapshot } from "./store";
const snapshot = {
  talentUser: { user_id: "owner", name: "Original", headline: "Default" },
  talentExperiences: [
    { id: 10, role: "Engineer", description: "Original work" },
  ],
  talentEducations: [],
  talentExtras: [],
} as unknown as ProfileSnapshot;

test("editing a copied snapshot preserves original facts and stable row identifiers on retry", () => {
  const input = {
    talentUser: { headline: "Role version" },
    rows: [
      {
        type: "experience",
        operation: "add",
        fields: { role: "Builder", description: "Confirmed work" },
      },
    ],
  };
  const edited = applyProfileEdits(snapshot, input, "operation");
  assert.equal(snapshot.talentUser?.headline, "Default");
  assert.equal(edited.talentUser?.headline, "Role version");
  assert.equal(edited.talentExperiences[0].id, 10);
  assert.deepEqual(edited, applyProfileEdits(snapshot, input, "operation"));
});

test("model profile projection retains exact revision and history without raw timestamps or snapshot dumps", () => {
  const rendered = formatProfileToolResult("read_profile", {
    profileId: "profile",
    revision: 3,
    title: "Role version",
    snapshot,
    history: [{ revision: 2, created_at: "2026-10-29T10:00:00.000Z" }],
    nextHistoryCursor: null,
  });
  assert.match(rendered, /profileId=profile; revision=3/);
  assert.match(rendered, /RowID=10/);
  assert.match(rendered, /end: not recorded; current employment\/enrollment unconfirmed/);
  assert.match(rendered, /Revision 2; 2026-10-29 19:00/);
  assert.doesNotMatch(rendered, /2026-10-29T|"talentUser"|"snapshot"/);
});

test("exact assigned documents are readable, while outline omits their body", () => {
  const material = {
    id: "material",
    documents: [
      {
        id: "document",
        revision: 4,
        file_name: "Answers",
        extracted_text: "Approved role answers",
        is_public: false,
        storage_path: "private/path",
      },
    ],
  } as unknown as RoleMaterial;
  const docs = projectRoleMaterialDocuments(material);
  assert.deepEqual(docs, [
    {
      documentId: "document",
      revision: 4,
      title: "Answers",
      description: "Approved role answers",
    },
  ]);
  const outlined = projectReadTalentProfile(
    { profile: { documents: docs } },
    "outline"
  );
  assert.deepEqual((outlined.profile as any).documents, [
    { documentId: "document", revision: 4, title: "Answers" },
  ]);
});
