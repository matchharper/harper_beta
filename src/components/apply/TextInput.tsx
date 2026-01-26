import React from "react";

type TextInputProps = {
  label?: string;
  placeholder: string;
  value: string;
  rows?: number;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  autoFocus?: boolean;
};

const TextInput = ({
  label,
  placeholder,
  value,
  rows,
  onChange,
  autoFocus = false,
}: TextInputProps) => {
  return (
    <div className="w-full group flex flex-col mt-2">
      {label && <label className="mb-1 font-medium text-sm">{label}</label>}
      {rows ? (
        <textarea
          placeholder={placeholder}
          className="transition-colors duration-200 leading-8 focus:border-b focus:border-brightnavy w-full px-0.5 py-2 border-b border-xgray400 text-xl font-normal focus:outline-none outline-none"
          value={value}
          onChange={onChange}
          rows={rows}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          placeholder={placeholder}
          className="transition-colors duration-200 focus:border-b focus:border-brightnavy w-full px-0.5 py-2 border-b border-xgray400 text-xl font-normal leading-5 focus:outline-none outline-none"
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
        />
      )}
      <div className="transition-colors duration-200 rounded-full w-full h-[1px] bg-white/0 group-focus-within:bg-brightnavy"></div>
    </div>
  );
};

export default React.memo(TextInput);
