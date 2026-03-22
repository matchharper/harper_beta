import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useCandidatesByConnectionTyped } from "@/hooks/useBookMarkCandidates";
import { useMemo, useState, useEffect } from "react";
import CandidateViews from "@/components/CandidateViews";
import { Check, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Loading } from "@/components/ui/loading";
import ShortlistEmptyState from "./components/EmptyState";
import {
  BookmarkFolder,
  useBookmarkFolders,
  useDeleteBookmarkFolder,
} from "@/hooks/useBookmarkFolders";
import BaseModal from "@/components/Modal/BaseModal";
import { showToast } from "@/components/toast/toast";

const PAGE_SIZE = 10;
type ShortlistMode = "folder" | "requested";

export default function BookmarksPage() {
  const { companyUser } = useCompanyUserStore();
  const userId = useMemo(() => companyUser?.user_id, [companyUser]);

  const [mode, setMode] = useState<ShortlistMode>("folder");
  const [selectedFolderId, setSelectedFolderId] = useState<number>(-1);
  const [folderToDelete, setFolderToDelete] = useState<BookmarkFolder | null>(
    null
  );
  const [pageByMode, setPageByMode] = useState<Record<ShortlistMode, number>>({
    folder: 0,
    requested: 0,
  });

  const { data: folders = [], isLoading: isFoldersLoading } =
    useBookmarkFolders(userId, true);
  const { mutateAsync: deleteFolder, isPending: isDeletingFolder } =
    useDeleteBookmarkFolder();

  const defaultFolder = useMemo(() => {
    if (folders.length === 0) return null;
    return folders.find((folder) => folder.is_default) ?? folders[0];
  }, [folders]);

  const otherFolders = useMemo(() => {
    if (!defaultFolder) return folders;
    const defaultId = Number(defaultFolder.id);
    return folders.filter((folder) => Number(folder.id) !== defaultId);
  }, [folders, defaultFolder]);

  useEffect(() => {
    setMode("folder");
    setSelectedFolderId(-1);
    setPageByMode({ folder: 0, requested: 0 });
  }, [userId]);

  useEffect(() => {
    if (folders.length === 0) {
      setSelectedFolderId(-1);
      return;
    }

    const folderIds = new Set(folders.map((folder) => Number(folder.id)));
    if (selectedFolderId !== -1 && folderIds.has(selectedFolderId)) return;

    const fallback =
      Number((folders.find((folder) => folder.is_default) ?? folders[0]).id) ||
      -1;
    setSelectedFolderId(fallback);
  }, [folders, selectedFolderId]);

  const currentTyped = mode === "requested" ? 1 : 0;
  const currentFolderId = mode === "folder" ? selectedFolderId : null;
  const pageIdx = pageByMode[mode] ?? 0;

  const { data, isLoading, error, isFetching } = useCandidatesByConnectionTyped(
    userId,
    currentTyped,
    pageIdx,
    PAGE_SIZE,
    currentFolderId
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = data?.hasNext ?? false;
  const hasPrev = pageIdx > 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialFolderLoading =
    mode === "folder" && selectedFolderId === -1 && isFoldersLoading;

  const handleConfirmDeleteFolder = async () => {
    if (!folderToDelete || !userId) return;

    try {
      const deletingId = Number(folderToDelete.id);
      const deletingName = folderToDelete.name;

      await deleteFolder({ userId, folderId: deletingId });
      setFolderToDelete(null);
      setPageByMode((prev) => ({ ...prev, folder: 0 }));

      if (mode === "folder" && selectedFolderId === deletingId) {
        setSelectedFolderId(-1);
      }

      showToast({
        message: `"${deletingName}" 폴더와 포함된 북마크가 삭제되었습니다.`,
        variant: "white",
      });
    } catch (error: any) {
      showToast({
        message: String(error?.message ?? "폴더 삭제에 실패했습니다."),
        variant: "white",
      });
    }
  };

  const selectFolderTab = (folderId: number) => {
    setMode("folder");
    setSelectedFolderId(folderId);
    setPageByMode((prev) => ({ ...prev, folder: 0 }));
  };

  if (isInitialFolderLoading) {
    return (
      <div className="px-4">
        <Loading className="text-hgray600" />
      </div>
    );
  }

  if (error) return <div>Error</div>;

  return (
    <div className="w-full">
      <div className="px-4 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {defaultFolder && (
            <div
              className={`inline-flex items-center gap-1 rounded-sm px-3 py-2 text-sm transition-colors ${
                mode === "folder" &&
                selectedFolderId === Number(defaultFolder.id)
                  ? "bg-accenta1/0 text-accenta1"
                  : "text-hgray800 hover:bg-white/0 hover:text-hgray900"
              }`}
            >
              <button
                type="button"
                onClick={() => selectFolderTab(Number(defaultFolder.id))}
                className="cursor-pointer"
              >
                {defaultFolder.name}
              </button>
              {mode === "folder" &&
                selectedFolderId === Number(defaultFolder.id) && (
                  <Check size={14} className="text-accenta1" />
                )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setMode("requested");
              setPageByMode((prev) => ({ ...prev, requested: 0 }));
            }}
            className={`px-3 py-2 rounded-sm inline-flex items-center gap-1 text-sm transition-colors ${
              mode === "requested"
                ? "bg-accenta1/0 text-accenta1"
                : "text-hgray800 hover:bg-white/0 hover:text-hgray900"
            }`}
          >
            Intro 요청됨
            {mode === "requested" && (
              <Check size={14} className="text-accenta1" />
            )}
          </button>

          {otherFolders.map((folder) => {
            const fid = Number(folder.id);
            const isActive = mode === "folder" && selectedFolderId === fid;

            return (
              <div
                key={folder.id}
                className={`inline-flex items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accenta1/0 text-accenta1"
                    : "text-hgray800 hover:bg-white/0 hover:text-hgray900"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectFolderTab(fid)}
                  className="cursor-pointer"
                >
                  {folder.name}
                </button>
                {isActive && <Check size={16} className="text-accenta1" />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFolderToDelete(folder);
                  }}
                  className="p-0.5 rounded hover:bg-white/10 text-hgray700 hover:text-white"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-10">
          <Loading className="text-hgray600" />
        </div>
      ) : null}

      {!isLoading && items.length === 0 && !isFetching && (
        <ShortlistEmptyState
          mode={mode === "requested" ? "requested" : "bookmark"}
        />
      )}

      {!isLoading && items.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 mb-0 mt-4 px-4">
            <div className="flex flex-row items-center gap-3 text-sm text-hgray900">
              <span>Page</span>
              <span
                className={`rounded-md p-1 bg-white/5 ${
                  !hasPrev || isFetching
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
                onClick={() =>
                  setPageByMode((prev) => ({
                    ...prev,
                    [mode]: Math.max(0, pageIdx - 1),
                  }))
                }
              >
                <ChevronLeft size={16} className="text-accenta1" />
              </span>
              <span className="font-medium">{pageIdx + 1}</span> /{" "}
              <span className="font-medium">{pageCount}</span>{" "}
              <span
                className={`rounded-md p-1 bg-white/5 ${
                  !hasNext || isFetching
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
                onClick={() => {
                  if (!hasNext) return;
                  setPageByMode((prev) => ({
                    ...prev,
                    [mode]: pageIdx + 1,
                  }));
                }}
              >
                <ChevronRight size={16} className="text-accenta1" />
              </span>
              {isFetching && (
                <span className="ml-2 text-hgray500">Syncing…</span>
              )}
            </div>
          </div>

          <CandidateViews
            items={items}
            userId={userId}
            isMyList={true}
            showShortlistMemo={true}
            criterias={[]}
          />
        </>
      )}

      {folderToDelete && (
        <BaseModal
          onClose={() => setFolderToDelete(null)}
          onConfirm={() => void handleConfirmDeleteFolder()}
          confirmLabel="폴더 삭제"
          isLoading={isDeletingFolder}
          size="sm"
        >
          <div className="flex flex-col gap-3">
            <div className="text-lg font-normal text-white">폴더 삭제 확인</div>
            <div className="text-sm text-hgray800 leading-relaxed">
              <span className="text-white">[{folderToDelete.name}]</span> 폴더를
              삭제하면, 이 폴더에 담긴 북마크가 모두 제거됩니다.
              <br />이 작업은 되돌릴 수 없습니다.
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
}
