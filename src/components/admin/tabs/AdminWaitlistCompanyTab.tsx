import React from "react";
import type { WaitlistCompany } from "@/components/admin/types";
import { formatKST } from "@/components/admin/utils";
import { Loading } from "@/components/ui/loading";

type AdminWaitlistCompanyTabProps = {
  rows: WaitlistCompany[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
};

export default function AdminWaitlistCompanyTab({
  rows,
  loading,
  error,
  onRefresh,
}: AdminWaitlistCompanyTabProps) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between w-full">
        <div className="text-[12px] text-black/55">
          Rows: <span className="text-black">{rows.length}</span>
        </div>

        {loading && (
          <Loading
            size="sm"
            label="Loading…"
            className="text-[12px] text-black/55"
            inline={true}
          />
        )}
      </div>

      {error ? (
        <div
          className="border border-black/15 bg-black/[0.05] p-4 text-[13px] flex items-start justify-between gap-4"
          style={{ borderRadius: 0 }}
        >
          <div>
            <div className="font-semibold">Error</div>
            <div className="text-black/70 mt-1">{error}</div>
          </div>
          <button
            onClick={onRefresh}
            className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.05]"
            style={{ borderRadius: 0 }}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="border border-black/10 w-full" style={{ borderRadius: 0 }}>
        {loading ? (
          <Loading
            size="sm"
            label="Loading…"
            className="p-6 text-[13px] text-black/55"
          />
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-[14px] font-semibold">No rows</div>
            <div className="text-[13px] text-black/55 mt-2">
              No company waitlist data yet.
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={`${row.email}-${row.created_at}`}
              className="border-t border-black/10 first:border-t-0 w-full"
            >
              <div className="px-5 py-4 w-full">
                <div className="flex flex-row items-start justify-between gap-4">
                  <div className="text-[14px] font-semibold break-all">
                    {row.email}
                  </div>
                  <div className="text-[12px] text-black/55 whitespace-nowrap">
                    {formatKST(row.created_at)}
                  </div>
                </div>

                <div className="mt-3 text-[13px] text-black/80 w-full space-y-1">
                  <div>Name: {row.name ?? "-"}</div>
                  <div className="break-all">
                    Company: {row.company ?? "-"}
                    {row.company_link ? (
                      <>
                        {" "}
                        (
                        <a
                          href={row.company_link}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          link
                        </a>
                        )
                      </>
                    ) : null}
                  </div>
                  <div>
                    Role / Size: {row.role ?? "-"} / {row.size ?? "-"}
                  </div>
                  <div>Needs: {row.needs?.join(", ") || "-"}</div>
                  <div>Main: {row.main ?? "-"}</div>
                  <div>Additional: {row.additional ?? "-"}</div>
                  <div>
                    Submit: {row.is_submit ? "Y" : "N"} · Beta Agree: · Mobile:{" "}
                    {row.is_mobile === null ? "-" : row.is_mobile ? "Y" : "N"}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
