/**
 * #1 후보자 링크: the review form of an application mail always offers 'Harper 후보 요약 링크 넣기' (Shaun 11/18: in the
 * first days 2 of 5 application mails went out without the box ever being offered). The application guide asks the
 * writer to add it; this adds it in code when a form looks like an application mail (a résumé or other document to a
 * company address) and the box is missing. Checked by default like the other boxes; the user can uncheck it. Pure.
 */
import type { CareerFormDraft } from "@/lib/career/forms/schema";

export const PROFILE_LINK_BOX_LABEL = "Harper 후보 요약 링크 넣기";
export const PROFILE_LINK_BOX_DESCRIPTION =
  "회사가 가입 없이 볼 수 있는 내 요약 링크(경력·이 공고에 맞는 이유, 희망 연봉 제외)를 지원서에 넣어요. 하퍼 링크와 함께 지원하면 합격 가능성이 높아져요.";

/** Mailbox providers people use for themselves: an address there is never a company's. */
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "naver.com", "daum.net", "hanmail.net", "kakao.com", "nate.com", "outlook.com",
  "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com",
]);

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

/** Every text a form shows: labels, descriptions and string values of its items. */
function formTexts(form: Pick<CareerFormDraft, "title" | "items">): string[] {
  const texts = [form.title ?? ""];
  for (const item of form.items) {
    texts.push(item.label, item.description ?? "");
    if (typeof item.content === "string") texts.push(item.content);
    else for (const value of Object.values(item.content)) if (typeof value === "string") texts.push(value);
  }
  return texts;
}

/** Whether the form sends a document to an address on a company's domain (an application mail). */
export function looksLikeApplicationMail(form: Pick<CareerFormDraft, "title" | "items">): boolean {
  if (!form.items.some((item) => item.type === "document")) return false;
  for (const text of formTexts(form)) {
    for (const match of text.matchAll(EMAIL)) {
      const domain = match[1].toLowerCase();
      if (!PERSONAL_DOMAINS.has(domain)) return true;
    }
  }
  return false;
}

/**
 * The form with the box added when it looks like an application mail and has none (matched by its label), or the
 * same form. `added` says whether it was added, so the writer can be told.
 */
export function withProfileLinkBox<T extends Pick<CareerFormDraft, "kind" | "title" | "items">>(form: T): { form: T; added: boolean } {
  if (form.kind !== "form" || !looksLikeApplicationMail(form)) return { form, added: false };
  if (form.items.some((item) => item.label.includes("후보 요약 링크") || /candidate summary link/i.test(item.label))) return { form, added: false };
  const ids = new Set(form.items.map((item) => item.id));
  let id = "harper_candidate_link";
  for (let n = 2; ids.has(id); n += 1) id = `harper_candidate_link_${n}`;
  const box = { id, label: PROFILE_LINK_BOX_LABEL, description: PROFILE_LINK_BOX_DESCRIPTION, type: "checkbox", content: { value: true } };
  return { form: { ...form, items: [...form.items, box] }, added: true };
}
