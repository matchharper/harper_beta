import { useState } from "react";

export const Selections = ({
    selected,
    setSelected,
    setIsDirty,
    options,
}: {
    selected: string;
    setSelected: (selected: string) => void;
    setIsDirty: (isDirty: boolean) => void;
    options: string[];
}) => {
    const [flash, setFlash] = useState(false);

    const handleClick = (opt: string) => {
        setFlash(true);

        setTimeout(() => setFlash(false), 200); // 0.2초만 깜빡
        setIsDirty(true);
        setSelected(opt);
    };

    return (
        <div className="flex flex-row gap-2 flex-wrap">
            {options.map((option) => (
                <div
                    key={option}
                    onClick={() => handleClick(option)}
                    className={`flex flex-row text-base md:text-base transition-all duration-200 items-center gap-2 cursor-pointer border-2 py-2 px-3 min-w-[200px] rounded-[4px]
              ${flash ? "animate-pulse" : ""}
              ${selected === option
                            ? "bg-brightnavy/20  hover:bg-brightnavy/20 border-brightnavy"
                            : "bg-brightnavy/5  hover:bg-brightnavy/30 active:border-brightnavy border-brightnavy/10"
                        }
              `}
                >
                    {option}
                </div>
            ))}
        </div>
    );
};

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

export const TextInput = ({
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
                    className="transition-colors duration-200 leading-8 focus:border-b focus:border-brightnavy w-full px-0.5 py-2 border-b border-xgray400 text-lg md:text-xl font-normal focus:outline-none outline-none"
                    value={value}
                    onChange={onChange}
                    rows={rows}
                    autoFocus={autoFocus}
                />
            ) : (
                <input
                    placeholder={placeholder}
                    className="transition-colors duration-200 focus:border-b focus:border-brightnavy w-full px-0.5 py-2 border-b border-xgray400 text-lg md:text-xl font-normal leading-5 focus:outline-none outline-none"
                    value={value}
                    onChange={onChange}
                    autoFocus={autoFocus}
                />
            )}
            <div className="transition-colors duration-200 rounded-full w-full h-[1px] bg-white/0 group-focus-within:bg-brightnavy"></div>
        </div>
    );
};
