import React, { useEffect, useMemo, useRef, useState } from "react";
import { showToast } from "../toast/toast";
import { Bookmark, Check, FolderPlus } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  useAddCandidateToBookmarkFolder,
  useBookmarkFolders,
  useCandidateBookmarkFolderIds,
  useClearCandidateBookmarks,
  useCreateBookmarkFolder,
  useRemoveCandidateFromBookmarkFolder,
} from "@/hooks/useBookmarkFolders";

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
  const [open, setOpen] = useState(false);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data: folders = [], isLoading: isFoldersLoading } =
    useBookmarkFolders(userId, open);
  const { data: selectedFolderIds = [], isLoading: isSelectedFoldersLoading } =
    useCandidateBookmarkFolderIds(userId, candidId, open);

  const { mutateAsync: createFolder, isPending: isCreatingFolder } =
    useCreateBookmarkFolder();
  const { mutateAsync: addToFolder, isPending: isAddingToFolder } =
    useAddCandidateToBookmarkFolder();
  const { mutateAsync: removeFromFolder, isPending: isRemovingFromFolder } =
    useRemoveCandidateFromBookmarkFolder();
  const { mutateAsync: clearAllBookmarks, isPending: isClearingBookmarks } =
    useClearCandidateBookmarks();

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
    isCreatingFolder ||
    isAddingToFolder ||
    isRemovingFromFolder ||
    isClearingBookmarks;

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

  const handleClearAllBookmarks = async () => {
    try {
      await clearAllBookmarks({ userId, candidId });
      showToast({ message: "북마크에서 제거되었습니다.", variant: "white" });
    } catch (error: any) {
      showToast({
        message: String(error?.message ?? "북마크 제거에 실패했습니다."),
        variant: "white",
      });
    }
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setIsAddingFolder(false);
          setNewFolderName("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          className={`cursor-pointer text-sm rounded-xl text-white flex flex-row items-center gap-2 ${
            size === "sm"
              ? "h-7 px-1.5 text-xs bg-hgray500/20 hover:bg-hgray500/30"
              : size === "lg"
                ? "h-12 px-6 text-lg bg-white/10 hover:bg-white/5"
                : "h-8 px-3 text-sm bg-white/0 hover:bg-white/5"
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
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[260px] bg-[#36363A]/90 backdrop-blur-md border-none text-white p-1 rounded-[10px]"
      >
        {/* <DropdownMenuLabel className="text-xs text-hgray700 font-normal">
          북마크 폴더
        </DropdownMenuLabel> 
        <DropdownMenuSeparator className="bg-white/10" />*/}

        {(isFoldersLoading || isSelectedFoldersLoading) && (
          <div className="px-2 py-2 text-xs text-hgray700">불러오는 중...</div>
        )}

        {!isFoldersLoading &&
          !isSelectedFoldersLoading &&
          folders.length === 0 && (
            <div className="px-2 py-2 text-xs text-hgray700">
              폴더가 없습니다. 새 폴더를 만들어주세요.
            </div>
          )}

        {!isFoldersLoading &&
          !isSelectedFoldersLoading &&
          folders.map((folder) => {
            const isChecked = selectedFolderIdSet.has(Number(folder.id));
            return (
              <DropdownMenuItem
                key={folder.id}
                disabled={isMutating}
                onSelect={(e) => {
                  e.preventDefault();
                  void handleToggleFolder(Number(folder.id), !isChecked);
                }}
                className="cursor-pointer text-sm text-hgray900 py-2 rounded-[10px] mt-0.5"
              >
                <div className="w-full flex items-center justify-between gap-2 relative">
                  <span className="line-clamp-2">{folder.name}</span>
                  {isChecked && (
                    <Check className="w-3.5 h-3.5 text-accenta1 absolute right-2" />
                  )}
                </div>
              </DropdownMenuItem>
            );
          })}

        <DropdownMenuSeparator className="bg-white/10" />

        {!isAddingFolder && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setIsAddingFolder(true);
            }}
            className="cursor-pointer text-sm text-hgray900 py-3 px-4 rounded-[10px]"
          >
            <FolderPlus className="w-4 h-4 mr-1" />
            Add folder
          </DropdownMenuItem>
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
              className="w-full h-8 rounded-md bg-white/5 border border-white/10 px-2 text-xs text-white outline-none focus:border-white/30"
            />
            <div className="mt-2 flex items-center justify-end gap-1">
              <button
                type="button"
                className="h-7 px-2 rounded text-xs text-hgray700 hover:bg-white/5"
                onClick={() => {
                  setIsAddingFolder(false);
                  setNewFolderName("");
                }}
              >
                취소
              </button>
              <button
                type="button"
                className="h-7 px-2 rounded text-xs text-black bg-accenta1 disabled:opacity-70"
                onClick={() => void handleCreateFolder()}
                disabled={isCreatingFolder || isAddingToFolder}
              >
                생성 후 저장
              </button>
            </div>
          </div>
        )}

        {/* {isBookmarkedInUi && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              disabled={isMutating}
              onSelect={(e) => {
                e.preventDefault();
                void handleClearAllBookmarks();
              }}
              className="cursor-pointer text-sm text-red-400 focus:bg-red-400/15"
            >
              북마크 전체 제거
            </DropdownMenuItem>
          </>
        )} */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default React.memo(Bookmarkbutton);
