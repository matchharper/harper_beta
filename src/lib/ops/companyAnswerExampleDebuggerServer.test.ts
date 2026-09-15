import assert from "node:assert/strict";
import test from "node:test";
import { runOpsCompanyAnswerExampleDebug } from "@/lib/ops/companyAnswerExampleDebuggerServer";

test("company answer retrieval debugger uses the production company lookup contract", async () => {
  const calls: Array<{
    audience: string;
    minScore: number;
    question: string;
    topK: number;
  }> = [];
  const result = await runOpsCompanyAnswerExampleDebug(
    { message: "  가격이 어떻게 되나요?  \r\n" },
    {
      lookup: async (question, options) => {
        calls.push({
          audience: options.audience,
          minScore: options.minScore,
          question,
          topK: options.topK,
        });
        return {
          assistantInstruction: "matched",
          examples: [
            {
              answer_example_text: "회사별 계약 조건에 따라 안내드려요.",
              id: "example-1",
              score: 0.81234,
              tags: ["pricing"],
              user_example_text: "가격 정책이 궁금해요.",
            },
          ],
        };
      },
    }
  );

  assert.deepEqual(calls, [
    {
      audience: "company",
      minScore: 0.35,
      question: "  가격이 어떻게 되나요?  \r\n",
      topK: 3,
    },
  ]);
  assert.equal(result.normalizedInput, "가격이 어떻게 되나요?");
  assert.equal(result.configuration.audience, "company");
  assert.equal(result.configuration.topK, 3);
  assert.equal(result.configuration.minScore, 0.35);
  assert.match(
    result.promptBlock ?? "",
    /<service_answer_examples audience="company">/
  );
  assert.match(result.promptBlock ?? "", /가격 정책이 궁금해요/);
  assert.doesNotMatch(result.promptBlock ?? "", /example-1|0\.81234|pricing/);
});

test("company answer retrieval debugger passes custom score and count settings", async () => {
  let receivedOptions:
    | { audience: "company"; minScore: number; topK: number }
    | undefined;
  const result = await runOpsCompanyAnswerExampleDebug(
    { message: "가격이 궁금해요", minScore: 0.7, topK: 8 },
    {
      lookup: async (_question, options) => {
        receivedOptions = options;
        return { assistantInstruction: "no match", examples: [] };
      },
    }
  );

  assert.deepEqual(receivedOptions, {
    audience: "company",
    minScore: 0.7,
    topK: 8,
  });
  assert.equal(result.configuration.minScore, 0.7);
  assert.equal(result.configuration.topK, 8);
});

test("company answer retrieval debugger reports no injected block without matches", async () => {
  const result = await runOpsCompanyAnswerExampleDebug(
    { message: "매칭되지 않는 질문" },
    {
      lookup: async () => ({
        assistantInstruction: "no match",
        examples: [],
      }),
    }
  );

  assert.equal(result.promptBlock, null);
  assert.deepEqual(result.matches, []);
});
