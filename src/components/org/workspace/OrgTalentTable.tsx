import Image from "next/image";
import { useState } from "react";

import { formatKstDateOnly } from "@/components/ops/dateUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";

export type OrgTalentTableStatusTone = "muted" | "primary";

export type OrgTalentTableRow<Item> = {
  companyName?: string | null;
  date: string;
  item: Item;
  key: string;
  name: string;
  profilePicture?: string | null;
  roleName?: string | null;
  statusLabel: string;
  statusTone: OrgTalentTableStatusTone;
  viewed: boolean;
};

function formatTableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatKstDateOnly(date).slice(2);
}

function TalentAvatar({ name, src }: { name: string; src?: string | null }) {
  const profilePicture = getDisplayableProfileImageUrl(src);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  if (profilePicture && failedImageSrc !== profilePicture) {
    return (
      <Image
        alt=""
        className="size-7 rounded-full object-cover"
        height={28}
        onError={() => setFailedImageSrc(profilePicture)}
        src={profilePicture}
        unoptimized
        width={28}
      />
    );
  }

  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function StatusLabel({
  children,
  tone,
}: {
  children: string;
  tone: OrgTalentTableStatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]",
        tone === "primary"
          ? "font-medium text-primary"
          : "font-light text-neutral-muted"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "primary" ? "bg-primary" : "bg-neutral-400"
        )}
      />
      {children}
    </span>
  );
}

export function OrgTalentTable<Item>({
  companyHeader = "회사",
  dateHeader,
  onSelect,
  onSelectRole,
  roleHeader = "포지션",
  rows,
  statusHeader,
}: {
  companyHeader?: string | null;
  dateHeader: string;
  onSelect: (item: Item) => void;
  onSelectRole?: (item: Item) => void;
  roleHeader?: string;
  rows: readonly OrgTalentTableRow<Item>[];
  statusHeader: string;
}) {
  const showCompany = companyHeader !== null;

  return (
    <div className="overflow-x-auto rounded-sm border border-neutral-1000-a05 bg-bg-floating">
      <table
        className={cn(
          "w-full border-collapse text-left",
          showCompany ? "min-w-[1040px]" : "min-w-[860px]"
        )}
      >
        <thead className="bg-neutral-200/35">
          <tr className="border-b border-neutral-1000-a05 text-[12px] font-light text-neutral-soft">
            <th className="w-16 py-2.5 pl-4 pr-2 font-normal">사진</th>
            <th className="px-3 py-2.5 font-normal">이름</th>
            <th className="px-3 py-2.5 font-normal">{roleHeader}</th>
            {showCompany ? (
              <th className="px-3 py-2.5 font-normal">{companyHeader}</th>
            ) : null}
            <th className="w-28 px-3 py-2.5 font-normal">열람 여부</th>
            <th className="w-36 px-3 py-2.5 font-normal">{statusHeader}</th>
            <th className="w-28 px-3 py-2.5 pr-4 text-right font-normal">
              {dateHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              aria-label={`${row.name} 상세 열기`}
              className="group cursor-pointer border-b border-neutral-1000-a05 outline-none transition last:border-b-0 hover:bg-neutral-1000-a03 focus-visible:bg-neutral-1000-a05"
              key={row.key}
              onClick={() => onSelect(row.item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(row.item);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <td className="w-16 py-3 pl-4 pr-2">
                <TalentAvatar name={row.name} src={row.profilePicture} />
              </td>
              <td className="min-w-44 px-3 py-3">
                <span className="block truncate text-[14px] font-medium text-neutral-primary">
                  {row.name}
                </span>
              </td>
              <td className="min-w-52 px-3 py-3 text-[13px] font-normal text-neutral-primary">
                {onSelectRole ? (
                  <button
                    className="line-clamp-2 max-w-full text-left underline-offset-2 outline-none hover:underline focus-visible:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectRole(row.item);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    {row.roleName || "Role"}
                  </button>
                ) : (
                  <span className="line-clamp-2">{row.roleName || "Role"}</span>
                )}
              </td>
              {showCompany ? (
                <td className="min-w-44 px-3 py-3 text-[13px] font-light text-neutral-muted">
                  <span className="line-clamp-2">{row.companyName || "-"}</span>
                </td>
              ) : null}
              <td className="w-28 px-3 py-3">
                <StatusLabel tone={row.viewed ? "muted" : "primary"}>
                  {row.viewed ? "열람" : "미열람"}
                </StatusLabel>
              </td>
              <td className="w-36 px-3 py-3">
                <StatusLabel tone={row.statusTone}>
                  {row.statusLabel}
                </StatusLabel>
              </td>
              <td className="w-28 px-3 py-3 pr-4 text-right text-[13px] tabular-nums text-neutral-muted">
                {formatTableDate(row.date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrgTalentTableLoading({
  showCompany = true,
}: {
  showCompany?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          className="flex items-center gap-4 border-b border-neutral-1000-a05 px-4 py-3 last:border-b-0"
          key={index}
        >
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="ml-8 h-4 w-48" />
          {showCompany ? <Skeleton className="h-4 w-36" /> : null}
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
