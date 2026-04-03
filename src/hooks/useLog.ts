import { useAuthStore } from "@/store/useAuthStore";
import { postLogEvent } from "@/lib/logEvent";

// hooks/useLogEvent.ts
export function useLogEvent() {
  const { session } = useAuthStore();

  return async (type: string) => {
    await postLogEvent(type, { accessToken: session?.access_token ?? null });
  };
}
