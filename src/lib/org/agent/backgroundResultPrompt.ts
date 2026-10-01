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
  firstCompanyFirstResultDelivery?: boolean;
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
      content: args.systemPrompt + (args.firstCompanyFirstResultDelivery ? `

<first_company_first_result_delivery>
This is the first successful candidate-search result delivered to this company. Open by briefly explaining what this result is and how Harper will keep looking. For Roles with verified periodic search enabled, explain the actual weekday/hour when search starts in Asia/Seoul and invite changes to it; a candidate message is sent after a successful search only when someone is worth showing, not necessarily at that hour or on every scheduled day. When candidates are shown, the company can ask Harper to approach one; that is an additional option. Harper also has a separate path that introduces suitable Roles to candidates first and can bring interested candidates to the company after candidate acceptance and Harper's normal confirmation, so company requests from this list are not required for every future connection. Do not imply that a candidate has agreed or that a connection is complete; normal consent and confirmation still apply. Close by asking for one consequential missing hiring input that could improve the next search. Prioritize compensation when the supplied Role facts do not establish it; otherwise choose a genuine gap in the desired talent profile or priority. Do not re-ask for facts already present. Use natural wording appropriate to this result and conversation, without a fixed script.
</first_company_first_result_delivery>` : ""),
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
