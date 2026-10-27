/** Local/opt-in diagnostics: never include audio, transcripts, SDP or device IDs. */
export function isLiveSessionDebugEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;
  try {
    return (
      new URLSearchParams(window.location.search).get("voiceDebug") === "1" ||
      window.localStorage.getItem("careerVoiceDebug") === "1"
    );
  } catch {
    return false;
  }
}

export async function readLiveAudioDiagnostics(peer: RTCPeerConnection) {
  const stats = await peer.getStats();
  const input: Record<string, unknown>[] = [];
  const outbound: Record<string, unknown>[] = [];
  stats.forEach((stat) => {
    if (stat.kind !== "audio") return;
    if (stat.type === "media-source") {
      input.push({
        audioLevel: stat.audioLevel,
        totalAudioEnergy: stat.totalAudioEnergy,
        totalSamplesDuration: stat.totalSamplesDuration,
      });
    }
    if (stat.type === "outbound-rtp") {
      outbound.push({
        bytesSent: stat.bytesSent,
        packetsSent: stat.packetsSent,
      });
    }
  });
  return {
    connectionState: peer.connectionState,
    tracks: peer
      .getSenders()
      .filter((sender) => sender.track?.kind === "audio")
      .map(({ track }) => ({
        enabled: track!.enabled,
        muted: track!.muted,
        readyState: track!.readyState,
      })),
    input,
    outbound,
  };
}
