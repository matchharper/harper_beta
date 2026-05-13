"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ThumbsUp, ThumbsDown, Globe } from "lucide-react";
import CareerMobileShell from "../CareerMobileShell";
import CareerMobileTopBar from "../CareerMobileTopBar";
import CareerMobileSegmentedTabs, {
  type SegmentedTabItem,
} from "../CareerMobileSegmentedTabs";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import { cn } from "@/lib/utils";

export type JobsDisplayTab = "new" | "tracking" | "archived";

export type CareerMobileJobSummary = {
  id: string;
  title: string;
  company: string;
  companyLogoUrl?: string | null;
  location?: string | null;
  salary?: string | null;
  postedAgo?: string | null;
  sourceLabel?: string | null;
  bullets: string[];
  roleDetailHtml: string;
};

type WorkspaceTabOption = {
  id: CareerWorkspaceTab;
  label: string;
};

type CareerMobileJobsViewProps = {
  activeWorkspaceTab: CareerWorkspaceTab;
  onChangeWorkspaceTab: (tab: CareerWorkspaceTab) => void;
  workspaceTabOptions: WorkspaceTabOption[];
  newCount?: number;
  trackingCount?: number;
  archivedCount?: number;
  selectedJob: CareerMobileJobSummary | null;
  profilePicture?: string | null;
  userName?: string | null;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onOpenProfile?: () => void;
  activeJobsTab?: JobsDisplayTab;
  onChangeJobsTab?: (tab: JobsDisplayTab) => void;
  bottomReservePx?: number;
};

export default function CareerMobileJobsView({
  activeWorkspaceTab,
  onChangeWorkspaceTab,
  workspaceTabOptions,
  newCount,
  trackingCount,
  archivedCount,
  selectedJob,
  profilePicture,
  userName,
  onOpenSettings,
  onOpenHelp,
  onOpenProfile,
  activeJobsTab,
  onChangeJobsTab,
  bottomReservePx = 200,
}: CareerMobileJobsViewProps) {
  const [internalTab, setInternalTab] = useState<JobsDisplayTab>("new");
  const tab = activeJobsTab ?? internalTab;
  const setTab = onChangeJobsTab ?? setInternalTab;

  const items: SegmentedTabItem<JobsDisplayTab>[] = [
    { id: "new", label: "New", count: newCount },
    { id: "tracking", label: "Tracking", count: trackingCount },
    { id: "archived", label: "Archived", count: archivedCount },
  ];

  return (
    <CareerMobileShell
      header={
        <CareerMobileTopBar
          activeTab={activeWorkspaceTab}
          options={workspaceTabOptions}
          onChangeTab={onChangeWorkspaceTab}
          profilePicture={profilePicture}
          userName={userName}
          onOpenSettings={onOpenSettings}
          onOpenHelp={onOpenHelp}
          onOpenProfile={onOpenProfile}
        />
      }
    >
      <CareerMobileSegmentedTabs
        items={items}
        activeId={tab}
        onChange={setTab}
      />

      {selectedJob ? (
        <div
          className="flex flex-col gap-6 px-4 pt-4"
          style={{ paddingBottom: `${bottomReservePx}px` }}
        >
          <JobSummaryCard job={selectedJob} />
          <RoleSection roleDetailHtml={selectedJob.roleDetailHtml} />
        </div>
      ) : (
        <EmptyState tab={tab} />
      )}
    </CareerMobileShell>
  );
}

function JobSummaryCard({ job }: { job: CareerMobileJobSummary }) {
  return (
    <article className="rounded-2xl border border-beige900/10 bg-white p-5">
      <header className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-beige900 text-beige50/80">
          {job.companyLogoUrl ? (
            <Image
              src={job.companyLogoUrl}
              alt={job.company}
              width={48}
              height={48}
              className="h-12 w-12 object-cover"
            />
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              {job.company.slice(0, 2)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-medium leading-tight text-beige900">
            {job.title}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] text-beige900/70">
            <span>{job.company}</span>
            {job.location ? (
              <>
                <Sep />
                <span>{job.location}</span>
              </>
            ) : null}
            <Sep />
          </div>
          {job.salary ? (
            <div className="mt-1.5 inline-block text-[14px] text-beige900/85 underline underline-offset-[3px]">
              {job.salary}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-beige900/55">
            {job.postedAgo ? <span>Posted {job.postedAgo}</span> : null}
            {job.postedAgo && job.sourceLabel ? <Sep /> : null}
            {job.sourceLabel ? (
              <>
                <Globe className="h-3.5 w-3.5" />
                <span className="underline underline-offset-[3px]">
                  {job.sourceLabel}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {job.bullets.length > 0 ? (
        <ul className="mt-5 space-y-2.5 text-[15px] leading-[1.55] text-beige900">
          {job.bullets.map((bullet, idx) => (
            <li
              key={idx}
              className="relative pl-5 before:absolute before:left-1 before:top-[0.65em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-beige900"
            >
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function RoleSection({ roleDetailHtml }: { roleDetailHtml: string }) {
  return (
    <section>
      <h3 className="text-[18px] font-medium text-beige900">Role</h3>
      <hr className="mt-3 border-beige900/10" />
      <div
        className="mt-4 rounded-2xl bg-white/55 p-5 text-[15px] leading-[1.75] text-beige900/85 [&_strong]:font-semibold [&_strong]:text-beige900"
        dangerouslySetInnerHTML={{ __html: roleDetailHtml }}
      />
    </section>
  );
}

export function JobActionBar({
  onTrack,
  onDismiss,
  className,
}: {
  onTrack?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-beige900/15 bg-white text-[15px] font-medium text-beige900/85 transition active:bg-beige100"
      >
        <ThumbsDown className="h-4 w-4" />
        Not for me
      </button>
      <button
        type="button"
        onClick={onTrack}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-beige900 text-[15px] font-medium text-beige50 transition active:bg-beige900/85"
      >
        <ThumbsUp className="h-4 w-4" />
        Track
      </button>
    </div>
  );
}

function EmptyState({ tab }: { tab: JobsDisplayTab }) {
  const message =
    tab === "new"
      ? "아직 새로 추천된 포지션이 없습니다."
      : tab === "tracking"
        ? "트래킹 중인 포지션이 없습니다."
        : "보관된 포지션이 없습니다.";
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20 text-center text-[15px] text-beige900/55">
      {message}
    </div>
  );
}

function Sep() {
  return (
    <span className="select-none text-beige900/35" aria-hidden>
      ·
    </span>
  );
}
