// career-i18n-skip-file: Internal developer controls.
"use client";

import { useCallback, useEffect, useId, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { useCareerApi } from "@/hooks/career/useCareerApi";

const SERVICE_WORKER_URL = "/harper-push-sw.js";
const ICON = "/images/logo.png";
const IMAGE = "/images/blueorangesky.png";

type Preset = { label: string; note: string; build: () => Record<string, unknown> };

const nowLabel = () =>
  new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const PRESETS: Preset[] = [
  {
    label: "기본",
    note: "제목·본문·아이콘. 누르면 /career로 이동",
    build: () => ({
      title: "새 기회가 도착했어요",
      options: { body: "Wonderful Korea · Forward Deployed Engineer", icon: ICON, data: { url: "/career" } },
    }),
  },
  {
    label: "큰 이미지",
    note: "image. macOS 기본 알림 센터에서는 보통 무시됨",
    build: () => ({
      title: "이번 주 추천 3건",
      options: { body: "이미지가 보이는지 확인해 보세요.", icon: ICON, image: IMAGE, data: { url: "/career/history" } },
    }),
  },
  {
    label: "버튼 두 개",
    note: "actions. 버튼마다 다른 URL 열기. macOS Chrome은 ‘옵션’ 메뉴 안에 표시",
    build: () => ({
      title: "Harper가 지원서를 준비했어요",
      options: {
        body: "검토 후 제출할까요?",
        icon: ICON,
        actions: [
          { action: "review", title: "검토하기" },
          { action: "later", title: "나중에" },
        ],
        data: { url: "/career", actionUrls: { review: "/career/history", later: "/career" } },
      },
    }),
  },
  {
    label: "닫을 때까지 유지",
    note: "requireInteraction. 자동으로 사라지지 않음",
    build: () => ({
      title: "답장이 왔어요",
      options: { body: "직접 닫거나 누를 때까지 남아 있어야 합니다.", icon: ICON, requireInteraction: true },
    }),
  },
  {
    label: "같은 tag로 교체",
    note: "tag + renotify. 두 번 보내면 쌓이지 않고 바뀜",
    build: () => ({
      title: "진행 상황",
      options: {
        body: `${nowLabel()} 기준 업데이트`,
        icon: ICON,
        tag: "harper-dev-progress",
        renotify: true,
      },
    }),
  },
  {
    label: "무음",
    note: "silent. 소리·진동 없이 표시",
    build: () => ({ title: "조용한 알림", options: { body: "소리 없이 도착해야 합니다.", icon: ICON, silent: true } }),
  },
  {
    label: "긴 본문",
    note: "줄바꿈·긴 글이 어디서 잘리는지 확인",
    build: () => ({
      title: "Harper 요약 — 제목이 아주 길면 어디서 잘리는지 보기 위한 긴 제목입니다",
      options: {
        body:
          "첫째 줄: 회사가 답장을 보냈습니다.\n둘째 줄: 다음 주 화요일 오후 2시 면접을 제안했습니다.\n셋째 줄: 준비할 자료 세 가지를 정리해 두었습니다.\n넷째 줄: 이 줄이 보이면 네 줄 이상 표시됩니다. 🙂",
        icon: ICON,
      },
    }),
  },
  {
    label: "모바일 옵션",
    note: "badge·vibrate·timestamp(3시간 전). 데스크톱에서는 대부분 무시",
    build: () => ({
      title: "모바일 전용 옵션",
      options: {
        body: "Android Chrome에서 배지·진동·시간 표시를 확인하세요.",
        icon: ICON,
        badge: ICON,
        vibrate: [200, 100, 200, 100, 400],
        timestamp: Date.now() - 3 * 60 * 60 * 1000,
      },
    }),
  },
  {
    label: "전부 섞기",
    note: "가능한 옵션을 한 번에. urgency high, TTL 5분",
    build: () => ({
      title: "모든 옵션",
      urgency: "high",
      ttlSeconds: 300,
      options: {
        body: "아이콘·이미지·버튼·tag·유지·진동·시간·언어를 모두 넣었습니다.",
        icon: ICON,
        image: IMAGE,
        badge: ICON,
        actions: [
          { action: "open", title: "열기" },
          { action: "dismiss", title: "닫기" },
        ],
        tag: "harper-dev-all",
        renotify: true,
        requireInteraction: true,
        vibrate: [100, 50, 100],
        timestamp: Date.now(),
        lang: "ko-KR",
        dir: "auto",
        data: { url: "/career", actionUrls: { open: "/career/history" } },
      },
    }),
  },
];

const DELAYS = [0, 5, 15, 30];

const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export default function CareerWebPushDevModal({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useCareerApi();
  const editorId = useId();
  const [supported] = useState(pushSupported);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    pushSupported() ? Notification.permission : "unsupported"
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [payload, setPayload] = useState(() => JSON.stringify(PRESETS[0].build(), null, 2));
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback(
    (line: string) => setLog((prev) => [`${nowLabel()}  ${line}`, ...prev].slice(0, 30)),
    []
  );

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL).then(async (registration) => {
      setSubscription((await registration?.pushManager.getSubscription()) ?? null);
    });
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.source !== "harper-push") return;
      const detail = [data.action && `action=${data.action}`, data.url && `→ ${data.url}`, data.error]
        .filter(Boolean)
        .join(" ");
      addLog(`SW ${data.type}: ${data.title ?? ""} ${detail}`.trim());
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [supported, addLog]);

  const subscribe = async () => {
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") throw new Error(`알림 권한: ${result}`);
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY가 없습니다. dev 서버를 다시 시작하세요.");
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      const next =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      setSubscription(next);
      addLog(`구독됨: ${new URL(next.endpoint).host}`);
    } catch (error) {
      addLog(`구독 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    if (!subscription) return;
    await subscription.unsubscribe();
    setSubscription(null);
    addLog("구독 해제");
  };

  const choosePreset = (index: number) => {
    setPresetIndex(index);
    setPayload(JSON.stringify(PRESETS[index].build(), null, 2));
  };

  const send = async () => {
    if (!subscription) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      addLog(`JSON 오류: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetchWithAuth("/api/talent/dev-web-push", {
        method: "POST",
        body: JSON.stringify({ ...parsed, delaySeconds, subscription: subscription.toJSON() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      addLog(
        result.scheduledInSeconds
          ? `${result.scheduledInSeconds}초 뒤 발송 예약`
          : `push 서비스 응답 ${result.statusCode}`
      );
    } catch (error) {
      addLog(`발송 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const maxActions =
    typeof Notification !== "undefined" && "maxActions" in Notification
      ? (Notification as unknown as { maxActions: number }).maxActions
      : "?";

  return (
    <TalentCareerModal open onClose={onClose} title="Web Push 테스트" bodyClassName="px-4 pb-5 sm:px-5">
      <div data-career-i18n-skip="true" className="space-y-4">
        <Text as="div" type="subtle" className="break-all">
          {supported
            ? `권한 ${permission} · 버튼 최대 ${maxActions}개 · ${
                subscription ? `구독 ${new URL(subscription.endpoint).host}` : "구독 안 됨"
              }`
            : "이 브라우저는 Web Push를 지원하지 않습니다. iOS는 홈 화면에 추가한 뒤에만 지원합니다."}
        </Text>
        <div className="flex flex-wrap gap-2">
          <MuteButton disabled={!supported || busy} onClick={() => void subscribe()}>
            {subscription ? "구독 다시 확인" : "권한 요청 · 구독"}
          </MuteButton>
          {subscription ? (
            <MuteButton disabled={busy} onClick={() => void unsubscribe()}>
              구독 해제
            </MuteButton>
          ) : null}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-neutral-primary">예시</legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset, index) => (
              <MuteButton
                key={preset.label}
                size="sm"
                variant={index === presetIndex ? "dark" : "default"}
                onClick={() => choosePreset(index)}
              >
                {preset.label}
              </MuteButton>
            ))}
          </div>
          <Text as="div" type="subtle">
            {PRESETS[presetIndex].note}
          </Text>
        </fieldset>
        <label htmlFor={editorId} className="block space-y-2 text-sm">
          <span>보낼 내용 (title, options는 showNotification 인자 그대로. urgency·ttlSeconds·topic은 push 전송 옵션)</span>
          <Textarea
            id={editorId}
            rows={14}
            className="font-mono text-[12px]"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {DELAYS.map((delay) => (
            <MuteButton
              key={delay}
              size="sm"
              variant={delay === delaySeconds ? "dark" : "default"}
              onClick={() => setDelaySeconds(delay)}
            >
              {delay === 0 ? "즉시" : `${delay}초 뒤`}
            </MuteButton>
          ))}
          <MuteButton disabled={!subscription || busy} onClick={() => void send()}>
            보내기
          </MuteButton>
        </div>
        <Text as="div" type="subtle">
          지연 발송을 고르면 그 사이 탭을 닫거나 다른 앱으로 옮겨 도착을 확인할 수 있습니다.
        </Text>
        {log.length ? (
          <pre className="max-h-48 overflow-auto rounded-lg bg-surface-tint p-3 text-[12px] leading-5 whitespace-pre-wrap">
            {log.join("\n")}
          </pre>
        ) : null}
      </div>
    </TalentCareerModal>
  );
}
