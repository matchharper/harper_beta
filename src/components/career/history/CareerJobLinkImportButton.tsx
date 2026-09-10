import { CircleCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { CompactDropdown } from "@/components/ui/compact-dropdown";
import { Input } from "@/components/ui/input";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerHistoryContext } from "@/components/career/CareerSidebarContext";

const MAX_IMPORT_ITEMS = 20;

type ImportSavedStage = "applied" | "closed" | "connected" | "saved";

type ImportRow = {
  clientId: string;
  companyName: string;
  detailsRequired: boolean;
  error: string;
  roleId: string | null;
  savedStage: ImportSavedStage;
  status: "idle" | "success";
  title: string;
  url: string;
};

type ImportItemResponse = {
  clientId: string;
  code?: string;
  detailsRequired?: boolean;
  error?: string;
  ok?: boolean;
  roleId?: string;
};

type ImportResponse = {
  error?: string;
  results?: ImportItemResponse[];
};

function createImportRow(clientId: string, url = ""): ImportRow {
  return {
    clientId,
    companyName: "",
    detailsRequired: false,
    error: "",
    roleId: null,
    savedStage: "saved",
    status: "idle",
    title: "",
    url,
  };
}

function pastedJobUrls(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => /^https?:\/\//i.test(item))
    )
  );
}

