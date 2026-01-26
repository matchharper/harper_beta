// "use client"; // app router면 필요, pages router면 없어도 됨

// import HarperCircle from "@/components/call/HarperCircle";
// import {
//   ArrowUpFromLine,
//   AudioLines,
//   LoaderCircle,
//   Mic,
//   MicOff,
//   PhoneOff,
//   Space,
// } from "lucide-react";
// import React, { useCallback, useEffect, useRef, useState } from "react";
// import { useConversation } from "@/hooks/useConversation";
// import { supabase } from "@/lib/supabase";
// import { useUserProfile } from "@/states/useUserProfile";
// import router from "next/router";
// import {
//   highlightDifferences,
//   highlightDifferences2,
// } from "@/utils/textprocess";
// import { useMicRecorder } from "@/hooks/useMicRecorder";
// import RecruiterCallSummaryScreen from "@/components/call/CallEndScreen";
// import { MicPulseRings } from "@/components/call/MicPulseRing";

// const TEST_SCRIPT = "오늘은 기분이 좋다.";

// const Call: React.FC = () => {
//   const [isScriptVisible, setIsScriptVisible] = useState(true);
//   const [message, setMessage] = useState<string>("");
//   const [script, setScript] = useState<string>("");
//   const [callTime, setCallTime] = useState<number>(0);
//   const [isTest, setIsTest] = useState<boolean>(false);
//   const [isTestDone, setIsTestDone] = useState<boolean>(false);
//   const [isTestPassed, setIsTestPassed] = useState<boolean>(false);
//   const [isTestLoading, setIsTestLoading] = useState<boolean>(false);
//   const [textScript, setTextScript] = useState<string>("");
//   const [wrongCount, setWrongCount] = useState<number>(0);

//   const [isActiveButton, setIsActiveButton] = useState<boolean>(false);

//   const sendButtonRef = useRef<HTMLButtonElement>(null);

//   const userId =
//     typeof window !== "undefined" ? localStorage.getItem("userId") : null;
//   const { data: userProfile } = useUserProfile(userId);

//   const { isRecording, micLevel, startMicRecording, stopMicCompletely } =
//     useMicRecorder();

//   const {
//     isMuted,
//     startCall,
//     isThinking,
//     endCall,
//     sendAudioCommit,
//     callStatus,
//     assistantTexts,
//     userTranscript,
//     harperSaying,
//     toggleMute,
//     startTest,
//     endTest,
//     isPlayingTts,
//     userTranscripts,
//   } = useConversation(startMicRecording, stopMicCompletely);
//   const [timer, setTimer] = useState("00:00");
//   const secRef = useRef(0);

//   useEffect(() => {
//     const id = setInterval(() => {
//       secRef.current += 1;
//       const minutes = Math.floor(secRef.current / 60);
//       const secs = secRef.current % 60;
//       const mm = String(minutes).padStart(2, "0");
//       const ss = String(secs).padStart(2, "0");
//       const time = `${mm}:${ss}`;
//       setTimer(time);
//     }, 1000);

//     if (callStatus !== "calling") {
//       clearInterval(id);
//     }

//     return () => clearInterval(id); // cleanup
//   }, [callStatus]);

//   useEffect(() => {
//     if (!isTestDone) return;
//     const markedScript = highlightDifferences2(TEST_SCRIPT, userTranscript);
//     const wrongCounts = (markedScript.match(/<span/g) || []).length;

//     setWrongCount(wrongCounts);
//     setTextScript(markedScript);
//   }, [userTranscript, isTestDone]);

//   // const handleSendAudio = useCallback(async () => {
//   //   const audioBase64 = stopRecordingAndGetBase64();
//   //   if (!audioBase64) return;
//   // }, [stopRecordingAndGetBase64]);

//   // const handleEndCall = () => {
//   //   stopMicCompletely();
//   //   setCallStatus("ended");
//   // };

//   const handleEndCall = async () => {
//     const { script: _script, callTime: _callTime } = await endCall();
//     setScript(_script);
//     setCallTime(_callTime);
//     logger.log("script", _script);
//     logger.log("callTime", _callTime);
//   };

//   const handleSaveCallHistory = async () => {
//     const body = {
//       user_id: userId,
//       script: script,
//       total_sesstion_time: callTime,
//       resume_id: userProfile?.resume_id,
//     };
//     const { data, error } = await supabase.from("calls").insert(body);
//     logger.log("저장 완료!", data);
//     alert("저장 완료!");
//     router.push("/app");
//   };

