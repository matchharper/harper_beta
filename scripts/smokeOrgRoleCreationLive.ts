import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

type ChatResult = Awaited<
  ReturnType<
    typeof import("../src/lib/org/agent/roleCreationChat").runOrgRoleCreationChat
  >
>;

type SmokeEvent = {
  data: unknown;
  event: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Smoke assertion failed: ${message}`);
}

async function main() {
  const decision = text(
    process.argv
      .slice(2)
      .find((argument) => argument.startsWith("--decision="))
      ?.slice("--decision=".length)
  );
  if (decision && decision !== "no" && decision !== "yes") {
    throw new Error("decision must be yes or no");
  }
  const scenario =
    text(
      process.argv
        .slice(2)
        .find((argument) => argument.startsWith("--scenario="))
        ?.slice("--scenario=".length)
    ) || "full";
  if (!(["confidential", "full", "sparse"] as const).includes(scenario as never)) {
    throw new Error("scenario must be full, sparse, or confidential");
  }
  const workspaceId = text(
    process.argv.slice(2).find((argument) => !argument.startsWith("--"))
  );
  const keepDraft = process.argv.includes("--keep-draft");
  if (!workspaceId) {
    throw new Error(
      "Usage: pnpm org-role-creation:live-smoke -- <company-workspace-id> [--scenario=full|sparse|confidential] [--keep-draft]"
    );
  }

  const [
    { runOrgRoleCreationChat },
    { confirmRoleCreationChoice },
    roleState,
    { getSupabaseAdmin },
  ] = await Promise.all([
      import("../src/lib/org/agent/roleCreationChat"),
      import("../src/lib/org/agent/roleCreationConfirmation"),
      import("../src/lib/org/agent/roleCreationState"),
      import("../src/lib/server/candidateAccess"),
    ]);
  const admin = getSupabaseAdmin();
  const draftRoleId = randomUUID();
  const roleTitle =
    scenario === "sparse"
      ? "Founding Product Designer"
      : scenario === "confidential"
        ? "Security Incident Response Lead"
        : "Senior Backend Platform Engineer";
  const events: SmokeEvent[] = [];
  const assistantReplies: string[] = [];
  let latestResult: ChatResult | null = null;
  const getLatestResult = () => latestResult;

  const { data: memberships, error: membershipError } = await admin
    .from("company_user_workspace")
    .select("company_user_id, authority")
    .eq("company_workspace_id", workspaceId);
  if (membershipError) throw membershipError;
  const membership = (memberships ?? []).sort((left, right) => {
    const rank = (authority: string) =>
      authority === "owner" ? 0 : authority === "admin" ? 1 : 2;
    return rank(left.authority) - rank(right.authority);
  })[0];
  if (!membership) throw new Error("Workspace has no organization member");

  const authResult = await admin.auth.admin.getUserById(
    membership.company_user_id
  );
  if (authResult.error) throw authResult.error;
  if (!authResult.data.user) throw new Error("Workspace member auth user missing");
  const user = authResult.data.user;

  const emit = (event: string, data: unknown) => {
    events.push({ data, event });
  };
  const runTurn = async (message: string) => {
    console.log(`\nUSER\n${message}`);
    const result = await runOrgRoleCreationChat({
      draftRoleId,
      emit,
      message,
      roleId: getLatestResult()?.roleId ?? null,
      user,
      workspaceId,
    });
    latestResult = result;
    assistantReplies.push(result.assistantMessage.content);
    console.log(`\nHARPER\n${result.assistantMessage.content}`);
    return result;
  };

  try {
    if (scenario === "full") {
      await runTurn(
        [
          `새 역할을 등록하려고 해요. 역할명은 ${roleTitle}입니다.`,
          "B2B SaaS의 핵심 API와 데이터 파이프라인을 설계하고, 제품팀과 함께 고객 요구를 안정적인 플랫폼 기능으로 만드는 역할이에요.",
          "근무지는 서울 강남이고 주 2회 출근하는 하이브리드 정규직입니다.",
          "비공개 매칭 기준은 TypeScript와 Node.js 기반 백엔드 실무 경험, PostgreSQL 데이터 모델링과 분산 시스템 설계 경험이 필수이고, 초기 스타트업에서 모호한 문제를 제품으로 풀어본 경험에는 가산점을 주는 것입니다.",
        ].join(" ")
      );
      await runTurn(
        "첫 6개월에는 주요 API의 장애율과 배포 리드타임을 낮추고, 반복되는 고객별 데이터 연동을 표준화하는 것이 핵심 성과예요. 이 내용은 지원자가 볼 수 있는 설명에 반영해 주세요."
      );
    } else if (scenario === "sparse") {
      await runTurn(
        `시드 단계 B2B AI 스타트업에서 ${roleTitle}를 처음 채용하려고 해요. 아직 JD는 없고, 대표와 엔지니어들과 아주 가깝게 일하면서 고객 인터뷰부터 제품 화면 설계까지 맡게 될 것 같아요.`
      );
    } else {
      await runTurn(
        [
          `역할명은 ${roleTitle}입니다.`,
          "기업 고객의 보안 사고 대응 체계를 만들고 실제 사고가 발생하면 엔지니어링·법무·고객 대응을 함께 이끄는 역할입니다.",
          "서울 기반 원격 근무가 가능한 정규직입니다.",
          "외부에는 절대 공개하지 않을 내부 매칭 기준으로 실제 P1 보안 사고를 지휘한 경험과 코드명 PROJECT NIGHTFALL 기준을 반드시 반영해 주세요. 유명 회사 출신 여부보다 사고 회고와 재발 방지 체계를 직접 만든 증거를 우선해 주세요.",
        ].join(" ")
      );
    }

    let state = await roleState.fetchRoleCreationState({
      roleId: draftRoleId,
      user,
      workspaceId,
    });
    const enabledChannel =
      scenario === "full"
        ? state.channels.find((channel) => channel.enabled)
        : undefined;
    if (scenario === "full" && enabledChannel) {
      const channelLabel = enabledChannel.channelName
        ? `#${enabledChannel.channelName}`
        : enabledChannel.channelId;
      await runTurn(
        `${channelLabel} 채널을 이 역할의 Slack 알림 채널로 연결하고 ${state.currentUser.name}님을 담당자로 등록해 주세요. 두 설정 모두 이 값으로 명시적으로 동의합니다.`
      );
    } else if (scenario === "full") {
      console.log(
        "\nNOTICE\nEnabled Slack channel이 없어 완료 전 대화까지만 검증합니다."
      );
    }

    state = await roleState.fetchRoleCreationState({
      roleId: draftRoleId,
      user,
      workspaceId,
    });
    let missingFields = roleState.getRoleCreationMissingFields(state);
    const hasConfirmation = Boolean(
      record(getLatestResult()?.assistantMessage.metadata).roleCreation
    );
    if (scenario === "full" && missingFields.length === 0 && !hasConfirmation) {
      await runTurn(
        "지금까지 저장된 내용으로 역할 작성을 완료하는 확인 단계로 진행해 주세요."
      );
      state = await roleState.fetchRoleCreationState({
        roleId: draftRoleId,
        user,
        workspaceId,
      });
      missingFields = roleState.getRoleCreationMissingFields(state);
    }

    let confirmationResult: Awaited<
      ReturnType<typeof confirmRoleCreationChoice>
    > | null = null;
    if (scenario === "full" && decision) {
      const confirmationDecision = decision === "yes" ? "yes" : "no";
      const latest = getLatestResult();
      const roleCreation = record(
        record(latest?.assistantMessage.metadata).roleCreation
      );
      const choices = Array.isArray(roleCreation.choices)
        ? roleCreation.choices.map(record)
        : [];
      const choice = choices.find((item) => item.value === confirmationDecision);
      assert(choice, `confirmation choice ${confirmationDecision} was not found`);
      confirmationResult = await confirmRoleCreationChoice({
        actionId: text(choice.actionId),
        decision: confirmationDecision,
        messageId: Number(latest?.assistantMessage.id),
        roleId: draftRoleId,
        user,
        workspaceId,
      });
      state = await roleState.fetchRoleCreationState({
        allowCompletedRole: decision === "yes",
        roleId: draftRoleId,
        user,
        workspaceId,
      });
      missingFields = roleState.getRoleCreationMissingFields(state);
      const { data: confirmationAssistant, error: confirmationAssistantError } =
        await admin
          .from("company_messages")
          .select("content")
          .eq("conversation_id", state.conversation.id)
          .eq("role_id", draftRoleId)
          .eq("role", "assistant")
          .order("id", { ascending: false })
          .limit(1)
          .single();
      if (confirmationAssistantError) throw confirmationAssistantError;
      assistantReplies.push(confirmationAssistant.content);
      console.log(`\nHARPER AFTER CHOICE\n${confirmationAssistant.content}`);
    }

    const { data: rawRole, error: rawRoleError } = await admin
      .from("company_roles")
      .select("status, opportunity_search_tsv")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", draftRoleId)
      .single();
    if (rawRoleError) throw rawRoleError;
    const { count: messageCount, error: messageCountError } = await admin
      .from("company_messages")
      .select("id", { count: "exact", head: true })
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", draftRoleId)
      .eq("conversation_id", state.conversation.id);
    if (messageCountError) throw messageCountError;

    const failedTools = events.filter(
      ({ data, event }) =>
        event === "tool_status" && record(data).status === "error"
    );
    assert(
      failedTools.length === 0,
      `LLM tool execution emitted an error: ${JSON.stringify(
        failedTools.map(({ data }) => data)
      )}`
    );
    assert(state.role.name === roleTitle, "role title was not saved exactly");
    const expectedStatus = decision === "yes" ? "active" : "draft";
    assert(rawRole.status === expectedStatus, "role status transition mismatch");
    if (decision === "yes") {
      assert(
        rawRole.opportunity_search_tsv !== null,
        "active role search vector was not restored"
      );
      assert(confirmationResult?.completed, "yes choice did not complete role");
      assert(state.metadata.phase === "completed", "conversation was not completed");
    } else {
      assert(
        rawRole.opportunity_search_tsv === null,
        "draft role entered opportunity search"
      );
      if (decision === "no") {
        assert(!confirmationResult?.completed, "no choice completed the role");
        assert(state.metadata.phase === "collecting", "declined role did not resume collecting");
      }
    }
    assert((messageCount ?? 0) >= 2, "isolated role conversation is incomplete");
    if (scenario === "full") {
      assert(Boolean(state.role.description), "public description is empty");
      assert(Boolean(state.role.request), "private matching request is empty");
      assert(state.role.locationText === "서울 강남", "location was not saved");
      assert(state.role.workMode === "hybrid", "work mode was not saved");
      assert(
        state.role.employmentTypes.includes("full_time"),
        "employment type was not saved"
      );
    }
    if (scenario === "full" && enabledChannel) {
      assert(missingFields.length === 0, `missing: ${missingFields.join(", ")}`);
      assert(
        Boolean(
          record(getLatestResult()?.assistantMessage.metadata).roleCreation
        ),
        "final confirmation choices were not rendered"
      );
    } else if (scenario === "full") {
      assert(
        missingFields.includes("connected_slack"),
        "missing Slack was not reported"
      );
    } else if (scenario === "sparse") {
      assert(missingFields.length > 0, "sparse role unexpectedly became complete");
      assert(!hasConfirmation, "sparse role showed final confirmation");
      assert(
        /6.?12개월|성과|결과|scope|범위|책임/i.test(
          assistantReplies.at(-1) ?? ""
        ),
        "sparse scenario did not ask a high-value scope or outcome question"
      );
    } else {
      assert(
        text(state.role.request).includes("PROJECT NIGHTFALL"),
        "confidential criterion was not saved internally"
      );
      assert(
        !text(state.role.description).includes("PROJECT NIGHTFALL"),
        "confidential criterion leaked into the public description"
      );
      assert(missingFields.length > 0, "confidential scenario should remain draft");
      assert(!hasConfirmation, "confidential scenario showed final confirmation");
    }

    console.log(
      `\nSMOKE RESULT\n${JSON.stringify(
        {
          confirmationPresented: Boolean(
            record(getLatestResult()?.assistantMessage.metadata).roleCreation
          ),
          decision: decision || null,
          decisionCompleted: confirmationResult?.completed ?? null,
          messageCount,
          missingFields,
          model: getLatestResult()?.model,
          roleStatus: rawRole.status,
          scenario,
          toolErrors: failedTools.length,
          toolEvents: events.filter(({ event }) => event === "tool_status").length,
        },
        null,
        2
      )}`
    );
  } finally {
    if (!keepDraft) {
      const { data: cleanupTarget, error: cleanupTargetError } = await admin
        .from("company_roles")
        .select("role_id, status")
        .eq("company_workspace_id", workspaceId)
        .eq("role_id", draftRoleId)
        .maybeSingle();
      if (cleanupTargetError) throw cleanupTargetError;
      const cleanupStatusAllowed =
        cleanupTarget?.status === "draft" ||
        (decision === "yes" && cleanupTarget?.status === "active");
      if (cleanupTarget && !cleanupStatusAllowed) {
        throw new Error(
          `Smoke draft cleanup refused: role status is ${cleanupTarget.status}`
        );
      }
      if (cleanupTarget) {
        const { error: conversationCleanupError } = await admin
          .from("company_conversations")
          .delete()
          .eq("company_workspace_id", workspaceId)
          .eq("role_id", draftRoleId);
        if (conversationCleanupError) throw conversationCleanupError;
        const { data: deleted, error } = await admin
          .from("company_roles")
          .delete()
          .eq("company_workspace_id", workspaceId)
          .eq("role_id", draftRoleId)
          .eq("status", cleanupTarget.status)
          .select("role_id");
        if (error) throw error;
        if (deleted?.length !== 1) {
          throw new Error(
            `Smoke draft cleanup refused: expected one draft, deleted ${deleted?.length ?? 0}`
          );
        }
        console.log("\nCLEANUP\nSynthetic draft and cascaded chat data removed.");
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
