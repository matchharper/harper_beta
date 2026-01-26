// "use client";

// import { useCallback, useEffect, useRef, useState } from "react";
// import { useMicRecorder } from "./useMicRecorder";
// import {
//   OpenAIRealtimeClient,
//   OpenAIRealtimeCallbacks,
// } from "@/lib/stt/createSttSocket";
// import { int16ToBase64 } from "@/utils/audio";
// import { callGreeting, makeQuestion } from "@/lib/llm/llm";
// import { useUserProfile } from "@/states/useUserProfile";
// import { splitTextToChunks } from "@/utils/textprocess";
// import { OPENAI_KEY } from "@/utils/constantkeys";
// import { showToast } from "@/components/toast/toast";

// type CallStatus = "idle" | "calling" | "ended" | "test";

// export const useConversation = (
//   startMicRecording: (
//     sendAudio: (pcm16: any) => void,
//     changeIsRecording?: boolean
//   ) => void,
//   stopMicCompletely: (changeIsRecording?: boolean) => void
// ) => {
//   const [callStatus, setCallStatus] = useState<CallStatus>("idle");
//   const [userTranscripts, setUserTranscripts] = useState<string[]>([]);
//   const [assistantTexts, setAssistantTexts] = useState<string[]>([]);
//   const [harperSaying, setHarperSaying] = useState<string>("");
//   const [userTranscript, setUserTranscript] = useState<string>("");
//   const [isPlayingTts, setIsPlayingTts] = useState<boolean>(false);
//   const [isMuted, setIsMuted] = useState<boolean>(false);
//   const [isThinking, setIsThinking] = useState<boolean>(false);

//   const audioRef = useRef<HTMLAudioElement | null>(null);
//   const sayingRef = useRef<string>("");

//   const userTranscriptRef = useRef(userTranscript);

//   // keep ref in sync with state
//   useEffect(() => {
//     userTranscriptRef.current = userTranscript;
//   }, [userTranscript]);

//   const userId =
//     typeof window !== "undefined" ? localStorage.getItem("userId") : null;
//   const { data: userProfile } = useUserProfile(userId);

//   const clientRef = useRef<OpenAIRealtimeClient | null>(null);
//   const callScriptRef = useRef<string>("");
//   const callStartTimeRef = useRef<number>(0);

//   const connectSttSocket = async () => {
//     if (clientRef.current) return clientRef.current;

//     const callbacks: OpenAIRealtimeCallbacks = {
//       onDelta: (text) => {
//         logger.log("onDelta", text);
//       },
//       onFinal: (text) => {
//         setUserTranscript((prev) => prev + " " + text);
//         logger.log("onFinal", text);
//       },
//       onError: (err) => {
//         console.error("Realtime STT error:", err);
//       },
//       onClose: () => {
//         logger.log("onClose");
//       },
//     };

//     try {
//       const client = new OpenAIRealtimeClient({
//         token: OPENAI_KEY,
//         callbacks,
//       });

//       clientRef.current = client;
//       logger.log("Connected to STT socket", client);
//     } catch (err) {
//       console.error("Error connecting to STT socket:", err);
//     }
//   };

//   const sendAudio = async (pcm16: any) => {
//     // pcm16 is Int16Array
//     // openai realtime stt expects base64 encoded audio
//     if (isMuted) return;

//     clientRef.current?.sendAudio(int16ToBase64(pcm16));
//   };

//   const startMicAndScripting = async () => {
//     setUserTranscript("");
//     await connectSttSocket();
//     await clientRef.current?.start("ko-KR");
//     await startMicRecording(sendAudio);
//   };

//   const stopMicAndScripting = async () => {
//     await clientRef.current?.sendAudioStreamEnd(); // 마지막으로 말하던거는 script 따고 종료
//     await stopMicCompletely();
//     await clientRef.current?.stop();
//   };

//   const toggleMute = async () => {
//     if (isMuted) {
//       setIsMuted(false);
//       await startMicRecording(sendAudio, false);
//       // await startMicAndScripting();
//     } else {
//       setIsMuted(true);
//       await stopMicCompletely(false);
//       // await clientRef.current?.sendAudioStreamEnd(); // 마지막으로 말하던거는 script 따고 종료
//       // await clientRef.current?.stop();
//     }
//   };

//   const playTts = useCallback(
//     async (
//       text: string,
//       opts?: {
//         onBeforeLast?: () => void | Promise<void>;
//         onAfterLast?: () => void | Promise<void>;
//       }
//     ) => {
//       const cleaned = text.trim();
//       if (!cleaned) return;