export default function CareerJobLinkImportButton() {
  const t = useCareerT();
  const { locale } = useMessages();
  const router = useRouter();
  const { fetchWithAuth } = useCareerApi();
  const { onRefreshHistoryOpportunities } = useCareerHistoryContext();
  const nextRowId = useRef(2);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>(() => [
    createImportRow("job-link-1"),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");

  const stageOptions = useMemo(
    () =>
      [
        {
          label: t("career.history.job_link_import.stage_saved", "관심 있음"),
          value: "saved" as const,
        },
        {
          label: t("career.history.job_link_import.stage_applied", "지원함"),
          value: "applied" as const,
        },
        {
          label: t(
            "career.history.saved_opportunity_status.connected",
            "진행중"
          ),
          value: "connected" as const,
        },
        {
          label: t(
            "career.history.saved_opportunity_status.1jv953e",
            "진행 종료"
          ),
          value: "closed" as const,
        },
      ] satisfies Array<{ label: string; value: ImportSavedStage }>,
    [t]
  );

  const reset = useCallback(() => {
    nextRowId.current = 2;
    setRows([createImportRow("job-link-1")]);
    setRequestError("");
  }, []);

  const close = useCallback(() => {
    if (submitting) return;
    setOpen(false);
    reset();
  }, [reset, submitting]);

  const addRow = useCallback((url = "") => {
    const clientId = `job-link-${nextRowId.current}`;
    nextRowId.current += 1;
    setRows((current) => [...current, createImportRow(clientId, url)]);
    setRequestError("");
  }, []);

  const updateRow = useCallback(
    (clientId: string, updates: Partial<ImportRow>) => {
      setRows((current) =>
        current.map((row) =>
          row.clientId === clientId
            ? {
                ...row,
                ...updates,
                error: "",
                roleId: null,
                status: "idle",
              }
            : row
        )
      );
      setRequestError("");
    },
    []
  );

  const removeRow = useCallback((clientId: string) => {
    setRows((current) =>
      current.length === 1
        ? [createImportRow(current[0].clientId)]
        : current.filter((row) => row.clientId !== clientId)
    );
    setRequestError("");
  }, []);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>, clientId: string) => {
      const urls = pastedJobUrls(event.clipboardData.getData("text"));
      if (urls.length < 2) return;
      event.preventDefault();

      setRows((current) => {
        const index = current.findIndex((row) => row.clientId === clientId);
        if (index < 0) return current;
        const currentRow = current[index];
        const existingUrls = new Set(
          current.map((row) => row.url.trim()).filter(Boolean)
        );
        const uniqueUrls = urls.filter((url) => !existingUrls.has(url));
        if (uniqueUrls.length === 0) return current;

        const insertedRows = uniqueUrls.map((url, urlIndex) => {
          if (urlIndex === 0 && !currentRow.url.trim()) {
            return {
              ...createImportRow(currentRow.clientId, url),
              savedStage: currentRow.savedStage,
            };
          }
          const nextClientId = `job-link-${nextRowId.current}`;
          nextRowId.current += 1;
          return {
            ...createImportRow(nextClientId, url),
            savedStage: currentRow.savedStage,
          };
        });
        const shouldReplaceCurrent = !currentRow.url.trim();
        return [
          ...current.slice(0, index),
          ...(shouldReplaceCurrent
            ? insertedRows
            : [currentRow, ...insertedRows]),
          ...current.slice(index + 1),
        ];
      });
      setRequestError("");
    },
    []
  );

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      const pendingRows = rows.filter((row) => row.status !== "success");
      if (pendingRows.length === 0 || rows.length > MAX_IMPORT_ITEMS) return;

      setSubmitting(true);
      setRequestError("");

      try {
        const response = await fetchWithAuth(
          "/api/talent/opportunities/import-url",
          {
            method: "POST",
            body: JSON.stringify({
              items: pendingRows.map((row) => ({
                clientId: row.clientId,
                companyName: row.detailsRequired ? row.companyName : undefined,
                savedStage: row.savedStage,
                title: row.detailsRequired ? row.title : undefined,
                url: row.url,
              })),
              locale,
            }),
          }
        );
        const payload = (await response
          .json()
          .catch(() => ({}))) as ImportResponse;
        if (!response.ok || !Array.isArray(payload.results)) {
          throw new Error(
            payload.error ||
              t(
                "career.history.job_link_import.failed",
                "공고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
              )
          );
        }

        const resultByClientId = new Map(
          payload.results.map((result) => [result.clientId, result])
        );
        const successfulResults = payload.results.filter(
          (result) => result.ok && result.roleId
        );
        setRows((current) =>
          current.map((row) => {
            const result = resultByClientId.get(row.clientId);
            if (!result) return row;
            if (result.ok && result.roleId) {
              return {
                ...row,
                detailsRequired: false,
                error: "",
                roleId: result.roleId,
                status: "success",
              };
            }
            return {
              ...row,
              detailsRequired:
                result.detailsRequired === true || row.detailsRequired,
              error: result.error ?? "",
              roleId: null,
              status: "idle",
            };
          })
        );

        if (successfulResults.length > 0) {
          await onRefreshHistoryOpportunities();
        }
        if (payload.results.every((result) => result.ok === true)) {
          const firstRoleId = successfulResults[0]?.roleId;
          setOpen(false);
          reset();
          const query: Record<string, string | string[] | undefined> = {
            ...router.query,
            historyTab: "saved",
            savedStage: "all",
            id: firstRoleId,
          };
          delete query.tab;
          await router.push(
            {
              pathname:
                router.pathname === "/career/preview"
                  ? "/career/preview"
                  : "/career/history",
              query,
            },
            undefined,
            { shallow: true, scroll: false }
          );
        }
      } catch (submitError) {
        setRequestError(
          submitError instanceof Error
            ? submitError.message
            : t(
                "career.history.job_link_import.failed",
                "공고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
              )
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      fetchWithAuth,
      locale,
      onRefreshHistoryOpportunities,
      reset,
      router,
      rows,
      submitting,
      t,
    ]
  );

  const buttonLabel = t(
    "career.history.job_link_import.button",
    "공고 링크 추가"
  );
  const hasIncompleteRow = rows.some(
    (row) =>
      row.status !== "success" &&
      (!row.url.trim() ||
        (row.detailsRequired && (!row.companyName.trim() || !row.title.trim())))
  );
  const batchLimitExceeded = rows.length > MAX_IMPORT_ITEMS;
  const remainingCount = rows.filter((row) => row.status !== "success").length;

  return (
    <>
      <MuteButton
        type="button"
        size="sm"
        variant="default"
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
      </MuteButton>

      <TalentCareerModal
        open={open}
        onClose={close}
        closeOnBackdrop={!submitting}
        mobileBottomSheet
        panelClassName="flex max-h-[calc(100dvh-3rem)] flex-col"
        bodyClassName="min-h-0 overflow-y-auto"
        headerClassName="shrink-0"
        footerClassName="shrink-0"
        title={t(
          "career.history.job_link_import.title",
          "지원할 공고 저장하기"
        )}
        description={t(
          "career.history.job_link_import.description",
          "임의로 관심 공고를 추가할 수 있습니다. 여러 개를 한 번에 저장할 수 있습니다."
        )}
        footer={
          <div className="flex items-center justify-end gap-2">
            <MuteButton
              type="button"
              variant="default"
              onClick={close}
              disabled={submitting}
            >
              {t("career.history.job_link_import.cancel", "취소")}
            </MuteButton>
            <MuteButton
              type="submit"
              form="career-job-link-import-form"
              variant="dark"
              disabled={
                submitting ||
                remainingCount === 0 ||
                hasIncompleteRow ||
                batchLimitExceeded
              }
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting
                ? t("career.history.job_link_import.submitting", "저장 중")
                : t("career.history.job_link_import.submit", "전체 저장")}
            </MuteButton>
          </div>
        }
      >
        <form
          id="career-job-link-import-form"
          className="space-y-4 px-4 py-5 sm:px-5"
          onSubmit={submit}
        >
          <div className="space-y-3">
            {rows.map((row, index) => {
              const urlInputId = `career-job-link-import-url-${row.clientId}`;
              const companyInputId = `career-job-link-import-company-${row.clientId}`;
              const titleInputId = `career-job-link-import-title-${row.clientId}`;
              return (
                <section key={row.clientId} className="space-y-3 pt-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end">
                    <Input
                      id={urlInputId}
                      type="url"
                      autoFocus={index === 0}
                      autoComplete="url"
                      inputMode="url"
                      placeholder={t(
                        "career.history.job_link_import.url_placeholder",
                        "https://..."
                      )}
                      value={row.url}
                      onPaste={(event) => handlePaste(event, row.clientId)}
                      onChange={(event) =>
                        updateRow(row.clientId, {
                          companyName: "",
                          detailsRequired: false,
                          title: "",
                          url: event.target.value,
                        })
                      }
                      disabled={submitting || row.status === "success"}
                      className="sm:h-9 sm:py-1.5"
                    />

                    <div className="flex items-center justify-between gap-3 sm:contents">
                      <CompactDropdown<ImportSavedStage>
                        id={`career-job-link-import-stage-${row.clientId}`}
                        ariaLabel={t(
                          "career.history.job_link_import.stage_label",
                          "현재 상태"
                        )}
                        value={row.savedStage}
                        disabled={submitting || row.status === "success"}
                        options={stageOptions}
                        className="w-[150px] sm:h-9 sm:w-full"
                        onValueChange={(savedStage) => {
                          updateRow(row.clientId, {
                            savedStage,
                          });
                        }}
                      />

                      <MuteButton
                        type="button"
                        size="md"
                        variant="transparent"
                        aria-label={t(
                          "career.history.job_link_import.remove",
                          "공고 삭제"
                        )}
                        onClick={() => removeRow(row.clientId)}
                        disabled={submitting}
                        className="sm:h-9 sm:w-9 sm:p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </MuteButton>
                    </div>
                  </div>

                  {row.detailsRequired ? (
                    <div className="grid gap-3 rounded-md bg-bg-weak p-3 sm:grid-cols-2">
                      <p className="text-[12px] leading-5 text-neutral-muted sm:col-span-2">
                        {t(
                          "career.history.job_link_import.details_help",
                          "이 페이지에서는 두 항목을 자동으로 확인하지 못했습니다. 직접 입력하면 링크와 함께 저장할 수 있습니다."
                        )}
                      </p>
                      <div className="space-y-1.5">
                        <label
                          htmlFor={companyInputId}
                          className="block text-[13px] font-medium text-neutral-primary"
                        >
                          {t(
                            "career.history.job_link_import.company_label",
                            "회사명"
                          )}
                        </label>
                        <Input
                          id={companyInputId}
                          value={row.companyName}
                          onChange={(event) =>
                            updateRow(row.clientId, {
                              companyName: event.target.value,
                            })
                          }
                          disabled={submitting}
                          maxLength={240}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor={titleInputId}
                          className="block text-[13px] font-medium text-neutral-primary"
                        >
                          {t(
                            "career.history.job_link_import.role_label",
                            "포지션명"
                          )}
                        </label>
                        <Input
                          id={titleInputId}
                          value={row.title}
                          onChange={(event) =>
                            updateRow(row.clientId, {
                              title: event.target.value,
                            })
                          }
                          disabled={submitting}
                          maxLength={500}
                        />
                      </div>
                    </div>
                  ) : null}

                  {row.status === "success" ? (
                    <p className="flex items-center gap-1.5 text-[12px] text-positive">
                      <CircleCheck className="h-4 w-4" />
                      {t(
                        "career.history.job_link_import.saved",
                        "저장되었습니다."
                      )}
                    </p>
                  ) : row.error && !row.detailsRequired ? (
                    <p className="text-[12px] leading-5 text-critical">
                      {row.error}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>

          <MuteButton
            type="button"
            size="md"
            variant="default"
            onClick={() => addRow()}
            disabled={submitting || rows.length >= MAX_IMPORT_ITEMS}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("career.history.job_link_import.add", "공고 추가")}
          </MuteButton>

          {batchLimitExceeded ? (
            <p
              role="alert"
              className="rounded-md border border-critical/25 bg-critical-faded px-3 py-2 text-[13px] leading-5 text-critical"
            >
              {t(
                "career.api.opportunities.import_url_batch_limit",
                "공고는 한 번에 20개까지 저장할 수 있습니다."
              )}
            </p>
          ) : requestError ? (
            <p
              role="alert"
              className="rounded-md border border-critical/25 bg-critical-faded px-3 py-2 text-[13px] leading-5 text-critical"
            >
              {requestError}
            </p>
          ) : null}
        </form>
      </TalentCareerModal>
    </>
  );
}
