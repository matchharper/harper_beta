import React from "react";

const HarperCircle = ({ micLevel }: { micLevel: number }) => {
  return (
    <div className="flex flex-col gap-3 items-center justify-center">
      <div
        className={`w-[140px] h-[140px] flex items-center justify-center transition-all rounded-full bg-[linear-gradient(45deg,#6d28d9,#8b5cf6,#c084fc,#e879f9,#f472b6)] bg-[length:300%_300%] animate-gradientx`}
      >
        <span className=""></span>
      </div>
      <div className="text-xl text-black font-light">Harper</div>
    </div>
  );
};

export default HarperCircle;
