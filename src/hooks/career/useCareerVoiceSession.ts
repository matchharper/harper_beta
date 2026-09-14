"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  isCareerLiveModel,
  resolveCareerVoiceModel,
  type CareerVoiceModel,
  type CareerVoiceModelOverride,
} from "@/lib/career/voiceModel";
import { useLiveSession } from "./useLiveSession";
import {
  useRealtimeSession,
  type RealtimeConnectOptions,
  type UseRealtimeSessionArgs,
} from "./useRealtimeSession";

type UseCareerVoiceSessionArgs = UseRealtimeSessionArgs & {
  modelOverride?: CareerVoiceModelOverride;
};

export function useCareerVoiceSession({
  modelOverride,
  ...sessionArgs
}: UseCareerVoiceSessionArgs) {
  const realtimeSession = useRealtimeSession(sessionArgs);
  const liveSession = useLiveSession(sessionArgs);
  const resolvedModel = resolveCareerVoiceModel(modelOverride);
  const activeModelRef = useRef<CareerVoiceModel | null>(null);
  const [activeModel, setActiveModel] = useState<CareerVoiceModel | null>(null);

  const getSession = useCallback(
    (model: CareerVoiceModel) =>
      isCareerLiveModel(model) ? liveSession : realtimeSession,
    [liveSession, realtimeSession]
  );
  const getCurrentSession = useCallback(
    () => getSession(activeModelRef.current ?? resolvedModel),
    [getSession, resolvedModel]
  );

  const connect = useCallback(
    async (options?: RealtimeConnectOptions) => {
      const model = resolveCareerVoiceModel(modelOverride);
      activeModelRef.current = model;
      setActiveModel(model);
      const connected = await getSession(model).connect(options);
      if (!connected && activeModelRef.current === model) {
        activeModelRef.current = null;
        setActiveModel(null);
      }
      return connected;
    },
    [getSession, modelOverride]
  );

  const disconnect = useCallback(() => {
    const model = activeModelRef.current ?? resolvedModel;
    getSession(model).disconnect();
    activeModelRef.current = null;
    setActiveModel(null);
  }, [getSession, resolvedModel]);

  const controller = getSession(activeModel ?? resolvedModel);

  return useMemo(
    () => ({
      ...controller,
      connect,
      disconnect,
      sendTextMessage: (text: string) =>
        getCurrentSession().sendTextMessage(text),
      triggerResponse: () => getCurrentSession().triggerResponse(),
      cancelResponse: () => getCurrentSession().cancelResponse(),
      primePlayback: () => getCurrentSession().primePlayback(),
      runAfterCurrentPlayback: (callback: () => void) =>
        getCurrentSession().runAfterCurrentPlayback(callback),
      generateSpeech: (text: string) =>
        getCurrentSession().generateSpeech(text),
      updateSessionInstructions: (instructions: string) =>
        getCurrentSession().updateSessionInstructions(instructions),
      markRealtimeAudioTurnSaved: (options: {
        hasAssistantAudio: boolean;
        hasUserAudio: boolean;
      }) => getCurrentSession().markRealtimeAudioTurnSaved(options),
      getMediaStream: () => getCurrentSession().getMediaStream(),
      getLastConnectFailure: () => getCurrentSession().getLastConnectFailure(),
      sendEvent: (event: Record<string, unknown>) =>
        getCurrentSession().sendEvent(event),
    }),
    [controller, connect, disconnect, getCurrentSession]
  );
}
