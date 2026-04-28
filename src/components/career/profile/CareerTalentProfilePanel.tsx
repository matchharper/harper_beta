import React, { useEffect, useMemo, useState } from "react";
import {
  AwardIcon,
  Building2,
  MapPin,
  Pencil,
  Plus,
  Save,
  SchoolIcon,
  Trash2,
} from "lucide-react";
import { initials } from "@/components/NameProfile";
import { useCareerSidebarContext } from "../CareerSidebarContext";
import type {
  CareerTalentEducation,
  CareerTalentExperience,
  CareerTalentExtra,
  CareerTalentProfile,
  CareerTalentUser,
} from "../types";
import { locationEnToKo } from "@/utils/language_map";
import { dateToFormat } from "@/utils/textprocess";
import {
  CareerPrimaryButton,
  CareerSecondaryButton,
  CareerTextInput,
  CareerTextarea,
  careerCx,
} from "../ui/CareerPrimitives";

type EditableExperience = CareerTalentExperience & { clientKey: string };
type EditableEducation = CareerTalentEducation & { clientKey: string };
type EditableExtra = CareerTalentExtra & { clientKey: string };

type EditableTalentProfile = {
  talentUser: CareerTalentUser;
  talentExperiences: EditableExperience[];
  talentEducations: EditableEducation[];
  talentExtras: EditableExtra[];
};

const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatRange = (startDate?: string | null, endDate?: string | null) => {
  const start = dateToFormat(startDate);
  const end = dateToFormat(endDate);
  if (!start && !end) return "";
  if (start && !end) return `${start} - 현재`;
  if (!start && end) return end;
  return `${start} - ${end}`;
};

const formatMonth = (months?: number | null) => {
  if (!months || months <= 0) return "";
  const years = Math.floor(months / 12);
  const remain = months % 12;
  return `${years > 0 ? `${years}년 ` : ""}${remain}개월`;
};

const createClientKey = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const createBlankTalentUser = (userId?: string | null): CareerTalentUser => ({
  user_id: userId ?? "",
  name: null,
  profile_picture: null,
  headline: null,
  bio: null,
  location: null,
});

const createEditableProfile = (
  profile: CareerTalentProfile
): EditableTalentProfile => ({
  talentUser: profile.talentUser
    ? { ...profile.talentUser }
    : createBlankTalentUser(),
  talentExperiences: profile.talentExperiences.map((item) => ({
    ...item,
    clientKey: createClientKey("exp"),
  })),
  talentEducations: profile.talentEducations.map((item) => ({
    ...item,
    clientKey: createClientKey("edu"),
  })),
  talentExtras: profile.talentExtras.map((item) => ({
    ...item,
    clientKey: createClientKey("extra"),
  })),
});

const trimSingleLine = (value: string | null | undefined) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
};

const trimMultiline = (value: string | null | undefined) => {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .trim();
  return normalized || null;
};

const trimDateText = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const toComparableProfile = (
  profile: CareerTalentProfile | EditableTalentProfile
) => ({
  talentUser: {
    name: trimSingleLine(profile.talentUser?.name),
    profile_picture: trimSingleLine(profile.talentUser?.profile_picture),
    headline: trimSingleLine(profile.talentUser?.headline),
    bio: trimMultiline(profile.talentUser?.bio),
    location: trimSingleLine(profile.talentUser?.location),
  },
  talentExperiences: profile.talentExperiences.map((item) => ({
    role: trimSingleLine(item.role),
    description: trimMultiline(item.description),
    start_date: trimDateText(item.start_date),
    end_date: trimDateText(item.end_date),
    months: item.months ?? null,
    company_id: trimSingleLine(item.company_id),
    company_link: trimSingleLine(item.company_link),
    company_name: trimSingleLine(item.company_name),
    company_location: trimSingleLine(item.company_location),
    company_logo: trimSingleLine(item.company_logo),
    memo: trimMultiline(item.memo),
  })),
  talentEducations: profile.talentEducations.map((item) => ({
    school: trimSingleLine(item.school),
    degree: trimSingleLine(item.degree),
    description: trimMultiline(item.description),
    field: trimSingleLine(item.field),
    start_date: trimDateText(item.start_date),
    end_date: trimDateText(item.end_date),
    url: trimSingleLine(item.url),
    memo: trimMultiline(item.memo),
  })),
  talentExtras: profile.talentExtras.map((item) => ({
    title: trimSingleLine(item.title),
    description: trimMultiline(item.description),
    date: trimDateText(item.date),
    memo: trimMultiline(item.memo),
  })),
});

