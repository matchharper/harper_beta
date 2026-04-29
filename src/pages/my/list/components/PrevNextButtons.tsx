import { ChevronLeft, ChevronRight } from "lucide-react";
import React from "react";

const PrevNextButtons = () => {
  return (
    <div className="flex items-end justify-end w-full py-8 flex-col">
      <div className="flex items-center justify-center gap-2 flex-row">
        <div className="p-2 rounded-md hover:bg-beige500/70 bg-beige500/55 cursor-pointer">
          <ChevronLeft size={20} className="text-beige900/55" />
        </div>
        <div className="p-2 rounded-md hover:bg-beige500/70 bg-beige500/55 cursor-pointer">
          <ChevronRight size={20} className="text-beige900/55" />
        </div>
      </div>
    </div>
  );
};

export default PrevNextButtons;
