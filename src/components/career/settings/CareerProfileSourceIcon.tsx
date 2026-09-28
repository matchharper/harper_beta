import { Globe2 } from "lucide-react";
import Image from "next/image";
import { CAREER_PROFILE_LINK_SOURCES } from "@/lib/career/profileSources";

export default function CareerProfileSourceIcon({
  source,
  small = false,
}: {
  source: number | "gmail";
  small?: boolean;
}) {
  const iconSrc =
    source === "gmail"
      ? "/images/logos/gmail.svg"
      : CAREER_PROFILE_LINK_SOURCES[source]?.iconSrc;
  if (!iconSrc) {
    return (
      <Globe2
        className={small ? "h-2.5 w-2.5" : "h-5 w-5"}
        aria-hidden="true"
      />
    );
  }
  return (
    <Image
      src={iconSrc}
      alt=""
      width={22}
      height={22}
      className={`${small ? "h-2.5 w-2.5" : "h-[22px] w-[22px]"} object-contain`}
    />
  );
}
