import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Lock,
  MessageSquare,
  Share2,
  User,
} from "lucide-react";
import CandidateViews from "@/components/CandidateViews";
import { Loading } from "@/components/ui/loading";
import {
  useSharedBookmarkFolderPage,
  useSharedFolderViewerIdentity,
} from "@/hooks/useSharedBookmarkFolder";

const PAGE_SIZE = 10;

function ErrorCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-hgray200 px-6 font-sans text-white">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-hgray700" />
          <div>
            <div className="text-base font-medium text-white">{title}</div>
            <div className="mt-2 text-sm leading-6 text-hgray700">{desc}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharedFolderPage() {
  const router = useRouter();
  const token =
    typeof router.query.token === "string" ? router.query.token : "";
  const [pageIdx, setPageIdx] = useState(0);
  const viewer = useSharedFolderViewerIdentity(token);
  const { data, isLoading, error, isFetching } = useSharedBookmarkFolderPage(
    token,
    pageIdx,
    PAGE_SIZE,
    viewer?.viewerKey
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const folderName = data?.folder?.name ?? "Shared folder";
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = pageIdx > 0;
  const hasNext = (pageIdx + 1) * PAGE_SIZE < total;

  const buildProfileHref = useMemo(() => {
    return (candidate: any) =>
      `/share/folder/${encodeURIComponent(token)}/candidate/${encodeURIComponent(candidate.id)}`;
  }, [token]);

  if (isLoading && !data) {
    return <Loading className="min-h-screen justify-center text-hgray700" />;
  }

  if (error) {
    return (
      <ErrorCard
        title="공유 폴더를 열 수 없어요"
        desc={String(error instanceof Error ? error.message : error)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-hgray200 font-sans text-white">
      <div className="sticky top-0 z-20 border-b border-b-white/5 bg-hgray200/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-hgray800 transition-colors hover:text-white"
            >
              From <span className="text-accenta1">Harper</span>
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-hgray800">
              <Lock className="h-3.5 w-3.5" />
              외부 공유용 폴더
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accenta1/20 bg-accenta1/10 px-3 py-1 text-xs text-accenta1">
            <Share2 className="h-3.5 w-3.5" />
            {folderName}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] px-4 py-8">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-[760px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-hgray800">
                <Lock className="h-3 w-3" />
                외부 공유된 폴더
              </div>
              <div className="mt-4 text-[28px] font-normal leading-tight text-white">
                {folderName}
              </div>
              <div className="mt-3 text-sm leading-6 text-hgray700"></div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <div className="mt-2 text-xl font-medium text-white">
                  {total}
                </div>
                <div className="mt-1 text-xs text-hgray700">공유된 후보 수</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <div className="mt-2 truncate text-base font-medium text-white">
                  {viewer?.viewerName ?? "게스트"}
                </div>
                <div className="mt-1 text-xs text-hgray700">
                  메모 작성 시 이 이름으로 저장됩니다.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-hgray800">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/10"
              onClick={() => setPageIdx((current) => Math.max(0, current - 1))}
              disabled={!hasPrev || isFetching}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
              {pageIdx + 1} / {pageCount}
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/10"
              onClick={() => {
                if (!hasNext) return;
                setPageIdx((current) => current + 1);
              }}
              disabled={!hasNext || isFetching}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-white/10 bg-white/5 px-6 py-12 text-center text-sm text-hgray700">
            공유된 후보가 없습니다.
          </div>
        ) : (
          <div className="mt-4">
            <CandidateViews
              items={items}
              criterias={[]}
              indexStart={pageIdx * PAGE_SIZE}
              sourceType="linkedin"
              buildProfileHref={buildProfileHref}
              showBookmarkAction={false}
              showMarkAction={false}
              sharedFolderContext={{
                token,
                viewer,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
