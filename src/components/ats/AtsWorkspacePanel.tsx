import React from "react";
import { Check, ChevronDown, Loader2, Target } from "lucide-react";
import type { AtsBookmarkFolderOption, AtsWorkspaceRecord } from "@/lib/ats/shared";

type AtsWorkspacePanelProps = {
  atsFolders: AtsBookmarkFolderOption[];
  buttonPrimaryClassName: string;
  currentAtsFolder: AtsBookmarkFolderOption | null;
  inputClassName: string;
  onChangeWorkspaceFolder: (nextFolderId: number | null) => void | Promise<void>;
  onSaveWorkspace: () => void | Promise<void>;
  onToggleOpen: () => void;
  panelClassName: string;
  saveWorkspacePending: boolean;
  setWorkspaceDraft: React.Dispatch<React.SetStateAction<AtsWorkspaceRecord>>;
  textareaClassName: string;
  workspaceDraft: AtsWorkspaceRecord;
  workspaceOpen: boolean;
};

export default function AtsWorkspacePanel({
  atsFolders,
  buttonPrimaryClassName,
  currentAtsFolder,
  inputClassName,
  onChangeWorkspaceFolder,
  onSaveWorkspace,
  onToggleOpen,
  panelClassName,
  saveWorkspacePending,
  setWorkspaceDraft,
  textareaClassName,
  workspaceDraft,
  workspaceOpen,
}: AtsWorkspacePanelProps) {
  return (
    <div className={`${panelClassName} overflow-hidden`}>
      <div className="flex flex-col px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-beige500/55 p-2 text-beige900">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <div className="text-lg font-medium text-beige900">ATS Workspace</div>
            <div className="mt-1 text-xs text-beige900/45">
              대상 폴더: {currentAtsFolder?.name ?? "폴더 없음"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={workspaceOpen}
            className={buttonPrimaryClassName}
          >
            <ChevronDown
              className={`h-4 w-4 transition ${workspaceOpen ? "rotate-0" : "-rotate-90"}`}
            />
            {workspaceOpen ? "접기" : "펼치기"}
          </button>
          <button
            type="button"
            onClick={() => void onSaveWorkspace()}
            disabled={saveWorkspacePending}
            className={buttonPrimaryClassName}
          >
            {saveWorkspacePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save Workspace
          </button>
        </div>
      </div>

      {workspaceOpen && (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="space-y-3">
            <div>
              <div className="mb-2 text-sm font-medium text-beige900">
                ATS Folder
              </div>
              {atsFolders.length === 0 ? (
                <div className="rounded-md border border-dashed border-beige900/8 px-3 py-3 text-sm text-beige900/45">
                  선택 가능한 북마크 폴더가 없습니다.
                </div>
              ) : (
                <select
                  value={currentAtsFolder?.id ?? ""}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    void onChangeWorkspaceFolder(
                      Number.isFinite(raw) && raw > 0 ? raw : null
                    );
                  }}
                  disabled={saveWorkspacePending}
                  className={inputClassName}
                >
                  {atsFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                      {folder.isDefault ? " (Default)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <div className="mt-2 text-xs text-beige900/45">
                ATS 후보 목록은 여기서 선택한 북마크 폴더를 기준으로 불러옵니다.
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-beige900">
                Sender Email
              </div>
              <input
                type="email"
                value={workspaceDraft.senderEmail ?? ""}
                onChange={(event) =>
                  setWorkspaceDraft((prev) => ({
                    ...prev,
                    senderEmail: event.target.value,
                  }))
                }
                placeholder="you@company.com"
                className={inputClassName}
              />
              <div className="mt-2 text-xs text-beige900/45">
                ATS 수동 메일과 시퀀스 발신 주소로 사용됩니다.
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-beige900">JD</div>
              <textarea
                value={workspaceDraft.jobDescription ?? ""}
                onChange={(event) =>
                  setWorkspaceDraft((prev) => ({
                    ...prev,
                    jobDescription: event.target.value,
                  }))
                }
                rows={8}
                placeholder="이 포지션의 JD를 넣어주세요. 이메일 시퀀스와 개인화 문구 생성에 사용됩니다."
                disabled={saveWorkspacePending}
                className={textareaClassName}
              />
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-beige900">
                Company Pitch
              </div>
              <textarea
                value={workspaceDraft.companyPitch ?? ""}
                onChange={(event) =>
                  setWorkspaceDraft((prev) => ({
                    ...prev,
                    companyPitch: event.target.value,
                  }))
                }
                rows={3}
                placeholder="후보자에게 전달할 회사/팀 소개 문구"
                disabled={saveWorkspacePending}
                className={textareaClassName}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
