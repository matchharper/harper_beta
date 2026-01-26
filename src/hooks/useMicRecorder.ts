"use client";

import { useCallback, useRef, useState } from "react";
import { floatTo16BitPCM, resampleLinearMono, TARGET_SR } from "@/utils/audio";

export const useMicRecorder = () => {
  const [isRecording, setIsRecording] = useState(false); // isRecording이면 지원자가 말하는 중
  const [micLevel, setMicLevel] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const procNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunksRef = useRef<Int16Array[]>([]);
  const isRecordingRef = useRef<boolean>(false);
  const rafLockRef = useRef(false);

  const resetAudioGraph = useCallback(() => {
    procNodeRef.current?.disconnect();
    audioCtxRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());

    procNodeRef.current = null;
    audioCtxRef.current = null;
    mediaStreamRef.current = null;
  }, []);

  const startMic = useCallback(async (sendAudio: (pcm16: any) => void) => {
    audioChunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 48000,
        sampleSize: 16,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
      video: false,
    });

    const audioCtx = new (window.AudioContext ||
      (window as any).webkitAudioContext)({
      sampleRate: 48000,
      latencyHint: "interactive",
    });

    const src = audioCtx.createMediaStreamSource(stream);

    const hpf = audioCtx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 130;

    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 20;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    const proc = audioCtx.createScriptProcessor(4096, 1, 1);
    const inGain = audioCtx.createGain();
    inGain.gain.value = 0.6;

    src
      .connect(inGain)
      .connect(hpf)
      .connect(comp)
      .connect(proc)
      .connect(audioCtx.destination);

    proc.onaudioprocess = (ev) => {
      if (!isRecordingRef.current) return;

      const inRate = audioCtx.sampleRate;
      const input = ev.inputBuffer.getChannelData(0);

      const scaled = new Float32Array(input.length);
      for (let i = 0; i < input.length; i++) {
        scaled[i] = input[i] * 0.95;
      }

      const mono16k = resampleLinearMono(scaled, inRate, TARGET_SR);
      const pcm16 = floatTo16BitPCM(mono16k);
      sendAudio(pcm16);
      // voice-end detection for latency metric
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      // 간단한 게이트/정규화 (필요시 조정). 애니메이션을 위해 추가 animation
      const level = Math.min(1, Math.max(0, (rms - 0.005) * (1 / 0.03))); // ~0~1
      // EMA + rAF로 너무 자주 setState 안 하게
      if (!rafLockRef.current) {
        rafLockRef.current = true;
        requestAnimationFrame(() => {
          setMicLevel((prev) => prev * 0.8 + level * 0.2);
          rafLockRef.current = false;
        });
      }
    };

    mediaStreamRef.current = stream;
    audioCtxRef.current = audioCtx;
    procNodeRef.current = proc;
  }, []);

  const startMicRecording = useCallback(
    async (
      sendAudio: (pcm16: any) => void,
      changeIsRecording: boolean = true
    ) => {
      if (!mediaStreamRef.current || !audioCtxRef.current) {
        await startMic(sendAudio);
      }

      if (changeIsRecording) {
        setIsRecording(true);
        isRecordingRef.current = true;
      }
    },
    [startMic]
  );

  const stopMicCompletely = useCallback(
    (changeIsRecording: boolean = true) => {
      resetAudioGraph();
      audioChunksRef.current = [];

      if (changeIsRecording) {
        isRecordingRef.current = false;
        setIsRecording(false);
      }
    },
    [resetAudioGraph]
  );

  return {
    isRecording,
    micLevel,
    setIsRecording,
    startMicRecording,
    stopMicCompletely,
  };
};
