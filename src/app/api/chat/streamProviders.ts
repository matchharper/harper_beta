import {
  client,
  geminiChatStream,
  sseAsyncIterableToReadableStream,
  xaiClient,
} from "@/lib/llm/llm";
import { logger } from "@/utils/logger";

export async function createXaiOrOpenAIStream(params: {
  model: string;
  messages: any[];
  temperature: number;
  tools?: any;
  tool_choice?: any;
}) {
  try {
    return await xaiClient.chat.completions.create({
      ...params,
      stream: true,
    });
  } catch {
    return await client.chat.completions.create({
      ...params,
      model: "gpt-4.1-mini",
      stream: true,
    });
  }
}

export async function createXaiGeminiOpenAIReadableStream(params: {
  model: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature: number;
  tools?: any;
  tool_choice?: any;
  openaiModel?: string;
  geminiModel?: string;
}) {
  const {
    model,
    systemPrompt,
    messages,
    temperature,
    tools,
    tool_choice,
    openaiModel = "gpt-4.1-mini",
    geminiModel = "gemini-3-flash-preview",
  } = params;

  try {
    const xaiSse = await xaiClient.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature,
      stream: true,
      ...(tools ? { tools } : {}),
      ...(tool_choice ? { tool_choice } : {}),
    });

    return {
      provider: "xai" as const,
      stream: sseAsyncIterableToReadableStream(xaiSse as any),
    };
  } catch (err) {
    logger.log("xAI failed. Falling back to Gemini...", err);
  }

  try {
    const geminiReadable = await geminiChatStream({
      model: geminiModel,
      systemPrompt,
      messages,
      temperature,
    });

    return {
      provider: "gemini" as const,
      stream: geminiReadable,
    };
  } catch (err) {
    logger.log("Gemini failed. Falling back to OpenAI...", err);
  }

  const openaiSse = await client.chat.completions.create({
    model: openaiModel,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature,
    stream: true,
    ...(tools ? { tools } : {}),
    ...(tool_choice ? { tool_choice } : {}),
  });

  return {
    provider: "openai" as const,
    stream: sseAsyncIterableToReadableStream(openaiSse as any),
  };
}