//       const chunks = splitTextToChunks(cleaned);
//       if (!chunks.length) return;

//       try {
//         const concurrencyLimit = 1;
//         const fetchPromises: Promise<any>[] = []; // 오디오 생성 Promise를 담을 풀

//         const generatedChunks: {
//           blob: Blob;
//           isLast: boolean;
//           index: number;
//           chunk: string;
//         }[] = [];

//         // 1. 모든 청크에 대한 생성 작업을 시작하고, 동시성 2를 유지합니다.
//         for (let i = 0; i < chunks.length; i++) {
//           setIsPlayingTts(true);
//           const chunk = chunks[i];
//           const isLast = i === chunks.length - 1;

//           // TTS 오디오 생성 요청을 비동기 함수로 정의
//           const fetchJob = async (index: number) => {
//             if (isLast && opts?.onBeforeLast) {
//               await opts.onBeforeLast();
//             }
//             logger.log(`[Chunk ${index + 1}] 생성 요청 시작:`, chunk);

//             const res = await fetch("/api/tts", {
//               method: "POST",
//               headers: { "Content-Type": "application/json" },
//               body: JSON.stringify({ text: chunk }),
//             });
//             if (!res.ok)
//               throw new Error(`Failed to fetch TTS for chunk ${index}`);

//             const blob = await res.blob();
//             logger.log(`[Chunk ${index + 1}] 생성 완료`);

//             return { blob, isLast, index, chunk };
//           };

//           // Promise를 생성 풀(fetchPromises)에 추가
//           const jobPromise = fetchJob(i)
//             .then((result) => {
//               // 완료된 결과를 순서 보장을 위해 인덱스와 함께 저장
//               generatedChunks[result.index] = result;
//               return result;
//             })
//             .catch((err) => {
//               console.error(`Error in fetchJob for chunk ${i}:`, err);
//               throw err;
//             });

//           fetchPromises.push(jobPromise);

//           // 동시성 제한을 초과하면, 가장 먼저 시작된 작업이 끝날 때까지 기다립니다.
//           if (fetchPromises.length >= concurrencyLimit) {
//             // Promise.race는 가장 빨리 끝난 Promise의 결과를 반환합니다.
//             await Promise.race(fetchPromises);

//             // 완료된 Promise를 제거 (여기서는 단순하게 배열의 맨 앞에서 제거)
//             // 실제 구현 시 Promise.race는 "어떤" Promise가 끝났는지 정확히 알려주지 않아 까다롭지만,
//             // 생성 완료 후 `generatedChunks`에 저장되므로 여기서는 단순히 `await`만 사용하여 압박을 줄입니다.
//             // *가장 간단하게,* `Promise.all`로 `concurrencyLimit` 단위로 끊어서 생성하는 방법을 채택합니다.

//             // === 이 부분이 너무 복잡해지므로, 이전 답변의 "Batch and Wait" 방식으로 회귀하고 에러 핸들링을 강화합니다. ===
//           }
//         }

//         // 2. 모든 생성이 완료되기를 기다립니다 (생성 풀이 빌 때까지).
//         await Promise.all(fetchPromises);

//         // 3. 생성된 청크를 순서대로 재생
//         // generatedChunks는 인덱스 순서대로 채워졌을 것입니다. (정확히는 인덱스에 따라 위치가 보장)
//         // 실제 순차 재생을 위해 인덱스 순서대로 정렬해야 합니다.
//         const sortedChunks = generatedChunks
//           .filter((c) => c)
//           .sort((a, b) => a.index - b.index);

//         for (const { blob, isLast, index, chunk } of sortedChunks) {
//           if (index === 0) setIsThinking(false);
//           const url = URL.createObjectURL(blob);

//           // 이전 오디오 중지 및 URL 해제
//           if (audioRef.current) {
//             audioRef.current.pause();
//             audioRef.current.src = "";
//           }

//           logger.log(`[Chunk ${index + 1}] 재생 시작`);
//           setHarperSaying((prev) => prev + " " + chunk);
//           sayingRef.current += " " + chunk;

//           await new Promise<void>((resolve, reject) => {
//             const audio = new Audio(url);
//             audioRef.current = audio;

//             let beforeEndTimeout: number | null = null;
//             let beforeEndCalled = false;

//             // helper: call only once
//             const callBeforeEnd = async () => {
//               if (beforeEndCalled) return;
//               beforeEndCalled = true;

