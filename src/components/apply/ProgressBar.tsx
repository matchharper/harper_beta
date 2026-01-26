import React from "react";
import { motion } from "framer-motion";

interface ProgressBarProps {
  currentStep: number; // 0-based index도, 1-based index도 둘 다 지원
  totalSteps: number;
}

const ProgressBar = ({ currentStep, totalSteps }: ProgressBarProps) => {
  const normalizedStep = currentStep < 1 ? currentStep + 1 : currentStep; // 1-based 대응

  const progress = Math.min(normalizedStep / totalSteps, 1);

  return (
    <div className="flex flex-row items-center justify-start w-full h-1 bg-xgray300 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="h-full bg-black"
      />
      <div className="bg-white block w-[3px] h-full"></div>
    </div>
  );
};

export default React.memo(ProgressBar);
