import React from "react";

import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { Input as UiInput } from "@/components/ui/input";

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
        <UiTextarea
          unstyled
          placeholder={placeholder}
          className="transition-colors duration-200 leading-8 focus:border-b focus:border-info/30 w-full px-0.5 py-2 border-b border-neutral-400 text-xl font-normal focus:outline-none outline-none"
          value={value}
          onChange={onChange}
          rows={rows}
          autoFocus={autoFocus}
        />
      ) : (
        <UiInput
          unstyled
          placeholder={placeholder}
          className="transition-colors duration-200 focus:border-b focus:border-info/30 w-full px-0.5 py-2 border-b border-neutral-400 text-xl font-normal leading-5 focus:outline-none outline-none"
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
        />
      )}
      <div className="transition-colors duration-200 rounded-full w-full h-px bg-transparent group-focus-within:bg-info"></div>
    </div>
  );
};

export default React.memo(TextInput);
