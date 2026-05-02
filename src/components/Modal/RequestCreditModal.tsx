import React, { useState } from "react";
import BaseModal from "./BaseModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { showToast } from "../toast/toast";
import { useMessages } from "@/i18n/useMessage";

interface RequestCreditModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (credit_num: number) => Promise<boolean>;
}

const CREDIT_OPTIONS = [
  {
    label: "20",
    value: 20,
  },
  {
    label: "50",
    value: 50,
  },
  {
    label: "100",
    value: 100,
  },
  {
    label: "150",
    value: 150,
  },
];

const RequestCreditModal = ({
  open,
  onClose,
  onConfirm,
}: RequestCreditModalProps) => {
  const [selectedCredit, setSelectedCredit] = useState(20);
  const [sentRequest, setSentRequest] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { m } = useMessages();

  if (!open) return null;

  return (
    <BaseModal
      onClose={onClose}
      onConfirm={async () => {
        if (sentRequest) {
          setSentRequest(false);
          showToast({ message: "Plan inquiry submitted.", variant: "white" });
          onClose();
        } else {
          setIsLoading(true);
          const result = await onConfirm(selectedCredit);
          if (result) {
            setIsLoading(false);
            setSentRequest(true);
          }
        }
      }}
      isLoading={isLoading}
      confirmLabel={sentRequest ? m.system.close : m.system.submit_request}
      isCloseButton={!sentRequest}
    >
      <div className="flex flex-col items-start justify-center gap-4">
        {sentRequest ? (
          <div className="text-base text-beige900 font-light">
            <div className="text-lg font-normal mb-2">
              {m.system.credit_request_submitted}
            </div>
            <div>{m.system.credit_request_submitted_description}</div>
          </div>
        ) : (
          <>
            <div className="text-lg text-beige900 font-normal">
              {m.system.credit_request}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className={[
                    "flex flex-row px-4 transition-all duration-300 text-beige900 rounded-2xl h-14 w-full bg-beige50 border border-beige900/8 items-center justify-between",
                    "hover:bg-beige50/80 focus:outline-none focus:ring-beige900/8",
                  ].join(" ")}
                >
                  <div>
                    열람 횟수 {selectedCredit}회
                  </div>
                  <div>
                    <ChevronDown size={24} strokeWidth={1} />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="rounded-2xl w-[var(--radix-popper-anchor-width)] p-1 backdrop-blur-sm bg-beige50/95"
              >
                <DropdownMenuGroup>
                  {CREDIT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      className="w-full font-light rounded-xl hover:border-none hover:outline-none hover:bg-beige500/55 cursor-pointer p-3 mt-1"
                      onClick={() => {
                        setSelectedCredit(option.value);
                      }}
                    >
                      열람 횟수 {option.label}회
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </BaseModal>
  );
};

export default RequestCreditModal;
