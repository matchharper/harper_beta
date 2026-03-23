import CandidateViews from "@/components/CandidateViews";
import BaseModal from "@/components/Modal/BaseModal";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { Loading } from "@/components/ui/loading";
import { showToast } from "@/components/toast/toast";
import { useCandidatesByConnectionTyped } from "@/hooks/useBookMarkCandidates";
import {
  BookmarkFolder,
  useBookmarkFolders,
  useDeleteBookmarkFolder,
  useUpdateBookmarkFolder,
} from "@/hooks/useBookmarkFolders";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ShortlistEmptyState from "./components/EmptyState";
import { useSettingStore } from "@/store/useSettingStore";

const PAGE_SIZE_OPTIONS = [10, 20, 30] as const;

type ShortlistMode = "folder" | "requested";
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

function BookmarkFolderTab({
  folder,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  folder: BookmarkFolder;
  isActive: boolean;
  onSelect: () => void;
  onRename: (folder: BookmarkFolder) => void;
  onDelete: (folder: BookmarkFolder) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      onClick={onSelect}
      className={`group relative inline-flex cursor-pointer items-center gap-1.5 pb-3 pl-3 pr-8 pt-2 text-sm transition-colors ${
        isActive ? "text-white" : "text-white/65 hover:text-white/90"
      }`}
    >
      <button type="button" className="cursor-pointer">
        {folder.name}
      </button>
      {isActive && (
        <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-white" />
      )}

      <ActionDropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="end"
        contentClassName="min-w-[140px]"
        trigger={
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className={`absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md transition-all duration-200 ${
              menuOpen
                ? "bg-white/10 text-white opacity-100"
                : "text-white/60 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-white"
            }`}
          >
            <MoreHorizontal size={14} />
          </button>
        }
      >
        <ActionDropdownItem
          onSelect={() => onRename(folder)}
          className="flex items-center gap-2"
        >
          <Pencil className="h-4 w-4" />
          <span>이름 변경</span>
        </ActionDropdownItem>
        <ActionDropdownItem
          tone="danger"
          onSelect={() => onDelete(folder)}
          className="flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          <span>삭제</span>
        </ActionDropdownItem>
      </ActionDropdown>
    </div>
  );
}

