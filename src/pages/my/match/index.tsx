import { formatDateInputValue, formatDateTime } from "@/components/ats/utils";
import CandidateViews from "@/components/CandidateViews";
import Reveal from "@/components/landing/Animation/Reveal";
import AppLayout from "@/components/layout/app";
import MatchRoleComposer from "@/components/match/MatchRoleComposer";
import MatchWorkspaceForm from "@/components/match/MatchWorkspaceForm";
import { showToast } from "@/components/toast/toast";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/components/ui/action-dropdown";
import { Loading } from "@/components/ui/loading";
import {
  useCreateMatchWorkspace,
  useMatchCandidates,
  useMatchWorkspace,
  useSaveMatchRole,
  useUpdateMatchWorkspace,
} from "@/hooks/match/useMatchWorkspace";
import { cn } from "@/lib/cn";
import type { MatchRoleRecord } from "@/lib/match/shared";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Box,
  Building2,
  ChevronDown,
  Edit,
  Globe,
  Link2,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { BareButton } from "@/components/ui/button";

const ROLE_STATUS_LABEL: Record<MatchRoleRecord["status"], string> = {
  active: "진행중",
  ended: "종료",
  paused: "중단",
  top_priority: "최우선",
};

const TYPE_LABEL: Record<"full_time" | "part_time", string> = {
  full_time: "풀타임",
  part_time: "파트타임",
};

const ROLE_STATUS_SURFACE_CLASSNAME: Record<MatchRoleRecord["status"], string> =
  {
    active:
      "border-positive/30 bg-positive-faded text-positive hover:bg-positive-faded",
    ended:
      "border-neutral-1000-a05 bg-bg-floating text-neutral-soft hover:bg-bg-weak",
    paused: "border-info/30 bg-info-faded text-info hover:bg-info-faded",
    top_priority:
      "border-primary/40 bg-accent-200 text-primary hover:bg-accent-200",
  };

function MatchEmptyState({
  description,
  title,
}: {
  description: React.ReactNode;
  title: string;
}) {
  return (
    <div className="border-y border-neutral-1000-a05 py-8 text-center">
      <div className="mx-auto flex items-center justify-center text-neutral-primary">
        <Box size={20} />
      </div>
      <div className="mt-5 text-base text-neutral-primary">{title}</div>
      <div className="mx-auto mt-3 max-w-[560px] text-sm leading-7 text-neutral-muted">
        {description}
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-row items-center justify-between w-full gap-5 py-4 px-4 rounded-md bg-bg-default border border-neutral-1000-a05 shadow-sm h-14">
      <div className="text-sm text-neutral-muted">{label}</div>
      <div className="text-right text-neutral-primary">{value}</div>
    </div>
  );
}

