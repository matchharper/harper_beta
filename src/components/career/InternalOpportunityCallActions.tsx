"use client";

import {
  Check,
  CheckSquare2,
  Headset,
  Loader2,
  MessageCircle,
  UserRoundCheck,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CareerInternalOpportunityCallRequest } from "./types";

type InternalOpportunityCallActionsProps = {
  callRequests: CareerInternalOpportunityCallRequest[];
  callStartPending?: boolean;
  className?: string;
  disabled?: boolean;
  onStart: (
    callRequest: CareerInternalOpportunityCallRequest
  ) => boolean | void | Promise<boolean | void>;
  variant?: "desktop" | "mobile";
};

const formatInternalCallLabel = (
  callRequest: CareerInternalOpportunityCallRequest
) => {
  const companyName = callRequest.companyName.trim() || "회사";
  const roleTitle = callRequest.roleTitle.trim() || "Role";
  return `${companyName} - ${roleTitle} 통화 대기`;
};

const MessageCircleCheckIcon = ({ className }: { className?: string }) => (
  <span className={cn("relative inline-flex", className)}>
    <MessageCircle className="h-full w-full" strokeWidth={1.8} />
    <Check
      className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-bg-floating"
      strokeWidth={2.4}
    />
  </span>
);

export function InternalOpportunityCallActions({
  callRequests,
  callStartPending = false,
  className,
  disabled = false,
  onStart,
  variant = "desktop",
}: InternalOpportunityCallActionsProps) {
  const isMobile = variant === "mobile";
  const [pendingCallId, setPendingCallId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const actionDisabled = disabled || callStartPending || pendingCallId !== null;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (callRequests.length === 0) return null;

  const handleStart = async (
    callRequest: CareerInternalOpportunityCallRequest
  ) => {
    if (actionDisabled) return;
    setPendingCallId(callRequest.id);
    try {
      await onStart(callRequest);
    } catch (error) {
      console.error("[InternalOpportunityCallActions] failed to start", {
        callRequestId: callRequest.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (mountedRef.current) {
        setPendingCallId(null);
      }
    }
  };

  return (
    <div
      className={cn(
        isMobile
          ? "flex w-full flex-col gap-2"
          : "flex w-full flex-row flex-wrap items-center justify-center gap-2",
        className
      )}
      aria-busy={pendingCallId !== null || callStartPending || undefined}
    >
      {callRequests.map((callRequest) => {
        const callPending = pendingCallId === callRequest.id;
        const label = formatInternalCallLabel(callRequest);

        return (
          <ActionButton
            key={callRequest.id}
            onClick={() => void handleStart(callRequest)}
            disabled={actionDisabled}
            aria-label={label}
            aria-busy={callPending || undefined}
            actionVariant="secondary"
            className={cn(
              "text-center font-normal",
              isMobile ? "w-full" : "pl-2 pr-4"
            )}
          >
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-neutral-muted"
              aria-hidden="true"
            >
              {callPending ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  strokeWidth={1.8}
                />
              ) : callRequest.companyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={callRequest.companyLogoUrl}
                  alt=""
                  className="h-full w-full rounded-full object-contain p-0.5"
                />
              ) : (
                <UserRoundCheck className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 truncate text-[15px] md:text-[14px] font-medium leading-5">
              {label}
            </span>
          </ActionButton>
        );
      })}
    </div>
  );
}