//   useEffect(() => {
//     if (isRecording) {
//       const sto = setTimeout(() => {
//         setMessage("짧게 답변하셔도 괜찮습니다.");
//       }, 50000);
//       return () => clearTimeout(sto);
//     }

//     if (!isRecording) {
//       setMessage("");
//     }
//   }, [isRecording]);

//   const startTestCall = async () => {
//     setIsTestLoading(true);
//     setIsTestDone(false);
//     setWrongCount(0);
//     setTextScript("");
//     await startTest();
//     logger.log("startTest");
//     setIsTestLoading(false);
//     setIsTest(true);
//   };

//   const checkTestCall = async () => {
//     logger.log("checkTest");
//     setIsTestDone(true);
//     endTest();
//     // setIsTest(false);
//   };
//   useEffect(() => {
//     const handleKeyDown = (e: KeyboardEvent) => {
//       // 스페이스바 + 키 반복(repeat) 무시
//       if (e.code === "Space" && !e.repeat) {
//         e.preventDefault();
//         setIsActiveButton(true);
//       }
//     };

//     const handleKeyUp = (e: KeyboardEvent) => {
//       if (e.code === "Space") {
//         e.preventDefault();
//         setIsActiveButton(false);
//         sendButtonRef.current?.click();
//       }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     window.addEventListener("keyup", handleKeyUp);

//     return () => {
//       window.removeEventListener("keydown", handleKeyDown);
//       window.removeEventListener("keyup", handleKeyUp);
//     };
//   }, []);

//   const onStop = async () => {
//     const timeout = setTimeout(() => {
//       logger.log("User transcript: ", userTranscript);
//       sendAudioCommit();
//     }, 1500);
//     return () => clearTimeout(timeout);
//   };

//   return (
//     <div className="w-full max-w-[100vw] h-[100vh] flex flex-col gap-2 items-center justify-center bg-white text-black font-inter">
//       <div className="flex flex-row items-stretch justify-between gap-8 md:w-[90vw]">
//         {/* Left side: Call visuals */}
//         <div
//           className={`flex items-center justify-center transition-transform duration-300 ${
//             isScriptVisible ? "w-[60%] " : "w-[95%] "
//           }`}
//         >
//           <div className="flex flex-row items-center justify-between gap-2 md:flex-col w-[60%] h-full">
//             <div className="w-full h-6 flex flex-row items-center justify-start gap-2">
//               <span>Call with Harper</span>
//               {callStatus === "calling" ||
//                 (callStatus === "ended" && (
//                   <div className="text-xgray700">{timer}</div>
//                 ))}
//             </div>
//             <div className="w-full relative rounded-lg flex items-center justify-center border border-xlightgray h-[380px] shadow-sm">
//               <div className="flex flex-col gap-3 items-center justify-center">
//                 <div
//                   className={`w-[140px] h-[140px] flex relative items-center justify-center transition-all rounded-full bg-[linear-gradient(45deg,#6d28d9,#8b5cf6,#c084fc,#e879f9,#f472b6)] bg-[length:300%_300%] animate-gradientx`}
//                 >
//                   {isPlayingTts && (
//                     <div>
//                       <MicPulseRings count={2} />
//                     </div>
//                   )}
//                   <span className=""></span>
//                 </div>
//                 <div className="text-xl text-black font-light">Harper</div>
//               </div>
//             </div>
//             <div className="w-full rounded-lg flex items-end justify-center border border-xgray300/0 h-[220px]">
//               {callStatus === "calling" && (
//                 <div className="w-full flex flex-col items-center justify-center">
//                   <div className="flex flex-row gap-8 items-end justify-end">
//                     {/* Record / Send */}
//                     <div className="group inline-flex flex-col items-center gap-2">
//                       {!isMuted && isRecording && (
//                         <div className="w-[86%] flex items-center gap-3">
//                           <div className="flex-1 h-2 bg-xgray300 rounded-full overflow-hidden">
//                             <div
//                               className="h-full bg-xgrayblack transition-all max-w-[100%] duration-150 rounded-full"
//                               style={{ width: `${micLevel * 100 * 1.2}%` }}
//                             />
//                           </div>
//                         </div>
//                       )}
//                       <button
//                         ref={sendButtonRef}
//                         onClick={isRecording ? onStop : startCall}
//                         className={`cursor-pointer hover:opacity-90 w-16 h-16 rounded-full border-black/30 backdrop-blur border flex items-center justify-center active:scale-95 transition-all duration-300
//                           ${isActiveButton ? "scale-95" : "scale-100"}
//                         ${
//                           isRecording
//                             ? "bg-xgrayblack w-64"
//                             : "bg-white disabled:opacity-40"
//                         }`}
//                       >
//                         {isRecording ? (
//                           <Space className="w-5 h-5 text-white" />
//                         ) : (
//                           <AudioLines className="w-5 h-5 text-black/90" />
//                         )}
//                       </button>
//                       <span className="text-sm text-black/80 font-light">
//                         {isRecording
//                           ? "Click or Push Spacebar to send"
//                           : "Interrupt"}
//                       </span>
//                     </div>

