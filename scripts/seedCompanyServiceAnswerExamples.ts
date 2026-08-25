import { COMPANY_SERVICE_FAQ_ITEMS } from "../src/lib/org/serviceFaq";

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(
      `Dry run: ${COMPANY_SERVICE_FAQ_ITEMS.length} Company FAQ rows are ready. Pass --apply after the audience migration is live.`
    );
    return;
  }

  const [{ saveOpsAnswerExample }, { hashAnswerExampleUserText }, server] =
    await Promise.all([
      import("../src/lib/ops/answerExamplesServer"),
      import("../src/lib/serviceAnswerExamples"),
      import("../src/lib/talentOnboarding/server"),
    ]);

  const admin = server.getTalentSupabaseAdmin();
  let inserted = 0;
  let updated = 0;
  const tagSetCounts = new Map<string, number>();
  for (const item of COMPANY_SERVICE_FAQ_ITEMS) {
    const tagSet = [...item.tags].sort().join("|");
    tagSetCounts.set(tagSet, (tagSetCounts.get(tagSet) ?? 0) + 1);
  }

  for (const item of COMPANY_SERVICE_FAQ_ITEMS) {
    const userExampleHash = hashAnswerExampleUserText(item.question);
    const stableNote = `Company FAQ seed key: ${item.key}. Canonical copy shared with /org/documents.`;
    const { data, error } = await admin
      .from("service_answer_examples")
      .select("id")
      .eq("audience", "company")
      .eq("user_example_hash", userExampleHash)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message ?? "Failed to find Company FAQ row");
    }

    let existingId = data?.id;
    if (!existingId) {
      const { data: noteMatch, error: noteMatchError } = await admin
        .from("service_answer_examples")
        .select("id")
        .eq("audience", "company")
        .eq("notes", stableNote)
        .limit(1)
        .maybeSingle();

      if (noteMatchError) {
        throw new Error(
          noteMatchError.message ?? "Failed to match Company FAQ seed key"
        );
      }
      existingId = noteMatch?.id;
    }

    const tagSet = [...item.tags].sort().join("|");
    if (!existingId && tagSetCounts.get(tagSet) === 1) {
      const { data: tagMatches, error: tagMatchError } = await admin
        .from("service_answer_examples")
        .select("id")
        .eq("audience", "company")
        .contains("tags", [...item.tags])
        .limit(2);

      if (tagMatchError) {
        throw new Error(
          tagMatchError.message ?? "Failed to match existing Company FAQ row"
        );
      }
      if (tagMatches?.length === 1) existingId = tagMatches[0].id;
    }

    await saveOpsAnswerExample({
      actorEmail: "seed:company-service-faq",
      admin,
      input: {
        answerExampleText: item.answer,
        audience: "company",
        enabled: true,
        id: existingId,
        notes: stableNote,
        tags: [...item.tags],
        userExampleText: item.question,
      },
    });

    if (existingId) updated += 1;
    else inserted += 1;
  }

  console.log(
    `Company FAQ seed complete: ${inserted} inserted, ${updated} updated.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