export default function MatchPage() {
  const router = useRouter();
  const requestedWorkspaceId =
    typeof router.query.workspaceId === "string"
      ? router.query.workspaceId
      : null;
  const requestedRoleId =
    typeof router.query.roleId === "string" ? router.query.roleId : null;
  const requestedComposer =
    typeof router.query.composer === "string" ? router.query.composer : null;
  const isRoleComposerRequested = requestedComposer === "role";
  const isWorkspaceComposerRequested = requestedComposer === "workspace";
  const { data, isLoading } = useMatchWorkspace(requestedWorkspaceId, true);
  const createWorkspace = useCreateMatchWorkspace();
  const updateWorkspace = useUpdateMatchWorkspace();
  const saveRole = useSaveMatchRole();

  const workspace = data?.workspace ?? null;
  const workspaces = data?.workspaces ?? [];
  const roles = data?.roles ?? [];
  const selectedRole =
    roles.find((role) => role.roleId === requestedRoleId) ?? null;
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);
  const [editingRole, setEditingRole] = useState<MatchRoleRecord | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const candidatesQuery = useMatchCandidates({
    enabled: Boolean(workspace),
    roleId: selectedRole?.roleId ?? null,
    workspaceId: workspace?.companyWorkspaceId ?? null,
  });

  useEffect(() => {
    if (!workspace) return;
    setShowCreateForm(false);
  }, [workspace]);

  const replaceQuery = (nextQuery: Record<string, string | undefined>) => {
    void router.replace(
      {
        pathname: "/my/match",
        query: Object.fromEntries(
          Object.entries(nextQuery).filter(([, value]) => Boolean(value))
        ),
      },
      undefined,
      { shallow: true }
    );
  };

  const persistWorkspace = async (
    values: {
      companyDescription: string;
      companyName: string;
      homepageUrl: string;
      linkedinUrl: string;
    },
    mode: "create" | "update"
  ) => {
    try {
      const response =
        mode === "create"
          ? await createWorkspace.mutateAsync(values)
          : await updateWorkspace.mutateAsync({
              ...values,
              workspaceId: workspace?.companyWorkspaceId ?? null,
            });

      const savedWorkspace = response.workspace;
      if (!savedWorkspace) {
        throw new Error("Workspace 저장에 실패했습니다.");
      }

      setShowCreateForm(false);
      setIsEditingWorkspace(false);
      replaceQuery({
        workspaceId: savedWorkspace.companyWorkspaceId,
      });
      showToast({
        message:
          mode === "create"
            ? "Workspace가 생성되었습니다."
            : "Workspace가 업데이트되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "Workspace 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const persistRole = async (values: {
    description: string;
    employmentTypes: ("full_time" | "part_time")[];
    externalJdUrl: string;
    name: string;
    status: MatchRoleRecord["status"];
  }) => {
    try {
      const response = await saveRole.mutateAsync({
        companyWorkspaceId: workspace?.companyWorkspaceId ?? null,
        description: values.description,
        employmentTypes: values.employmentTypes,
        externalJdUrl: values.externalJdUrl,
        name: values.name,
        roleId: editingRole?.roleId ?? null,
        status: values.status,
      });
      setEditingRole(null);
      replaceQuery({
        roleId: response.role.roleId,
        workspaceId: response.role.companyWorkspaceId,
      });
      showToast({
        message: editingRole
          ? "Role이 수정되었습니다."
          : "Role이 생성되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "Role 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const updateRoleStatus = async (
    role: MatchRoleRecord,
    nextStatus: MatchRoleRecord["status"]
  ) => {
    if (role.status === nextStatus) return;

    setUpdatingRoleId(role.roleId);

    try {
      const response = await saveRole.mutateAsync({
        companyWorkspaceId: role.companyWorkspaceId,
        description: role.description,
        employmentTypes: role.employmentTypes,
        externalJdUrl: role.externalJdUrl,
        name: role.name,
        roleId: role.roleId,
        status: nextStatus,
      });

      setEditingRole((current) =>
        current?.roleId === role.roleId
          ? {
              ...current,
              status: response.role.status,
            }
          : current
      );

      showToast({
        message: "Role 상태가 업데이트되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "Role 상태 변경에 실패했습니다.",
        variant: "white",
      });
    } finally {
      setUpdatingRoleId((current) =>
        current === role.roleId ? null : current
      );
    }
  };

  if (isLoading) {
    return (
      <AppLayout initialCollapse={false}>
        <Loading
          isFullScreen={true}
          label="로딩 중입니다"
          className="text-neutral-muted"
        />
      </AppLayout>
    );
  }

  const isSavingWorkspace =
    createWorkspace.isPending || updateWorkspace.isPending;
  const isRoleComposerOpen =
    Boolean(workspace) && (isRoleComposerRequested || editingRole);
  const isWorkspaceComposerOpen =
    showCreateForm || isWorkspaceComposerRequested;

  const closeWorkspaceComposer = () => {
    setShowCreateForm(false);

    if (isWorkspaceComposerRequested) {
      replaceQuery({
        roleId: selectedRole?.roleId,
        workspaceId: workspace?.companyWorkspaceId,
      });
    }
  };

  return (
    <AppLayout initialCollapse={false}>
      <div className="w-full border-b border-neutral-1000-a05 px-4 py-2.5 flex flex-row items-center justify-between">
        <div className="text-xl font-medium">Workspace</div>
        <div>
          {workspace ? (
            <ActionDropdown
              align="end"
              contentClassName="w-[260px]"
              trigger={
                <BareButton
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-floating px-3 py-2.5 text-xs font-medium text-neutral-primary transition hover:bg-bg-weak"
                >
                  <div className="flex flex-row items-center gap-2">
                    {workspace.logoUrl ? (
                      <img
                        src={workspace.logoUrl}
                        alt={workspace.companyName}
                        className="h-4 w-4 rounded-full"
                      />
                    ) : (
                      <Building2 size={14} className="text-neutral-soft" />
                    )}
                    <span className="max-w-[180px] truncate">
                      {workspace.companyName}
                    </span>
                  </div>
                  <ChevronDown size={14} className="text-neutral-muted" />
                </BareButton>
              }
            >
              {workspaces.map((item) => (
                <ActionDropdownItem
                  key={item.companyWorkspaceId}
                  onSelect={() =>
                    replaceQuery({
                      workspaceId: item.companyWorkspaceId,
                    })
                  }
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex flex-row items-center gap-2">
                    {item.logoUrl ? (
                      <img
                        src={item.logoUrl}
                        alt={item.companyName}
                        className="h-4 w-4 rounded-full"
                      />
                    ) : (
                      <Building2 size={14} className="text-neutral-soft" />
                    )}
                    <span className="truncate">{item.companyName}</span>
                  </div>
                  {workspace.companyWorkspaceId === item.companyWorkspaceId ? (
                    <span className="text-xs text-neutral-soft">선택됨</span>
                  ) : null}
                </ActionDropdownItem>
              ))}
              <ActionDropdownSeparator />
              <ActionDropdownItem
                onSelect={() => setShowCreateForm(true)}
                className="flex items-center gap-2"
              >
                <Plus size={14} />
                <span>새 Workspace 생성하기</span>
              </ActionDropdownItem>
            </ActionDropdown>
          ) : (
            <BareButton
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 rounded-md bg-black px-3 py-2.5 text-xs font-medium text-neutral-00 transition hover:bg-black/90"
            >
              <Plus size={14} />새 Workspace
            </BareButton>
          )}
        </div>
      </div>
      <div className="relative w-full px-4 py-6 sm:px-6">
        {!workspace ? (
          <motion.div
            key="match-intro"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-[920px] pb-6 pt-[10vh]"
          >
            <div className="text-center">
              <Reveal delay={0.0}>
                <Image
                  src="/svgs/people.svg"
                  alt="people"
                  width={80}
                  height={80}
                  className="mx-auto opacity-40"
                />
              </Reveal>
              <Reveal delay={0.04}>
                <div className="mt-2 font-hedvig text-2xl leading-none text-neutral-primary">
                  Harper <span className="text-neutral-muted">Scout</span>
                </div>
              </Reveal>
              <Reveal delay={0.08}>
                <p className="mx-auto flex flex-col gap-0 font-normal mt-6 max-w-[720px] text-[15px] text-neutral-primary">
                  <div>
                    하퍼는 검색 이외에도, 내부적으로 확보한 인재풀을 통해 직접
                  </div>
                  <div>
                    적합한 인재를 매칭해 인터뷰 연결까지 도와드리고 있습니다.
                  </div>
                  <div className="mt-2">
                    가장 중요하고 기준이 높은 역할을 채워드릴게요.
                  </div>
                  <div className="mt-2">
                    자세한 설명은{" "}
                    <span
                      className="text-primary underline cursor-pointer hover:text-primary"
                      onClick={() =>
                        window.open("https://www.matchharper.com", "_blank")
                      }
                    >
                      홈페이지
                    </span>
                    를 참고해 주세요.
                  </div>
                </p>
              </Reveal>

              <Reveal delay={0.12}>
                <div className="mt-10 flex flex-col items-center">
                  <a
                    href={data?.bookingUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex flex-col min-w-[232px] items-center justify-center rounded-[12px] bg-black px-6 py-2.5 text-sm font-semibold text-neutral-00 transition hover:brightness-95"
                  >
                    <div>이용 신청하기</div>
                    <div className="font-normal text-[13px] text-neutral-00/65 mt-0">
                      스케줄 선택으로 이동합니다.
                    </div>
                  </a>
                  <div className="mt-6 text-xs text-neutral-soft">
                    이미 신청을 완료하셨다면?
                  </div>
                  <Image
                    onClick={() => setShowCreateForm(true)}
                    className="mt-2 cursor-pointer hover:opacity-90 transition"
                    src="/svgs/dashed.svg"
                    alt="dashed"
                    width={232}
                    height={10}
                  />
                  {/* <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="mt-2 min-w-[240px] bg-neutral-00/5 inline-flex items-center justify-center gap-2 rounded-[12px] border-neutral-1000-a10 px-6 py-4 text-[15px] text-neutral-00/90 transition hover:border-neutral-00/30 hover:text-neutral-00"
                >
                  <Plus size={18} />새 Workspace 만들기
                </button> */}
                </div>
              </Reveal>
            </div>
          </motion.div>
        ) : (
          <div className="mx-auto max-w-[960px] pb-20 pt-6">
            <section className="">
              <div>
                <div className="flex flex-col items-wen justify-center gap-6">
                  <div className="flex flex-row w-full items-end justify-between">
                    <div className="w-64"></div>
                    <div className="flex flex-row w-full justify-center items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-bg-floating">
                        {workspace.logoUrl ? (
                          <img
                            src={workspace.logoUrl}
                            alt={workspace.companyName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Building2 size={20} className="text-neutral-soft" />
                        )}
                      </div>
                      <h1 className="text-4xl font-semibold leading-[1.05] text-neutral-primary">
                        {workspace.companyName}
                      </h1>
                    </div>

                    <div className="w-64 flex justify-end">
                      <BareButton
                        type="button"
                        onClick={() => setIsEditingWorkspace(true)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs bg-black text-neutral-00 transition hover:bg-black/90"
                      >
                        <Pencil size={14} />
                        Workspace 수정
                      </BareButton>
                    </div>
                  </div>
                  <div className="flex flex-row items-center justify-center w-full gap-4 text-sm text-neutral-muted">
                    {workspace.homepageUrl && (
                      <a
                        href={workspace.homepageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 transition hover:text-neutral-primary bg-bg-floating py-1.5 px-3 rounded-full"
                      >
                        <Globe size={14} />
                        홈페이지
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                    {workspace.linkedinUrl && (
                      <a
                        href={workspace.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 transition hover:text-neutral-primary bg-bg-floating py-1.5 px-3 rounded-full"
                      >
                        <Link2 size={14} />
                        LinkedIn
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-8 max-w-[760px] text-[15px] leading-8 text-neutral-primary">
                  {workspace.companyDescription?.trim() ||
                    "아직 회사 설명이 없습니다. 우측 수정 버튼으로 context를 추가해 주세요."}
                </div>
              </div>

              <div className="mt-8 flex flex-row items-center justify-center w-full gap-4">
                <SummaryMetric
                  label="Roles"
                  value={<span className="text-xl">{roles.length}</span>}
                />
                <SummaryMetric
                  label="Candidates"
                  value={
                    <span className="text-xl">
                      {candidatesQuery.data?.total ?? 0}
                    </span>
                  }
                />
                <SummaryMetric
                  label="Focused role"
                  value={
                    <span className="text-sm text-neutral-primary">
                      {selectedRole?.name ?? "All Roles"}
                    </span>
                  }
                />
              </div>
            </section>

            <AnimatePresence>
              {isRoleComposerOpen && (
                <MatchRoleComposer
                  title={editingRole ? "Role 수정" : "새 Role 만들기"}
                  isSaving={saveRole.isPending}
                  initialValues={
                    editingRole
                      ? {
                          description: editingRole.description,
                          employmentTypes: editingRole.employmentTypes,
                          externalJdUrl: editingRole.externalJdUrl,
                          name: editingRole.name,
                          status: editingRole.status,
                        }
                      : null
                  }
                  onCancel={() => {
                    setEditingRole(null);
                    replaceQuery({
                      roleId: selectedRole?.roleId,
                      workspaceId: workspace.companyWorkspaceId,
                    });
                  }}
                  onSubmit={persistRole}
                />
              )}
            </AnimatePresence>

            <section className="mt-16">
              <div className="flex flex-row items-center justify-between gap-5">
                <div className="text-lg font-medium text-neutral-primary">
                  Roles
                </div>
                <BareButton
                  type="button"
                  onClick={() =>
                    replaceQuery({
                      composer: "role",
                      roleId: selectedRole?.roleId,
                      workspaceId: workspace.companyWorkspaceId,
                    })
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-3 py-2 text-xs font-medium text-neutral-00 transition hover:bg-black/90"
                >
                  <Plus size={15} />
                  Role 추가하기
                </BareButton>
              </div>

              <div className="mt-4">
                {roles.length === 0 ? (
                  <MatchEmptyState
                    title="아직 등록된 Role이 없습니다"
                    description={<></>}
                  />
                ) : (
                  <div className="">
                    {roles.map((role, index) => {
                      const isActive = selectedRole?.roleId === role.roleId;
                      const isUpdatingStatus =
                        updatingRoleId === role.roleId && saveRole.isPending;

                      return (
                        <motion.div
                          key={role.roleId}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className={cn("px-1 py-5")}
                        >
                          <div
                            className={cn(
                              "border-b border-neutral-1000-a05 py-3 bg-bg-floating px-3 hover:bg-bg-floating transition-colors",
                              isActive
                                ? "border-neutral-1000-a05 bg-bg-default"
                                : "hover:border-neutral-1000-a05 hover:bg-bg-floating"
                            )}
                          >
                            <div className="flex gap-4 flex-row items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <BareButton
                                      type="button"
                                      onClick={() =>
                                        replaceQuery({
                                          roleId: role.roleId,
                                          workspaceId:
                                            workspace.companyWorkspaceId,
                                        })
                                      }
                                      className="text-left text-base font-medium leading-tight text-neutral-primary transition hover:text-neutral-primary"
                                    >
                                      {role.name}
                                    </BareButton>

                                    <div className="mt-2 max-w-[760px] text-[13px] leading-5 text-neutral-primary line-clamp-2">
                                      {role.description?.trim() ||
                                        "아직 role description이 없습니다."}
                                    </div>

                                    {role.externalJdUrl && (
                                      <a
                                        href={role.externalJdUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-4 inline-flex items-center gap-1 text-sm text-neutral-muted transition hover:text-neutral-primary"
                                      >
                                        JD 보기
                                        <ArrowUpRight size={13} />
                                      </a>
                                    )}

                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-muted">
                                      {/* {role.employmentTypes.map((item) => (
                                        <span
                                          key={item}
                                          className="inline-flex items-center rounded-full border border-neutral-1000-a05 bg-bg-floating px-2.5 py-1"
                                        >
                                          {TYPE_LABEL[item]}
                                        </span>
                                      ))} */}
                                      <span className="inline-flex text-[13px] items-center text-neutral-primary">
                                        {role.matchedCandidateCount} 매칭됨 ᐧ{" "}
                                        {formatDateInputValue(
                                          new Date(role.createdAt)
                                        )}{" "}
                                        생성
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex self-stretch flex-col items-end justify-between">
                                <BareButton
                                  type="button"
                                  onClick={() => {
                                    setEditingRole(role);
                                  }}
                                  className="inline-flex flex-row gap-2 items-center justify-center bg-bg-floating hover:bg-bg-weak rounded-md px-3 py-2 text-xs text-neutral-primary transition"
                                >
                                  <Edit size={14} />
                                  수정
                                </BareButton>

                                <ActionDropdown
                                  align="end"
                                  contentClassName="min-w-[180px]"
                                  trigger={
                                    <BareButton
                                      type="button"
                                      disabled={isUpdatingStatus}
                                      className={cn(
                                        "inline-flex shrink-0 items-center gap-2 rounded-full bg-transparent border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                                        ROLE_STATUS_SURFACE_CLASSNAME[
                                          role.status
                                        ]
                                      )}
                                    >
                                      <span>
                                        {isUpdatingStatus
                                          ? "저장 중..."
                                          : ROLE_STATUS_LABEL[role.status]}
                                      </span>
                                      <ChevronDown size={14} />
                                    </BareButton>
                                  }
                                >
                                  {(
                                    Object.keys(
                                      ROLE_STATUS_LABEL
                                    ) as MatchRoleRecord["status"][]
                                  ).map((item) => (
                                    <ActionDropdownItem
                                      key={item}
                                      onSelect={() =>
                                        void updateRoleStatus(role, item)
                                      }
                                      className="flex items-center justify-between gap-3"
                                    >
                                      <span>{ROLE_STATUS_LABEL[item]}</span>
                                      {role.status === item && (
                                        <span className="text-xs text-neutral-soft">
                                          선택됨
                                        </span>
                                      )}
                                    </ActionDropdownItem>
                                  ))}
                                </ActionDropdown>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-16">
              <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
                <div className="mt-2 text-lg font-medium text-neutral-primary">
                  현재까지 추천된 후보자
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-muted">
                  {selectedRole ? (
                    <>
                      <span className="text-neutral-primary">
                        {selectedRole.name}
                      </span>
                      <BareButton
                        type="button"
                        onClick={() =>
                          replaceQuery({
                            workspaceId: workspace.companyWorkspaceId,
                          })
                        }
                        className="text-neutral-muted transition hover:text-neutral-primary"
                      >
                        필터 해제
                      </BareButton>
                    </>
                  ) : (
                    <span>모든 role 기준으로 표시 중</span>
                  )}
                </div>
              </div>

              <div className="mt-8">
                {roles.length === 0 ? (
                  <MatchEmptyState
                    title="먼저 Role을 만들어 주세요"
                    description={
                      <>
                        role이 있어야 해당 workspace 기준으로 추천 후보를 정리할
                        수 있습니다.
                      </>
                    }
                  />
                ) : candidatesQuery.isLoading ? (
                  <div className="border-y border-neutral-1000-a05 py-12">
                    <Loading inline={true} className="text-neutral-muted" />
                  </div>
                ) : (candidatesQuery.data?.items?.length ?? 0) === 0 ? (
                  <MatchEmptyState
                    title="아직 추천된 후보가 없습니다"
                    description={
                      <>이 영역에 후보자가 추천되고, 바로 검토할 수 있습니다.</>
                    }
                  />
                ) : (
                  <CandidateViews
                    items={candidatesQuery.data?.items ?? []}
                    criterias={[]}
                    showBookmarkAction={false}
                    showMarkAction={false}
                    buildProfileHref={(candidate: any) =>
                      `/my/match/candidate/${candidate.id}?roleId=${encodeURIComponent(
                        candidate.match?.roleId ?? ""
                      )}&workspaceId=${encodeURIComponent(
                        workspace.companyWorkspaceId
                      )}`
                    }
                  />
                )}
              </div>
            </section>
          </div>
        )}

        <AnimatePresence>
          {isWorkspaceComposerOpen ? (
            <MatchWorkspaceForm
              title="새 Workspace 만들기"
              submitLabel="생성하기"
              isSubmitting={isSavingWorkspace}
              onCancel={closeWorkspaceComposer}
              onSubmit={(values) => persistWorkspace(values, "create")}
            />
          ) : null}

          {workspace && isEditingWorkspace ? (
            <MatchWorkspaceForm
              title="Workspace 수정"
              submitLabel="변경 저장"
              isSubmitting={isSavingWorkspace}
              initialValues={{
                companyDescription: workspace.companyDescription ?? "",
                companyName: workspace.companyName,
                homepageUrl: workspace.homepageUrl ?? "",
                linkedinUrl: workspace.linkedinUrl ?? "",
              }}
              onCancel={() => setIsEditingWorkspace(false)}
              onSubmit={(values) => persistWorkspace(values, "update")}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
