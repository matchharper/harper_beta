import { useRouter } from "next/router";
import { Bookmark } from "lucide-react";
import { BareButton } from "@/components/ui/button";

export default function ShortlistEmptyState({
  mode = "bookmark",
}: {
  mode?: "bookmark" | "requested";
}) {
  const router = useRouter();
  const isRequestedMode = mode === "requested";

  return (
    <div className="py-10 mt-24">
      <div className="mx-auto max-w-[520px] rounded-2xl px-6 py-8 backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bg-weak">
            <Bookmark
              className="h-5 w-5 text-neutral-primary"
              fill="currentColor"
            />
          </div>

          <div className="text-lg font-semibold text-neutral-primary">
            {isRequestedMode
              ? "아직 Intro 요청한 후보가 없습니다"
              : "아직 저장한 후보가 없습니다"}
          </div>
          <div className="mt-1 text-sm text-neutral-primary">
            {isRequestedMode ? (
              <>
                프로필에서 Intro 요청을 보내면
                <br />
                여기에서 한눈에 관리할 수 있어요.
              </>
            ) : (
              <>
                검색 중 마음에 드는 후보를 북마크하면
                <br />
                여기에서 한눈에 관리할 수 있어요.
              </>
            )}
          </div>

          <BareButton
            type="button"
            onClick={() => router.push("/my")}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-medium text-neutral-00 hover:bg-black/90 active:bg-black/80 transition"
          >
            후보 검색하러 가기
          </BareButton>
        </div>
      </div>
    </div>
  );
}