//                     {/* Mute */}
//                     <div className="group inline-flex flex-col items-center gap-2">
//                       <button
//                         onClick={toggleMute}
//                         className="cursor-pointer hover:opacity-90 w-16 h-16 rounded-full border border-black/30 flex items-center justify-center transition active:scale-95"
//                       >
//                         {isMuted ? (
//                           <MicOff className="w-5 h-5 text-black/90" />
//                         ) : (
//                           <Mic className="w-5 h-5 text-black/90" />
//                         )}
//                       </button>
//                       <span className="text-base text-black/90 font-light">
//                         {isMuted ? "Muted" : "Mute"}
//                       </span>
//                     </div>

//                     {/* End Call */}
//                     <div className="group inline-flex flex-col items-center gap-2">
//                       <button
//                         onClick={handleEndCall}
//                         className="cursor-pointer hover:opacity-90 w-16 h-16 rounded-full border border-red-600 bg-red-600/10 flex items-center justify-center transition active:scale-95"
//                       >
//                         <PhoneOff className="w-5 h-5 text-red-600" />
//                       </button>
//                       <span className="text-base text-black/90 font-light">
//                         End Call
//                       </span>
//                     </div>
//                   </div>
//                 </div>
//               )}
//             </div>
//           </div>
//         </div>

//         {/* Right side */}
//         <div
//           className={`flex flex-col items-center justify-center gap-2 transition-transform duration-300 ${
//             isScriptVisible ? "w-[40%] " : "w-[5%] "
//           }`}
//         >
//           <div className="flex flex-row items-center justify-between gap-2 w-full">
//             <div className="w-full h-6 text-black/50 text-sm">{message}</div>
//             <div className="w-full  flex items-center justify-end">
//               <div
//                 className="text-brightnavy cursor-pointer hover:opacity-90"
//                 onClick={() => setIsScriptVisible((prev) => !prev)}
//               >
//                 {isScriptVisible ? "Hide" : "Show"}
//               </div>
//             </div>
//           </div>
//           <div className="flex flex-row items-center justify-center gap-2 md:flex-col bg-xlightgray p-4 rounded-md w-full h-full">
//             {callStatus === "ended" && (
//               <div className="flex flex-col items-center justify-between">
//                 {/* <div>
//                   하퍼와의 통화가 완료되었습니다. 저장하고 진행하시겠습니까?
//                 </div>
//                 <button
//                   className="cursor-pointer hover:opacity-90 rounded-lg bg-brightnavy text-white py-4 w-full"
//                   onClick={handleSaveCallHistory}
//                 >
//                   저장 후 진행
//                 </button> */}
//                 <RecruiterCallSummaryScreen duration={timer} />
//               </div>
//             )}
//             {callStatus === "idle" && (
//               <div className="flex flex-col flex-1 items-center justify-between gap-4 w-full">
//                 <div className="text-left w-full">
//                   <div>
//                     지원자님만을 위한 리크루터 AI 하퍼와의 통화가 시작됩니다.
//                   </div>
//                   <div>
//                     통화를 시작하기에 앞서, 통화하기에 적합한 환경으로 이동한 뒤
//                     아래 시작버튼을 눌러주세요.
//                   </div>
//                   <div>
//                     주변 소음이 심하다면 말을 잘 못 알아들어 지원자님을 제대로
//                     이해하지 못할 수 있습니다.
//                   </div>
//                   <div>
//                     현재 환경이 대화하기 적합한지 확인하고 싶다면 아래의 테스트
//                     버튼을 눌러주세요.
//                   </div>

