import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/assembleCareerDesignHandoff.mjs <exported HTML> [screen JSON]");
const screens = JSON.parse(
  fs.readFileSync(process.argv[3] ?? "output/career-design-screens.json", "utf8")
);
const dom = new JSDOM(fs.readFileSync(source, "utf8"), {
  virtualConsole: new VirtualConsole(),
});
const doc = dom.window.document;
const data = JSON.parse(doc.getElementById("snapshots").textContent);
data.frames = screens;
const frames = [...doc.querySelectorAll("iframe")];
if (frames.length !== screens.length)
  throw new Error("Missing screen snapshots");
frames.forEach((frame, index) => {
  frame.removeAttribute("src");
  frame.removeAttribute("srcdoc");
  frame.setAttribute("data-snapshot", String(index));
  frame.setAttribute("sandbox", "allow-same-origin");
});
doc.getElementById("snapshots").textContent = JSON.stringify(data).replaceAll(
  "<",
  "\\u003c"
);
doc.getElementById("demo-feedback").textContent = "";
fs.mkdirSync("docs/design", { recursive: true });
fs.writeFileSync(
  "docs/design/career-floating-sky-handoff.html",
  "<!doctype html>" + doc.documentElement.outerHTML
);
console.log(
  "Assembled 8 real React component snapshots into docs/design/career-floating-sky-handoff.html"
);
