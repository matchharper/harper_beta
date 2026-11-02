import { stringifyLlmDateTimes } from '@/lib/llm/promptDateTime';
import { convertMarkdownLinksToSlackMrkdwn, formatSlackLink } from "../slackMessages";
import type { CompanyCapabilityId } from "./capabilities/registry";

/** The server knows which completed work is resuming, even after unrelated turns. */
export function companyUpdateInitialCapabilities(context: Record<string, unknown>): CompanyCapabilityId[] {
  const facts = context.facts as Record<string, unknown> | undefined;
  return typeof facts?.matchingSearchRunId === "string" && facts.matchingSearchRunId
    ? ["candidate_search"] : [];
}

export type CompanyUpdateSlackReceipt = {
  slackMessageTs: string;
  threadId: string;
};

/** The mention is a channel-entry signal; Harper's explanation remains model-authored. */
export async function deliverCompanyUpdateSlackThread(
  args: { channelId: string; eventKey: string; mentionSlackUserId: string; text: string },
  send: (message: {
    text: string;
    threadTs?: string;
    idempotencyKey: string;
  }) => Promise<CompanyUpdateSlackReceipt>
) {
  const root = await send({
    text: `<@${args.mentionSlackUserId}> 👋`,
    idempotencyKey: `${args.eventKey}:mention`,
  });
  const reply = await send({
    text: convertMarkdownLinksToSlackMrkdwn(args.text),
    threadTs: root.slackMessageTs,
    idempotencyKey: `${args.eventKey}:welcome`,
  });
  return { ...reply, rootMessageTs: root.slackMessageTs };
}

/** Resolve only explicit renderer identifiers; never rewrite model-authored prose. */
export function renderCompanyUpdateCardText(text: string, targets: Array<{ id: string; profileUrl: string }>) {
  const urls = new Map(targets.map(target => [target.id, target.profileUrl]));
  return convertMarkdownLinksToSlackMrkdwn(text.replace(
    /\[([^\]\n]+)\]\(talent:([a-zA-Z0-9-]+)\)/g,
    (original, label: string, id: string) => urls.has(id) ? formatSlackLink(urls.get(id)!, label) : original,
  ));
}

/** Shared input contract: facts and purpose, never a prepared Harper message. */
export function buildCompanyUpdatePrompt(context: Record<string, unknown>) {
  const facts = context.facts as Record<string, unknown> | undefined;
  const hasDeliveryFact = typeof facts?.companyMessageAlreadyDelivered === "boolean";
  const alreadyDelivered = facts?.companyMessageAlreadyDelivered === true;
  const { preservedPresentation, candidateIds: _renderIds, ...publicFacts } = facts ?? {};
  const publicContext = { ...context, facts: publicFacts };
  return [
    alreadyDelivered
      ? "A verified product result has already been shown to this company. Continue only if useful work, a consequential suggestion or a necessary decision remains; otherwise finish silently. Do not repeat the delivered presentation."
      : "Share this verified product event with the company as part of the ongoing conversation.",
    "Continue the company's actual conversation as Harper. Explain the verified event and its practical consequence, using fresh general reads when relevant. You may propose a useful next step based on the conversation; do not force a generic offer or invent work already done.",
    "The event adds no new company authorization and does not reset an existing assignment. Resume the company's actual instructions within their original scope, respecting later corrections, cancellations and normal tool permissions. Distinguish the completed step from the requested outcome and the event's recorded time from current state. Do not repeat the committed action.",
    "Only supplied company-shareable facts and authorized read results may be used. A pending state establishes only that no decision is recorded; it does not establish that anyone opened, read, or is actively reviewing the proposal. Never infer a private candidate reason or equate changed contact preferences with a declined proposal.",
    ...(hasDeliveryFact ? [
      "Perform useful follow-up work when the company's actual instructions authorize it and existing tools support it. When a company decision is needed, offer the concrete help that matters in this conversation. Do not merely return work to the company that you can already complete with its authorization.",
      "Report only verified effects. A workflow status alone does not establish that a future email, invitation or other delivery has been scheduled. Before promising an upcoming operation, verify its actual durable schedule or supported product contract with the general read tools; otherwise describe the current fact and the available next choice.",
      "Keep the event's subject identity exact. Use its immutable identifiers to join read results; similar status, circumstances or timing do not establish that another candidate is the event subject. If the event supplies only a name, retain that name without inventing a profile link or alias from unrelated results.",
    ] : []),
    ...(preservedPresentation ? ["The server appends the supplied verified presentation and its links unchanged. Write Harper's surrounding explanation and useful next decision, without repeating or rewriting the presentation."] : []),
    "<company_update>", stringifyLlmDateTimes(publicContext), "</company_update>",
  ].join("\n");
}
