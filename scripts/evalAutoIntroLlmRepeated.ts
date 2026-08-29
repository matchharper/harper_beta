import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

function positiveIntFlag(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  const value = Number(index >= 0 ? process.argv[index + 1] : null);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeIntFlag(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  const value = Number(index >= 0 ? process.argv[index + 1] : null);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

async function main() {
  const [llm, notifications] = await Promise.all([
    import("@/lib/ops/autoIntroToCompanyLlm"),
    import("@/lib/ops/autoIntroToCompanyNotifications"),
  ]);
  const limit = positiveIntFlag("--limit", 3);
  const offset = nonNegativeIntFlag("--offset", 0);
  const repeats = positiveIntFlag("--repeats", 3);
  const dossiers = await notifications.fetchAutoIntroToCompanyCandidateDossiers(
    { limit: limit + offset }
  );
  const groups = dossiers.groups.slice(offset, offset + limit);
  if (groups.length === 0) {
    throw new Error("No eligible auto-intro dossiers are available");
  }

  process.stderr.write(
    `Evaluating ${groups.length} role-candidate pairs, ${repeats} runs each. No Slack messages will be sent.\n`
  );
  for (const [groupIndex, group] of groups.entries()) {
    const role = group.roles[0];
    const candidate = role?.candidates[0];
    if (!role || !candidate) continue;
    for (let run = 1; run <= repeats; run += 1) {
      const startedAt = Date.now();
      const submissionAttempts: Array<Record<string, unknown>> = [];
      const submissionErrors: string[] = [];
      process.stderr.write(
        `[${groupIndex + 1}/${groups.length}] ${group.companyName} / ${role.roleTitle} / ${candidate.name} — run ${run}/${repeats}\n`
      );
      try {
        const generated = await llm.generateAutoIntroWorkspaceMessage(group, {
          logUsage: false,
          onTrace: (event) => {
            if (
              event.type === "tool_start" &&
              event.name === "submit_auto_intro"
            ) {
              const input = event.input as Record<string, any> | null;
              submissionAttempts.push({
                body: input?.slackProfile?.body ?? null,
              });
            }
            if (
              event.type === "tool_result" &&
              event.name === "submit_auto_intro" &&
              event.content.startsWith("Submission error:")
            ) {
              submissionErrors.push(event.content);
            }
          },
          source: "manual_repeated_auto_intro_prompt_eval",
        });
        process.stdout.write(
          `${JSON.stringify({
            candidateName: candidate.name,
            companyName: group.companyName,
            durationMs: Date.now() - startedAt,
            message: generated.message,
            model: generated.model,
            roleTitle: role.roleTitle,
            run,
            submissionAttempts:
              submissionErrors.length > 0 ? submissionAttempts : [],
            submissionErrors,
            talentId: candidate.talentId,
            webToolCallCount: generated.webToolCallCount,
            workspaceId: group.workspaceId,
          })}\n`
        );
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({
            candidateName: candidate.name,
            companyName: group.companyName,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
            roleTitle: role.roleTitle,
            run,
            submissionAttempts: submissionAttempts.slice(-3),
            submissionErrors,
            talentId: candidate.talentId,
            workspaceId: group.workspaceId,
          })}\n`
        );
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
});