//               if (isLast) {
//                 await startMicAndScripting();
//               }
//             };

//             audio.onloadedmetadata = () => {
//               if (!audio.duration || !isFinite(audio.duration)) return;

//               const msUntilOneSecondBeforeEnd =
//                 (audio.duration - 1 - audio.currentTime) * 1000;

//               if (msUntilOneSecondBeforeEnd <= 0) {
//                 void callBeforeEnd();
//               } else {
//                 beforeEndTimeout = window.setTimeout(() => {
//                   void callBeforeEnd();
//                 }, msUntilOneSecondBeforeEnd);
//               }
//             };

//             audio.onended = async () => {
//               URL.revokeObjectURL(url);
//               setIsPlayingTts(false);

//               if (isLast) {
//                 await opts?.onAfterLast?.();
//                 logger.log("harperSaying", harperSaying);
//                 setAssistantTexts((prev) => [...prev, sayingRef.current]);

//                 setHarperSaying("");
//               }
//               resolve();
//             };

//             audio.onerror = (e) => {
//               URL.revokeObjectURL(url);
//               reject(e);
//               setIsPlayingTts(false);
//             };

//             audio.play().catch((err) => {
//               URL.revokeObjectURL(url);
//               reject(err);
//               setIsPlayingTts(false);
//             });
//           });

//           logger.log(`[Chunk ${index + 1}] 재생 완료`);
//           if (isLast) break;
//         }
//       } catch (err) {
//         console.error("Error playing TTS:", err);
//       } finally {
//         setIsPlayingTts(false);
//       }
//     },
//     [
//       setIsPlayingTts,
//       audioRef,
//       startMicAndScripting,
//       setHarperSaying,
//       setAssistantTexts,
//       harperSaying,
//     ]
//   );

//   const startCall = async () => {
//     setUserTranscript("");
//     setUserTranscripts([]);
//     setAssistantTexts([]);
//     callStartTimeRef.current = performance.now();
//     setCallStatus("calling");
//     const question = await callGreeting("", "");
//     // setAssistantTexts((prev) => [...prev, question]);
//     await playTts(question);
//     callScriptRef.current += `Harper: ${question}\n`;
//     await startMicRecording(sendAudio);
//   };

//   const startTest = async () => {
//     await startMicAndScripting();
//   };

//   const endTest = async () => {
//     await stopMicAndScripting();

//     return userTranscript;
//   };

//   const endCall = async () => {
//     setCallStatus("ended");
//     await stopMicAndScripting();
//     if (userTranscript.trim() !== "") {
//       callScriptRef.current += `User: ${userTranscript}\n`;
//     }
//     return {
//       script: callScriptRef.current,
//       callTime: performance.now() - callStartTimeRef.current,
//     };
//   };

//   const sendAudioCommit = async () => {
//     // 현재까지 유저가 말한걸 보내기.
//     logger.log("\nuserTranscriptRef: ", userTranscriptRef.current);
//     logger.log("\nuserTranscript: ", userTranscript);
//     // audio 끊고
//     await stopMicAndScripting();
//     if (
//       userTranscript.trim() === "" &&
//       userTranscriptRef.current.trim() === ""
//     ) {
//       logger.log("userTranscript is empty");
//       showToast({
//         message: "Nothing recorded",
//         variant: "white",
//       });
//       return;
//     }

//     const currentUserTranscript = userTranscriptRef.current;

//     setUserTranscripts((prev) => [...prev, currentUserTranscript]);
//     setUserTranscript("");
//     setIsThinking(true);
//     callScriptRef.current += `User: ${currentUserTranscript}\n`;
//     // script는 나와있고
//     // llm 요청하고
//     // const userInfo = `이름: ${userProfile?.resumes?[0].[0].}, 사는 곳 ${userProfile?.resumes?.[0]?.location}`;
//     sayingRef.current = "";
//     const question = await makeQuestion(
//       callScriptRef.current,
//       "",
//       ""
//       // userInfo,
//       // userProfile?.resumes?.[0]?.resume_text ?? ""
//     );
//     callScriptRef.current += `Harper: ${question}\n`;
//     // tts로 오디오 출력까지
//     await playTts(question);
//   };

//   return {
//     isPlayingTts,
//     isMuted,
//     userTranscripts,
//     isThinking,
//     assistantTexts,
//     callStatus,
//     harperSaying,
//     startCall,
//     sendAudioCommit,
//     endCall,
//     userTranscript,
//     toggleMute,
//     startTest,
//     endTest,
//   };
// };
