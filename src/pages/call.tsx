import RecruiterCallSummaryScreen from "@/components/call/CallEndScreen";
import { MicPulseRings } from "@/components/call/MicPulseRing";
import { useConversation } from "@/hooks/useConversation";
import { useMicRecorder } from "@/hooks/useMicRecorder";
import { highlightDifferences2 } from "@/utils/textprocess";
import { logger } from "@/utils/logger";
import {
  AudioLines,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  Space,
} from "lucide-react";
import { useRouter } from "next/router";
import React, { useEffect, useRef, useState } from "react";

const TEST_SCRIPT = "오늘은 기분이 좋다.";

const Call: React.FC = () => {
  const router = useRouter();
  const [isScriptVisible, setIsScriptVisible] = useState(true);
  const [message, setMessage] = useState("");
  const [script, setScript] = useState("");
  const [callTime, setCallTime] = useState(0);
  const [isTest, setIsTest] = useState(false);
  const [isTestDone, setIsTestDone] = useState(false);
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [textScript, setTextScript] = useState("");
  const [wrongCount, setWrongCount] = useState(0);
  const [isActiveButton, setIsActiveButton] = useState(false);
  const [timer, setTimer] = useState("00:00");

  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const secRef = useRef(0);

  const { isRecording, micLevel, startMicRecording, stopMicCompletely } =
    useMicRecorder();

  const {
    isMuted,
    startCall,
    isThinking,
    endCall,
    sendAudioCommit,
    callStatus,
    assistantTexts,
    userTranscript,
    harperSaying,
    toggleMute,
    startTest,
    endTest,
    isPlayingTts,
    userTranscripts,
  } = useConversation(startMicRecording, stopMicCompletely);

  useEffect(() => {
    if (callStatus !== "calling") {
      return;
    }

    secRef.current = 0;
    setTimer("00:00");

    const id = window.setInterval(() => {
      secRef.current += 1;
      const minutes = Math.floor(secRef.current / 60);
      const seconds = secRef.current % 60;
      setTimer(
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    }, 1000);

    return () => {
      window.clearInterval(id);
    };
  }, [callStatus]);

  useEffect(() => {
    if (!isTestDone) return;

    const markedScript = highlightDifferences2(TEST_SCRIPT, userTranscript);
    const nextWrongCount = (markedScript.match(/<span/g) || []).length;

    setWrongCount(nextWrongCount);
    setTextScript(markedScript);
  }, [isTestDone, userTranscript]);

  useEffect(() => {
    if (!isRecording) {
      setMessage("");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage("짧게 답변하셔도 괜찮습니다.");
    }, 50000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isRecording]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (callStatus !== "calling") return;
      if (event.code !== "Space" || event.repeat) return;

      event.preventDefault();
      setIsActiveButton(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (callStatus !== "calling") return;
      if (event.code !== "Space") return;

      event.preventDefault();
      setIsActiveButton(false);

      if (isRecording) {
        sendButtonRef.current?.click();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [callStatus, isRecording]);

  const handleStartCall = async () => {
    setIsTest(false);
    setIsTestDone(false);
    setTextScript("");
    setWrongCount(0);
    await startCall();
  };

  const handleEndCall = async () => {
    const result = await endCall();
    setScript(result.script);
    setCallTime(result.callTime);
    logger.log("call script", result.script);
    logger.log("call time", result.callTime);
  };

  const handleStartTest = async () => {
    setIsTestLoading(true);
    setIsTest(true);
    setIsTestDone(false);
    setTextScript("");
    setWrongCount(0);

    await startTest();
    setIsTestLoading(false);
  };

  const handleCheckTest = async () => {
    await endTest();
    setIsTestDone(true);
  };

  const handleStopRecording = async () => {
    await sendAudioCommit();
  };

  return (
    <div className="flex h-[100vh] max-w-[100vw] flex-col items-center justify-center gap-2 bg-white font-inter text-black">
      <div className="flex w-[90vw] flex-row items-stretch justify-between gap-8">
        <div
          className={`flex items-center justify-center transition-transform duration-300 ${
            isScriptVisible ? "w-[60%]" : "w-[95%]"
          }`}
        >
          <div className="flex h-full w-[60%] flex-row items-center justify-between gap-2 md:flex-col">
            <div className="flex h-6 w-full flex-row items-center justify-start gap-2">
              <span>Call with Harper</span>
              {(callStatus === "calling" || callStatus === "ended") && (
                <div className="text-xgray700">{timer}</div>
              )}
            </div>

            <div className="relative flex h-[380px] w-full items-center justify-center rounded-lg border border-xlightgray shadow-sm">
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="relative flex h-[140px] w-[140px] items-center justify-center rounded-full bg-[linear-gradient(45deg,#6d28d9,#8b5cf6,#c084fc,#e879f9,#f472b6)] bg-[length:300%_300%] transition-all animate-gradientx">
                  {isPlayingTts && <MicPulseRings count={2} />}
                </div>
                <div className="text-xl font-light text-black">Harper</div>
              </div>
            </div>

            <div className="flex h-[220px] w-full items-end justify-center rounded-lg border border-xgray300/0">
              {callStatus === "calling" && (
                <div className="flex w-full flex-col items-center justify-center">
                  <div className="flex flex-row items-end justify-end gap-8">
                    <div className="group inline-flex flex-col items-center gap-2">
                      {!isMuted && isRecording && (
                        <div className="flex w-[86%] items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-xgray300">
                            <div
                              className="h-full max-w-[100%] rounded-full bg-xgrayblack transition-all duration-150"
                              style={{ width: `${micLevel * 100 * 1.2}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <button
                        ref={sendButtonRef}
                        type="button"
                        onClick={
                          isRecording ? handleStopRecording : handleStartCall
                        }
                        className={`flex h-16 items-center justify-center rounded-full border border-black/30 backdrop-blur transition-all duration-300 active:scale-95 ${
                          isActiveButton ? "scale-95" : "scale-100"
                        } ${
                          isRecording
                            ? "w-64 bg-xgrayblack"
                            : "w-16 bg-white disabled:opacity-40"
                        }`}
                      >
                        {isRecording ? (
                          <Space className="h-5 w-5 text-white" />
                        ) : (
                          <AudioLines className="h-5 w-5 text-black/90" />
                        )}
                      </button>

                      <span className="text-sm font-light text-black/80">
                        {isRecording
                          ? "Click or Push Spacebar to send"
                          : "Interrupt"}
                      </span>
                    </div>

                    <div className="group inline-flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="flex h-16 w-16 items-center justify-center rounded-full border border-black/30 transition active:scale-95"
                      >
                        {isMuted ? (
                          <MicOff className="h-5 w-5 text-black/90" />
                        ) : (
                          <Mic className="h-5 w-5 text-black/90" />
                        )}
                      </button>
                      <span className="text-base font-light text-black/90">
                        {isMuted ? "Muted" : "Mute"}
                      </span>
                    </div>

                    <div className="group inline-flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={handleEndCall}
                        className="flex h-16 w-16 items-center justify-center rounded-full border border-red-600 bg-red-600/10 transition active:scale-95"
                      >
                        <PhoneOff className="h-5 w-5 text-red-600" />
                      </button>
                      <span className="text-base text-black/90">End Call</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`flex flex-col items-center justify-center gap-2 transition-transform duration-300 ${
            isScriptVisible ? "w-[40%]" : "w-[5%]"
          }`}
        >
          <div className="flex w-full flex-row items-center justify-between gap-2">
            <div className="h-6 w-full text-sm text-black/50">{message}</div>
            <div className="flex w-full items-center justify-end">
              <button
                type="button"
                onClick={() => setIsScriptVisible((prev) => !prev)}
                className="cursor-pointer text-brightnavy hover:opacity-90"
              >
                {isScriptVisible ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="flex h-full w-full flex-row items-center justify-center gap-2 rounded-md bg-xlightgray p-4 md:flex-col">
            {callStatus === "ended" && (
              <div className="flex flex-col items-center justify-between">
                <RecruiterCallSummaryScreen
                  duration={timer}
                  onClickProfile={() => router.push("/app")}
                />
                <div className="mt-4 hidden">{script}</div>
                <div className="hidden">{callTime}</div>
              </div>
            )}

            {callStatus === "idle" && (
              <div className="flex w-full flex-1 flex-col items-center justify-between gap-4">
                <div className="w-full text-left">
                  <div>지원자님만을 위한 리크루터 AI 하퍼와의 통화가 시작됩니다.</div>
                  <div>
                    통화를 시작하기에 앞서, 통화하기에 적합한 환경으로 이동한 뒤
                    아래 시작 버튼을 눌러주세요.
                  </div>
                  <div>
                    주변 소음이 심하다면 말을 잘 못 알아들어 지원자님을 제대로
                    이해하지 못할 수 있습니다.
                  </div>
                  <div>
                    현재 환경이 대화하기 적합한지 확인하고 싶다면 아래의 테스트
                    버튼을 눌러주세요.
                  </div>
                  <div className="mt-3 text-sm text-black/60">
                    테스트는 Chrome 계열 브라우저에서 가장 안정적입니다.
                  </div>

                  {isTest && (
                    <div className="mt-12 flex w-full flex-col gap-2">
                      <div>
                        테스트 중입니다. 아래 텍스트를 읽고, 제출 버튼을 눌러주세요.
                      </div>

                      <div className="flex h-12 items-center justify-start rounded-lg border border-xgray300 bg-xlightgray px-4 text-sm text-black/80">
                        {TEST_SCRIPT}
                      </div>

                      <div
                        className="flex min-h-[48px] flex-row items-center justify-start rounded-lg border border-xgray300 bg-blue-100 px-4 text-sm text-blue-800"
                        dangerouslySetInnerHTML={{
                          __html: textScript || userTranscript,
                        }}
                      />

                      {isTestDone && (
                        <>
                          {wrongCount > 0 ? (
                            <div className="text-sm text-red-500">
                              <div>{wrongCount}개의 오류가 있습니다.</div>
                              <div>1. 좀 더 조용한 곳에서 접속하거나</div>
                              <div>2. 마이크에 잘 들리게 말해 주세요.</div>
                            </div>
                          ) : (
                            <div className="text-sm text-green-500">
                              <div>테스트 완료!</div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex w-full flex-col gap-2">
                  {(!isTest || isTestLoading || isTestDone) && (
                    <button
                      type="button"
                      onClick={handleStartTest}
                      className="flex w-full items-center justify-center rounded-lg border border-xgray300 bg-xlightgray py-4 text-black hover:bg-xgray300/40"
                    >
                      {isTestDone ? (
                        wrongCount > 0
                          ? "다시 테스트 하기"
                          : "테스트 완료. 다시 테스트 하기"
                      ) : isTestLoading ? (
                        <LoaderCircle className="h-6 w-6 animate-spin text-black" />
                      ) : (
                        "Test"
                      )}
                    </button>
                  )}

                  {isTest && !isTestDone && !isTestLoading && (
                    <div className="flex w-full flex-col items-center justify-center gap-2">
                      <div className="flex w-full items-center gap-3">
                        <Mic className="h-4 w-4 text-black" />

                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-xgray300">
                          <div
                            className="h-full rounded-full bg-brightnavy transition-all duration-150"
                            style={{ width: `${micLevel * 100}%` }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCheckTest}
                        className="w-full rounded-lg border border-xgray300 bg-xlightgray py-4 text-black hover:bg-xgray300"
                      >
                        제출하기
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleStartCall}
                    className="w-full rounded-lg bg-brightnavy py-4 text-white hover:opacity-90"
                  >
                    Start Call
                  </button>
                </div>
              </div>
            )}

            {callStatus === "calling" && (
              <div className="flex w-full flex-1 flex-col items-center justify-between gap-4 overflow-y-scroll pb-6">
                <div className="flex w-full flex-col gap-2">
                  {isScriptVisible && (
                    <div className="min-h-[120px] w-full rounded-lg bg-xlightgray px-4 py-0 text-sm">
                      {assistantTexts.map((transcript, index) => (
                        <div key={`assistant-${index}`} className="flex w-full flex-col gap-2">
                          <div className="pt-2">
                            <div className="whitespace-pre-wrap text-black/80">
                              {transcript}
                            </div>
                          </div>

                          {index < userTranscripts.length && (
                            <div className="pt-2">
                              <div className="whitespace-pre-wrap text-blue-600">
                                {userTranscripts[index]}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {isThinking && harperSaying === "" && (
                        <div className="pt-2">
                          <div className="whitespace-pre-wrap text-black/80">
                            Thinking...
                          </div>
                        </div>
                      )}

                      <div className="pt-2">
                        <div className="whitespace-pre-wrap font-semibold text-black/90">
                          {harperSaying}
                        </div>
                        {userTranscript && (
                          <div className="mt-4 text-blue-500">
                            {userTranscript}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Call;
