/** The agent-correspondence modes of existing company tools. A service principal
 * cannot execute their legacy human-delivery or company-first discovery modes.
 * Keep these contracts shared with the full tools; no scenario chooses them.
 */
export const AGENT_CONTACT_DESCRIPTION = "Communicate with the candidate's agent within the company's delegated purpose and sharing permissions. action=send_to_agent immediately queues that agent to handle questions, information, requests or replies. The receiving agent has its own conversation history and sources and acts for its user; this does not directly notify the candidate or change interest, sharing consent or hiring stage.";
export const AGENT_MESSAGE_DESCRIPTION = "Your message to the candidate's agent within the company's delegated purpose. The counterpart can answer from its own knowledge and sources and decides how to act for its user.";
export const AGENT_PRESENTATION_DESCRIPTION = "Deliver your considered candidate assessment and shared profile to the hiring team for review through the Role inbox. Publication itself communicates to the team; this is not storage for private working notes or an ongoing investigation. It uses your own assessment without another writer or score gate. It does not send a separate chat/email alert or make a hiring decision.";

export const COMPANY_AGENT_CONTACT_TOOL = {
  type: "function",
  function: {
    name: "contact_talent",
    description: AGENT_CONTACT_DESCRIPTION,
    parameters: {
      type: "object", additionalProperties: false, required: ["action", "messageContent"],
      properties: {
        action: { type: "string", enum: ["send_to_agent"] },
        introductionRootId: { type: "string", description: "Exact authorized introduction from correspondence. Supply this or replyToMessageId." },
        replyToMessageId: { type: "string", description: "Exact agent message being answered; identifies its introduction." },
        messageContent: { type: "string", minLength: 1, description: AGENT_MESSAGE_DESCRIPTION },
      },
    },
  },
} as const;

export const COMPANY_AGENT_PRESENTATION_TOOL = {
  type: "function",
  function: {
    name: "publish_role_recommendations",
    description: AGENT_PRESENTATION_DESCRIPTION,
    parameters: {
      type: "object", additionalProperties: false, required: ["roleId", "introductionRootId", "presentation"],
      properties: {
        roleId: { type: "string" },
        introductionRootId: { type: "string", description: "Exact candidate-authorized introduction whose shared materials will be presented in the Role inbox. Existing hiring decisions are preserved." },
        presentation: { type: "string", description: "Your company-facing assessment grounded in the shared materials and company context. Creates or updates the presentation; updating preserves shared materials and hiring progress." },
        expectedPresentation: { type: "string", description: "When changing an existing presentation, its exact current text from read_agent_messages. Detects concurrent changes; omit for a new presentation." },
        reason: { type: "string", description: "Purpose grounded in the company conversation and assessed evidence." },
      },
    },
  },
} as const;
