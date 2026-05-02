import React from "react";

type TextareaProps = {
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  className?: string;
};

const Textarea = ({
  placeholder,
  value,
  onChange,
  rows = 4,
  className = "",
}: TextareaProps) => {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
      className={[
        "w-full text-beige900 mt-2 rounded-lg border font-light border-beige900/8 bg-beige50 p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-beige900/8",
        className,
      ].join(" ")}
    />
  );
};

export default Textarea;
