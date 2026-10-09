export type BackgroundResultPart = { candidateId: string | null; text: string };
export type BackgroundResultCandidateTarget = {
  id: string;
  name: string;
  profileUrl: string;
};

/** The IDs are a renderer contract, not a classification of the prose. */
export function backgroundResultResponseFormat(candidateIds: string[]) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "company_background_result_messages",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["parts"],
        properties: {
          parts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["candidateId", "text"],
              properties: {
                candidateId: {
                  type: ["string", "null"],
                  enum: [null, ...candidateIds],
                },
                text: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}

export function parseBackgroundResultParts(
  raw: unknown,
  candidateIds: string[]
): BackgroundResultPart[] {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as any).parts)
  )
    throw new Error("Background result messages are required");
  const expected = new Set(candidateIds);
  const seen = new Set<string>();
  const parts = (value as any).parts.map((part: any): BackgroundResultPart => {
    if (!part || typeof part.text !== "string" || !part.text.trim())
      throw new Error("Background result message text is required");
    if (part.candidateId !== null) {
      if (
        typeof part.candidateId !== "string" ||
        !expected.has(part.candidateId) ||
        seen.has(part.candidateId)
      )
        throw new Error(
          "Invalid or duplicate background result candidate identifier"
        );
      seen.add(part.candidateId);
    }
    return { candidateId: part.candidateId, text: part.text.trim() };
  });
  if (!parts.length || seen.size !== expected.size)
    throw new Error(
      "Background result must cover every candidate exactly once"
    );
  return parts;
}

export function backgroundResultRenderContract(
  targets: BackgroundResultCandidateTarget[]
) {
  return `
<message_rendering_contract>
Return JSON with an ordered parts array. Each part contains only text and candidateId.
Write the same natural response you would otherwise give. Each candidate's complete explanation is one part with that candidate's exact ID; the renderer appends their profile card immediately after it. Include the candidate's supplied profile link in that explanation.
Opening remarks, role context, closing remarks, and follow-up questions have candidateId:null and their own parts. Keep them outside candidate explanation parts so the card directly follows the explanation. Mention each supplied candidate in exactly one identified part. Choose the wording, length, and ordering yourself; this is a rendering contract, not a wording template.
Candidate rendering targets: ${JSON.stringify(targets)}
</message_rendering_contract>`;
}
