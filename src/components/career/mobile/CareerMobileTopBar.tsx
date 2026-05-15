"use client";

import React from "react";
import { ChevronDown, Settings, HelpCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import CareerProfileMenu from "@/components/career/CareerProfileMenu";

type TabOption = {
  id: CareerWorkspaceTab;
  label: string;
};

type CareerMobileTopBarProps = {
  activeTab: CareerWorkspaceTab;
  options: TabOption[];
  onChangeTab: (tab: CareerWorkspaceTab) => void;
  profilePicture?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  onOpenSettings?: () => void;
  onOpenSupport?: () => void;
  onLogout?: () => void | Promise<void>;
  className?: string;
};

export default function CareerMobileTopBar({
  activeTab,
  options,
  onChangeTab,
  profilePicture,
  userName,
  userEmail,
  onOpenSettings,
  onOpenSupport,
  onLogout,
  className,
}: CareerMobileTopBarProps) {
  const activeLabel =
    options.find((opt) => opt.id === activeTab)?.label ?? options[0]?.label;

  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b border-beige900/10 bg-beige50/95 px-4 text-beige900 backdrop-blur-xl",
        className
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-[20px] font-medium text-beige900 transition active:bg-beige900/5"
          >
            {activeLabel}
            <ChevronDown className="h-5 w-5 text-beige900/55" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          className="min-w-[160px] border border-beige900/10 bg-beige50 text-beige900"
        >
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt.id}
              onSelect={() => onChangeTab(opt.id)}
              className={cn(
                "cursor-pointer rounded-sm px-3 py-2 text-sm",
                opt.id === activeTab && "bg-beige200/60 font-medium"
              )}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center gap-1.5">
        <IconButton
          ariaLabel="개선사항 및 문의사항"
          onClick={onOpenSupport}
          icon={<HelpCircle className="h-5 w-5" />}
        />
        <IconButton
          ariaLabel="설정"
          onClick={onOpenSettings}
          icon={<Settings className="h-5 w-5" />}
        />
        {onLogout ? (
          <CareerProfileMenu
            variant="mobile"
            profileImageUrl={profilePicture ?? null}
            profileName={userName ?? "Candidate"}
            profileEmail={userEmail ?? ""}
            onLogout={onLogout}
            onSuggestUpdate={() => onOpenSupport?.()}
          />
        ) : null}
      </div>
    </header>
  );
}

function IconButton({
  ariaLabel,
  icon,
  onClick,
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-beige900/70 transition active:bg-beige900/5 disabled:opacity-40"
    >
      {icon}
    </button>
  );
}
