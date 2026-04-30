import { LifeBuoy, LoaderCircle, LogOut, Settings2, X } from "lucide-react";
import { useState } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerNotificationsPopover from "./CareerNotificationsPopover";
import { careerCx } from "./ui/CareerPrimitives";
import {
  BeigeActionDropdown,
  BeigeActionDropdownItem,
  BeigeActionDropdownSeparator,
} from "@/components/ui/beige/action-dropdown";
import { DropdownMenuLabel } from "@/components/ui/beige/dropdown-menu";
import React from "react";
import { showToast } from "@/components/toast/toast";
import { useCareerApi } from "@/hooks/career/useCareerApi";

export type CareerWorkspaceTab = "home" | "profile" | "history";

export const isCareerWorkspaceTab = (
  value: string | null | undefined
): value is CareerWorkspaceTab =>
  value === "home" || value === "profile" || value === "history";

export const getCareerWorkspaceHref = (tab: CareerWorkspaceTab) =>
  tab === "home" ? "/career" : `/career/${tab}`;

const CareerWorkspaceNav = () => {
  const {
    user,
    onLogout,
    onOpenSettings,
    talentProfile,
    notifications,
    unreadNotificationCount,
    notificationsMarkingAsRead,
    notificationsError,
    onMarkNotificationsRead,
  } = useCareerSidebarContext();
  const { fetchWithAuth } = useCareerApi();

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");
  const profileName = talentProfile.talentUser?.name ?? displayName;
  const profileEmail = user?.email ?? "";
  const profileImageUrl =
    talentProfile.talentUser?.profile_picture ??
    user?.user_metadata?.avatar_url;
  const normalizedProfileName = String(profileName ?? "Candidate");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryEmail, setInquiryEmail] = useState(profileEmail);
  const [inquiryContent, setInquiryContent] = useState("");
  const [inquirySubmitting, setInquirySubmitting] = useState(false);

  const profileInitial =
    normalizedProfileName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") || "C";

  const handleOpenSupport = () => {
    setInquiryEmail(profileEmail);
    setInquiryContent("");
    setInquiryOpen(true);
    setProfileMenuOpen(false);
  };

  const handleCloseInquiry = () => {
    if (inquirySubmitting) return;
    setInquiryOpen(false);
  };

  const handleSubmitInquiry = async () => {
    const email = inquiryEmail.trim();
    const content = inquiryContent.trim();

    if (inquirySubmitting) return;

    if (!email) {
      showToast({ message: "이메일을 입력해 주세요.", variant: "white" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast({
        message: "올바른 이메일 형식으로 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    if (!content) {
      showToast({ message: "문의 내용을 입력해 주세요.", variant: "white" });
      return;
    }

    setInquirySubmitting(true);

    try {
      const response = await fetchWithAuth("/api/feedback/career", {
        method: "POST",
        body: JSON.stringify({
          email,
          content,
          pagePath:
            typeof window !== "undefined"
              ? window.location.pathname
              : "/career",
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.error) {
        throw new Error(data?.error ?? "문의 저장에 실패했습니다.");
      }

      setInquiryOpen(false);
      setInquiryContent("");
      showToast({ message: "문의가 접수되었습니다.", variant: "white" });
    } catch (error) {
      console.error("career inquiry submit failed:", error);
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "문의 접수 중 오류가 발생했습니다.",
        variant: "error",
      });
    } finally {
      setInquirySubmitting(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-20 bg-beige50 text-beige900 backdrop-blur-xl">
        <div className="flex flex-row items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
          <div className="font-halant text-[1.1rem] text-beige900">Harper</div>
          <div className="flex items-center gap-2">
            <CareerNotificationsPopover
              notifications={notifications}
              unreadNotificationCount={unreadNotificationCount}
              notificationsMarkingAsRead={notificationsMarkingAsRead}
              notificationsError={notificationsError}
              onMarkNotificationsRead={onMarkNotificationsRead}
              showLabel={false}
              align="end"
              side="bottom"
              sideOffset={12}
              buttonClassName="h-8 w-8 rounded-xl border border-beige900/10 bg-white/75 px-0 text-beige900 shadow-[0_8px_24px_rgba(37,20,6,0.05)] hover:border-beige900/20 hover:bg-white"
            />
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="설정"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-beige900/10 bg-white/75 text-beige900 shadow-[0_8px_24px_rgba(37,20,6,0.05)] transition-colors hover:border-beige900/20 hover:bg-white"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <BeigeActionDropdown
              open={profileMenuOpen}
              onOpenChange={setProfileMenuOpen}
              align="end"
              side="bottom"
              sideOffset={12}
              contentClassName="w-[236px]"
              trigger={
                <button
                  type="button"
                  aria-label="프로필 메뉴"
                  className={careerCx(
                    "flex h-8 w-8 items-center justify-center overflow-hidden rounded-[12px] border bg-white/80 shadow-[0_8px_24px_rgba(37,20,6,0.05)] transition-all",
                    profileMenuOpen
                      ? "border-beige900/20 ring-4 ring-white/70"
                      : "border-beige900/10 hover:border-beige900/20 hover:bg-white"
                  )}
                >
                  {profileImageUrl &&
                  !profileImageUrl.includes("media.licdn.com") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profileImageUrl}
                      alt={profileName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-medium text-beige900">
                      {profileInitial}
                    </span>
                  )}
                </button>
              }
            >
              <DropdownMenuLabel className="px-3 pb-2 pt-2.5">
                <div className="truncate text-sm font-medium text-beige900">
                  {profileName}
                </div>
                <div className="mt-1 truncate text-[12px] font-normal text-beige900/50">
                  {profileEmail || "Career profile"}
                </div>
              </DropdownMenuLabel>
              <BeigeActionDropdownSeparator />
              <BeigeActionDropdownItem
                onSelect={handleOpenSupport}
                className="flex flex-row items-center gap-2.5"
              >
                <LifeBuoy className="h-4 w-4" />
                문의하기
              </BeigeActionDropdownItem>
              <BeigeActionDropdownItem
                onSelect={() => void onLogout()}
                tone="danger"
                className="flex flex-row items-center gap-2.5"
              >
                <LogOut className="h-4 w-4" />
                로그아웃
              </BeigeActionDropdownItem>
            </BeigeActionDropdown>
          </div>
        </div>
      </header>
      {inquiryOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="문의 모달 닫기"
            onClick={handleCloseInquiry}
            className="absolute inset-0 bg-beige900/15 backdrop-blur-[2px]"
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitInquiry();
            }}
            className="relative z-10 w-full max-w-[460px] rounded-2xl border border-beige900/10 bg-beige50 p-5 shadow-[0_20px_60px_rgba(37,20,6,0.18)]"
          >
            <button
              type="button"
              onClick={handleCloseInquiry}
              disabled={inquirySubmitting}
              aria-label="문의 모달 닫기"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-beige900/50 transition hover:bg-beige900/[0.05] hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="pr-8">
              <h2 className="text-lg font-semibold text-beige900">문의하기</h2>
              <p className="mt-2 text-sm leading-6 text-beige900/55">
                확인 후 입력하신 이메일로 답변드리겠습니다.
              </p>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-beige900/70">
                  이메일
                </span>
                <input
                  type="email"
                  value={inquiryEmail}
                  onChange={(event) => setInquiryEmail(event.target.value)}
                  disabled={inquirySubmitting}
                  placeholder="example@example.com"
                  className="h-11 w-full rounded-xl border border-beige900/10 bg-white/75 px-3 text-sm text-beige900 outline-none transition placeholder:text-beige900/30 focus:border-beige900/30 focus:ring-2 focus:ring-beige900/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-beige900/70">
                  문의 내용
                </span>
                <textarea
                  value={inquiryContent}
                  onChange={(event) => setInquiryContent(event.target.value)}
                  disabled={inquirySubmitting}
                  rows={4}
                  placeholder="문의하실 내용을 입력해 주세요."
                  className="w-full resize-none rounded-xl border border-beige900/10 bg-white/75 px-3 py-3 text-sm leading-6 text-beige900 outline-none transition placeholder:text-beige900/30 focus:border-beige900/30 focus:ring-2 focus:ring-beige900/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseInquiry}
                disabled={inquirySubmitting}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-beige900/10 bg-white/65 px-4 text-sm font-medium text-beige900/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                닫기
              </button>
              <button
                type="submit"
                disabled={inquirySubmitting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-beige900 px-4 text-sm font-medium text-beige50 transition hover:bg-beige900/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {inquirySubmitting ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    접수 중
                  </>
                ) : (
                  "제출"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default React.memo(CareerWorkspaceNav);
