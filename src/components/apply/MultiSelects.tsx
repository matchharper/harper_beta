"use client";

import React from "react";

const MultiSelects = ({
  selects,
  setSelects,
  setIsDirty,
  options,
}: {
  selects: string[];
  setSelects: (selects: string[]) => void;
  setIsDirty: (isDirty: boolean) => void;
  options: string[];
}) => {
  const handleSelect = (option: string) => {
    if (selects.includes(option)) {
      const newSelects = selects.filter((select) => select !== option);
      setSelects(newSelects);
    } else {
      if (option === "기타") {
        setSelects([...selects, option, ""]);
      } else {
        setSelects([option, ...selects]);
      }
    }
  };

  const handleOtherChange = (e: any) => {
    const value = e.target.value;
    const newSelects = [...selects.slice(0, -1), value];
    setSelects(newSelects);
  };

  return (
    <div className="flex flex-row gap-2 flex-wrap">
      {options.map((option) => (
        <div
          key={option}
          onClick={() => {
            setIsDirty(true);
            handleSelect(option);
          }}
          className={`flex flex-row transition-all duration-200 items-center gap-2 cursor-pointer border-2 py-2 px-3 min-w-[160px] md:min-w-[200px] rounded-[4px]
              ${
                selects.includes(option)
                  ? "bg-brightnavy/20  hover:bg-brightnavy/20 border-brightnavy"
                  : "bg-brightnavy/5  hover:bg-brightnavy/30 active:border-brightnavy border-brightnavy/10"
              }
              `}
        >
          {option}
        </div>
      ))}

      {selects.includes("기타") && (
        <input
          type="text"
          value={selects[selects.length - 1]}
          onChange={handleOtherChange}
          onClick={(e) => e.stopPropagation()} // 클릭해도 카드 토글 안 되게
          placeholder="직접 입력해 주세요"
          className="transition-colors duration-200 mt-2 focus:border-b focus:border-brightnavy w-full px-0.5 py-2 border-b border-xgray400 text-base font-normal leading-5 focus:outline-none outline-none"
        />
      )}
    </div>
  );
};

export default React.memo(MultiSelects);
