import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { showToast } from "../toast/toast";
import { Bookmark, Check, FolderPlus } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";
import {
  prefetchBookmarkFolders,
  prefetchCandidateBookmarkFolderIds,
  useAddCandidateToBookmarkFolder,
  useBookmarkFolders,
  useCandidateBookmarkFolderIds,
  useCreateBookmarkFolder,
  useRemoveCandidateFromBookmarkFolder,
} from "@/hooks/useBookmarkFolders";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "./action-dropdown";

const Bookmarkbutton = ({
  userId,
  candidId,
  connection,
  isText = true,
  size = "md",
}: {
  userId: string;
  candidId: string;
  connection?: { typed: number }[];
  isText?: boolean;
  size?: "sm" | "md" | "lg";
}) => {
  const { m } = useMessages();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data: folders = [], isLoading: isFoldersLoading } =
    useBookmarkFolders(userId);
  const { data: selectedFolderIds = [], isLoading: isSelectedFoldersLoading } =
    useCandidateBookmarkFolderIds(userId, candidId, open);

  const { mutateAsync: createFolder, isPending: isCreatingFolder } =
    useCreateBookmarkFolder();
  const { mutateAsync: addToFolder, isPending: isAddingToFolder } =
    useAddCandidateToBookmarkFolder();
  const { mutateAsync: removeFromFolder, isPending: isRemovingFromFolder } =
    useRemoveCandidateFromBookmarkFolder();

  useEffect(() => {
    if (!isAddingFolder) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isAddingFolder]);

  const isBookmarked = useMemo(() => {
    return (connection ?? []).some((con) => con.typed === 0);
  }, [connection]);

  const selectedFolderIdSet = useMemo(() => {
    return new Set((selectedFolderIds ?? []).map((id) => Number(id)));
  }, [selectedFolderIds]);

  const isBookmarkedInUi = useMemo(() => {
    if (selectedFolderIdSet.size > 0) return true;
    return isBookmarked;
  }, [selectedFolderIdSet, isBookmarked]);

  const isMutating =
    isCreatingFolder || isAddingToFolder || isRemovingFromFolder;
  const hasFolders = folders.length > 0;
  const showInitialLoading =
    (isFoldersLoading && !hasFolders) ||
    (open && isSelectedFoldersLoading && !hasFolders);

  const warmBookmarkMenu = () => {
    void prefetchBookmarkFolders(queryClient, userId);
    void prefetchCandidateBookmarkFolderIds(queryClient, userId, candidId);
  };

  const handleToggleFolder = async (folderId: number, nextChecked: boolean) => {
    try {
      if (nextChecked) {
        await addToFolder({ userId, candidId, folderId });
        showToast({
          message: "북마크 폴더에 추가되었습니다.",
          variant: "white",
        });
      } else {
        await removeFromFolder({ userId, candidId, folderId });
        showToast({
          message: "북마크 폴더에서 제거되었습니다.",
          variant: "white",
        });
      }
    } catch (error: any) {
      showToast({
        message: String(error?.message ?? "북마크 폴더 변경에 실패했습니다."),
        variant: "white",
      });
    }
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      showToast({ message: "폴더 이름을 입력해주세요.", variant: "white" });
      return;
    }

    try {
      const created = await createFolder({ userId, name: trimmed });
      await addToFolder({ userId, candidId, folderId: Number(created.id) });
      showToast({
        message: `폴더 "${created.name}"를 만들고 북마크를 저장했습니다.`,
        variant: "white",
      });
      setNewFolderName("");
      setIsAddingFolder(false);
    } catch (error: any) {
      const message =
        String(error?.code ?? "") === "23505"
          ? "같은 이름의 폴더가 이미 있습니다."
          : String(error?.message ?? "폴더 생성에 실패했습니다.");
      showToast({ message, variant: "white" });
    }
  };

  return (
    <ActionDropdown
      open={open}
      onOpenChange={(next) => {
        if (next) {
          warmBookmarkMenu();
        }
        setOpen(next);
        if (!next) {
          setIsAddingFolder(false);
          setNewFolderName("");
        }
      }}
      align="end"
      contentClassName="w-[260px]"
      trigger={
        <button
          onMouseEnter={warmBookmarkMenu}
          onFocus={warmBookmarkMenu}
          className={`cursor-pointer text-sm rounded-xl text-white flex flex-row items-center gap-2 ${
            size === "sm"
              ? "h-7 px-1.5 text-xs bg-hgray500/20 hover:bg-hgray500/30"
              : size === "lg"
                ? "h-12 px-6 text-lg bg-white/10 hover:bg-white/5"
                : "h-8 px-2 text-sm bg-white/0 hover:bg-white/5"
          }`}
        >
          {isBookmarkedInUi ? (
            <Bookmark className="w-4 h-4 text-white" fill="white" />
          ) : (
            <Bookmark className="w-4 h-4 text-white" />
          )}
          {isText && (
            <span>{isBookmarkedInUi ? m.data.saved : m.data.save}</span>
          )}
        </button>
      }
    >
      {showInitialLoading && (
        <div className="px-2 py-2 text-xs text-white/45">불러오는 중...</div>
      )}

      {!isFoldersLoading && !isSelectedFoldersLoading && folders.length === 0 && (
          <div className="px-2 py-2 text-xs text-white/45">
            폴더가 없습니다. 새 폴더를 만들어주세요.
          </div>
        )}

      {!isFoldersLoading &&
        folders.map((folder) => {
          const isChecked = selectedFolderIdSet.has(Number(folder.id));
          return (
            <ActionDropdownItem
              key={folder.id}
              disabled={isMutating || isSelectedFoldersLoading}
              keepOpen
              onSelect={() => {
                void handleToggleFolder(Number(folder.id), !isChecked);
              }}
              className="mt-0.5 py-2"
            >
              <div className="relative flex w-full items-center justify-between gap-2">
                <span className="line-clamp-2">{folder.name}</span>
                {isChecked && (
                  <Check className="absolute right-2 h-3.5 w-3.5 text-accenta1" />
                )}
              </div>
            </ActionDropdownItem>
          );
        })}

      <ActionDropdownSeparator />

      {!isAddingFolder && (
        <ActionDropdownItem
          keepOpen
          onSelect={() => {
            setIsAddingFolder(true);
          }}
          className="px-4 py-3"
        >
          <FolderPlus className="mr-1 h-4 w-4" />
          폴더 추가
        </ActionDropdownItem>
      )}

      {isAddingFolder && (
        <div className="px-2 py-1.5">
          <input
            ref={inputRef}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreateFolder();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setIsAddingFolder(false);
                setNewFolderName("");
              }
            }}
            placeholder="새 폴더 이름"
            className="h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/30"
          />
          <div className="mt-2 flex items-center justify-end gap-1">
            <button
              type="button"
              className="h-7 rounded px-2 text-xs text-white/45 hover:bg-white/5 hover:text-white"
              onClick={() => {
                setIsAddingFolder(false);
                setNewFolderName("");
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="h-7 rounded bg-accenta1 px-2 text-xs text-black disabled:opacity-70"
              onClick={() => void handleCreateFolder()}
              disabled={isCreatingFolder || isAddingToFolder}
            >
              생성 후 저장
            </button>
          </div>
        </div>
      )}
    </ActionDropdown>
  );
};

export default React.memo(Bookmarkbutton);
