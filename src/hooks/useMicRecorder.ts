"use client";

import { useCallback, useRef, useState } from "react";

export const useMicRecorder = () => {
  const [isRecording, setIsRecording] = useState(false); // isRecording이면 지원자가 말하는 중
  const [micLevel, setMicLevel] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  const resetAudioGraph = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    sourceNodeRef.current?.disconnect();
    analyserNodeRef.current?.disconnect();
    void audioCtxRef.current?.close().catch(() => undefined);
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());

    sourceNodeRef.current = null;
    analyserNodeRef.current = null;
    audioCtxRef.current = null;
    mediaStreamRef.current = null;
    setMicLevel(0);
  }, []);

  const updateMicLevel = useCallback(() => {
    const analyser = analyserNodeRef.current;
    if (!analyser || !isRecordingRef.current) {
      animationFrameRef.current = null;
      return;
    }

    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);

    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const centered = samples[i];
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / samples.length);
    const level = Math.min(1, Math.max(0, (rms - 0.005) * (1 / 0.03)));
    setMicLevel((prev) => prev * 0.8 + level * 0.2);

    animationFrameRef.current = requestAnimationFrame(updateMicLevel);
  }, []);

  const startMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioCtx) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("AudioContext is not supported");
    }

    const audioCtx = new AudioCtx({ latencyHint: "interactive" });

    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);

    mediaStreamRef.current = stream;
    audioCtxRef.current = audioCtx;
    sourceNodeRef.current = src;
    analyserNodeRef.current = analyser;
  }, []);

  const startMicRecording = useCallback(
    async (changeIsRecording: boolean = true) => {
      if (!mediaStreamRef.current || !audioCtxRef.current) {
        await startMic();
      }

      if (changeIsRecording) {
        setIsRecording(true);
        isRecordingRef.current = true;
      }

      if (audioCtxRef.current?.state === "suspended") {
        await audioCtxRef.current.resume().catch(() => undefined);
      }

      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(updateMicLevel);
      }
    },
    [startMic, updateMicLevel]
  );

  const stopMicCompletely = useCallback(
    (changeIsRecording: boolean = true) => {
      isRecordingRef.current = false;
      resetAudioGraph();

      if (changeIsRecording) {
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
