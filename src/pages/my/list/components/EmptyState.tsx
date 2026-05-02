import { useRouter } from "next/router";
import { Bookmark } from "lucide-react";

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
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-beige500/70">
            <Bookmark className="h-5 w-5 text-beige900" fill="currentColor" />
          </div>

          <div className="text-lg font-semibold text-beige900">
            {isRequestedMode
              ? "아직 Intro 요청한 후보가 없습니다"
              : "아직 저장한 후보가 없습니다"}
          </div>
          <div className="mt-1 text-sm text-beige900/80">
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

          <button
            type="button"
            onClick={() => router.push("/my")}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-beige900 px-6 py-3 text-sm font-medium text-beige100 hover:bg-beige900/90 active:bg-beige900/80 transition"
          >
            후보 검색하러 가기
          </button>
        </div>
      </div>
    </div>
  );
}
