import { locationEnToKo } from "@/utils/language_map";
import { useRouter } from "next/router";
import React, { useState } from "react";
import ConfirmModal from "./Modal/ConfirmModal";
import { Lock } from "lucide-react";

const NameProfile = ({
  id,
  profile_picture,
  name,
  headline,
  location,
}: {
  id: string;
  profile_picture: string;
  name: string;
  headline: string;
  location: string;
}) => {
  const router = useRouter();
  const [isRevealConfirmModalOpen, setIsRevealConfirmModalOpen] =
    useState(false);

  const handleReveal = () => {
    if (isRevealConfirmModalOpen) {
      setIsRevealConfirmModalOpen(false);
    } else {
      setIsRevealConfirmModalOpen(true);
    }
  };

  return (
    <div className="flex flex-row flex-1 items-start gap-4">
      <ConfirmModal
        open={isRevealConfirmModalOpen}
        onClose={() => setIsRevealConfirmModalOpen(false)}
        onConfirm={() => handleReveal()}
        title="이 프로필을 열람할까요?"
        description="이 작업은 되돌릴 수 없습니다."
        confirmLabel="열람"
        cancelLabel="취소"
      />
      <div
        onClick={() => router.push(`/my/p/${id}`)}
        className="cursor-pointer rounded-full hover:border-accenta1/80 border border-transparent transition-colors duration-100"
      >
        <Avatar url={profile_picture} name={name} size="lg" />
      </div>

      <div className="flex flex-col items-start justify-between">
        <div className="flex flex-col gap-0">
          <div
            className="truncate font-medium text-lg hover:underline cursor-pointer relative"
            onClick={() => router.push(`/my/p/${id}`)}
          >
            {/* <div className="absolute inset-0 bg-white/10 z-10 blur-xl rounded-full"></div> */}
            {name ?? id}
          </div>

          {headline && (
            <div className="mt-1 font-light text-base text-hgray800">
              {headline}
            </div>
          )}
          {location && (
            <div className="mt-1 text-sm text-hgray600 font-light">
              {locationEnToKo(location)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(NameProfile);

export const initials = (name?: string | null) =>
  (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "U";

const SIZE_CLASS = {
  sm: "w-8 h-8 min-w-8 text-xs",
  md: "w-10 h-10 min-w-10 text-sm",
  lg: "w-20 h-20 min-w-20 text-base",
} as const;

export function Avatar({
  url,
  name,
  size = "md",
  className = "",
  isProfileRevealed = true,
}: {
  url?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  isProfileRevealed?: boolean;
}) {
  const sizeClass = SIZE_CLASS[size];

  const image = () => {
    if (url?.includes("media.licdn.com")) {
      return (
        <div
          className={`${sizeClass} rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center font-semibold ring-1 ring-black/10 ${className}`}
        >
          {initials(name)}
        </div>
      );
    }
    if (url?.includes("https://scholar.google")) {
      return (
        <img
          src="/images/scholar_profile.png"
          alt={name ?? "profile"}
          className={`${sizeClass} rounded-full object-cover ring-1 ring-black/10 ${className}`}
        />
      );
    }

    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? "profile"}
        className={`${sizeClass} rounded-full object-cover ring-1 ring-black/10 ${className}`}
      />
    ) : (
      <div
        className={`${sizeClass} rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center font-semibold ring-1 ring-black/10 ${className}`}
      >
        {initials(name)}
      </div>
    );
  };
  return (
    <div className="relative">
      {image()}
      {isProfileRevealed ? null : (
        <div className="flex items-center justify-center absolute w-full h-full top-0 left-0 bg-white/10 z-10 backdrop-blur-md rounded-full">
          <Lock className="w-4 h-4 text-black/90" />
        </div>
      )}
    </div>
  );
}
