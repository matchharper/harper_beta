import React, { memo } from "react";
import { useCareerVoiceInputStore } from "@/store/useCareerVoiceInputStore";

type CareerVoiceInputLevelFillProps = {
  voiceListening: boolean;
};

const CareerVoiceInputLevelFill = ({
  voiceListening,
}: CareerVoiceInputLevelFillProps) => {
  const voiceInputLevel = useCareerVoiceInputStore(
    (state) => state.voiceInputLevel
  );
  const width = `${Math.round(voiceInputLevel * 100)}%`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-hblack200 via-hblack200 to-transparent transition-[width,opacity] duration-200"
      style={{
        width,
        opacity: voiceListening ? 1 : 0.35,
      }}
    />
  );
};

export default memo(CareerVoiceInputLevelFill);
