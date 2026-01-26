import { useToggleBookmark } from "@/hooks/useToggleBookmark";
import React, { useState } from "react";
import { showToast } from "../toast/toast";
import { Bookmark } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";

const Bookmarkbutton = ({
  userId,
  candidId,
  connection,
  isText = true,
  size = "md",
}: {
  userId: string;
  candidId: string;
  connection: { typed: number }[];
  isText?: boolean;
  size?: "sm" | "md" | "lg";
}) => {
  const { m } = useMessages();
  const [isBookmarked, setIsBookmarked] = useState(
    connection?.map((con) => con.typed).includes(0)
  );
  const { mutate: toggleBookmarkMutation } = useToggleBookmark();

  const toggleBookmark = () => {
    if (isBookmarked)
      showToast({ message: "북마크에서 제거되었습니다.", variant: "white" });
    else showToast({ message: "북마크에 추가되었습니다.", variant: "white" });
    toggleBookmarkMutation({ userId, candidId });
    setIsBookmarked(!isBookmarked);
  };

  return (
    <button
      onClick={toggleBookmark}
      className={`cursor-pointer text-sm rounded-xl  text-white flex flex-row items-center gap-2 ${size === "sm"
        ? "h-7 px-1.5 text-xs bg-hgray500/20 hover:bg-hgray500/30"
        : size === "lg"
          ? "h-12 px-6 text-lg bg-white/10 hover:bg-white/5"
          : "h-8 px-3 text-sm bg-white/0 hover:bg-white/5"
        }`}
    >
      {isBookmarked ? (
        <Bookmark className="w-4 h-4 text-white" fill="white" />
      ) : (
        <Bookmark className="w-4 h-4 text-white" />
      )}
      {isText && <span>{isBookmarked ? m.data.saved : m.data.save}</span>}
    </button>
  );
};

export default React.memo(Bookmarkbutton);
