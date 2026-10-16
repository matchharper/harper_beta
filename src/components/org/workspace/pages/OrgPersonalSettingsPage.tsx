import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppleSwitch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useUpdateOrgMemberProfile } from "@/hooks/org/useOrg";
import { useUnsavedChangesWarning } from "@/hooks/org/useUnsavedChangesWarning";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgPersonalSettings } from "@/lib/org/personalSettings";
import { useToastStore } from "@/store/useToastStore";

export function OrgPersonalSettingsPage() {
  const { currentUser, user, workspace } = useOrgWorkspace();
  return (
    <PersonalSettingsContent
      key={`${user.id}:${workspace.workspaceId}`}
      name={currentUser?.name ?? ""}
      role={currentUser?.role ?? ""}
    />
  );
}

function PersonalSettingsContent({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const { bootstrap, currentUser, currentUserEmail, roles, user, workspace } =
    useOrgWorkspace();
  const { locale, setLocale, c } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const updateProfile = useUpdateOrgMemberProfile();
  const { mutateAsync: updateProfileAsync } = updateProfile;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ name: string; role: string } | null>(
    null
  );
  const [languageSaving, setLanguageSaving] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [composing, setComposing] = useState(false);
  const profileSaving = useRef(false);
  const profile = draft ?? { name, role };
  const dirty = profile.name.trim() !== name || profile.role.trim() !== role;
  useUnsavedChangesWarning(dirty);

  const queryKey = ["org", "personal-settings", user.id, workspace.workspaceId];
  const settings = useQuery({
    queryKey,
    queryFn: () =>
      fetchWithInternalAuth<OrgPersonalSettings>(
        `/api/org/personal-settings?${new URLSearchParams({ workspaceId: workspace.workspaceId })}`
      ),
  });
  const updateEmail = useMutation({
    mutationFn: (emailEnabled: boolean) =>
      fetchWithInternalAuth<Pick<OrgPersonalSettings, "emailEnabled">>(
        "/api/org/personal-settings",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.workspaceId,
            emailEnabled,
          }),
        }
      ),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
    },
    onSuccess: (saved) => {
      // The preference belongs to the account, including its other workspaces.
      queryClient.setQueriesData<OrgPersonalSettings>(
        { queryKey: ["org", "personal-settings", user.id] },
        (previous) => (previous ? { ...previous, ...saved } : previous)
      );
    },
    onError: () =>
      addToast({
        message: c(
          "이메일 설정을 저장하지 못했어요. 다시 시도해 주세요.",
          "Couldn't save email settings. Try again."
        ),
        variant: "error",
      }),
  });
  const myTeamIds = new Set(
    currentUser?.teamIds ?? (currentUser?.teamId ? [currentUser.teamId] : [])
  );
  const myTeams = (bootstrap.teams ?? []).filter((team) =>
    myTeamIds.has(team.teamId)
  );
  const assignedRoleIds = new Set(settings.data?.assignedRoleIds ?? []);
  const myRoles = roles.filter((item) => assignedRoleIds.has(item.roleId));

  const saveProfile = useCallback(async () => {
    if (!draft || !currentUser || composing || profileSaving.current) return;
    const next = { name: draft.name.trim(), role: draft.role.trim() };
    if (!next.name || !next.role || (next.name === name && next.role === role))
      return;
    profileSaving.current = true;
    setProfileError(false);
    try {
      await updateProfileAsync({
        ...next,
        workspaceId: workspace.workspaceId,
      });
      // Preserve any text entered while this request was in flight.
      setDraft((current) => (current === draft ? null : current));
    } catch {
      setProfileError(true);
    } finally {
      profileSaving.current = false;
    }
  }, [
    draft,
    currentUser,
    composing,
    name,
    role,
    updateProfileAsync,
    workspace.workspaceId,
  ]);

  useEffect(() => {
    if (!dirty || composing || updateProfile.isPending || profileError) return;
    const timer = window.setTimeout(() => void saveProfile(), 700);
    return () => window.clearTimeout(timer);
  }, [dirty, composing, updateProfile.isPending, profileError, saveProfile]);

  const saving =
    updateProfile.isPending || updateEmail.isPending || languageSaving;

  return (
    <div className="max-w-[680px] space-y-4">
      <OrgPageHeader
        className="flex-row items-center justify-between"
        title={c("개인 설정", "Personal settings")}
        actions={
          <div
            role="status"
            className="flex h-7 items-center gap-1.5 text-xs text-neutral-muted"
          >
            {saving && (
              <>
                <Loader2
                  aria-hidden="true"
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                />
                {c("저장 중", "Saving")}
              </>
            )}
          </div>
        }
      />

      <OrgSection className="pb-4">
        <OrgSectionHeader className="mb-2" title={c("프로필", "Profile")} />
        <div className="space-y-1">
          <SettingsRow label={c("이름", "Name")} htmlFor="org-personal-name">
            <Input
              id="org-personal-name"
              autoComplete="name"
              required
              maxLength={200}
              value={profile.name}
              disabled={!currentUser}
              aria-invalid={!profile.name.trim()}
              onChange={(event) => {
                setDraft({ ...profile, name: event.target.value });
                setProfileError(false);
              }}
              onBlur={() => {
                if (!profileError) void saveProfile();
              }}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
            />
          </SettingsRow>
          <SettingsRow
            label={c("직무", "Job title")}
            htmlFor="org-personal-role"
          >
            <Input
              id="org-personal-role"
              autoComplete="organization-title"
              required
              maxLength={160}
              value={profile.role}
              disabled={!currentUser}
              aria-invalid={!profile.role.trim()}
              onChange={(event) => {
                setDraft({ ...profile, role: event.target.value });
                setProfileError(false);
              }}
              onBlur={() => {
                if (!profileError) void saveProfile();
              }}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
            />
          </SettingsRow>
          <SettingsRow label={c("이메일", "Email")}>
            <span className="break-all text-right">
              {currentUserEmail || "—"}
            </span>
          </SettingsRow>
        </div>
        {(!profile.name.trim() || !profile.role.trim()) && (
          <p role="alert" className="mt-2 text-right text-xs text-critical">
            {!profile.name.trim()
              ? c("이름을 입력해 주세요.", "Enter your name.")
              : c("직무를 입력해 주세요.", "Enter your job title.")}
          </p>
        )}
        {profileError && (
          <div
            role="alert"
            className="mt-2 flex items-center justify-end gap-2 text-xs text-critical"
          >
            {c("프로필을 저장하지 못했어요.", "Couldn't save your profile.")}
            <MuteButton
              onClick={() => void saveProfile()}
              disabled={updateProfile.isPending}
            >
              {c("다시 시도", "Try again")}
            </MuteButton>
          </div>
        )}
      </OrgSection>

      <OrgSection className="pb-4">
        <OrgSectionHeader
          className="mb-2"
          title={c("팀 · 담당 Role", "Teams & assigned roles")}
        />
        <div className="space-y-1">
          <SettingsRow label={c("팀", "Teams")}>
            <span className="break-words text-right">
              {myTeams.length ? (
                myTeams.map((team) => team.name).join(", ")
              ) : (
                <span className="text-neutral-soft">
                  {c("배정된 팀 없음", "No teams assigned")}
                </span>
              )}
            </span>
          </SettingsRow>
          <SettingsRow label={c("담당 Role", "Assigned roles")}>
            {settings.isPending ? (
              <Skeleton className="h-5 w-40" />
            ) : settings.isError ? (
              <span className="text-neutral-muted">
                {c("불러오지 못했어요", "Couldn't load")}
              </span>
            ) : myRoles.length ? (
              <ul className="space-y-2 text-right">
                {myRoles.map((item) => (
                  <li key={item.roleId}>
                    <Link
                      className="break-words underline-offset-4 hover:underline focus-visible:underline"
                      href={buildOrgHref({
                        page: "role",
                        roleId: item.roleId,
                        orgId: workspace.workspaceId,
                      })}
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-neutral-soft">
                {c("담당 Role 없음", "No roles assigned")}
              </span>
            )}
          </SettingsRow>
        </div>
      </OrgSection>

      <OrgSection className="pb-4">
        <SettingsRow
          label={c("안내 이메일 수신", "Receive email updates")}
          htmlFor="org-personal-email"
        >
          {settings.isPending ? (
            <Skeleton className="h-[22px] w-[42px] shrink-0 rounded-full" />
          ) : (
            <AppleSwitch
              id="org-personal-email"
              aria-label={c("안내 이메일 수신", "Receive email updates")}
              checked={
                updateEmail.isPending
                  ? updateEmail.variables
                  : (settings.data?.emailEnabled ?? false)
              }
              disabled={
                !settings.data || settings.isError || updateEmail.isPending
              }
              onCheckedChange={(enabled) => updateEmail.mutate(enabled)}
            />
          )}
        </SettingsRow>
        {settings.isError && (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center justify-end gap-3 text-sm text-critical"
          >
            {c(
              "개인 설정을 불러오지 못했어요.",
              "Couldn't load personal settings."
            )}
            <MuteButton
              disabled={settings.isFetching}
              onClick={() => void settings.refetch()}
            >
              {c("다시 시도", "Try again")}
            </MuteButton>
          </div>
        )}
      </OrgSection>

      <OrgSection className="pb-4">
        <SettingsRow
          label={c("언어", "Language")}
          htmlFor="org-personal-language"
        >
          <Select
            value={locale}
            disabled={languageSaving}
            items={[
              { value: "ko", label: "한국어" },
              { value: "en", label: "English" },
            ]}
            onValueChange={async (next) => {
              if ((next !== "ko" && next !== "en") || next === locale) return;
              setLanguageSaving(true);
              try {
                await setLocale(next);
              } catch {
                addToast({
                  message: c(
                    "언어 설정을 저장하지 못했어요. 다시 시도해 주세요.",
                    "Couldn't save language. Try again."
                  ),
                  variant: "error",
                });
              } finally {
                setLanguageSaving(false);
              }
            }}
          >
            <SelectTrigger
              id="org-personal-language"
              size="sm"
              className="w-auto gap-1.5 border-0 bg-bg-weak px-2.5 text-[13px] leading-[18px] font-medium hover:bg-neutral-1000-a10 data-[size=sm]:h-7"
            >
              <SelectValue>
                {locale === "ko" ? "한국어" : "English"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              side="bottom"
            >
              <SelectItem value="ko">한국어</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </OrgSection>
    </div>
  );
}

function SettingsRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-5 py-2 text-sm">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="min-w-0 flex-1 text-neutral-muted">
          {label}
        </label>
      ) : (
        <span className="min-w-0 flex-1 text-neutral-muted">{label}</span>
      )}
      <div className="flex w-[60%] max-w-[340px] min-w-0 justify-end">
        {children}
      </div>
    </div>
  );
}
