import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";

const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), {
  ssr: false,
});

const DEMO_PLAYBACK_ID = "74ZUIm006dlmbRdtF6lWvOI01cAM4jq02SWTy010101DccnuE";
const DEMO_POSTER_PATH = "/videos/harper-demo-poster.png";

export default function DemoVideo({
  playerName = "Harper demo page",
}: {
  playerName?: string;
}) {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const internalQuery = router.query.internal;
  const isInternalPreview = Array.isArray(internalQuery)
    ? internalQuery.includes("1")
    : internalQuery === "1";
  const disableMuxTracking =
    process.env.NODE_ENV !== "production" ||
    authLoading ||
    isInternalPreview ||
    isInternalEmail(user?.email);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-none border border-neutral-1000-a10 bg-neutral-1000 shadow-[0_24px_80px_rgba(31,28,26,0.16)]">
      <MuxPlayer
        className="block aspect-video w-full bg-neutral-1000"
        playbackId={DEMO_PLAYBACK_ID}
        disableTracking={disableMuxTracking}
        poster={DEMO_POSTER_PATH}
        videoTitle="Harper Demo"
        streamType="on-demand"
        playsInline
        preload="none"
        defaultDuration={72}
        accentColor="#d96b28"
        maxAutoResolution="1080p"
        metadata={{
          video_id: "harper-demo",
          video_title: "Harper Demo",
          player_name: playerName,
        }}
      />
    </div>
  );
}
