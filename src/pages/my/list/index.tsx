import AppLayout from "@/components/layout/app";
import { useMemo, useState } from "react";
import ConnectedPage from "./connectedPage";
import BookmarkPage from "./bookmarkPage";
import RequestedPage from "./requestedPage";
import { useConnectionCounts } from "@/hooks/useBookMarkCandidates";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import PickedPage from "./pickedPage";

type PageKey = "bookmark" | "picked" | "connected";

const TABS: { key: PageKey; label: string }[] = [
  { key: "bookmark", label: "Shortlist" },
  { key: "picked", label: "Harper's Pick" },
  // { key: "connected", label: "Connections" },
];

export default function MyPage() {
  const [currentPage, setCurrentPage] = useState<PageKey>("bookmark");
  const { companyUser } = useCompanyUserStore();
  const userId = useMemo(() => companyUser?.user_id, [companyUser]);
  const { data } = useConnectionCounts(userId);

  const title = useMemo(() => {
    return TABS.find((t) => t.key === currentPage)?.label ?? "마이페이지";
  }, [currentPage]);

  const page = useMemo(() => {
    switch (currentPage) {
      case "bookmark":
        return <BookmarkPage />;
      case "picked":
        return <PickedPage />;
    }
  }, [currentPage]);

  return (
    <AppLayout initialCollapse={false}>
      <div className="min-h-screen w-full">
        {/* Header */}
        <div className="sticky top-0 z-50 w-full backdrop-blur">
          <div className="mx-auto w-full px-4 pt-6 pb-2">
            <div className="flex items-end justify-between gap-4">
              <div className="text-3xl font-hedvig font-light tracking-tight text-white">
                {title}
              </div>

              {/* (Optional) Right side action slot */}
              {/* <button className="rounded-xl border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50">
                설정
              </button> */}
            </div>

            {/* <div className="mt-2">
              <div className="inline-flex rounded-2xl p-1">
                {TABS.map((t) => {
                  const active = t.key === currentPage;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setCurrentPage(t.key)}
                      className={[
                        "relative rounded-3xl py-2 text-sm font-normal transition pr-4",
                        active
                          ? "text-white shadow-sm"
                          : "text-xgray800 hover:text-white",
                      ].join(" ")}
                    >
                      {t.label}{" "}
                      {data?.[t.key as keyof typeof data] ? (
                        <span className="ml-1 text-[14px] text-accenta1">
                          {data?.[t.key as keyof typeof data]}
                        </span>
                      ) : (
                        ""
                      )}
                    </button>
                  );
                })}
              </div>
            </div> */}
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto w-full px-4 pb-8">
          <div className="">{page}</div>
        </div>
      </div>
    </AppLayout>
  );
}
