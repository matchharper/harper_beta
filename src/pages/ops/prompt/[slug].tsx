import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  usePromptDetail,
  usePromptSaveDraft,
  usePromptPublish,
  usePromptRollback,
  useTestFlags,
  useToggleTestFlag,
} from "@/hooks/usePromptAdmin";
import { useRouter } from "next/router";
import Head from "next/head";
import { useState, useEffect, useMemo, useCallback } from "react";
import { ArrowLeft, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

/** Client-side section extraction (no fs dependency) */
function extractSectionNames(content: string): string[] {
  return content
    .split(/^## /m)
    .slice(1)
    .map((s) => s.split("\n")[0].trim());
}

export default function OpsPromptEditorPage() {
  const router = useRouter();
  const slug = router.query.slug as string;

  const { data, isLoading } = usePromptDetail(slug);
  const saveDraft = usePromptSaveDraft();
  const publish = usePromptPublish();
  const rollback = usePromptRollback();
  const { data: testFlags } = useTestFlags();
  const toggleFlag = useToggleTestFlag();

  const [editorContent, setEditorContent] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const template = data?.data;
  const versions = data?.versions ?? [];
  const isTestActive = (testFlags ?? []).includes(slug);

  // Initialize editor content from API data
  useEffect(() => {
    if (template && !initialized) {
      setEditorContent(template.draft_content ?? template.content);
      setInitialized(true);
    }
  }, [template, initialized]);

  // Reset on slug change
  useEffect(() => {
    setInitialized(false);
    setPreviewVersion(null);
    setShowVersions(false);
  }, [slug]);

  // Dirty detection
  const isDirty = useMemo(() => {
    if (!template) return false;
    const original = template.draft_content ?? template.content;
    return editorContent !== original;
  }, [editorContent, template]);

  // Section validation
  const sectionStatus = useMemo(() => {
    if (!template) return [];
    const found = extractSectionNames(editorContent);
    return (template.required_sections ?? []).map((section: string) => ({
      name: section,
      present: found.some((f) => f.startsWith(section)),
    }));
  }, [editorContent, template]);

  const hasValidationErrors = sectionStatus.some((s) => !s.present);

  const showNotice = useCallback(
    (type: "success" | "error", text: string) => {
      setNotice({ type, text });
      setTimeout(() => setNotice(null), 4000);
    },
    []
  );

  // --- Handlers ---

  const handleSaveDraft = async () => {
    saveDraft.mutate(
      { slug, draftContent: editorContent },
      {
        onSuccess: () => showNotice("success", "Draft 저장 완료"),
        onError: (err) => showNotice("error", (err as Error).message),
      }
    );
  };

  const handlePublish = () => {
    if (!window.confirm("이 draft를 프로덕션에 배포하시겠습니까?")) return;
    publish.mutate(slug, {
      onSuccess: (res: any) =>
        showNotice("success", `v${res.version} 배포 완료`),
      onError: (err) => showNotice("error", (err as Error).message),
    });
  };

  const handleRollback = (versionNumber: number) => {
    if (
      !window.confirm(
        `v${versionNumber} 내용으로 새 draft를 생성하시겠습니까?`
      )
    )
      return;
    rollback.mutate(
      { slug, versionNumber },
      {
        onSuccess: () => {
          showNotice("success", `v${versionNumber} → draft 생성 완료`);
          setInitialized(false); // re-load from API
        },
        onError: (err) => showNotice("error", (err as Error).message),
      }
    );
  };

  const handleTestToggle = () => {
    toggleFlag.mutate(
      { slug, enabled: !isTestActive },
      {
        onSuccess: () =>
          showNotice(
            "success",
            isTestActive ? "테스트 모드 종료" : "테스트 모드 시작 — /career/chat에서 draft 적용"
          ),
        onError: (err) => showNotice("error", (err as Error).message),
      }
    );
  };

  if (!slug) return null;

  return (
    <>
      <Head>
        <title>{template?.name ?? slug} — Prompts — Harper Ops</title>
      </Head>

      <OpsShell
        compactHeader
        title={template?.name ?? slug}
        actions={
          <Link
            href="/ops/prompt"
            className={cx(
              opsTheme.buttonSecondary,
              "h-9 gap-1.5 text-beige900"
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            목록
          </Link>
        }
      >
        {isLoading ? (
          <div className="px-4 font-geist text-sm text-beige900/60">
            로딩 중...
          </div>
        ) : !template ? (
          <div className="px-4 font-geist text-sm text-beige900/60">
            프롬프트를 찾을 수 없습니다.
          </div>
        ) : (
          <div className="space-y-4 px-4">
            {/* Notice */}
            {notice && (
              <div
                className={
                  notice.type === "success"
                    ? opsTheme.successNotice
                    : opsTheme.errorNotice
                }
              >
                {notice.text}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={!isDirty || hasValidationErrors || saveDraft.isPending}
                className={cx(opsTheme.buttonPrimary, "h-9")}
              >
                {saveDraft.isPending ? "저장 중..." : "Draft 저장"}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={!template.draft_content || publish.isPending}
                className={cx(opsTheme.buttonSecondary, "h-9 text-beige900")}
              >
                {publish.isPending ? "배포 중..." : "Publish"}
              </button>
              <button
                type="button"
                onClick={handleTestToggle}
                disabled={toggleFlag.isPending}
                className={cx(
                  isTestActive
                    ? "inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 px-4 font-geist text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                    : cx(opsTheme.buttonSecondary, "text-beige900"),
                  "h-9"
                )}
              >
                {isTestActive ? "테스트 종료" : "Draft 테스트 시작"}
              </button>

              {isDirty && (
                <span className="font-geist text-xs text-amber-600">
                  저장하지 않은 변경사항
                </span>
              )}
              {template.draft_content && !isDirty && (
                <span className="font-geist text-xs text-beige900/45">
                  Draft 있음 (Publish 대기)
                </span>
              )}
            </div>

            {/* Main layout: editor + sidebar */}
            <div className="flex flex-col gap-4 lg:flex-row">
              {/* Editor */}
              <div className="min-w-0 flex-1">
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  spellCheck={false}
                  className={cx(
                    opsTheme.textarea,
                    "min-h-[600px] font-mono text-[13px] leading-[1.6]"
                  )}
                />
              </div>

              {/* Sidebar */}
              <div className="w-full space-y-4 lg:w-80">
                {/* Section Validation */}
                <div className={cx(opsTheme.panel, "p-4")}>
                  <div className={opsTheme.eyebrow}>섹션 검증</div>
                  <div className="mt-3 space-y-1.5">
                    {sectionStatus.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center gap-2 font-geist text-sm"
                      >
                        {s.present ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span
                          className={
                            s.present ? "text-beige900/70" : "text-red-600"
                          }
                        >
                          {s.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Info */}
                <div className={cx(opsTheme.panel, "p-4")}>
                  <div className={opsTheme.eyebrow}>정보</div>
                  <div className="mt-3 space-y-2 font-geist text-sm text-beige900/65">
                    <div>
                      <span className="font-medium text-beige900">Slug:</span>{" "}
                      {template.slug}
                    </div>
                    <div>
                      <span className="font-medium text-beige900">
                        Published:
                      </span>{" "}
                      {template.published_at
                        ? new Date(template.published_at).toLocaleString(
                            "ko-KR"
                          )
                        : "—"}
                    </div>
                    <div>
                      <span className="font-medium text-beige900">
                        Updated:
                      </span>{" "}
                      {new Date(template.updated_at).toLocaleString("ko-KR")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Version History */}
            <div className={cx(opsTheme.panel, "p-4")}>
              <button
                type="button"
                onClick={() => setShowVersions(!showVersions)}
                className="flex w-full items-center justify-between"
              >
                <div className={opsTheme.eyebrow}>
                  버전 이력 ({versions.length})
                </div>
                {showVersions ? (
                  <ChevronUp className="h-4 w-4 text-beige900/45" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-beige900/45" />
                )}
              </button>

              {showVersions && (
                <div className="mt-4 space-y-3">
                  {versions.length === 0 ? (
                    <div className="font-geist text-sm text-beige900/45">
                      아직 publish된 버전이 없습니다.
                    </div>
                  ) : (
                    versions.map((v) => (
                      <div
                        key={v.id}
                        className={cx(
                          opsTheme.panelSoft,
                          "px-4 py-3"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-geist text-sm font-medium text-beige900">
                              v{v.version_number}
                            </span>
                            <span className="ml-2 font-geist text-xs text-beige900/45">
                              {new Date(v.published_at).toLocaleString("ko-KR")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewVersion(
                                  previewVersion === v.version_number
                                    ? null
                                    : v.version_number
                                )
                              }
                              className="font-geist text-xs text-beige900/60 underline decoration-beige900/20 underline-offset-2 hover:text-beige900"
                            >
                              {previewVersion === v.version_number
                                ? "닫기"
                                : "미리보기"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRollback(v.version_number)}
                              disabled={rollback.isPending}
                              className="font-geist text-xs font-medium text-beige900 underline decoration-beige900/20 underline-offset-2 hover:decoration-beige900/50"
                            >
                              롤백
                            </button>
                          </div>
                        </div>

                        {previewVersion === v.version_number && (
                          <pre className="mt-3 max-h-[300px] overflow-auto rounded-md bg-white/60 p-3 font-mono text-[12px] leading-[1.5] text-beige900/80">
                            {v.content}
                          </pre>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </OpsShell>
    </>
  );
}
