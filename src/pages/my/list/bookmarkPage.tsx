import CandidateViews from "@/components/CandidateViews";
import BaseModal from "@/components/Modal/BaseModal";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { Loading } from "@/components/ui/loading";
import { showToast } from "@/components/toast/toast";
import { useCandidatesByConnectionTyped } from "@/hooks/useBookMarkCandidates";
import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import {
  useActiveBookmarkFolderShareMap,
  useCreateBookmarkFolderShare,
  useRevokeBookmarkFolderShare,
  useSharedBookmarkFolderPage,
} from "@/hooks/useSharedBookmarkFolder";
import { createSharedFolderOwnerIdentity } from "@/lib/sharedFolder";
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
  Copy,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ShortlistEmptyState from "./components/EmptyState";
import { useSettingStore } from "@/store/useSettingStore";
import ForwardIcon from "@/assets/icons/forward.svg";
import { useRouter } from "next/router";

const PAGE_SIZE_OPTIONS = [10, 20, 30] as const;

type ShortlistMode = "folder" | "requested";
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

function readSingleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseShortlistMode(
  value: string | string[] | undefined
): ShortlistMode {
  return readSingleQueryValue(value) === "requested" ? "requested" : "folder";
}

function parsePageIndex(value: string | string[] | undefined) {
  const raw = Number(readSingleQueryValue(value) ?? "");
  if (!Number.isFinite(raw) || raw < 1) return 0;
  return Math.floor(raw) - 1;
}

function parsePageSizeOption(
  value: string | string[] | undefined
): PageSizeOption {
  const raw = Number(readSingleQueryValue(value) ?? "");
  if (PAGE_SIZE_OPTIONS.includes(raw as PageSizeOption)) {
    return raw as PageSizeOption;
  }
  return 10;
}

function parseFolderId(value: string | string[] | undefined) {
  const raw = Number(readSingleQueryValue(value) ?? "");
  if (!Number.isFinite(raw) || raw < 1) return null;
  return Math.floor(raw);
}

function hasValidPositivePage(value: string | string[] | undefined) {
  const raw = Number(readSingleQueryValue(value) ?? "");
  return Number.isFinite(raw) && raw >= 1;
}

