import React from "react";
import type {
  AdminBookmarkFolder,
  AdminBookmarkFolderItem,
  AdminBookmarkUser,
} from "@/components/admin/types";
import { formatKST } from "@/components/admin/utils";
import { Loading } from "@/components/ui/loading";

type AdminBookmarkFoldersTabProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void | Promise<void>;
  users: AdminBookmarkUser[];
  usersLoading: boolean;
  usersError: string | null;
  selectedUser: AdminBookmarkUser | null;
  onSelectUser: (user: AdminBookmarkUser) => void | Promise<void>;
  folders: AdminBookmarkFolder[];
  foldersLoading: boolean;
  foldersError: string | null;
  selectedFolderId: number | null;
  selectedFolder: AdminBookmarkFolder | null;
  onSelectFolder: (folder: AdminBookmarkFolder) => void | Promise<void>;
  items: AdminBookmarkFolderItem[];
  itemsLoading: boolean;
  itemsError: string | null;
  itemTotal: number;
  itemLimit: number;
};

export default function AdminBookmarkFoldersTab({
  search,
  onSearchChange,
  onSearchSubmit,
  users,
  usersLoading,
  usersError,
  selectedUser,
  onSelectUser,
  folders,
  foldersLoading,
  foldersError,
  selectedFolderId,
  selectedFolder,
  onSelectFolder,
  items,
  itemsLoading,
  itemsError,
  itemTotal,
  itemLimit,
}: AdminBookmarkFoldersTabProps) {
  return (
    <>
      <div className="mb-4 rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4 text-[#4d3a24]">
        <div className="text-[14px] font-semibold">User lookup</div>
        <div className="mt-1 text-[12px] leading-5 text-[#7a664b]">
          이름이나 이메일로 유저를 찾고, 해당 유저의 북마크 폴더와 저장된 후보를
          확인합니다.
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onSearchSubmit();
              }
            }}
            placeholder="이름 또는 이메일"
            className="h-11 flex-1 rounded-[14px] border border-[#d8c7aa] bg-[#fffaf1] px-4 text-[14px] text-[#3f301f] outline-none placeholder:text-[#9e8b6d]"
          />
          <button
            onClick={() => {
              void onSearchSubmit();
            }}
            className="h-11 rounded-[14px] border border-[#5d4931] bg-[#5d4931] px-4 text-[13px] text-[#fff8ef] transition-colors hover:bg-[#4f3e29]"
          >
            Search
          </button>
        </div>
        {usersError ? (
          <div className="mt-3 text-[12px] text-[#8d3a24]">{usersError}</div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_280px_minmax(0,1fr)]">
        <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[#4d3a24]">
                Users
              </div>
              <div className="mt-1 text-[12px] text-[#7a664b]">{users.length}명</div>
            </div>
            {usersLoading ? (
              <Loading
                size="sm"
                inline={true}
                className="text-[12px] text-[#7a664b]"
              />
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            {users.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-6 text-center text-[12px] leading-5 text-[#8d7a5d]">
                {search.trim()
                  ? "일치하는 유저가 없습니다."
                  : "이름이나 이메일을 입력해 유저를 찾아보세요."}
              </div>
            ) : (
              users.map((user) => {
                const isSelected = selectedUser?.userId === user.userId;

                return (
                  <button
                    key={user.userId}
                    type="button"
                    onClick={() => {
                      void onSelectUser(user);
                    }}
                    className={`w-full rounded-[16px] border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-[#8e7554] bg-[#efe1c8]"
                        : "border-[#dcccad] bg-[#fffaf1] hover:bg-[#f4eadb]"
                    }`}
                  >
                    <div className="text-[13px] font-semibold text-[#3f301f]">
                      {user.name || "(이름 없음)"}
                    </div>
                    <div className="mt-1 break-all text-[12px] text-[#7a664b]">
                      {user.email || "-"}
                    </div>
                    <div className="mt-2 text-[11px] text-[#8d7a5d]">
                      폴더 {user.folderCount} · 북마크 {user.bookmarkCount}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[#4d3a24]">
                Folders
              </div>
              <div className="mt-1 text-[12px] text-[#7a664b]">
                {selectedUser
                  ? `${selectedUser.name || selectedUser.email || "선택된 유저"}`
                  : "유저를 먼저 선택하세요"}
              </div>
            </div>
            {foldersLoading ? (
              <Loading
                size="sm"
                inline={true}
                className="text-[12px] text-[#7a664b]"
              />
            ) : null}
          </div>

          {selectedUser ? (
            <div className="mt-3 rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-3 py-3 text-[12px] leading-5 text-[#6a563c]">
              <div>{selectedUser.email || "-"}</div>
              <div>{selectedUser.company || "회사 정보 없음"}</div>
            </div>
          ) : null}

          {foldersError ? (
            <div className="mt-3 text-[12px] text-[#8d3a24]">{foldersError}</div>
          ) : null}

          <div className="mt-4 space-y-2">
            {!selectedUser ? (
              <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-6 text-center text-[12px] leading-5 text-[#8d7a5d]">
                왼쪽에서 유저를 선택하면 폴더가 표시됩니다.
              </div>
            ) : folders.length === 0 && !foldersLoading ? (
              <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-6 text-center text-[12px] leading-5 text-[#8d7a5d]">
                북마크 폴더가 없습니다.
              </div>
            ) : (
              folders.map((folder) => {
                const isSelected = selectedFolderId === folder.id;

                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      void onSelectFolder(folder);
                    }}
                    className={`w-full rounded-[16px] border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-[#8e7554] bg-[#efe1c8]"
                        : "border-[#dcccad] bg-[#fffaf1] hover:bg-[#f4eadb]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-[#3f301f]">
                          {folder.name}
                        </div>
                        <div className="mt-1 text-[11px] text-[#8d7a5d]">
                          {folder.isDefault ? "기본 폴더" : "커스텀 폴더"}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-[#6a563c]">
                        {folder.itemCount}명
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[#4d3a24]">
                Candidates
              </div>
              <div className="mt-1 text-[12px] text-[#7a664b]">
                {selectedFolder
                  ? `${selectedFolder.name} · ${itemTotal}명`
                  : "폴더를 선택하면 후보 목록이 표시됩니다."}
              </div>
            </div>
            {itemsLoading ? (
              <Loading
                size="sm"
                inline={true}
                className="text-[12px] text-[#7a664b]"
              />
            ) : null}
          </div>

          {selectedFolder && itemTotal > itemLimit ? (
            <div className="mt-3 rounded-[14px] border border-[#dcccad] bg-[#fffaf1] px-3 py-2 text-[11px] text-[#7a664b]">
              최근 {itemLimit}개만 표시합니다. 전체 저장 수는 {itemTotal}개입니다.
            </div>
          ) : null}

          {itemsError ? (
            <div className="mt-3 text-[12px] text-[#8d3a24]">{itemsError}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            {!selectedFolder ? (
              <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-8 text-center text-[12px] leading-5 text-[#8d7a5d]">
                가운데에서 폴더를 선택하세요.
              </div>
            ) : items.length === 0 && !itemsLoading ? (
              <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-8 text-center text-[12px] leading-5 text-[#8d7a5d]">
                저장된 후보가 없습니다.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={`${item.folderItemId}-${item.candidId}`}
                  className="rounded-[18px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-[#3f301f]">
                        {item.name || "(이름 없음)"}
                      </div>
                      <div className="mt-1 text-[13px] leading-6 text-[#6a563c]">
                        {item.headline || "headline 없음"}
                      </div>
                      <div className="mt-2 text-[11px] text-[#8d7a5d]">
                        저장일 {formatKST(item.createdAt ?? undefined)}
                        {item.memoUpdatedAt
                          ? ` · 메모 수정 ${formatKST(item.memoUpdatedAt)}`
                          : ""}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={item.profileHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center rounded-[12px] border border-[#cfbb9a] bg-[#f4eadb] px-3 text-[12px] text-[#4d3a24] transition-colors hover:bg-[#eadcc7]"
                      >
                        Harper profile
                      </a>
                      {item.linkedinUrl ? (
                        <a
                          href={item.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center rounded-[12px] border border-[#e0d0b6] bg-transparent px-3 text-[12px] text-[#6a563c] transition-colors hover:bg-[#f4eadb]"
                        >
                          LinkedIn
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-[14px] border border-[#eadcc7] bg-[#f7efe2] px-3 py-3 text-[13px] leading-6 text-[#5b4932]">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                      Memo
                    </div>
                    <div className="whitespace-pre-wrap break-words">
                      {item.memo || "유저가 남긴 메모 없음"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