const toStructuredProfile = (
  draft: EditableTalentProfile,
  fallbackUserId: string | null | undefined
): CareerTalentProfile => ({
  talentUser: {
    user_id: draft.talentUser.user_id || fallbackUserId || "",
    name: trimSingleLine(draft.talentUser.name),
    profile_picture: trimSingleLine(draft.talentUser.profile_picture),
    headline: trimSingleLine(draft.talentUser.headline),
    bio: trimMultiline(draft.talentUser.bio),
    location: trimSingleLine(draft.talentUser.location),
  },
  talentExperiences: draft.talentExperiences.map(
    ({ clientKey: _clientKey, ...item }) => ({
      ...item,
      role: trimSingleLine(item.role),
      description: trimMultiline(item.description),
      start_date: trimDateText(item.start_date),
      end_date: trimDateText(item.end_date),
      company_id: trimSingleLine(item.company_id),
      company_link: trimSingleLine(item.company_link),
      company_name: trimSingleLine(item.company_name),
      company_location: trimSingleLine(item.company_location),
      company_logo: trimSingleLine(item.company_logo),
      memo: trimMultiline(item.memo),
    })
  ),
  talentEducations: draft.talentEducations.map(
    ({ clientKey: _clientKey, ...item }) => ({
      ...item,
      school: trimSingleLine(item.school),
      degree: trimSingleLine(item.degree),
      description: trimMultiline(item.description),
      field: trimSingleLine(item.field),
      start_date: trimDateText(item.start_date),
      end_date: trimDateText(item.end_date),
      url: trimSingleLine(item.url),
      memo: trimMultiline(item.memo),
    })
  ),
  talentExtras: draft.talentExtras.map(
    ({ clientKey: _clientKey, ...item }) => ({
      ...item,
      title: trimSingleLine(item.title),
      description: trimMultiline(item.description),
      date: trimDateText(item.date),
      memo: trimMultiline(item.memo),
    })
  ),
});

const TimelineBlock = ({
  title,
  subtitle,
  description,
  memo,
  meta,
  icon,
  logoUrl,
  logoAlt,
  isLast,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  memo?: string;
  meta?: string;
  icon: React.ReactNode;
  logoUrl?: string | null;
  logoAlt?: string;
  isLast?: boolean;
}) => (
  <div className={careerCx("relative pl-11", !isLast && "pb-6")}>
    {!isLast && (
      <div className="absolute bottom-0 left-[14px] top-[30px] w-px bg-beige900/10" />
    )}
    <div className="absolute left-0 top-1 flex h-7 w-7 items-center justify-center overflow-hidden rounded-[8px] border border-beige900/15 bg-white/45 text-beige900/70">
      <span className="absolute inset-0 flex items-center justify-center">
        {icon}
      </span>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={logoAlt ?? title}
          className="relative h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
    <div>
      <div className="text-[16px] font-medium leading-6 text-beige900">
        {title}
      </div>
      {subtitle && (
        <div className="mt-1 text-[14px] text-beige900/55">{subtitle}</div>
      )}
      {meta && <div className="mt-1 text-[13px] text-beige900/40">{meta}</div>}
      {description && (
        <div className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-beige900/65">
          {description}
        </div>
      )}
      {memo && (
        <div className="mt-2 border-l border-beige900/20 pl-3 text-[13px] leading-6 text-beige900/70">
          {memo}
        </div>
      )}
    </div>
  </div>
);

const ProfileSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="first:border-t-0 first:pt-0">
    {title ? (
      <div className="text-[14px] font-medium text-beige900/45">{title}</div>
    ) : null}
    <div className={title ? "mt-3" : ""}>{children}</div>
  </section>
);

