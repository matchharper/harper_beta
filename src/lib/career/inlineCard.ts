/** Records a chat card can name; see the card contract in inlineUi.ts. */
export type CareerInlineCardCompany = {
  id: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  /** Saved company research grouped by label, newest entry first. */
  topics: {
    label: string;
    entries: { content: string; checkedAt: string | null }[];
  }[];
};

export type CareerInlineCardRecord<Role = unknown> = {
  role: Role | null;
  company: CareerInlineCardCompany | null;
};
