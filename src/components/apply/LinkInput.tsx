import React from "react";
import Image from "next/image";

const LinkInput = ({
  label,
  value,
  onChange,
  placeholder,
  imgSrc,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  imgSrc: string;
}) => {
  return (
    <div className="flex flex-row w-full justify-between items-center">
      <div className="text-[15px] font-medium w-1/3 flex flex-row items-center gap-2">
        <Image src={imgSrc} alt={label} width={16} height={16} />
        <div>{label}</div>
      </div>
      <input
        placeholder={placeholder}
        className="w-full h-[36px] px-3 py-2 border border-xgray400 rounded-[5px] text-[14px] font-light leading-5 focus:ring-1 focus:ring-brightnavy outline-none"
        value={value}
        onChange={onChange}
      />
    </div>
  );
};

export default React.memo(LinkInput);
