import { useMemo, useState } from "react";
import {
  CareerInlinePanel,
  CareerPrimaryButton,
  CareerSectionHeader,
} from "./ui/CareerPrimitives";
import {
  buildDeliveryCopyUserPrompt,
  createExampleDeliveryCopyPromptInput,
  DELIVERY_COPY_TEST_FALLBACK_MODEL,
  DELIVERY_COPY_SYSTEM_PROMPT,
  DELIVERY_COPY_TEST_MODEL,
  DELIVERY_COPY_TEST_TEMPERATURE,
  parseDeliveryCopyText,
} from "@/lib/career/deliveryCopyPromptTest";

type DeliveryCopyTestResult = ReturnType<typeof parseDeliveryCopyText> & {
  receivedAt: string;
  model: string;
};

const grokApiKey = process.env.NEXT_PUBLIC_GROK_API_KEY?.trim() ?? "";

const DeliveryCopyPromptTestPanel = ({
  displayName,
}: {
  displayName: string;
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DeliveryCopyTestResult | null>(null);

  const exampleInput = useMemo(
    () => createExampleDeliveryCopyPromptInput(displayName),
    [displayName]
  );
  const userPrompt = useMemo(
    () => buildDeliveryCopyUserPrompt(exampleInput),
    [exampleInput]
  );

  const runRequest = async (model: string) => {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grokApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: DELIVERY_COPY_TEST_TEMPERATURE,
        messages: [
          { role: "system", content: DELIVERY_COPY_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const body = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(body || `HTTP ${response.status}`);
    }

    const payload = body
      ? (JSON.parse(body) as {
          choices?: Array<{
            message?: {
              content?: string | null;
            };
          }>;
        })
      : { choices: [] };

    return {
      model,
      rawText: payload.choices?.[0]?.message?.content?.trim() ?? "",
    };
  };

  const handleRun = async () => {
    if (!grokApiKey) {
      setError(
        "`NEXT_PUBLIC_GROK_API_KEY`가 없어서 브라우저에서 직접 호출할 수 없습니다."
      );
      return;
    }

    setIsRunning(true);
    setError("");

    try {
      let resolved = await runRequest(DELIVERY_COPY_TEST_MODEL).catch(
        async (primaryError) => {
          const message =
            primaryError instanceof Error
              ? primaryError.message.toLowerCase()
              : String(primaryError).toLowerCase();
          const shouldFallback =
            message.includes("service temporarily unavailable") ||
            message.includes("currently unavailable") ||
            message.includes("at capacity") ||
            message.includes("\"code\":\"the service is currently unavailable\"") ||
            message.includes("timeout") ||
            message.includes("aborted") ||
            message.includes("503");

          if (!shouldFallback) {
            throw primaryError;
          }

          return await runRequest(DELIVERY_COPY_TEST_FALLBACK_MODEL);
        }
      );

      const rawText = resolved.rawText;
      if (!rawText) {
        throw new Error("LLM 응답 본문이 비어 있습니다.");
      }

      setResult({
        ...parseDeliveryCopyText(rawText),
        model: resolved.model,
        receivedAt: new Date().toLocaleString("ko-KR"),
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "알 수 없는 오류가 발생했습니다."
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <CareerInlinePanel className="mt-8 rounded-[18px] border border-beige900/10 bg-white/55 px-5 py-5 sm:px-6">
      <CareerSectionHeader
        title="Delivery Copy Prompt Test"
        description="워커의 DELIVERY_COPY_SYSTEM_PROMPT와 동일한 텍스트를 넣고, 예시 payload로 브라우저에서 바로 LLM 호출하는 테스트 패널입니다."
        action={
          <CareerPrimaryButton
            onClick={() => void handleRun()}
            disabled={isRunning}
            className="px-4"
          >
            {isRunning ? "LLM 호출 중..." : "예시 데이터로 실행"}
          </CareerPrimaryButton>
        }
      />

      <div className="mt-4 flex flex-wrap gap-2 text-[12px] leading-5 text-beige900/60">
        <span className="rounded-full border border-beige900/10 bg-beige100/70 px-3 py-1">
          primary: {DELIVERY_COPY_TEST_MODEL}
        </span>
        <span className="rounded-full border border-beige900/10 bg-beige100/70 px-3 py-1">
          fallback: {DELIVERY_COPY_TEST_FALLBACK_MODEL}
        </span>
        <span className="rounded-full border border-beige900/10 bg-beige100/70 px-3 py-1">
          temperature: {DELIVERY_COPY_TEST_TEMPERATURE}
        </span>
        <span className="rounded-full border border-beige900/10 bg-beige100/70 px-3 py-1">
          browser direct call
        </span>
      </div>

      {!grokApiKey ? (
        <div className="mt-4 rounded-[12px] border border-amber-700/20 bg-amber-50/80 px-4 py-3 text-[13px] leading-6 text-amber-900">
          `NEXT_PUBLIC_GROK_API_KEY`가 세팅되지 않았습니다. dev 서버를 다시 띄운
          뒤 실행해야 합니다.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-[12px] border border-red-900/10 bg-red-50/80 px-4 py-3 text-[13px] leading-6 text-red-900">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <details className="rounded-[14px] border border-beige900/10 bg-white/65 px-4 py-4">
          <summary className="cursor-pointer text-[14px] font-medium text-beige900">
            System prompt 보기
          </summary>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-6 text-beige900/70">
            {DELIVERY_COPY_SYSTEM_PROMPT}
          </pre>
        </details>

        <details className="rounded-[14px] border border-beige900/10 bg-white/65 px-4 py-4">
          <summary className="cursor-pointer text-[14px] font-medium text-beige900">
            Example user prompt 보기
          </summary>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-6 text-beige900/70">
            {userPrompt}
          </pre>
        </details>
      </div>

      <div className="mt-5 rounded-[14px] border border-beige900/10 bg-[#f7f1e6] px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-[15px] font-medium text-beige900">LLM 응답</h3>
          <div className="flex flex-col items-end gap-1 text-[12px] leading-5 text-beige900/50">
            {result ? <span>used: {result.model}</span> : null}
            {result ? <span>{result.receivedAt}</span> : null}
          </div>
        </div>

        {result ? (
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-[12px] uppercase tracking-[0.14em] text-beige900/40">
                Subject
              </div>
              <div className="mt-2 text-[15px] leading-7 text-beige900">
                {result.emailSubject || "(subject 없음)"}
              </div>
            </div>

            <div>
              <div className="text-[12px] uppercase tracking-[0.14em] text-beige900/40">
                Body
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-7 text-beige900/80">
                {result.emailBody}
              </pre>
            </div>

            <details className="rounded-[12px] border border-beige900/10 bg-white/60 px-4 py-3">
              <summary className="cursor-pointer text-[13px] font-medium text-beige900/70">
                Raw parsed text 보기
              </summary>
              <pre className="mt-3 whitespace-pre-wrap break-words text-[12px] leading-6 text-beige900/65">
                {result.rawText}
              </pre>
            </details>
          </div>
        ) : (
          <div className="mt-3 text-[14px] leading-6 text-beige900/50">
            아직 실행 전입니다. 위 버튼을 누르면 같은 prompt 형식으로 바로
            호출합니다.
          </div>
        )}
      </div>
    </CareerInlinePanel>
  );
};

export default DeliveryCopyPromptTestPanel;
