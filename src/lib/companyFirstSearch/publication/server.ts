import 'server-only';
import { createChatCompletionWithFallback } from '@/lib/llm/llm';
import { extractLlmTokenUsage } from '@/lib/llm/usageLogging';
import { roleStartSql } from '@/lib/org/roleStart/db';
import { parsePublicationCommand, publishRecommendations } from './service';
import { fingerprint, parsePresentation, presentationInput, presentationSchema,
  PRESENTATION_MODEL, PRESENTATION_REASONING, PRESENTATION_MAX_OUTPUT_TOKENS, type PublicationRole, type PublicationCandidate, type Presentation } from './writer';

export async function writeCandidatePresentation(role: PublicationRole, candidate: PublicationCandidate): Promise<Presentation> {
  const input = presentationInput(role, candidate);
  const model = process.env.COMPANY_CANDIDATE_PRESENTATION_MODEL?.trim() || PRESENTATION_MODEL;
  const maxTokens = Number(process.env.COMPANY_REQUESTED_PRESENTATION_MAX_TOKENS || PRESENTATION_MAX_OUTPUT_TOKENS);
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) throw new Error('Invalid presentation output token configuration');
  const started = Date.now();
  const completion = await createChatCompletionWithFallback({
    model, debugLabel:'company-recommendation-presentation',
    openAIResponses:{reasoningEffort:PRESENTATION_REASONING},
    structuredOutput:{name:'company_candidate_presentation',schema:presentationSchema},
    buildRequest: () => ({temperature:0.3,max_completion_tokens:maxTokens,
      messages:[{role:'system',content:input.system},{role:'user',content:input.user}]}),
  });
  const content = completion.response?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Candidate presentation returned no structured content');
  return {...parsePresentation(JSON.parse(content),role,candidate),
    fingerprint:fingerprint({input,model,maxTokens,reasoningEffort:PRESENTATION_REASONING,talentId:candidate.talentId,roleId:role.roleId}),
    usage:{model:completion.model,maxTokens,reasoningEffort:PRESENTATION_REASONING,elapsedMs:Date.now()-started,
      ...extractLlmTokenUsage(completion.response)}};
}

/** Called and awaited by the web chat tool and the authenticated publication endpoint. */
export async function publishRoleRecommendations(args: Parameters<typeof parsePublicationCommand>[0]) {
  const command = parsePublicationCommand(args);
  const sql = roleStartSql();
  return publishRecommendations(command, {
    transaction: async work => {
      // postgres.js unwraps transaction results at runtime; work returns a single object.
      return await sql.begin(async transaction => work(async (text, params = []) =>
        Array.from(await transaction.unsafe(text, params)))) as Awaited<ReturnType<typeof work>>;
    },
    write:writeCandidatePresentation,
  });
}
