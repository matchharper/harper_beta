import { ChevronLeft, ChevronRight } from "lucide-react";
import React from "react";

const PrevNextButtons = () => {
  return (
    <div className="flex items-end justify-end w-full py-8 flex-col">
      <div className="flex items-center justify-center gap-2 flex-row">
        <div className="p-2 rounded-md hover:bg-white/10 bg-white/5 cursor-pointer">
          <ChevronLeft size={20} className="text-hgray600" />
        </div>
        <div className="p-2 rounded-md hover:bg-white/10 bg-white/5 cursor-pointer">
          <ChevronRight size={20} className="text-hgray600" />
        </div>
      </div>
    </div>
  );
};

export default PrevNextButtons;
