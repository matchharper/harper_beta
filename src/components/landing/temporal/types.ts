/** 랜딩 컴포넌트가 함께 쓰는 데이터 모양. */

export type CarouselBlock =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: readonly string[] };

export type CarouselCard =
  | {
      id: string;
      kind: "answer";
      prompt: string;
      notice?: { label: string; text: string };
      status: string;
      blocks: readonly CarouselBlock[];
      applied?: { title: string; state: string };
    }
  | {
      id: string;
      kind: "email";
      prompt: string;
      notice?: { label: string; text: string };
      status?: string;
      lead?: string;
      title: string;
      fields: readonly { label: string; value: string; multiline?: boolean }[];
      hold: string;
      send: string;
    }
  | {
      id: string;
      kind: "followups";
      notice: { label: string; text: string };
      date: string;
      heading: string;
      items: readonly { title: string; body: string; action: string }[];
      close: string;
    };

export type FeatureKey = "always" | "reach" | "apply" | "agenda" | "direct";