//                   {isTest && (
//                     <div className="flex flex-col gap-2 w-full mt-12">
//                       <div>
//                         테스트 중입니다... 아래 텍스트를 읽고, 제출 버튼을
//                         눌러주세요.
//                       </div>
//                       <div className="text-black/80 text-sm px-4 h-12 flex items-center justify-start rounded-lg bg-xlightgray border border-xgray300">
//                         {TEST_SCRIPT}
//                       </div>
//                       {textScript ? (
//                         <div
//                           className="text-blue-800 text-sm px-4 h-12 flex flex-row gap-1 items-center justify-start rounded-lg bg-blue-100 border border-xgray300"
//                           dangerouslySetInnerHTML={{ __html: textScript }}
//                         ></div>
//                       ) : (
//                         <div
//                           className="text-blue-800 text-sm px-4 h-12 flex flex-row gap-1 items-center justify-start rounded-lg bg-blue-100 border border-xgray300"
//                           dangerouslySetInnerHTML={{ __html: userTranscript }}
//                         ></div>
//                       )}
//                       {isTestDone && (
//                         <>
//                           {wrongCount > 0 ? (
//                             <div className="text-red-500 text-sm">
//                               <div>{wrongCount}개의 오류가 있습니다.</div>
//                               <div>1. 좀 더 조용한 곳에서 접속하거나</div>
//                               <div>
//                                 2. 마이크에 잘 들리게 말하여 주시기 바랍니다.
//                               </div>
//                             </div>
//                           ) : (
//                             <div className="text-green-500 text-sm">
//                               <div>테스트 완료!</div>
//                             </div>
//                           )}
//                         </>
//                       )}
//                     </div>
//                   )}
//                 </div>
//                 <div className="flex flex-col gap-2 w-full">
//                   {(!isTest || isTestLoading || isTestDone) && (
//                     <button
//                       className="flex items-center justify-center cursor-pointer hover:bg-xgray300/40 rounded-lg bg-xlightgray border border-xgray300 text-black py-4 w-full"
//                       onClick={startTestCall}
//                     >
//                       {isTestDone ? (
//                         <>
//                           {wrongCount > 0
//                             ? "다시 테스트 하기"
//                             : "테스트 완료. 다시 테스트 하기"}
//                         </>
//                       ) : isTestLoading ? (
//                         <LoaderCircle className="w-6 h-6 animate-spin text-black" />
//                       ) : (
//                         "Test"
//                       )}
//                     </button>
//                   )}
//                   {isTest && !isTestDone && !isTestLoading && (
//                     <div className="flex items-center justify-center w-full flex-col gap-2">
//                       <div className="w-full flex items-center gap-3">
//                         <Mic className="w-4 h-4 text-black" />

//                         <div className="flex-1 h-2 bg-xgray300 rounded-full overflow-hidden">
//                           <div
//                             className="h-full bg-brightnavy transition-all duration-150 rounded-full"
//                             style={{ width: `${micLevel * 100}%` }}
//                           />
//                         </div>
//                       </div>

//                       <button
//                         className="cursor-pointer hover:bg-xgray300 rounded-lg bg-xlightgray border border-xgray300 text-black py-4 w-full"
//                         onClick={checkTestCall}
//                       >
//                         제출하기
//                       </button>
//                     </div>
//                   )}
//                   <button
//                     className="cursor-pointer hover:opacity-90 rounded-lg bg-brightnavy text-white py-4 w-full"
//                     onClick={startCall}
//                   >
//                     Start Call
//                   </button>
//                 </div>
//               </div>
//             )}

//             {callStatus === "calling" && (
//               <div className="flex flex-col flex-1 items-center justify-between gap-4 w-full pb-6 overflow-y-scroll">
//                 {/* Script area */}
//                 <div className="flex flex-col gap-2 w-full">
//                   {isScriptVisible && (
//                     <div className="flex flex-col gap-2 w-full rounded-lg bg-xlightgray min-h-[120px] py-0 px-4 text-sm">
//                       {assistantTexts.map((transcript, index) => (
//                         <div key={index} className="flex flex-col gap-2 w-full">
//                           <div className="pt-2">
//                             <div className="whitespace-pre-wrap text-black/80">
//                               {transcript}
//                             </div>
//                           </div>
//                           {index < userTranscripts.length && (
//                             <div key={index} className="pt-2">
//                               <div className="whitespace-pre-wrap text-blue-600">
//                                 {userTranscripts[index]}
//                               </div>
//                             </div>
//                           )}
//                         </div>
//                       ))}
//                       {isThinking && harperSaying === "" && (
//                         <div className="pt-2">
//                           <div className="whitespace-pre-wrap text-black/80">
//                             Thinking...
//                           </div>
//                         </div>
//                       )}
//                       <div className="pt-2">
//                         <div className="whitespace-pre-wrap text-black/90 font-semibold">
//                           {harperSaying}
//                         </div>
//                         {userTranscript && (
//                           <div className="mt-4 text-blue-500">
//                             {userTranscript}
//                           </div>
//                         )}
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Call;

import React from "react";

const Call = () => {
  return <div>Call</div>;
};

export default Call;
