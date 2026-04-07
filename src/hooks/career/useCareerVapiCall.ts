import { useCallback, useEffect, useRef, useState } from "react";

export type VapiCallStatus =
  | "idle"
  | "connecting"
  | "active"
  | "ending"
  | "ended";

export function useCareerVapiCall() {
  const [vapiCallStatus, setVapiCallStatus] = useState<VapiCallStatus>("idle");
  const [vapiCallDuration, setVapiCallDuration] = useState(0);
  const [vapiCallError, setVapiCallError] = useState<string | null>(null);

  const vapiRef = useRef<unknown>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startVapiCall = useCallback(
    async (args: {
      userId: string;
      conversationId: string;
      existingInsightsContext?: string;
    }) => {
      const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
      const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

      if (!publicKey || !assistantId) {
        setVapiCallError(
          "VAPI가 아직 설정되지 않았습니다. 대시보드에서 API 키와 Assistant ID를 설정해 주세요."
        );
        setVapiCallStatus("ended");
        return;
      }

      setVapiCallStatus("connecting");
      setVapiCallError(null);
      setVapiCallDuration(0);

      try {
        const VapiModule = await import("@vapi-ai/web");
        const Vapi = VapiModule.default;
        const vapi = new Vapi(publicKey);
        vapiRef.current = vapi;

        vapi.on("call-start", () => {
          setVapiCallStatus("active");
          timerRef.current = setInterval(() => {
            setVapiCallDuration((prev) => prev + 1);
          }, 1000);
        });

        vapi.on("call-end", () => {
          setVapiCallStatus("ended");
          clearTimer();
        });

        vapi.on("error", (error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "object" && error !== null && "message" in error
                ? String((error as { message: unknown }).message)
                : "통화 중 오류가 발생했습니다.";
          setVapiCallError(message);
          setVapiCallStatus("ended");
          clearTimer();
        });

        await vapi.start(assistantId, {
          metadata: {
            userId: args.userId,
            conversationId: args.conversationId,
          },
          ...(args.existingInsightsContext
            ? {
                variableValues: {
                  existingInsights: args.existingInsightsContext,
                },
              }
            : {}),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "통화 연결에 실패했습니다.";
        if (
          message.includes("Permission") ||
          message.includes("NotAllowed") ||
          message.includes("microphone")
        ) {
          setVapiCallError(
            "마이크 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해 주세요."
          );
        } else {
          setVapiCallError(message);
        }
        setVapiCallStatus("idle");
        clearTimer();
      }
    },
    [clearTimer]
  );

  const endVapiCall = useCallback(() => {
    setVapiCallStatus("ending");
    try {
      const vapi = vapiRef.current as { stop?: () => void } | null;
      if (vapi && typeof vapi.stop === "function") {
        vapi.stop();
      }
    } catch {
      // cleanup will happen via call-end event or fallback below
    }
    // Fallback: if call-end event doesn't fire within 3s, force ended
    setTimeout(() => {
      setVapiCallStatus((current) =>
        current === "ending" ? "ended" : current
      );
      clearTimer();
    }, 3000);
  }, [clearTimer]);

  const dismissVapiCall = useCallback(() => {
    setVapiCallStatus("idle");
    setVapiCallDuration(0);
    setVapiCallError(null);
    vapiRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      try {
        const vapi = vapiRef.current as { stop?: () => void } | null;
        if (vapi && typeof vapi.stop === "function") {
          vapi.stop();
        }
      } catch {
        // silent cleanup
      }
    };
  }, [clearTimer]);

  return {
    vapiCallStatus,
    vapiCallDuration,
    vapiCallError,
    startVapiCall,
    endVapiCall,
    dismissVapiCall,
  };
}
