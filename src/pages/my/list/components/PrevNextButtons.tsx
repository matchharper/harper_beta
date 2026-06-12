import { ChevronLeft, ChevronRight } from "lucide-react";
import React from "react";

const PrevNextButtons = () => {
  return (
    <div className="flex items-end justify-end w-full py-8 flex-col">
      <div className="flex items-center justify-center gap-2 flex-row">
        <div className="p-2 rounded-md hover:bg-bg-weak bg-bg-floating cursor-pointer">
          <ChevronLeft size={20} className="text-neutral-muted" />
        </div>
        <div className="p-2 rounded-md hover:bg-bg-weak bg-bg-floating cursor-pointer">
          <ChevronRight size={20} className="text-neutral-muted" />
        </div>
      </div>
    </div>
  );
};

export default PrevNextButtons;
