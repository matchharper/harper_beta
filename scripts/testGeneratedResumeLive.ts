/** Opt-in integration fixture. Never uses real talent records or sends email. */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const file = "output/resume-test/session.json";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
type SuccessfulData<R> = R extends { error: null; data: infer D }
  ? NonNullable<D>
  : never;
function check<R extends { data: unknown; error: { message: string } | null }>(
  r: R
): SuccessfulData<R> {
  if (r.error) throw new Error(r.error.message);
  return r.data as SuccessfulData<R>;
}

async function main() {
  if (process.env.HARPER_RESUME_LIVE_TEST !== "1")
    throw new Error(
      "Set HARPER_RESUME_LIVE_TEST=1 to run the isolated integration fixture."
    );
  if (process.argv.includes("--seed")) {
    const email = `resume-test-${randomUUID()}@example.invalid`;
    const password = randomUUID() + randomUUID();
    const auth = check(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
    );
    const userId = auth.user.id;
    await mkdir("output/resume-test", { recursive: true });
    await writeFile(file, JSON.stringify({ userId }), { mode: 0o600 });
    check(
      await admin.from("talent_users").insert({
        user_id: userId,
        name: "김하늘",
        email,
        bio: "고객 인터뷰와 제품 실험을 담당하는 프로덕트 매니저. 영어 이름은 Haneul Kim.",
      })
    );
    check(
      await admin.from("talent_setting").insert({
        user_id: userId,
        profile_visibility: "dont_share",
        status: "stopped",
        get_internal_recommendation: false,
        get_external_recommendation: false,
        is_onboarding_done: true,
        preferred_locale: "ko",
      })
    );
    check(
      await admin.from("talent_experiences").insert({
        talent_id: userId,
        company_name: "예시 주식회사",
        role: "프로덕트 매니저",
        start_date: "2022-03-01",
        description:
          "고객 인터뷰를 바탕으로 신규 사용자 온보딩을 개선하고 디자이너·개발자와 협업했다.",
      })
    );
    check(
      await admin.from("talent_contexts").insert({
        talent_id: userId,
        collection: "memory",
        ref: 1,
        content:
          "지역 비영리 커뮤니티에서 봉사자용 일정 관리 도구를 기획하고 직접 사용자 인터뷰를 진행했다. PM 이력서에 활용할 수 있는 경험이다.",
        importance: 2,
      })
    );
    const conversation = check(
      await admin
        .from("talent_conversations")
        .insert({ user_id: userId, stage: "chat" })
        .select("id")
        .single()
    );
    const login = check(
      await anon.auth.signInWithPassword({ email, password })
    );
    await writeFile(
      file,
      JSON.stringify({
        userId,
        conversationId: conversation.id,
        session: login.session,
      }),
      { mode: 0o600 }
    );
    console.info("Isolated resume test user and session created.");
    return;
  }
  const state = JSON.parse(await readFile(file, "utf8"));
  if (process.argv.includes("--cleanup")) {
    const docs = check(
      await admin
        .from("talent_documents")
        .select("storage_path")
        .eq("talent_id", state.userId)
    );
    const paths = docs.map((x) => x.storage_path).filter(Boolean);
    if (paths.length)
      check(await admin.storage.from("talent-resumes").remove(paths));
    check(
      await admin.from("talent_users").delete().eq("user_id", state.userId)
    );
    check(await admin.auth.admin.deleteUser(state.userId));
    await writeFile(file, JSON.stringify({ cleaned: true }), { mode: 0o600 });
    console.info("Isolated resume test user and files removed.");
    return;
  }
  if (process.argv.includes("--direct")) {
    const { generateResume } = await import("../src/lib/resumes/service");
    const input = {
      action: "create",
      document_name: "김하늘_이력서_PM",
      content: {
        language: "ko",
        basics: { name: "김하늘" },
        projects: [
          {
            title: "사용자 경험 개선",
            description: "고객 인터뷰와 제품 개선을 담당했습니다.",
          },
        ],
      },
    };
    const args = {
      admin,
      userId: state.userId,
      userMessageId: "direct-test",
      requestId: randomUUID(),
      input,
    };
    const first = await generateResume(args);
    const duplicate = await generateResume(args);
    assert.equal(first.documentId, duplicate.documentId);
    const edit = {
      ...args,
      requestId: randomUUID(),
      input: {
        action: "update",
        document_id: first.documentId,
        expected_revision: first.revision,
        content: {
          ...input.content,
          projects: [
            {
              title: "사용자 경험 개선",
              description:
                "고객 인터뷰를 바탕으로 커뮤니티 도구를 기획했습니다.",
            },
          ],
        },
      },
    };
    const updated = await generateResume(edit);
    assert.equal(updated.documentId, first.documentId);
    assert.equal(updated.revision, 2);
    assert.equal((await generateResume(edit)).revision, 2);
    const docs = check(
      await admin
        .from("talent_documents")
        .select("id,revision,is_public,is_primary,storage_path")
        .eq("talent_id", state.userId)
    );
    assert.equal(docs.length, 1);
    assert.equal(docs[0].is_public, false);
    assert.equal(docs[0].is_primary, false);
    assert.equal(docs[0].storage_path, null);
    console.info(
      "Direct document create/retry/update/retry passed with real Supabase and no stored files."
    );
    return;
  }
  const base = process.env.HARPER_RESUME_TEST_URL || "http://localhost:3107";
  const headers = {
    Authorization: `Bearer ${state.session.access_token}`,
    "Content-Type": "application/json",
  };
  if (process.argv.includes("--security-tests")) {
    const ownUrl = `${base}/api/talent/documents/${state.documentId}/content`;
    for (const payload of [{ isPrimary: true }]) {
      const r = await fetch(`${base}/api/talent/documents`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ documentId: state.documentId, ...payload }),
      });
      assert.equal(r.status, 400, await r.text());
    }
    for (const isPublic of [true, false]) {
      const r = await fetch(`${base}/api/talent/documents`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ documentId: state.documentId, isPublic }),
      });
      assert.equal(r.status, 200, await r.text());
    }
    const email = `resume-access-test-${randomUUID()}@example.invalid`;
    const password = randomUUID() + randomUUID();
    const second = check(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
    );
    try {
      const login = check(
        await anon.auth.signInWithPassword({ email, password })
      );
      const otherHeaders = {
        ...headers,
        Authorization: `Bearer ${login.session!.access_token}`,
      };
      assert.equal(
        (await fetch(ownUrl, { headers: otherHeaders })).status,
        404
      );
      assert.equal(
        (
          await fetch(`${base}/api/talent/documents`, {
            method: "PATCH",
            headers: otherHeaders,
            body: JSON.stringify({
              documentId: state.documentId,
              fileName: "stolen.pdf",
            }),
          })
        ).status,
        404
      );
    } finally {
      check(await admin.auth.admin.deleteUser(second.user.id));
    }
    console.info(
      "Cross-account read/write and public/primary protections passed."
    );
    return;
  }
  // Browser locale synchronization may have changed this isolated fixture.
  check(
    await admin
      .from("talent_setting")
      .update({ preferred_locale: "ko" })
      .eq("user_id", state.userId)
  );
  const reviewOnly = process.argv.includes("--review");
  const beforeReview = reviewOnly
    ? check(
        await admin
          .from("talent_documents")
          .select("id,revision")
          .eq("talent_id", state.userId)
      )
    : null;
  const message = reviewOnly
    ? "현재 이력서의 PM 지원 적합성을 검토만 해줘. 아직 생성하거나 수정하지는 마."
    : process.argv.includes("--stream")
      ? "방금 만든 PM 이력서 소개의 순서를 바꿔줘. 비영리 커뮤니티의 봉사자 일정 도구를 기획한 경험을 첫 문장에 두고, 고객 인터뷰를 바탕으로 사용자 경험을 개선한 PM이라는 내용을 둘째 문장에 둬. 같은 문서와 파일 이름을 유지해줘."
      : process.argv.includes("--update")
        ? "방금 만든 PM 이력서 소개에 비영리 커뮤니티에서 봉사자 일정 도구를 기획한 경험도 강조해줘. 같은 문서만 수정하고 이름은 유지해줘."
        : "내가 알려준 경력과 기억을 활용해서 한국어 PM 이력서를 만들어줘. 커뮤니티 경험도 적절하면 반영해줘. 연락처는 생략해도 되고 회사 지원이나 공유는 하지 마.";
  const response = await fetch(`${base}/api/talent/chat`, {
    method: "POST",
    headers: {
      ...headers,
      ...(process.argv.includes("--stream")
        ? { Accept: "text/event-stream" }
        : {}),
    },
    body: JSON.stringify({
      clientRequestId: randomUUID(),
      conversationId: state.conversationId,
      message,
      locale: "ko",
      channel: "chat",
      allowedToolNames: [
        "list_documents",
        "read_document",
        "read_talent_context",
        "generate_resume",
      ],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const text = await response.text();
  await writeFile(
    `output/resume-test/${process.argv.includes("--update") ? "update" : "create"}-response.json`,
    text
  );
  assert.equal(response.status, 200, text.slice(0, 600));
  const docs = check(
    await admin
      .from("talent_documents")
      .select(
        "id,revision,origin_type,is_public,is_primary,extracted_text,file_name,storage_path"
      )
      .eq("talent_id", state.userId)
  );
  if (reviewOnly) {
    assert.deepEqual(
      docs.map(({ id, revision }) => ({ id, revision })),
      beforeReview
    );
    console.info("Review-only request did not create or modify a document.");
    return;
  }
  assert.equal(docs.length, 1);
  assert.equal(docs[0].is_public, false);
  assert.equal(docs[0].is_primary, false);
  assert.ok(docs[0].extracted_text.includes("커뮤니티"));
  assert.ok(text.includes(docs[0].id));
  if (state.documentId) assert.equal(docs[0].id, state.documentId);
  state.documentId = docs[0].id;
  await writeFile(file, JSON.stringify(state), { mode: 0o600 });
  const preview = await fetch(
    `${base}/api/talent/documents/${state.documentId}/content`,
    { headers }
  );
  assert.equal(preview.status, 200);
  const details = await preview.json();
  assert.equal(details.format, "resume");
  assert.equal(docs[0].storage_path, null);
  const pdf = await fetch(`${base}/api/talent/documents/${state.documentId}/pdf`, {
    method: "POST", headers, body: JSON.stringify({ expected_revision: details.revision, render_version: details.renderVersion })
  });
  assert.equal(pdf.status, 200);
  const unauthorized = await fetch(
    `${base}/api/talent/documents/${state.documentId}/content`
  );
  assert.equal(unauthorized.status, 401);
  console.info({
    status: "passed",
    revision: docs[0].revision,
    oneDocument: true,
    private: true,
    memoryReflected: true,
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