function hasValidPageSizeOption(value: string | string[] | undefined) {
  const raw = Number(readSingleQueryValue(value) ?? "");
  return PAGE_SIZE_OPTIONS.includes(raw as PageSizeOption);
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function BookmarkFolderTab({
  folder,
  isActive,
  isShared,
  onSelect,
  onRename,
  onDelete,
}: {
  folder: BookmarkFolder;
  isActive: boolean;
  isShared: boolean;
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
      {/* {isShared ? <Share2 className="h-3 w-3 text-accenta1" /> : null} */}
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
  const router = useRouter();
  const { companyUser } = useCompanyUserStore();
  const userId = useMemo(() => companyUser?.user_id, [companyUser]);

  const { viewType } = useSettingStore();
  const [folderToDelete, setFolderToDelete] = useState<BookmarkFolder | null>(
    null
  );
  const [folderToRename, setFolderToRename] = useState<BookmarkFolder | null>(
    null
  );
  const [renameValue, setRenameValue] = useState("");

  const { data: folders = [], isLoading: isFoldersLoading } =
    useBookmarkFolders(userId, true);
  const activeShareByFolderId = useActiveBookmarkFolderShareMap(userId);
  const { mutateAsync: createFolderShare, isPending: isCreatingFolderShare } =
    useCreateBookmarkFolderShare();
  const { mutateAsync: revokeFolderShare, isPending: isRevokingFolderShare } =
    useRevokeBookmarkFolderShare();
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
    if (!folderToRename) {
      setRenameValue("");
      return;
    }
    setRenameValue(folderToRename.name);
  }, [folderToRename]);

  const mode = useMemo(
    () => parseShortlistMode(router.query.mode),
    [router.query.mode]
  );
  const pageSize = useMemo(
    () => parsePageSizeOption(router.query.pageSize),
    [router.query.pageSize]
  );
  const folderPageIdx = useMemo(
    () => parsePageIndex(router.query.folderPage),
    [router.query.folderPage]
  );
  const requestedPageIdx = useMemo(
    () => parsePageIndex(router.query.requestedPage),
    [router.query.requestedPage]
  );
  const requestedFolderId = useMemo(
    () => parseFolderId(router.query.folderId),
    [router.query.folderId]
  );
  const selectedFolderId = useMemo(() => {
    if (folders.length === 0) return -1;

    const folderIds = new Set(folders.map((folder) => Number(folder.id)));
    if (requestedFolderId !== null && folderIds.has(requestedFolderId)) {
      return requestedFolderId;
    }

    return (
      Number((folders.find((folder) => folder.is_default) ?? folders[0]).id) ||
      -1
    );
  }, [folders, requestedFolderId]);
  const updateListQuery = useMemo(() => {
    return (
      updates: Record<string, string | undefined>,
      options?: { replace?: boolean }
    ) => {
      if (!router.isReady) return;

      const nextQuery: Record<string, string> = {};
      for (const [key, value] of Object.entries(router.query)) {
        const singleValue = readSingleQueryValue(value);
        if (typeof singleValue === "string" && singleValue.length > 0) {
          nextQuery[key] = singleValue;
        }
      }

      for (const [key, value] of Object.entries(updates)) {
        if (!value) {
          delete nextQuery[key];
          continue;
        }
        nextQuery[key] = value;
      }

      const navigate = options?.replace ? router.replace : router.push;
      void navigate(
        {
          pathname: router.pathname,
          query: nextQuery,
        },
        undefined,
        { shallow: true, scroll: false }
      );
    };
  }, [router]);

  useEffect(() => {
    if (!router.isReady || isFoldersLoading) return;

    const nextUpdates: Record<string, string | undefined> = {};
    if (readSingleQueryValue(router.query.mode) !== mode) {
      nextUpdates.mode = mode;
    }
    if (!hasValidPageSizeOption(router.query.pageSize)) {
      nextUpdates.pageSize = String(pageSize);
    }

    if (mode === "folder") {
      if (selectedFolderId > 0) {
        const currentFolderId = parseFolderId(router.query.folderId);
        if (currentFolderId !== selectedFolderId) {
          nextUpdates.folderId = String(selectedFolderId);
        }
      }
      if (!hasValidPositivePage(router.query.folderPage)) {
        nextUpdates.folderPage = "1";
      }
    }

    if (!hasValidPositivePage(router.query.requestedPage)) {
      nextUpdates.requestedPage = "1";
    }

    if (Object.keys(nextUpdates).length === 0) return;
    updateListQuery(nextUpdates, { replace: true });
  }, [
    isFoldersLoading,
    mode,
    pageSize,
    router.isReady,
    router.query.folderId,
    router.query.folderPage,
    router.query.mode,
    router.query.pageSize,
    router.query.requestedPage,
    selectedFolderId,
    updateListQuery,
  ]);

  const currentTyped = mode === "requested" ? 1 : 0;
  const currentFolderId = mode === "folder" ? selectedFolderId : null;
  const pageIdx = mode === "requested" ? requestedPageIdx : folderPageIdx;
  const currentFolderShare =
    mode === "folder" && currentFolderId != null
      ? (activeShareByFolderId.get(Number(currentFolderId)) ?? null)
      : null;
  const ownerSharedFolderViewer = useMemo(() => {
    if (!currentFolderShare?.token || !userId) return null;

    return createSharedFolderOwnerIdentity(
      userId,
      companyUser?.name ?? companyUser?.email ?? null
    );
  }, [
    companyUser?.email,
    companyUser?.name,
    currentFolderShare?.token,
    userId,
  ]);

  const { data, isLoading, error, isFetching } = useCandidatesByConnectionTyped(
    userId,
    currentTyped,
    pageIdx,
    pageSize,
    currentFolderId
  );
  const { data: sharedFolderPageData } = useSharedBookmarkFolderPage(
    currentFolderShare?.token,
    pageIdx,
    pageSize,
    ownerSharedFolderViewer?.viewerKey
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const hasNext = data?.hasNext ?? false;
  const hasPrev = pageIdx > 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const isInitialFolderLoading =
    mode === "folder" && selectedFolderId === -1 && isFoldersLoading;
  const itemsWithSharedNotes = useMemo(() => {
    if (!currentFolderShare?.token) return items;

    const notesByCandidateId = new Map<
      string,
      CandidateTypeWithConnection["shared_folder_notes"]
    >();
    for (const candidate of sharedFolderPageData?.items ?? []) {
      const candidateId = String(candidate?.id ?? "").trim();
      if (!candidateId) continue;
      notesByCandidateId.set(
        candidateId,
        Array.isArray(candidate?.shared_folder_notes)
          ? candidate.shared_folder_notes
          : []
      );
    }

    return items.map((item) => ({
      ...item,
      shared_folder_notes: notesByCandidateId.get(String(item.id ?? "")) ?? [],
    }));
  }, [currentFolderShare?.token, items, sharedFolderPageData?.items]);

  const handleConfirmDeleteFolder = async () => {
    if (!folderToDelete || !userId) return;

    try {
      const deletingId = Number(folderToDelete.id);
      const deletingName = folderToDelete.name;

      await deleteFolder({ userId, folderId: deletingId });
      setFolderToDelete(null);

      if (mode === "folder" && selectedFolderId === deletingId) {
        updateListQuery(
          {
            folderId: undefined,
            folderPage: "1",
          },
          { replace: true }
        );
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
    updateListQuery({
      mode: "folder",
      folderId: String(folderId),
      folderPage: "1",
    });
  };

  const changePageSize = (nextPageSize: PageSizeOption) => {
    if (nextPageSize === pageSize) return;
    updateListQuery({
      pageSize: String(nextPageSize),
      folderPage: "1",
      requestedPage: "1",
    });
  };

  const handleCreateFolderShare = async () => {
    if (
      !userId ||
      mode !== "folder" ||
      currentFolderId == null ||
      currentFolderId < 0
    ) {
      return;
    }

    try {
      const result = await createFolderShare({
        userId,
        folderId: Number(currentFolderId),
      });
      await copyToClipboard(result.url);
      showToast({
        message: currentFolderShare
          ? "공유 링크를 다시 복사했습니다."
          : "폴더 공유 링크를 만들고 복사했습니다.",
        variant: "white",
      });
    } catch (error: any) {
      showToast({
        message: String(
          error?.message ?? "폴더 공유 링크 생성에 실패했습니다."
        ),
        variant: "white",
      });
    }
  };

  const handleRevokeFolderShare = async () => {
    if (
      !userId ||
      mode !== "folder" ||
      currentFolderId == null ||
      currentFolderId < 0
    ) {
      return;
    }

    try {
      await revokeFolderShare({
        userId,
        folderId: Number(currentFolderId),
      });
      showToast({
        message: "폴더 공유를 중단했습니다.",
        variant: "white",
      });
    } catch (error: any) {
      showToast({
        message: String(error?.message ?? "폴더 공유 중단에 실패했습니다."),
        variant: "white",
      });
    }
  };

  if (isInitialFolderLoading) {
    return (
      <div className="px-4">
        <Loading className="text-hgray600" />
      </div>
    );
  }

  if (error) return <div>Error</div>;

  const Pagination = ({
    variant = "toolbar",
  }: {
    variant?: "toolbar" | "footer";
  }) => {
    const isToolbar = variant === "toolbar";

    return (
      <div
        className={`flex items-center justify-start gap-3 ${isToolbar ? "" : "px-4"}`}
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
              updateListQuery({
                [mode === "requested" ? "requestedPage" : "folderPage"]: String(
                  Math.max(1, pageIdx)
                ),
              })
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
              updateListQuery({
                [mode === "requested" ? "requestedPage" : "folderPage"]: String(
                  pageIdx + 2
                ),
              });
            }}
            disabled={!hasNext || isFetching}
          >
            <ChevronRight size={16} className="text-white" />
          </button>
          {isFetching && <span className="ml-2 text-hgray500">Syncing…</span>}
        </div>

        {isToolbar && (
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
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                  updateListQuery({
                    mode: "requested",
                    requestedPage: "1",
                  });
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
                    isShared={activeShareByFolderId.has(fid)}
                    onSelect={() => selectFolderTab(fid)}
                    onRename={setFolderToRename}
                    onDelete={setFolderToDelete}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex mt-2 px-4 w-full items-center justify-end">
        {mode === "folder" && selectedFolderId !== -1 ? (
          <ActionDropdown
            align="end"
            contentClassName="min-w-[180px]"
            trigger={
              <button
                type="button"
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
                  currentFolderShare
                    ? "border-white/35 bg-white text-black hover:bg-white/90"
                    : "border-white/10 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                <ForwardIcon className="h-5 w-5" />
                <span>{currentFolderShare ? "공유 중" : "공유"}</span>
              </button>
            }
          >
            <ActionDropdownItem
              disabled={isCreatingFolderShare || isRevokingFolderShare}
              onSelect={() => {
                void handleCreateFolderShare();
              }}
              className="flex items-center gap-2"
            >
              {currentFolderShare ? (
                <Copy className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )}

              <span>
                {currentFolderShare ? "링크 다시 복사" : "공유 링크 만들기"}
              </span>
            </ActionDropdownItem>
            {currentFolderShare ? (
              <ActionDropdownItem
                tone="danger"
                disabled={isRevokingFolderShare}
                onSelect={() => {
                  void handleRevokeFolderShare();
                }}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>공유 중단</span>
              </ActionDropdownItem>
            ) : null}
          </ActionDropdown>
        ) : null}
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
          <CandidateViews
            items={itemsWithSharedNotes}
            userId={userId}
            isMyList={true}
            showShortlistMemo={true}
            criterias={[]}
            showBookmarkAction={true}
            showMarkAction={true}
            sharedFolderContext={
              currentFolderShare?.token
                ? {
                    token: currentFolderShare.token,
                    viewer: ownerSharedFolderViewer,
                  }
                : null
            }
            toolbarLeftContent={<Pagination variant="toolbar" />}
          />

          {viewType === "card" && (
            <div className="relative mb-24 w-full items-center justify-center flex">
              <Pagination variant="footer" />
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
