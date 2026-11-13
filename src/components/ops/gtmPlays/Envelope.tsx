import { useState } from "react";
import {
  GTM_DEFAULT_ENVELOPE,
  GTM_SENDER_DOMAIN,
  gtmEnvelopeProblem,
  parseGtmEmailList,
  type GtmEnvelope,
} from "@/lib/gtmPlays/shared";
import { Label, TextInput } from "./ui";

const STORAGE_KEY = "gtm-plays:envelope";

function readStored(): GtmEnvelope {
  if (typeof window === "undefined") return GTM_DEFAULT_ENVELOPE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return GTM_DEFAULT_ENVELOPE;
    const value = JSON.parse(raw) as Partial<GtmEnvelope>;
    return {
      fromName: typeof value.fromName === "string" ? value.fromName : GTM_DEFAULT_ENVELOPE.fromName,
      fromEmail: typeof value.fromEmail === "string" ? value.fromEmail : GTM_DEFAULT_ENVELOPE.fromEmail,
      cc: Array.isArray(value.cc) ? value.cc.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return GTM_DEFAULT_ENVELOPE;
  }
}

/**
 * The sender and CC every GTM mail form uses: Chris by default, remembered in this browser once changed so
 * the next mail starts from the same sender.
 */
export function useGtmEnvelope() {
  // The mail forms render only in the browser (after the Ops data loads), so the stored sender is read once here.
  const [envelope, setEnvelope] = useState<GtmEnvelope>(readStored);
  const update = (next: GtmEnvelope) => {
    setEnvelope(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private windows: the form still works, it just starts from Chris next time.
    }
  };
  return { envelope, setEnvelope: update, problem: gtmEnvelopeProblem(envelope) };
}

/** 보내는 사람 (이름 · 주소) and 참조, with what is wrong shown right under them. */
export function EnvelopeFields({ envelope, onChange, problem }: {
  envelope: GtmEnvelope; onChange: (next: GtmEnvelope) => void; problem: string | null;
}) {
  // Typed freely, parsed into addresses when the field loses focus.
  const [ccText, setCcText] = useState(envelope.cc.join(", "));
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <label className="block">
          <Label>보내는 사람 이름</Label>
          <TextInput value={envelope.fromName} className="w-full" onChange={(event) => onChange({ ...envelope, fromName: event.target.value })} />
        </label>
        <label className="block">
          <Label>보내는 주소 (답장도 여기로)</Label>
          <TextInput
            value={envelope.fromEmail}
            className="w-full"
            placeholder={`이름@${GTM_SENDER_DOMAIN}`}
            onChange={(event) => onChange({ ...envelope, fromEmail: event.target.value })}
          />
        </label>
      </div>
      <label className="block">
        <Label>참조 (CC, 쉼표로 여러 명)</Label>
        <TextInput
          value={ccText}
          className="w-full"
          placeholder="없음"
          onChange={(event) => setCcText(event.target.value)}
          onBlur={() => onChange({ ...envelope, cc: parseGtmEmailList(ccText) })}
        />
      </label>
      {problem ? <p className="text-[12px] text-critical">{problem}</p> : null}
    </div>
  );
}