const EditSectionHeader = ({
  title,
  onAdd,
  addLabel,
}: {
  title: string;
  onAdd: () => void;
  addLabel: string;
}) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <div className="text-[14px] font-medium text-beige900/45">{title}</div>
    <CareerSecondaryButton
      type="button"
      onClick={onAdd}
      className="h-8 gap-1.5 px-3 text-xs"
    >
      <Plus className="h-3.5 w-3.5" />
      {addLabel}
    </CareerSecondaryButton>
  </div>
);

const EmptyEditState = ({ label }: { label: string }) => (
  <div className="rounded-[10px] border border-dashed border-beige900/20 bg-white/30 px-4 py-4 text-sm text-beige900/55">
    {label}
  </div>
);

const ItemRemoveButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-beige900/10 bg-white/60 text-beige900/60 transition-colors hover:border-beige900/25 hover:text-beige900"
    aria-label="항목 삭제"
  >
    <Trash2 className="h-4 w-4" />
  </button>
);

const CareerTalentProfilePanel = ({
  className = "",
}: {
  className?: string;
}) => {
  const {
    talentProfile,
    profileSavePending,
    profileSaveError,
    profileSaveInfo,
    onSaveTalentProfile,
  } = useCareerSidebarContext();
  const { talentUser, talentExperiences, talentEducations, talentExtras } =
    talentProfile;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditableTalentProfile>(() =>
    createEditableProfile(talentProfile)
  );

  useEffect(() => {
    if (isEditing) return;
    setDraft(createEditableProfile(talentProfile));
  }, [isEditing, talentProfile]);

  const mergedExperience = useMemo(() => {
    const expItems = talentExperiences.map((item) => ({
      kind: "exp" as const,
      item,
    }));
    const eduItems = talentEducations.map((item, index) => ({
      kind: "edu" as const,
      item,
      index,
    }));

    const datedItems = [
      ...expItems,
      ...eduItems.filter((edu) => Boolean(parseDate(edu.item.start_date))),
    ];

    datedItems.sort((a, b) => {
      const aIsOngoing = !parseDate(a.item.end_date);
      const bIsOngoing = !parseDate(b.item.end_date);
      if (aIsOngoing !== bIsOngoing) return aIsOngoing ? -1 : 1;

      const aStartDate = parseDate(a.item.start_date);
      const bStartDate = parseDate(b.item.start_date);
      if (aStartDate && bStartDate) {
        return bStartDate.getTime() - aStartDate.getTime();
      }
      if (aStartDate && !bStartDate) return -1;
      if (!aStartDate && bStartDate) return 1;
      return 0;
    });

    const undatedEdu = eduItems.filter(
      (edu) => !parseDate(edu.item.start_date)
    );

    if (undatedEdu.length === 0) return datedItems;

    const merged = [...datedItems];
    undatedEdu.forEach((edu) => {
      const nextDatedEdu = eduItems
        .slice(edu.index + 1)
        .find((next) => Boolean(parseDate(next.item.start_date)));

      if (!nextDatedEdu) {
        merged.push(edu);
        return;
      }

      const insertAt = merged.findIndex(
        (entry) => entry.kind === "edu" && entry.item === nextDatedEdu.item
      );

      if (insertAt === -1) merged.push(edu);
      else merged.splice(insertAt, 0, edu);
    });

    return merged;
  }, [talentEducations, talentExperiences]);

  const hasAnyProfileData =
    Boolean(
      talentUser?.name ||
      talentUser?.headline ||
      talentUser?.bio ||
      talentUser?.location
    ) ||
    mergedExperience.length > 0 ||
    talentExtras.length > 0;

  const hasUnsavedChanges = useMemo(() => {
    return (
      JSON.stringify(toComparableProfile(draft)) !==
      JSON.stringify(toComparableProfile(talentProfile))
    );
  }, [draft, talentProfile]);

  const beginEditing = () => {
    setDraft(createEditableProfile(talentProfile));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(createEditableProfile(talentProfile));
    setIsEditing(false);
  };

  const handleSave = async () => {
    const saved = await onSaveTalentProfile({
      structuredProfile: toStructuredProfile(
        draft,
        talentProfile.talentUser?.user_id ?? null
      ),
    });
    if (saved) {
      setIsEditing(false);
    }
  };

  const updateTalentUserField = (
    field: keyof Omit<CareerTalentUser, "user_id">,
    value: string
  ) => {
    setDraft((current) => ({
      ...current,
      talentUser: {
        ...current.talentUser,
        [field]: value,
      },
    }));
  };

  const updateExperienceField = (
    index: number,
    field: keyof CareerTalentExperience,
    value: string | number | null
  ) => {
    setDraft((current) => ({
      ...current,
      talentExperiences: current.talentExperiences.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const updateEducationField = (
    index: number,
    field: keyof CareerTalentEducation,
    value: string | null
  ) => {
    setDraft((current) => ({
      ...current,
      talentEducations: current.talentEducations.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const updateExtraField = (
    index: number,
    field: keyof CareerTalentExtra,
    value: string | null
  ) => {
    setDraft((current) => ({
      ...current,
      talentExtras: current.talentExtras.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addExperience = () => {
    setDraft((current) => ({
      ...current,
      talentExperiences: [
        ...current.talentExperiences,
        {
          id: Date.now(),
          talent_id:
            current.talentUser.user_id ||
            talentProfile.talentUser?.user_id ||
            "",
          role: null,
          description: null,
          start_date: null,
          end_date: null,
          months: null,
          company_name: null,
          company_location: null,
          company_logo: null,
          company_id: null,
          company_link: null,
          memo: null,
          clientKey: createClientKey("exp"),
        },
      ],
    }));
  };

  const addEducation = () => {
    setDraft((current) => ({
      ...current,
      talentEducations: [
        ...current.talentEducations,
        {
          id: Date.now(),
          talent_id:
            current.talentUser.user_id ||
            talentProfile.talentUser?.user_id ||
            "",
          school: null,
          degree: null,
          description: null,
          field: null,
          start_date: null,
          end_date: null,
          url: null,
          memo: null,
          clientKey: createClientKey("edu"),
        },
      ],
    }));
  };

  const addExtra = () => {
    setDraft((current) => ({
      ...current,
      talentExtras: [
        ...current.talentExtras,
        {
          title: null,
          description: null,
          date: null,
          memo: null,
          clientKey: createClientKey("extra"),
        },
      ],
    }));
  };

  const removeExperience = (index: number) => {
    setDraft((current) => ({
      ...current,
      talentExperiences: current.talentExperiences.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  };

  const removeEducation = (index: number) => {
    setDraft((current) => ({
      ...current,
      talentEducations: current.talentEducations.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  };

  const removeExtra = (index: number) => {
    setDraft((current) => ({
      ...current,
      talentExtras: current.talentExtras.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  };

  return (
    <div className={careerCx("space-y-5", className)}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isEditing ? (
          <>
            <CareerSecondaryButton
              type="button"
              onClick={cancelEditing}
              disabled={profileSavePending}
              className="gap-1.5"
            >
              취소
            </CareerSecondaryButton>
            <CareerPrimaryButton
              type="button"
              onClick={() => void handleSave()}
              disabled={profileSavePending || !hasUnsavedChanges}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {profileSavePending ? "저장 중..." : "저장하기"}
            </CareerPrimaryButton>
          </>
        ) : (
          <CareerSecondaryButton
            type="button"
            onClick={beginEditing}
            className="gap-1.5"
          >
            <Pencil className="h-4 w-4" />
            수정하기
          </CareerSecondaryButton>
        )}
      </div>

      {profileSaveError ? (
        <p className="rounded-lg border border-beige900/20 bg-beige900/10 px-3 py-2 text-sm text-beige900">
          {profileSaveError}
        </p>
      ) : null}
      {profileSaveInfo && (!isEditing || !hasUnsavedChanges) ? (
        <p className="rounded-lg border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
          {profileSaveInfo}
        </p>
      ) : null}

      {isEditing ? (
        <>
          <ProfileSection title="">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[8px] border border-beige900/10 bg-white/45 text-[24px] text-beige900/70">
                {draft.talentUser.profile_picture &&
                !draft.talentUser.profile_picture.includes(
                  "media.licdn.com"
                ) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.talentUser.profile_picture}
                    alt={draft.talentUser.name ?? "profile"}
                    className="h-[72px] w-[72px] rounded-[8px] object-cover"
                  />
                ) : (
                  initials(draft.talentUser.name)
                )}
              </div>

              <div className="grid flex-1 gap-3 md:grid-cols-2">
                <CareerTextInput
                  value={draft.talentUser.name ?? ""}
                  onChange={(event) =>
                    updateTalentUserField("name", event.target.value)
                  }
                  placeholder="이름"
                  className="h-10"
                />
                <CareerTextInput
                  value={draft.talentUser.location ?? ""}
                  onChange={(event) =>
                    updateTalentUserField("location", event.target.value)
                  }
                  placeholder="지역"
                  className="h-10"
                />
                <div className="md:col-span-2">
                  <CareerTextInput
                    value={draft.talentUser.headline ?? ""}
                    onChange={(event) =>
                      updateTalentUserField("headline", event.target.value)
                    }
                    placeholder="한 줄 소개"
                    className="h-10"
                  />
                </div>
              </div>
            </div>
          </ProfileSection>

          <ProfileSection title="bio">
            <CareerTextarea
              value={draft.talentUser.bio ?? ""}
              onChange={(event) =>
                updateTalentUserField("bio", event.target.value)
              }
              placeholder="bio를 입력해 주세요."
              className="min-h-[140px]"
            />
          </ProfileSection>

          <ProfileSection title="">
            <EditSectionHeader
              title="경력"
              onAdd={addExperience}
              addLabel="경력 추가"
            />
            <div className="space-y-3">
              {draft.talentExperiences.length === 0 ? (
                <EmptyEditState label="아직 경력이 없습니다. 항목을 추가해 주세요." />
              ) : (
                draft.talentExperiences.map((item, index) => (
                  <div
                    key={item.clientKey}
                    className="rounded-[12px] bg-beige500/30 p-4"
                  >
                    <div className="mb-3 flex items-start justify-end">
                      <ItemRemoveButton
                        onClick={() => removeExperience(index)}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <CareerTextInput
                        value={item.role ?? ""}
                        onChange={(event) =>
                          updateExperienceField(
                            index,
                            "role",
                            event.target.value
                          )
                        }
                        placeholder="직무"
                        className="h-10"
                      />
                      <CareerTextInput
                        value={item.company_name ?? ""}
                        onChange={(event) =>
                          updateExperienceField(
                            index,
                            "company_name",
                            event.target.value
                          )
                        }
                        placeholder="회사명"
                        className="h-10"
                      />
                      <CareerTextInput
                        value={item.company_location ?? ""}
                        onChange={(event) =>
                          updateExperienceField(
                            index,
                            "company_location",
                            event.target.value
                          )
                        }
                        placeholder="근무 지역"
                        className="h-10"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <CareerTextInput
                          value={item.start_date ?? ""}
                          onChange={(event) =>
                            updateExperienceField(
                              index,
                              "start_date",
                              event.target.value
                            )
                          }
                          placeholder="시작일"
                          className="h-10"
                        />
                        <CareerTextInput
                          value={item.end_date ?? ""}
                          onChange={(event) =>
                            updateExperienceField(
                              index,
                              "end_date",
                              event.target.value
                            )
                          }
                          placeholder="종료일 또는 현재"
                          className="h-10"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <CareerTextarea
                          value={item.description ?? ""}
                          onChange={(event) =>
                            updateExperienceField(
                              index,
                              "description",
                              event.target.value
                            )
                          }
                          placeholder="주요 업무와 성과"
                          className="min-h-[120px]"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <CareerTextarea
                          value={item.memo ?? ""}
                          onChange={(event) =>
                            updateExperienceField(
                              index,
                              "memo",
                              event.target.value
                            )
                          }
                          placeholder="추가 메모"
                          className="min-h-[90px]"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ProfileSection>

          <ProfileSection title="">
            <EditSectionHeader
              title="학력"
              onAdd={addEducation}
              addLabel="학력 추가"
            />
            <div className="space-y-3">
              {draft.talentEducations.length === 0 ? (
                <EmptyEditState label="아직 학력 정보가 없습니다. 항목을 추가해 주세요." />
              ) : (
                draft.talentEducations.map((item, index) => (
                  <div
                    key={item.clientKey}
                    className="rounded-[12px] border border-beige900/10 bg-white/35 p-4"
                  >
                    <div className="mb-3 flex items-start justify-end">
                      <ItemRemoveButton
                        onClick={() => removeEducation(index)}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <CareerTextInput
                        value={item.school ?? ""}
                        onChange={(event) =>
                          updateEducationField(
                            index,
                            "school",
                            event.target.value
                          )
                        }
                        placeholder="학교명"
                        className="h-10"
                      />
                      <CareerTextInput
                        value={item.degree ?? ""}
                        onChange={(event) =>
                          updateEducationField(
                            index,
                            "degree",
                            event.target.value
                          )
                        }
                        placeholder="학위"
                        className="h-10"
                      />
                      <CareerTextInput
                        value={item.field ?? ""}
                        onChange={(event) =>
                          updateEducationField(
                            index,
                            "field",
                            event.target.value
                          )
                        }
                        placeholder="전공"
                        className="h-10"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <CareerTextInput
                          value={item.start_date ?? ""}
                          onChange={(event) =>
                            updateEducationField(
                              index,
                              "start_date",
                              event.target.value
                            )
                          }
                          placeholder="시작일"
                          className="h-10"
                        />
                        <CareerTextInput
                          value={item.end_date ?? ""}
                          onChange={(event) =>
                            updateEducationField(
                              index,
                              "end_date",
                              event.target.value
                            )
                          }
                          placeholder="종료일"
                          className="h-10"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <CareerTextarea
                          value={item.description ?? ""}
                          onChange={(event) =>
                            updateEducationField(
                              index,
                              "description",
                              event.target.value
                            )
                          }
                          placeholder="학력 설명"
                          className="min-h-[120px]"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <CareerTextarea
                          value={item.memo ?? ""}
                          onChange={(event) =>
                            updateEducationField(
                              index,
                              "memo",
                              event.target.value
                            )
                          }
                          placeholder="추가 메모"
                          className="min-h-[90px]"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ProfileSection>

          <ProfileSection title="">
            <EditSectionHeader
              title="추가 정보"
              onAdd={addExtra}
              addLabel="추가 정보"
            />
            <div className="space-y-3">
              {draft.talentExtras.length === 0 ? (
                <EmptyEditState label="수상, 활동, 오픈소스 같은 추가 정보를 넣을 수 있습니다." />
              ) : (
                draft.talentExtras.map((item, index) => (
                  <div
                    key={item.clientKey}
                    className="rounded-[12px] border border-beige900/10 bg-white/35 p-4"
                  >
                    <div className="mb-3 flex items-start justify-end">
                      <ItemRemoveButton onClick={() => removeExtra(index)} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <CareerTextInput
                        value={item.title ?? ""}
                        onChange={(event) =>
                          updateExtraField(index, "title", event.target.value)
                        }
                        placeholder="제목"
                        className="h-10"
                      />
                      <CareerTextInput
                        value={item.date ?? ""}
                        onChange={(event) =>
                          updateExtraField(index, "date", event.target.value)
                        }
                        placeholder="날짜"
                        className="h-10"
                      />
                      <div className="md:col-span-2">
                        <CareerTextarea
                          value={item.description ?? ""}
                          onChange={(event) =>
                            updateExtraField(
                              index,
                              "description",
                              event.target.value
                            )
                          }
                          placeholder="설명"
                          className="min-h-[120px]"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <CareerTextarea
                          value={item.memo ?? ""}
                          onChange={(event) =>
                            updateExtraField(index, "memo", event.target.value)
                          }
                          placeholder="추가 메모"
                          className="min-h-[90px]"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ProfileSection>
        </>
      ) : hasAnyProfileData ? (
        <>
          <ProfileSection title="">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[8px] border border-beige900/10 bg-white/45 text-[24px] text-beige900/70">
                {talentUser?.profile_picture &&
                !talentUser.profile_picture.includes("media.licdn.com") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={talentUser.profile_picture}
                    alt={talentUser?.name ?? "profile"}
                    className="h-[72px] w-[72px] rounded-[8px] object-cover"
                  />
                ) : (
                  initials(talentUser?.name)
                )}
              </div>

              <div className="min-w-0 flex flex-col gap-1.5">
                <div className="font-halant text-2xl font-medium leading-[1] text-beige900">
                  {talentUser?.name ?? "Unknown"}
                </div>

                {talentUser?.headline && (
                  <div className="text-base leading-6">
                    {talentUser.headline}
                  </div>
                )}

                {talentUser?.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4" />
                    <span>{locationEnToKo(talentUser.location)}</span>
                  </div>
                )}
              </div>
            </div>
          </ProfileSection>

          {talentUser?.bio && (
            <ProfileSection title="bio">
              <div className="whitespace-pre-wrap text-[14px] leading-6 text-beige900/60">
                {talentUser.bio}
              </div>
            </ProfileSection>
          )}

          {mergedExperience.length > 0 && (
            <ProfileSection title="경력 및 학력">
              <div>
                {mergedExperience.map((entry, index) => {
                  if (entry.kind === "exp") {
                    const exp = entry.item;
                    const subtitle = [exp.company_name, exp.company_location]
                      .filter(Boolean)
                      .join(" · ");
                    const meta = [
                      formatRange(exp.start_date, exp.end_date),
                      formatMonth(exp.months),
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <TimelineBlock
                        key={`exp-${exp.id}-${index}`}
                        title={exp.role ?? "Employee"}
                        subtitle={subtitle}
                        meta={meta}
                        description={exp.description ?? ""}
                        memo={exp.memo ?? ""}
                        icon={<Building2 className="h-4 w-4" />}
                        logoUrl={exp.company_logo}
                        logoAlt={exp.company_name ?? exp.role ?? "Company"}
                        isLast={index === mergedExperience.length - 1}
                      />
                    );
                  }

                  const edu = entry.item;

                  return (
                    <TimelineBlock
                      key={`edu-${edu.id}-${index}`}
                      title={edu.school ?? "Student"}
                      subtitle={[edu.field, edu.degree]
                        .filter(Boolean)
                        .join(" · ")}
                      meta={formatRange(edu.start_date, edu.end_date)}
                      description={edu.description ?? ""}
                      memo={edu.memo ?? ""}
                      icon={<SchoolIcon className="h-4 w-4" />}
                      isLast={index === mergedExperience.length - 1}
                    />
                  );
                })}
              </div>
            </ProfileSection>
          )}

          {talentExtras.length > 0 && (
            <ProfileSection title="추가 정보">
              <div>
                {talentExtras.map((extra, index) => (
                  <TimelineBlock
                    key={`extra-${index}-${extra.title ?? "untitled"}`}
                    title={extra.title ?? "기타"}
                    subtitle={extra.date ?? ""}
                    description={extra.description ?? ""}
                    memo={extra.memo ?? ""}
                    icon={<AwardIcon className="h-4 w-4" />}
                    isLast={index === talentExtras.length - 1}
                  />
                ))}
              </div>
            </ProfileSection>
          )}
        </>
      ) : (
        <div className="rounded-[12px] border border-dashed border-beige900/20 bg-white/35 px-5 py-6 text-sm leading-6 text-beige900/60">
          아직 저장된 프로필 내용이 없습니다. 수정하기를 눌러 직접 입력할 수
          있습니다.
        </div>
      )}
    </div>
  );
};

export default React.memo(CareerTalentProfilePanel);
