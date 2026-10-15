import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { fillApplicationText, inspectApplicationFields } from "./applicationFormInput";

// Exercise exactly the serialized helpers installed in the hosted driver.
const fill = new Function(`return (${fillApplicationText.toString()})`)() as typeof fillApplicationText;
const inspect = new Function(`return (${inspectApplicationFields.toString()})`)() as typeof inspectApplicationFields;

test("stale visible input is repaired with real events and retained across a user wait", { skip: process.env.APPLICATION_BROWSER_TEST !== "1" }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.RESUME_CHROMIUM_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<form><label>Email<input type="email" required></label><button>Submit</button></form><output></output>
      <script>
      let savedEmail = ''; let submitted = 0;
      const field = document.querySelector('input');
      field.addEventListener('input', () => savedEmail = field.value);
      document.querySelector('form').onsubmit = e => {
        e.preventDefault();
        document.querySelector('output').textContent = savedEmail ? 'Accepted '+(++submitted) : 'Missing entry for required field: Email';
      };
      </script>`);
    const email = page.getByLabel("Email");
    await email.evaluate(e => { (e as HTMLInputElement).value = "fixture@example.com"; });
    await page.getByRole("button").click();
    assert.match(await page.locator("output").innerText(), /Missing entry/);
    await fill(email, "fixture@example.com");
    const fields = await inspect(page);
    assert.equal(fields[0].valid, true);
    assert.equal(JSON.stringify(fields).includes("fixture@example.com"), false);
    // Simulate another function-tool turn without reloading the page.
    await page.evaluate(() => document.body.setAttribute("data-resumed", "true"));
    await page.getByRole("button").click();
    assert.equal(await page.locator("output").innerText(), "Accepted 1");
    await assert.rejects(fill(email, "invalid"), /validation/);
    await assert.rejects(fill(page.locator("input.missing"), "x"), /Expected one/);
    await page.setContent('<label>Approved answer<textarea></textarea></label><output></output><script>document.querySelector("textarea").addEventListener("input",e=>document.querySelector("output").textContent=e.target.value)</script>');
    const answer = "승인된 한국어 지원 답변입니다.\n".repeat(200);
    await fill(page.getByLabel("Approved answer"), answer);
    assert.equal(await page.locator("output").textContent(), answer);
  } finally { await browser.close(); }
});
