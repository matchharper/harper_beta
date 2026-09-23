type BackgroundResultMessage = {
  content: string;
  name?: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: Array<{
    function: { arguments: string; name: string };
    id: string;
    type: "function";
  }>;
};

function clean(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replaceAll("\u0000", "")
    .trim()
    .slice(0, maxLength);
}

export function buildOrgAgentBackgroundResultMessages(args: {
  companyName: string;
  requestMessage: string;
  resultText: string;
  roleId: string;
  roleName: string;
  systemPrompt: string;
}): BackgroundResultMessage[] {
  const callId = "company_matching_background_result";
  const userPrompt = `<conversation_scope>
company=${clean(args.companyName, 300) || "현재 회사"}
role=${clean(args.roleName, 300) || "현재 채용"}
</conversation_scope>

<user_message>
${clean(args.requestMessage, 4_000)}
</user_message>`;
  return [
    {
      content: args.systemPrompt,
      role: "system",
    },
    {
      content: userPrompt,
      role: "user",
    },
    {
      content: "",
      role: "assistant",
      tool_calls: [
        {
          function: {
            arguments: JSON.stringify({ roleId: clean(args.roleId, 100) }),
            name: "request_matching_search",
          },
          id: callId,
          type: "function",
        },
      ],
    },
    {
      content: `The asynchronous work requested through this tool has now finished. The following are verified facts, not a draft or a prescribed response format. Continue the original conversation and use your judgment about what is useful to say and how to say it naturally. Do not infer facts that are not present here.\n\n${clean(args.resultText, 20_000)}`,
      name: "request_matching_search",
      role: "tool",
      tool_call_id: callId,
    },
  ];
}
