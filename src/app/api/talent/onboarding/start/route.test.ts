import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";

test("entry HTTP boundary: empty sources, ownership, retries and recoverable failures", async (t) => {
  const owner = "owner";
  const initial = () => ({
    authenticated: true,
    conversation: {
      id: "conversation",
      user_id: owner,
      stage: "profile",
      profile_ingestion_status: null as string | null,
      profile_ingestion_updated_at: null as string | null,
    },
    profile: {
      resume_links: ["https://existing.test"],
      resume_text: "Existing resume",
    },
    fail: "",
    ingestions: 0,
    admissions: 0,
    scheduled: 0,
    writes: [] as { table: string; values: Record<string, unknown> }[],
    rpcInput: null as Record<string, unknown> | null,
  });
  let state = initial();
  const admin = {
    from(table: string) {
      let values: Record<string, unknown> | undefined;
      const filters = new Map<string, unknown>();
      const resolve = () => {
        if (table === "talent_conversations") {
          if (
            [...filters].some(
              ([key, value]) => Reflect.get(state.conversation, key) !== value
            )
          )
            return { data: null, error: null };
          if (values) {
            state.writes.push({ table, values });
            Object.assign(state.conversation, values);
          }
          return { data: { ...state.conversation }, error: null };
        }
        if (table === "talent_users" && values) {
          assert.equal(filters.get("user_id"), owner);
          if (state.fail === "profile")
            return { data: null, error: { message: "Profile storage failed" } };
          state.writes.push({ table, values });
          Object.assign(state.profile, values);
        }
        return { data: null, error: null };
      };
      const query = {
        select: () => query,
        update: (input: Record<string, unknown>) => {
          values = input;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters.set(key, value);
          return query;
        },
        is: (key: string, value: unknown) => {
          filters.set(key, value);
          return query;
        },
        maybeSingle: async () => resolve(),
        throwOnError: async () => {
          const result = resolve();
          if (result.error) throw new Error(result.error.message);
          return result;
        },
        then: (onfulfilled: (value: ReturnType<typeof resolve>) => unknown) =>
          Promise.resolve(resolve()).then(onfulfilled),
      };
      return query;
    },
    rpc: async (name: string, input: Record<string, unknown>) => {
      assert.equal(name, "finalize_career_entry");
      state.admissions++;
      state.rpcInput = input;
      if (state.fail === "admission")
        return { data: null, error: { message: "Admission failed" } };
      state.conversation.stage = "completed";
      state.conversation.profile_ingestion_status = "completed";
      return {
        error: null,
        data: {
          inserted: true,
          conversation: state.conversation,
          userMessage: {
            id: 1,
            role: "user",
            content: input.p_receipt,
            message_type: "profile_submit",
          },
          run: { id: "run" },
        },
      };
    },
  };
  const modules = Module as unknown as {
    _load: (name: string, ...args: unknown[]) => unknown;
  };
  const original = modules._load;
  const noop = async () => {};
  const mocks: Record<string, unknown> = {
    "@/lib/supabaseServer": {
      getRequestUser: async () =>
        state.authenticated ? { id: owner, email: "owner@example.test" } : null,
    },
    "@/lib/talentOnboarding/server": {
      getTalentSupabaseAdmin: () => admin,
      ensureTalentUserRecord: noop,
      fetchTalentUserProfile: async () => ({ ...state.profile }),
      fetchTalentDocument: async () => ({
        id: "document",
        kind: "resume",
        storage_path: "owner/resume.pdf",
        extracted_text: "Parsed resume",
      }),
      updateTalentDocumentExtractedText: noop,
      fetchTalentSetting: async () => ({ preferred_locale: "ko" }),
      fetchTalentDocuments: async () => [],
      fetchTalentStructuredProfile: async () => null,
      serializeTalentDocuments: async () => [],
      getTalentResumeSignedUrl: async () => null,
      toTalentDisplayName: () => "Owner",
    },
    "@/lib/career/onboardingContinuation.server": {
      scheduleCareerConversationContinuation: () => {
        state.scheduled++;
      },
    },
    "@/lib/talentOnboarding/profileIngestion": {
      ingestTalentProfileFromLinkedin: async () => {
        state.ingestions++;
        if (state.fail === "extraction") throw new Error("Extraction failed");
      },
    },
    "@/lib/slackActivity": {
      notifySlackActivity: noop,
      getSlackActivityDeviceLabel: () => "fixture",
    },
    "@/lib/talentOnboarding/errorLogs": {
      insertTalentProfileSourceErrorLog: noop,
    },
    "@/lib/talentOnboarding/activityEvents": {
      buildProfileMaterialActivity: () => null,
      insertTalentActivityEvent: noop,
    },
    "@/lib/contactQueue": {
      cancelSignupNoProfileSubmit: noop,
      cancelCareerOnboardingContactQueue: noop,
    },
    "@/lib/errorAlert": { notifyUnsupportedUnicodeEscapeError: noop },
    "@/lib/requestDevice": { isMobileRequest: () => false },
    "@/lib/career/translatedCareerMessage": {
      careerT: (_locale: unknown, _key: unknown, fallback: string) => fallback,
    },
  };
  t.mock.method(
    modules,
    "_load",
    function (this: unknown, name: string, ...args: unknown[]) {
      if (name === "next/server")
        return {
          ...(original.call(this, name, ...args) as object),
          after: () => {},
        };
      return mocks[name] ?? original.call(this, name, ...args);
    }
  );
  const { POST } = await import("./route");
  const submit = (body: Record<string, unknown> = {}) =>
    POST(
      new NextRequest("https://fixture.invalid/api/talent/onboarding/start", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "conversation",
          links: [],
          officialJobSlug: "cedar-backend",
          ...body,
        }),
      })
    );

  await t.test(
    "empty entry preserves prior materials and admits the exact source without a synthetic kickoff",
    async () => {
      state = initial();
      const response = await submit();
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(state.ingestions, 0);
      assert.equal(state.admissions, 1);
      assert.equal(state.scheduled, 1);
      assert.deepEqual(state.profile.resume_links, ["https://existing.test"]);
      assert.equal(state.profile.resume_text, "Existing resume");
      assert.equal(state.rpcInput?.p_official_job_slug, "cedar-backend");
      assert.equal(state.rpcInput?.p_receipt, "자료 없이 Harper와 시작할게요.");
      assert.deepEqual(body.assistantMessages, []);
      assert.equal(body.conversation.stage, "completed");
    }
  );
  await t.test(
    "completed transport retry does not re-ingest or overwrite materials",
    async () => {
      state = initial();
      await submit();
      const before = state.writes.length;
      assert.equal(
        (await submit({ resumeText: "different", links: ["https://new.test"] }))
          .status,
        200
      );
      assert.equal(state.writes.length, before);
      assert.equal(state.admissions, 1);
      assert.equal(state.ingestions, 0);
      assert.equal(state.profile.resume_text, "Existing resume");
    }
  );
  await t.test(
    "an active extraction returns pending without another extraction or write",
    async () => {
      state = initial();
      state.conversation.profile_ingestion_status = "processing";
      state.conversation.profile_ingestion_updated_at =
        new Date().toISOString();
      const response = await submit({ resumeText: "Duplicate submission" });
      assert.equal(response.status, 202);
      assert.equal(
        (await response.json()).profileIngestion.status,
        "processing"
      );
      assert.equal(state.writes.length, 0);
      assert.equal(state.ingestions, 0);
      assert.equal(state.admissions, 0);
    }
  );
  await t.test(
    "owned document-only input supplies a truthful receipt and the existing extracted text",
    async () => {
      state = initial();
      assert.equal(
        (await submit({ resumeDocumentId: "document" })).status,
        200
      );
      assert.equal(state.rpcInput?.p_receipt, "이력서를 제출했습니다.");
      assert.equal(state.ingestions, 1);
      assert.equal(state.profile.resume_text, "Parsed resume");
      state = initial();
      assert.equal((await submit({ resumeDocumentId: "document", resumeText: "Stale client copy", applyProfileSources: false })).status, 200);
      assert.equal(state.profile.resume_text, "Parsed resume");
    }
  );
  await t.test(
    "authentication, conversation ownership and resume storage identity guard all profile writes",
    async () => {
      state = initial();
      state.authenticated = false;
      assert.equal((await submit()).status, 401);
      state = initial();
      state.conversation.user_id = "other";
      assert.equal((await submit()).status, 404);
      state = initial();
      assert.equal(
        (await submit({ resumeStoragePath: "other/resume.pdf" })).status,
        403
      );
      assert.equal(
        (
          await submit({
            resumeDocumentId: "document",
            resumeStoragePath: "owner/different.pdf",
          })
        ).status,
        409
      );
      assert.equal(state.writes.length, 0);
      assert.equal(state.admissions, 0);
    }
  );
  await t.test(
    "extraction failure remains retryable and skip uses no source ingestion",
    async () => {
      state = initial();
      state.fail = "extraction";
      const failed = await submit({
        resumeText: "Submitted resume",
        resumeFileName: "resume.pdf",
      });
      assert.equal(failed.status, 422);
      assert.equal(state.conversation.profile_ingestion_status, "failed");
      assert.equal(state.conversation.stage, "profile");
      assert.equal(state.admissions, 0);
      assert.equal((await submit({ applyProfileSources: false })).status, 200);
      assert.equal(state.ingestions, 1);
      assert.equal(state.profile.resume_text, "Submitted resume");
      assert.equal(state.admissions, 1);
    }
  );
  for (const failure of ["profile", "admission"])
    await t.test(
      `${failure} failure does not leave processing or falsely complete entry`,
      async () => {
        state = initial();
        state.fail = failure;
        assert.equal((await submit()).status, 500);
        assert.equal(state.conversation.stage, "profile");
        assert.equal(state.conversation.profile_ingestion_status, "failed");
        assert.equal(state.scheduled, 0);
        state.fail = "";
        assert.equal((await submit()).status, 200);
        assert.equal(state.scheduled, 1);
      }
    );
});
