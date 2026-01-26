// components/DropdownMenu.tsx
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Menu } from "lucide-react";

type MenuItem = {
  label: string;
  onClick: () => void;
};

type DropdownMenuProps = {
  buttonLabel: string | React.ReactNode;
  items: MenuItem[];
};

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  buttonLabel,
  items,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md
                  px-1.5 py-1.5 text-sm shadow-sm
                   hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-xgray700/50"
      >
        {open ? <X className="w-4 h-4" /> : <>{buttonLabel}</>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1.5 w-44 
              rounded-xl backdrop-blur bg-white/95
              shadow-[0_8px_24px_rgba(0,0,0,0.12)]
              ring-1 ring-black/10"
          >
            <ul className="py-1 text-sm text-black/80">
              {items.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      item.onClick();
                    }}
                    className="w-full font-normal px-3.5 py-2 text-left hover:bg-xlightgray"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
