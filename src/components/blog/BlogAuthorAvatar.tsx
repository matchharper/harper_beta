import { cn } from "@/lib/utils";
import Image from "next/image";

type BlogAuthorAvatarProps = {
  author: string;
  avatarUrl: string;
  withRing?: boolean;
};

export default function BlogAuthorAvatar({
  author,
  avatarUrl,
  withRing = false,
}: BlogAuthorAvatarProps) {
  if (author === "Harper") {
    return (
      <Image
        src="/svgs/face.svg"
        alt=""
        aria-hidden="true"
        width={16}
        height={16}
        className="h-4 w-4 shrink-0 object-contain mt-[1px]"
      />
    );
  }

  return (
    <div
      className={cn(
        "relative h-5 w-5 shrink-0 overflow-hidden rounded-full",
        withRing && "ring-1 ring-neutral-1000-a10"
      )}
    >
      <Image
        src={avatarUrl}
        alt={author}
        fill
        className="object-cover"
        sizes="20px"
      />
    </div>
  );
}