export default function BookmarksPage() {
  const { companyUser } = useCompanyUserStore();
  const userId = useMemo(() => companyUser?.user_id, [companyUser]);

  const { viewType } = useSettingStore();
  const [mode, setMode] = useState<ShortlistMode>("folder");
  const [selectedFolderId, setSelectedFolderId] = useState<number>(-1);
  const [folderToDelete, setFolderToDelete] = useState<BookmarkFolder | null>(
    null
  );
  const [folderToRename, setFolderToRename] = useState<BookmarkFolder | null>(
    null
  );
  const [renameValue, setRenameValue] = useState("");
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [pageByMode, setPageByMode] = useState<Record<ShortlistMode, number>>({
    folder: 0,
    requested: 0,
  });

  const { data: folders = [], isLoading: isFoldersLoading } =
    useBookmarkFolders(userId, true);
  const { mutateAsync: deleteFolder, isPending: isDeletingFolder } =
    useDeleteBookmarkFolder();
  const { mutateAsync: updateFolder, isPending: isUpdatingFolder } =
    useUpdateBookmarkFolder();

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
    setPageSize(10);
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

  useEffect(() => {
    if (!folderToRename) {
      setRenameValue("");
      return;
    }
    setRenameValue(folderToRename.name);
  }, [folderToRename]);

  const currentTyped = mode === "requested" ? 1 : 0;
  const currentFolderId = mode === "folder" ? selectedFolderId : null;
  const pageIdx = pageByMode[mode] ?? 0;

  const { data, isLoading, error, isFetching } = useCandidatesByConnectionTyped(
    userId,
    currentTyped,
    pageIdx,
    pageSize,
    currentFolderId
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = data?.hasNext ?? false;
  const hasPrev = pageIdx > 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
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

  const handleConfirmRenameFolder = async () => {
    if (!folderToRename || !userId) return;

    const nextName = renameValue.trim();
    if (!nextName) {
      showToast({
        message: "폴더 이름을 입력해주세요.",
        variant: "white",
      });
      return;
    }

    if (nextName === folderToRename.name.trim()) {
      setFolderToRename(null);
      return;
    }

    try {
      const updated = await updateFolder({
        userId,
        folderId: Number(folderToRename.id),
        name: nextName,
      });
      setFolderToRename(null);
      showToast({
        message: `폴더 이름이 "${updated.name}"로 변경되었습니다.`,
        variant: "white",
      });
    } catch (error: any) {
      const message =
        String(error?.code ?? "") === "23505"
          ? "같은 이름의 폴더가 이미 있습니다."
          : String(error?.message ?? "폴더 이름 변경에 실패했습니다.");

      showToast({
        message,
        variant: "white",
      });
    }
  };

  const selectFolderTab = (folderId: number) => {
    setMode("folder");
    setSelectedFolderId(folderId);
    setPageByMode((prev) => ({ ...prev, folder: 0 }));
  };

  const changePageSize = (nextPageSize: PageSizeOption) => {
    if (nextPageSize === pageSize) return;
    setPageSize(nextPageSize);
    setPageByMode({ folder: 0, requested: 0 });
  };

  if (isInitialFolderLoading) {
    return (
      <div className="px-4">
        <Loading className="text-hgray600" />
      </div>
    );
  }

  if (error) return <div>Error</div>;

  const Pagination = ({ isAbsolute = true }: { isAbsolute?: boolean }) => {
    return (
      <div
        className={`flex items-center justify-start gap-3 px-4 ${isAbsolute ? "absolute left-0 top-[-4px]" : ""}`}
      >
        <div className="flex flex-row items-center gap-3 text-sm text-hgray900">
          <button
            type="button"
            className={`w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 p-1 ${
              !hasPrev || isFetching
                ? "cursor-not-allowed opacity-40"
                : "cursor-pointer"
            }`}
            onClick={() =>
              setPageByMode((prev) => ({
                ...prev,
                [mode]: Math.max(0, pageIdx - 1),
              }))
            }
            disabled={!hasPrev || isFetching}
          >
            <ChevronLeft size={16} className="text-white" />
          </button>
          <div className="px-4 h-8 rounded-lg flex flex-row items-center justify-center gap-2 border border-white/5">
            <span className="font-medium">{pageIdx + 1}</span> /{" "}
            <span className="font-medium">{pageCount}</span>
          </div>
          <button
            type="button"
            className={`w-8 h-8 flex items-center justify-center rounded-md bg-white/5 p-1 ${
              !hasNext || isFetching
                ? "cursor-not-allowed opacity-40"
                : "cursor-pointer"
            }`}
            onClick={() => {
              if (!hasNext) return;
              setPageByMode((prev) => ({
                ...prev,
                [mode]: pageIdx + 1,
              }));
            }}
            disabled={!hasNext || isFetching}
          >
            <ChevronRight size={16} className="text-white" />
          </button>
          {isFetching && <span className="ml-2 text-hgray500">Syncing…</span>}
        </div>

        {isAbsolute && (
          <ActionDropdown
            align="end"
            contentClassName="min-w-[140px]"
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white transition-colors duration-200 hover:bg-white/10"
              >
                <span>{pageSize}명씩 보기</span>
                <ChevronDown className="h-4 w-4 text-hgray700" />
              </button>
            }
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <ActionDropdownItem
                key={option}
                onSelect={() => changePageSize(option)}
                className="flex items-center justify-between gap-3"
              >
                <span>{option}명씩 보기</span>
                {pageSize === option ? (
                  <Check className="h-4 w-4 text-accenta1" />
                ) : null}
              </ActionDropdownItem>
            ))}
          </ActionDropdown>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      <div className="mb-4 px-4">
        <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-end gap-2 border-b border-white/10">
            {defaultFolder && (
              <button
                type="button"
                onClick={() => selectFolderTab(Number(defaultFolder.id))}
                className={`relative inline-flex items-center gap-1.5 pb-3 pl-1 pr-3 pt-2 text-sm transition-colors ${
                  mode === "folder" &&
                  selectedFolderId === Number(defaultFolder.id)
                    ? "text-white"
                    : "text-white/65 hover:text-white/90"
                }`}
              >
                <Bookmark className="h-3.5 w-3.5" fill="currentColor" />
                <span>{defaultFolder.name}</span>
                {mode === "folder" &&
                  selectedFolderId === Number(defaultFolder.id) && (
                    <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-white" />
                  )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setMode("requested");
                setPageByMode((prev) => ({ ...prev, requested: 0 }));
              }}
              className={`relative inline-flex items-center gap-1 pb-3 px-3 pt-2 text-sm transition-colors ${
                mode === "requested"
                  ? "text-white"
                  : "text-white/65 hover:text-white/90"
              }`}
            >
              Intro 요청됨
              {mode === "requested" && (
                <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-white" />
              )}
            </button>

            {otherFolders.map((folder) => {
              const fid = Number(folder.id);
              return (
                <BookmarkFolderTab
                  key={folder.id}
                  folder={folder}
                  isActive={mode === "folder" && selectedFolderId === fid}
                  onSelect={() => selectFolderTab(fid)}
                  onRename={setFolderToRename}
                  onDelete={setFolderToDelete}
                />
              );
            })}
          </div>
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
        <div className="relative mt-8">
          <Pagination />

          <CandidateViews
            items={items}
            userId={userId}
            isMyList={true}
            showShortlistMemo={true}
            criterias={[]}
          />

          {viewType === "card" && (
            <div className="relative mb-24 w-full items-center justify-center flex">
              <Pagination isAbsolute={false} />
            </div>
          )}
        </div>
      )}

      {folderToRename && (
        <BaseModal
          onClose={() => setFolderToRename(null)}
          onConfirm={() => void handleConfirmRenameFolder()}
          confirmLabel="이름 변경"
          isLoading={isUpdatingFolder}
          size="sm"
        >
          <div className="flex flex-col gap-3">
            <div className="text-lg font-normal text-white">폴더 이름 변경</div>
            <div className="text-sm text-hgray800 leading-relaxed">
              새 폴더 이름을 입력해주세요.
            </div>
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleConfirmRenameFolder();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setFolderToRename(null);
                }
              }}
              placeholder="폴더 이름"
              className="mt-2 h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-hgray900 outline-none focus:border-white/20"
              autoFocus
            />
          </div>
        </BaseModal>
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
