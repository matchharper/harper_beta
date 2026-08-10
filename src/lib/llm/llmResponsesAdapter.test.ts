import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenAIResponsesRequest,
  toChatCompletionFromOpenAIResponse,
  toOpenAIResponsesInput,
} from "./responsesChatAdapter";

test("builds a stateless high-reasoning Responses request", () => {
  const request = buildOpenAIResponsesRequest({
    model: "gpt-5.6-luna",
    reasoningEffort: "high",
    requestBody: {
      max_tokens: 4_000,
      messages: [{ content: "Hello", role: "user" }],
      response_format: { type: "json_object" },
      tools: [
        {
          function: {
            name: "lookup",
            parameters: { properties: {}, type: "object" },
          },
          type: "function",
        },
      ],
    },
  });

  assert.deepEqual(request.reasoning, { effort: "high" });
  assert.deepEqual(request.text, { format: { type: "json_object" } });
  assert.equal(request.store, false);
  assert.deepEqual(request.include, ["reasoning.encrypted_content"]);
  assert.equal(request.max_output_tokens, 4_000);
});

test("maps Responses function calls into the existing chat tool shape", () => {
  const rawOutput = [
    { encrypted_content: "opaque", type: "reasoning" },
    {
      arguments: '{"sections":["members"]}',
      call_id: "call_1",
      name: "get_more_data",
      type: "function_call",
    },
  ];
  const completion = toChatCompletionFromOpenAIResponse({
    id: "resp_1",
    model: "gpt-5.6-luna",
    output: rawOutput,
    status: "completed",
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  });

  assert.deepEqual(completion.choices[0].message.tool_calls, [
    {
      function: {
        arguments: '{"sections":["members"]}',
        name: "get_more_data",
      },
      id: "call_1",
      type: "function",
    },
  ]);
  assert.equal(completion.usage.prompt_tokens, 10);
  assert.equal(completion.usage.completion_tokens, 5);
  assert.equal(completion.choices[0].message._responses_output, rawOutput);
});

test("replays raw reasoning and function items before the tool output", () => {
  const rawOutput = [
    { encrypted_content: "opaque", type: "reasoning" },
    {
      arguments: "{}",
      call_id: "call_1",
      name: "get_more_data",
      type: "function_call",
    },
  ];

  assert.deepEqual(
    toOpenAIResponsesInput([
      { content: "Be helpful", role: "system" },
      { content: "Who is on the team?", role: "user" },
      {
        _responses_output: rawOutput,
        content: null,
        role: "assistant",
        tool_calls: [
          {
            function: { arguments: "{}", name: "get_more_data" },
            id: "call_1",
            type: "function",
          },
        ],
      },
      {
        content: '{"members":[]}',
        role: "tool",
        tool_call_id: "call_1",
      },
    ]),
    [
      { content: "Be helpful", role: "system" },
      { content: "Who is on the team?", role: "user" },
      ...rawOutput,
      {
        call_id: "call_1",
        output: '{"members":[]}',
        type: "function_call_output",
      },
    ]
  );
});

test("converts legacy assistant tool messages when raw response items are absent", () => {
  assert.deepEqual(
    toOpenAIResponsesInput([
      {
        content: "",
        role: "assistant",
        tool_calls: [
          {
            function: { arguments: "{}", name: "read_role" },
            id: "call_2",
            type: "function",
          },
        ],
      },
    ]),
    [
      {
        arguments: "{}",
        call_id: "call_2",
        name: "read_role",
        type: "function_call",
      },
    ]
  );
});
