import { useEffect, useState } from "react";
import { GroupedListRow, GroupedListText } from "@/components/ui/grouped-list";
import { AppleSwitch } from "@/components/ui/switch";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { CareerSettingRow } from "./CareerSettingRow";

const ENDPOINT = "/api/talent/settings/crm-broadcast";

/** Harper's group emails (/ops/crm broadcasts); recommendation emails do not depend on it. */
export default function CareerCrmBroadcastSetting({
  grouped = false,
}: {
  grouped?: boolean;
}) {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const logCareerEvent = useCareerLogEvent();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const title = t(
    "career.settings.crm_broadcast.title",
    "Harper 소식 메일 받기"
  );
  const saveFailed = t(
    "career.settings.crm_broadcast.save_failed",
    "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithAuth(ENDPOINT);
        const payload = (await response.json().catch(() => ({}))) as {
          subscribed?: boolean;
        };
        if (
          !cancelled &&
          response.ok &&
          typeof payload.subscribed === "boolean"
        ) {
          setSubscribed(payload.subscribed);
        }
      } catch {
        // The toggle stays disabled until the setting loads.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth]);

  const handleChange = async (next: boolean) => {
    if (pending || subscribed === null || next === subscribed) return;
    const previous = subscribed;
    setSubscribed(next);
    setPending(true);
    setError("");
    logCareerEvent(`click_settings_crm_broadcast_${next ? "on" : "off"}`);
    try {
      const response = await fetchWithAuth(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ subscribed: next }),
      });
      if (!response.ok) throw new Error(saveFailed);
    } catch {
      setSubscribed(previous);
      setError(saveFailed);
    } finally {
      setPending(false);
    }
  };

  const toggle = (
    <AppleSwitch
      checked={subscribed ?? false}
      disabled={pending || subscribed === null}
      onCheckedChange={(next) => void handleChange(next)}
      aria-label={title}
    />
  );

  const desc = error ? (
    <span role="alert" className="text-critical">
      {error}
    </span>
  ) : (
    ""
  );

  if (grouped) {
    return (
      <GroupedListRow className="items-start py-4">
        <GroupedListText title={title} description={desc} />
        {toggle}
      </GroupedListRow>
    );
  }

  return (
    <CareerSettingRow
      mobileActionPlacement="trailing"
      title={title}
      desc={desc}
      action={
        <div className="flex min-h-9 items-center sm:justify-end">{toggle}</div>
      }
    />
  );
}
