import React, { useMemo, useRef, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";

export type CareerProfileEntryKind = "work" | "education" | "extra";

export type CareerProfileEntryFormValues = {
  companyId: string;
  companyLinkedinUrl: string;
  companyLogo: string;
  companyLocation: string;
  companyName: string;
  date: string;
  degree: string;
  description: string;
  employmentType: string;
  endDate: string;
  field: string;
  role: string;
  school: string;
  startDate: string;
  title: string;
  url: string;
};

const EMPTY_FORM_VALUES: CareerProfileEntryFormValues = {
  companyId: "",
  companyLinkedinUrl: "",
  companyLogo: "",
  companyLocation: "",
  companyName: "",
  date: "",
  degree: "",
  description: "",
  employmentType: "",
  endDate: "",
  field: "",
  role: "",
  school: "",
  startDate: "",
  title: "",
  url: "",
};

const FORM_ID = "career-profile-entry-form";
const COMPLETE_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const PARTIAL_MONTH_PATTERN = /^(?:\d{0,4}|\d{4}-(?:0[1-9]?|1[0-2]?)?)$/;

const isCompleteOrEmptyMonth = (value: string) =>
  value === "" || COMPLETE_MONTH_PATTERN.test(value);

const ProfileEntryField = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <label className="grid gap-1.5 text-[13px] font-medium text-neutral-primary">
    <span>{label}</span>
    {children}
  </label>
);

