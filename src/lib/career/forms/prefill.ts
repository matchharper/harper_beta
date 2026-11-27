/**
 * #13·#25 같은 질문 반복: a new form of an application starts with the answers the user already gave to the same
 * questions in this conversation (11/26-27 test: birth year, how they heard of the role and GitHub were asked again for
 * each posting, and one application's questions came in five rounds). The application guide asks the writer to look
 * those answers up; this fills what it missed, only where the answer is a checkable fact: an empty text item, or an
 * empty select with an option labelled as the earlier answer, matched by the question key the answers reader dedupes
 * by. Only start forms and web application reviews (shareLinks/formGuard.ts); never a consent, checkbox, document or
 * file item, never the start form's own choices (postings, scope, saved login, site accounts: an earlier delegation's
 * choice is not this one's), and never a value the writer set. The writer is told what came from which form, so it can
 * clear one that does not fit this application; the user can change any of them.
 */
import { APPLICATION_START_ITEM_IDS, looksLikeApplicationStart, looksLikeWebApplicationReview } from "@/lib/shareLinks/formGuard";
import { getCareerFormContent, type CareerFormDraft, type CareerFormItem } from "./schema";

type EarlierAnswer = { formId: number; label: string; answer: string };
export type EarlierAnswerFill = { label: string; formId: number };

const isEmpty = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !value.trim());
const sameText = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/** An empty text or select item that is not one of the start form's own choices (the per-site account select included). */
const fillable = (item: CareerFormItem) => (item.type === "text" || item.type === "select")
  && !APPLICATION_START_ITEM_IDS.includes(item.id) && !item.id.startsWith("account_") && isEmpty(getCareerFormContent(item).value);

/** The id of the select option labelled with this answer (an option without a label shows its id), if any. */
function optionLabelled(item: CareerFormItem, answer: string): string | undefined {
  const options = getCareerFormContent(item).options;
  for (const option of Array.isArray(options) ? options : []) {
    const { id, label } = (typeof option === "string" ? { id: option, label: option } : option ?? {}) as { id?: unknown; label?: unknown };
    if (typeof id === "string" && sameText(typeof label === "string" ? label : id, answer)) return id;
  }
}

/**
 * The form with its empty fact items filled from earlier answers, the fills, and the line that tells the writer.
 * The answers are read only when the form has such an item; a failed read leaves the form as written.
 */
export async function prefillFromEarlierAnswers<T extends Pick<CareerFormDraft, "kind" | "title" | "items" | "relatedRefs">>(
  form: T, source: { answers: () => Promise<{ answers: EarlierAnswer[] }>; questionKey: (label: string) => string },
): Promise<{ form: T; filled: EarlierAnswerFill[]; note: string }> {
  if (form.kind !== "form" || !(looksLikeApplicationStart(form) || looksLikeWebApplicationReview(form)) || !form.items.some(fillable))
    return { form, filled: [], note: "" };
  const { answers } = await source.answers().catch((error) => {
    console.warn("[career-forms] Earlier answers not read for a new form", { error: String(error) });
    return { answers: [] as EarlierAnswer[] };
  });
  // Newest first, as the reader returns them.
  const earlier = new Map<string, EarlierAnswer>();
  for (const entry of answers) {
    const key = source.questionKey(entry.label);
    if (!earlier.has(key)) earlier.set(key, entry);
  }
  const filled: EarlierAnswerFill[] = [];
  const items = form.items.map((item) => {
    const entry = fillable(item) ? earlier.get(source.questionKey(item.label)) : undefined;
    const value = !entry ? undefined : item.type === "text" ? entry.answer : optionLabelled(item, entry.answer);
    if (!entry || value === undefined) return item;
    filled.push({ label: item.label, formId: entry.formId });
    return { ...item, content: { ...getCareerFormContent(item), value } };
  });
  if (!filled.length) return { form, filled, note: "" };
  return {
    form: { ...form, items },
    filled,
    note: `Filled from earlier answers: ${filled.map(({ label, formId }) => `${label} ← form ${formId}`).join("; ")}. These are the user's answers to the same question in those forms, not consent or approval; update the form to clear one that does not fit this application.`,
  };
}
