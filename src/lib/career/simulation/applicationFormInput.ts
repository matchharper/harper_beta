import type { Locator, Page } from "playwright-core";

/** Native input events synchronize controlled form state, even if a previous
 * script left the DOM displaying the intended value without updating the app. */
export async function fillApplicationText(field: Locator, value: string) {
  if (await field.count() !== 1) throw new Error("Expected one application field");
  await field.fill("");
  if (value) await field.pressSequentially(value);
  await field.press("Tab");
  const actual = await field.inputValue();
  if (actual !== value) throw new Error("Application field did not retain the requested value");
  const valid = await field.evaluate(element => {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    return typeof input.checkValidity !== "function" || input.checkValidity();
  });
  if (!valid) throw new Error("Application field still fails browser validation");
}

// This check is necessary but cannot prove that custom server validation or
// application-level state is correct. Do not infer submission success from it.
export async function inspectApplicationFields(page: Page) {
  return page.locator("input,textarea,select").evaluateAll(elements =>
    elements.filter(element => element.getClientRects().length > 0).map(element => {
      const field = element as HTMLInputElement;
      return {
        label: field.labels?.[0]?.textContent?.trim() || field.getAttribute("aria-label") || field.name,
        type: field.type,
        filled: !!field.value,
        valid: field.validity.valid,
        error: field.validationMessage,
        ariaInvalid: field.getAttribute("aria-invalid"),
      };
    }));
}