const CareerProfileEntryModal = ({
  error,
  kind,
  onClose,
  onSubmit,
}: {
  error?: string | null;
  kind: CareerProfileEntryKind | null;
  onClose: () => void;
  onSubmit: (
    kind: CareerProfileEntryKind,
    values: CareerProfileEntryFormValues
  ) => boolean | void | Promise<boolean | void>;
}) => {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const [values, setValues] =
    useState<CareerProfileEntryFormValues>(EMPTY_FORM_VALUES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompanyLookupPending, setIsCompanyLookupPending] = useState(false);
  const [isCompanyLogoUploadPending, setIsCompanyLogoUploadPending] =
    useState(false);
  const [companyLogoError, setCompanyLogoError] = useState("");
  const companyLinkedinValueAtFocusRef = useRef("");
  const companyLookupRequestIdRef = useRef(0);
  const companyLookupInFlightRef = useRef(false);
  const companyLogoInputRef = useRef<HTMLInputElement | null>(null);

  const title = useMemo(() => {
    if (kind === "work") {
      return t(
        "career.profile.career_talent_profile_panel.0efzyx5",
        "경력 추가"
      );
    }
    if (kind === "education") {
      return t(
        "career.profile.career_talent_profile_panel.1efofsl",
        "학력 추가"
      );
    }
    return t("career.profile.career_talent_profile_panel.0wjximy", "추가 정보");
  }, [kind, t]);

  const hasValidMonthRange =
    isCompleteOrEmptyMonth(values.startDate) &&
    isCompleteOrEmptyMonth(values.endDate);
  const canSubmit =
    !isCompanyLookupPending && !isCompanyLogoUploadPending && hasValidMonthRange
      ? kind === "work"
        ? Boolean(values.role.trim() && values.companyName.trim())
        : kind === "education"
          ? Boolean(values.school.trim())
          : kind === "extra"
            ? Boolean(values.title.trim())
            : false
      : false;

  const updateValue = (
    field: keyof CareerProfileEntryFormValues,
    value: string
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const updateMonthValue = (field: "startDate" | "endDate", value: string) => {
    if (PARTIAL_MONTH_PATTERN.test(value)) updateValue(field, value);
  };

  const lookupCompanyByLinkedin = async (linkedinUrl: string) => {
    const requestId = ++companyLookupRequestIdRef.current;
    companyLookupInFlightRef.current = true;
    setIsCompanyLookupPending(true);

    try {
      const response = await fetchWithAuth(
        `/api/talent/profile/company/lookup?linkedinUrl=${encodeURIComponent(linkedinUrl)}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || requestId !== companyLookupRequestIdRef.current) {
        return;
      }

      const normalizedLinkedinUrl =
        typeof payload?.linkedinUrl === "string"
          ? payload.linkedinUrl.trim()
          : "";
      const company = payload?.company as
        | {
            id?: string | null;
            linkedinUrl?: string | null;
            location?: string | null;
            logo?: string | null;
            name?: string | null;
          }
        | null
        | undefined;
      if (!company) {
        if (!normalizedLinkedinUrl) return;

        setValues((current) =>
          current.companyLinkedinUrl.trim() === linkedinUrl
            ? { ...current, companyLinkedinUrl: normalizedLinkedinUrl }
            : current
        );
        return;
      }

      setValues((current) => {
        if (current.companyLinkedinUrl.trim() !== linkedinUrl) return current;

        return {
          ...current,
          companyId: company.id?.trim() || current.companyId,
          companyLinkedinUrl:
            company.linkedinUrl?.trim() ||
            normalizedLinkedinUrl ||
            current.companyLinkedinUrl,
          companyLocation:
            current.companyLocation.trim() || company.location?.trim() || "",
          companyLogo: current.companyLogo.trim() || company.logo?.trim() || "",
          companyName: current.companyName.trim() || company.name?.trim() || "",
        };
      });
    } finally {
      if (requestId === companyLookupRequestIdRef.current) {
        companyLookupInFlightRef.current = false;
        setIsCompanyLookupPending(false);
      }
    }
  };

  const handleCompanyLinkedinBlur = (
    event: React.FocusEvent<HTMLInputElement>
  ) => {
    const linkedinUrl = event.currentTarget.value.trim();
    if (linkedinUrl === companyLinkedinValueAtFocusRef.current) return;

    setValues((current) => ({
      ...current,
      companyId: "",
      companyLinkedinUrl: linkedinUrl,
    }));
    if (linkedinUrl) void lookupCompanyByLinkedin(linkedinUrl);
  };

  const uploadCompanyLogo = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setCompanyLogoError(
        t(
          "career.profile.career_talent_profile_panel.0anxi5z",
          "이미지 파일만 업로드할 수 있습니다."
        )
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setCompanyLogoError(
        t(
          "career.profile.career_talent_profile_panel.04441vu",
          "로고 이미지는 5MB 이하로 업로드해 주세요."
        )
      );
      return;
    }

    setCompanyLogoError("");
    setIsCompanyLogoUploadPending(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetchWithAuth("/api/talent/profile/logo/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload?.logoUrl !== "string") {
        throw new Error(
          payload?.error ??
            t(
              "career.profile.career_talent_profile_panel.0acdx91",
              "로고 업로드에 실패했습니다."
            )
        );
      }

      updateValue("companyLogo", payload.logoUrl);
    } catch (error) {
      setCompanyLogoError(
        error instanceof Error
          ? error.message
          : t(
              "career.profile.career_talent_profile_panel.0acdx91",
              "로고 업로드에 실패했습니다."
            )
      );
    } finally {
      setIsCompanyLogoUploadPending(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !kind ||
      !canSubmit ||
      isSubmitting ||
      companyLookupInFlightRef.current
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const submitted = await onSubmit(kind, values);
      if (submitted !== false) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TalentCareerModal
      open={Boolean(kind)}
      onClose={handleClose}
      title={title}
      closeOnBackdrop={!isSubmitting}
      showCloseButton={!isSubmitting}
      mobileBottomSheet
      panelClassName="max-w-[640px] border border-neutral-1000-a05 bg-bg-floating"
      bodyClassName="bg-bg-floating px-4 py-5 sm:px-5"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <MuteButton onClick={handleClose} disabled={isSubmitting} size="lg">
            {t(
              "career.profile.career_profile_settings_section.0jiry9t",
              "취소"
            )}
          </MuteButton>
          <MuteButton
            variant="primary"
            size="lg"
            type="submit"
            form={FORM_ID}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t(
              "career.profile.career_profile_settings_section.07836ex",
              "추가"
            )}
          </MuteButton>
        </div>
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={handleSubmit}>
        {kind === "work" ? (
          <>
            <ProfileEntryField
              label={t(
                "career.profile.entry.company_linkedin_label",
                "회사 LinkedIn"
              )}
            >
              <Input
                type="url"
                placeholder="https://www.linkedin.com/company/example"
                value={values.companyLinkedinUrl}
                onFocus={(event) => {
                  companyLinkedinValueAtFocusRef.current =
                    event.currentTarget.value.trim();
                }}
                onBlur={handleCompanyLinkedinBlur}
                onChange={(event) =>
                  updateValue("companyLinkedinUrl", event.target.value)
                }
                aria-describedby="career-profile-company-linkedin-help"
              />
              <span
                id="career-profile-company-linkedin-help"
                className="text-[12px] font-normal text-neutral-muted"
              >
                {isCompanyLookupPending
                  ? t(
                      "career.profile.entry.company_lookup_loading",
                      "회사 정보를 불러오는 중입니다."
                    )
                  : t(
                      "career.profile.entry.company_linkedin_help",
                      "주소를 변경한 뒤 입력창을 벗어나면 비어 있는 회사 정보가 자동으로 채워집니다."
                    )}
              </span>
            </ProfileEntryField>
            <ProfileEntryField
              label={t("career.profile.entry.company_logo_label", "회사 로고")}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-1000-a10 bg-bg-weak text-neutral-muted">
                  {values.companyLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={values.companyLogo}
                      src={values.companyLogo}
                      alt={t(
                        "career.profile.entry.company_logo_label",
                        "회사 로고"
                      )}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <Building2 className="h-5 w-5" />
                  )}
                </div>
                <Input
                  ref={companyLogoInputRef}
                  unstyled
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadCompanyLogo(file);
                  }}
                />
                <MuteButton
                  type="button"
                  disabled={isCompanyLogoUploadPending}
                  onClick={() => companyLogoInputRef.current?.click()}
                >
                  {isCompanyLogoUploadPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {isCompanyLogoUploadPending
                    ? t(
                        "career.profile.entry.company_logo_uploading",
                        "업로드 중"
                      )
                    : t(
                        "career.profile.entry.company_logo_choose",
                        "로고 선택"
                      )}
                </MuteButton>
              </div>
              {companyLogoError ? (
                <span className="text-[12px] font-normal text-critical">
                  {companyLogoError}
                </span>
              ) : null}
            </ProfileEntryField>
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.1qnltk8",
                  "직무"
                )}
              >
                <Input
                  autoFocus
                  required
                  placeholder="e.g. Product Engineer"
                  value={values.role}
                  onChange={(event) => updateValue("role", event.target.value)}
                />
              </ProfileEntryField>
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.0uwqvnk",
                  "회사명"
                )}
              >
                <Input
                  required
                  placeholder="e.g. Harper"
                  value={values.companyName}
                  onChange={(event) =>
                    updateValue("companyName", event.target.value)
                  }
                />
              </ProfileEntryField>
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.00infjs",
                  "근무 지역"
                )}
              >
                <Input
                  placeholder="e.g. Seoul or Remote"
                  value={values.companyLocation}
                  onChange={(event) =>
                    updateValue("companyLocation", event.target.value)
                  }
                />
              </ProfileEntryField>
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.0rtdf2n",
                  "고용 형태"
                )}
              >
                <Input
                  placeholder="e.g. Full-time"
                  value={values.employmentType}
                  onChange={(event) =>
                    updateValue("employmentType", event.target.value)
                  }
                />
              </ProfileEntryField>
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.11cor6u",
                  "시작일"
                )}
              >
                <Input
                  inputMode="numeric"
                  maxLength={7}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  placeholder="YYYY-MM"
                  title="Use YYYY-MM format"
                  aria-invalid={
                    values.startDate !== "" &&
                    !COMPLETE_MONTH_PATTERN.test(values.startDate)
                  }
                  value={values.startDate}
                  onChange={(event) =>
                    updateMonthValue("startDate", event.target.value)
                  }
                />
              </ProfileEntryField>
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.1iegi7w",
                  "종료일 또는 현재"
                )}
              >
                <Input
                  inputMode="numeric"
                  maxLength={7}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  placeholder="Present"
                  title="Use YYYY-MM format or leave empty for Present"
                  aria-invalid={
                    values.endDate !== "" &&
                    !COMPLETE_MONTH_PATTERN.test(values.endDate)
                  }
                  value={values.endDate}
                  onChange={(event) =>
                    updateMonthValue("endDate", event.target.value)
                  }
                />
              </ProfileEntryField>
            </div>
            <ProfileEntryField
              label={t(
                "career.profile.career_talent_profile_panel.051qjyj",
                "주요 업무와 성과"
              )}
            >
              <Textarea
                className="min-h-[120px]"
                placeholder="Describe your responsibilities and achievements"
                value={values.description}
                onChange={(event) =>
                  updateValue("description", event.target.value)
                }
              />
            </ProfileEntryField>
          </>
        ) : null}

        {kind === "education" ? (
          <>
            <ProfileEntryField
              label={t(
                "career.profile.career_talent_profile_panel.1afhauj",
                "학교명"
              )}
            >
              <Input
                autoFocus
                required
                placeholder="e.g. KAIST"
                value={values.school}
                onChange={(event) => updateValue("school", event.target.value)}
              />
            </ProfileEntryField>
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.06x2f2q",
                  "전공"
                )}
              >
                <Input
                  placeholder="e.g. Computer Science"
                  value={values.field}
                  onChange={(event) => updateValue("field", event.target.value)}
                />
              </ProfileEntryField>
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.0a7k434",
                  "학위"
                )}
              >
                <Input
                  placeholder="e.g. B.S."
                  value={values.degree}
                  onChange={(event) =>
                    updateValue("degree", event.target.value)
                  }
                />
              </ProfileEntryField>
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.11cor6u",
                  "시작일"
                )}
              >
                <Input
                  inputMode="numeric"
                  maxLength={7}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  placeholder="YYYY-MM"
                  title="Use YYYY-MM format"
                  aria-invalid={
                    values.startDate !== "" &&
                    !COMPLETE_MONTH_PATTERN.test(values.startDate)
                  }
                  value={values.startDate}
                  onChange={(event) =>
                    updateMonthValue("startDate", event.target.value)
                  }
                />
              </ProfileEntryField>
              <ProfileEntryField
                label={t(
                  "career.profile.career_talent_profile_panel.13a39zc",
                  "종료일"
                )}
              >
                <Input
                  inputMode="numeric"
                  maxLength={7}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  placeholder="Present"
                  title="Use YYYY-MM format or leave empty for Present"
                  aria-invalid={
                    values.endDate !== "" &&
                    !COMPLETE_MONTH_PATTERN.test(values.endDate)
                  }
                  value={values.endDate}
                  onChange={(event) =>
                    updateMonthValue("endDate", event.target.value)
                  }
                />
              </ProfileEntryField>
            </div>
            <ProfileEntryField
              label={t(
                "career.profile.career_talent_profile_panel.1ywstxy",
                "학교/프로그램 링크"
              )}
            >
              <Input
                type="url"
                placeholder="https://example.edu"
                value={values.url}
                onChange={(event) => updateValue("url", event.target.value)}
              />
            </ProfileEntryField>
            <ProfileEntryField
              label={t(
                "career.profile.career_talent_profile_panel.1trcux2",
                "학력 설명"
              )}
            >
              <Textarea
                className="min-h-[120px]"
                placeholder="Describe your studies, activities, or achievements"
                value={values.description}
                onChange={(event) =>
                  updateValue("description", event.target.value)
                }
              />
            </ProfileEntryField>
          </>
        ) : null}

        {kind === "extra" ? (
          <>
            <ProfileEntryField
              label={t(
                "career.profile.career_talent_profile_panel.1ub2ks6",
                "제목"
              )}
            >
              <Input
                autoFocus
                required
                placeholder="e.g. Open Source Contributor"
                value={values.title}
                onChange={(event) => updateValue("title", event.target.value)}
              />
            </ProfileEntryField>
            <ProfileEntryField
              label={t(
                "career.profile.career_talent_profile_panel.1pzl6hl",
                "날짜"
              )}
            >
              <Input
                placeholder="e.g. 2024-01"
                value={values.date}
                onChange={(event) => updateValue("date", event.target.value)}
              />
            </ProfileEntryField>
            <ProfileEntryField
              label={t(
                "career.profile.career_talent_profile_panel.07tjd6q",
                "설명"
              )}
            >
              <Textarea
                className="min-h-[140px]"
                placeholder="Describe this experience or achievement"
                value={values.description}
                onChange={(event) =>
                  updateValue("description", event.target.value)
                }
              />
            </ProfileEntryField>
          </>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical"
          >
            {error}
          </p>
        ) : null}
      </form>
    </TalentCareerModal>
  );
};

export default CareerProfileEntryModal;
