import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { formatKstDateOnly } from "@/components/ops/dateUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";

export type OrgTalentTableStatusTone = "muted" | "primary" | "action";

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

function TalentAvatar({
  mobile = false,
  name,
  src,
}: {
  mobile?: boolean;
  name: string;
  src?: string | null;
}) {
  const profilePicture = getDisplayableProfileImageUrl(src);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const size = mobile ? 40 : 28;

  if (profilePicture && failedImageSrc !== profilePicture) {
    return (
      <Image
        alt=""
        className={cn(
          "rounded-full object-cover",
          mobile ? "size-10" : "size-7"
        )}
        height={size}
        onError={() => setFailedImageSrc(profilePicture)}
        src={profilePicture}
        unoptimized
        width={size}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-bg-weak font-medium text-neutral-muted",
        mobile ? "size-10 text-[13px]" : "size-7 text-[12px]"
      )}
    >
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
          : tone === "action"
            ? "font-medium text-action"
            : "font-light text-neutral-muted"
      )}
    >
      <span
        className={cn(
          "size-[5px] rounded-full",
          tone === "primary"
            ? "bg-primary"
            : tone === "action"
              ? "bg-action"
              : "bg-neutral-400"
        )}
      />
      {children}
    </span>
  );
}

function OrgTalentMobileList<Item>({
  dateHeader,
  onSelect,
  onSelectRole,
  roleHeader,
  rows,
}: {
  dateHeader: string;
  onSelect: (item: Item) => void;
  onSelectRole?: (item: Item) => void;
  roleHeader: string;
  rows: readonly OrgTalentTableRow<Item>[];
}) {
  return (
    <div className="border-y border-neutral-1000-a05 bg-bg-default md:hidden">
      {rows.map((row) => (
        <div
          aria-label={`${row.name} 상세 열기`}
          className="group flex cursor-pointer items-start gap-3 border-b border-neutral-1000-a05 px-1 py-4 outline-none transition last:border-b-0 hover:bg-bg-weak focus-visible:bg-bg-weak"
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
          <TalentAvatar mobile name={row.name} src={row.profilePicture} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[15px] font-medium text-neutral-primary">
                {row.name}
              </span>
              {!row.viewed ? (
                <span
                  aria-label="미열람"
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                  role="status"
                />
              ) : null}
            </div>
            <div className="mt-1 min-w-0 text-[13px] leading-5 text-neutral-muted">
              <span className="sr-only">{roleHeader}: </span>
              {onSelectRole ? (
                <button
                  className="line-clamp-1 max-w-full text-left text-neutral-primary underline-offset-2 outline-none hover:underline focus-visible:underline"
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
                <span className="line-clamp-1 text-neutral-primary">
                  {row.roleName || "Role"}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusLabel tone={row.statusTone}>{row.statusLabel}</StatusLabel>
              <span className="text-[11px] tabular-nums text-neutral-soft">
                <span className="sr-only">{dateHeader}: </span>
                {formatTableDate(row.date)}
              </span>
              <span className="text-[11px] text-neutral-soft">
                {row.viewed ? "열람" : "미열람"}
              </span>
            </div>
          </div>
          <ChevronRight
            aria-hidden
            className="mt-2 size-4 shrink-0 text-neutral-soft transition group-hover:translate-x-0.5"
            strokeWidth={1.6}
          />
        </div>
      ))}
    </div>
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
    <>
      <OrgTalentMobileList
        dateHeader={dateHeader}
        onSelect={onSelect}
        onSelectRole={onSelectRole}
        roleHeader={roleHeader}
        rows={rows}
      />
      <div className="hidden overflow-x-auto rounded-sm border border-neutral-1000-a05 bg-bg-floating md:block">
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
                    <span className="line-clamp-2">
                      {row.roleName || "Role"}
                    </span>
                  )}
                </td>
                {showCompany ? (
                  <td className="min-w-44 px-3 py-3 text-[13px] font-light text-neutral-muted">
                    <span className="line-clamp-2">
                      {row.companyName || "-"}
                    </span>
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
    </>
  );
}

export function OrgTalentTableLoading({
  showCompany = true,
}: {
  showCompany?: boolean;
}) {
  return (
    <>
      <div className="border-y border-neutral-1000-a05 md:hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            className="flex items-start gap-3 border-b border-neutral-1000-a05 px-1 py-4 last:border-b-0"
            key={index}
          >
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-48 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating md:block">
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
    </>
  );
}
