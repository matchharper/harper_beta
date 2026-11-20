import assert from "node:assert/strict";
import test from "node:test";
import { cleanPostingFrame, plainFrameText, postingBoxHtml, postingBoxText } from "./postingFrame";

test("model words become plain text: no links, markdown or HTML", () => {
  assert.equal(plainFrameText("[여기](https://evil.example) 보세요 **꼭** <b>지금</b> www.spam.test/x", 200), "여기 보세요 꼭 지금");
  assert.equal(plainFrameText("contact me at spam.com now", 200), "contact me at now");
  assert.ok(plainFrameText("가".repeat(300), 50).length <= 51);
});

test("a frame keeps the need → experience lines only, and falls back to the picker's why", () => {
  const frame = cleanPostingFrame({
    summary: "예시페이는 결제 시스템을 새로 만들고 있어, 결제 백엔드 6년 경험과 잘 맞아요.",
    fit: ["대규모 결제 트래픽 -> 결제 API 6년 운영", "그냥 좋은 회사예요", "PG 연동 → PG 3곳 연동", "a → b", "x → y → z", "추가 → 넷째"],
  }, "fallback");
  assert.equal(frame.summary, "예시페이는 결제 시스템을 새로 만들고 있어, 결제 백엔드 6년 경험과 잘 맞아요.");
  assert.deepEqual(frame.fit, ["대규모 결제 트래픽 → 결제 API 6년 운영", "PG 연동 → PG 3곳 연동", "추가 → 넷째"]);
  assert.deepEqual(cleanPostingFrame(null, "경력과 잘 맞아요."), { summary: "경력과 잘 맞아요.", fit: [] });
});

test("the box shows company · title (place), the summary and ✓ lines, escaped", () => {
  const posting = {
    companyName: "예시&헬스", title: "프로덕트 디자이너", location: "서울", why: "맞아요.",
    summary: "요약 문장이에요.", fit: ["사용성 테스트 → 리서치 5년"],
  };
  const html = postingBoxHtml(posting);
  assert.match(html, /예시&amp;헬스 │ 프로덕트 디자이너 │ 서울/);
  // Tags and links never reach the box.
  assert.doesNotMatch(postingBoxHtml({ ...posting, companyName: "예시<b>헬스</b> https://evil.example" }), /evil|<b>/);
  assert.match(html, /요약 문장이에요\./);
  assert.match(html, /✓<\/span>&nbsp; 사용성 테스트 → 리서치 5년/);
  assert.equal(postingBoxText(posting), "■ 예시&헬스 │ 프로덕트 디자이너 │ 서울\n요약 문장이에요.\n✓ 사용성 테스트 → 리서치 5년");
  // No frame yet (an older pick): the why is the summary.
  assert.equal(postingBoxText({ ...posting, summary: null, fit: [] }), "■ 예시&헬스 │ 프로덕트 디자이너 │ 서울\n맞아요.");
});

test("a posting as a mail bullet: company · title · place, then what the company and the role do (11/18 form)", async () => {
  const { postingBulletMarkdown, postingBulletText } = await import("./postingFrame");
  const posting = {
    companyName: "예시데이터웍스", title: "시니어 프론트엔드 엔지니어", location: "서울 강남구", why: "디자인 시스템 경험이 맞아요.",
    summary: "기업용 데이터 분석 화면을 만드는 곳이에요. 화면의 기반을 다지고 디자인 시스템을 이끄는 자리입니다.", fit: ["디자인 시스템 → 5년 운영"],
  };
  // The mail shows the description only (no check marks or arrows); the need → experience lines stay on the log.
  assert.equal(postingBulletMarkdown(posting),
    "- 예시데이터웍스 · 시니어 프론트엔드 엔지니어 · 서울\n  기업용 데이터 분석 화면을 만드는 곳이에요. 화면의 기반을 다지고 디자인 시스템을 이끄는 자리입니다.");
  assert.equal(postingBulletText(posting),
    "• 예시데이터웍스 · 시니어 프론트엔드 엔지니어 · 서울\n  기업용 데이터 분석 화면을 만드는 곳이에요. 화면의 기반을 다지고 디자인 시스템을 이끄는 자리입니다.");
  // No description (the writer failed): the names alone, never the picker's why (it is about the person).
  assert.equal(postingBulletMarkdown({ ...posting, summary: null }), "- 예시데이터웍스 · 시니어 프론트엔드 엔지니어 · 서울");
  assert.equal(postingBulletMarkdown({ ...posting, companyName: "A*B [x](https://evil.example)", summary: null }), "- AB x · 시니어 프론트엔드 엔지니어 · 서울");
});

test("a place as one short word", async () => {
  const { shortPlace } = await import("./postingFrame");
  assert.equal(shortPlace("서울 강남구"), "서울");
  assert.equal(shortPlace("서울특별시 성동구"), "서울");
  assert.equal(shortPlace("경기 성남시"), "성남");
  assert.equal(shortPlace("부산"), "부산");
  assert.equal(shortPlace("San Francisco, CA"), "San Francisco");
  assert.equal(shortPlace(null), "");
});


test("an English mail shows Korean company names and titles in English (11/18 evaluation)", async () => {
  const { withMailNames, postingBulletMarkdown } = await import("./postingFrame");
  const base = { kind: "external" as const, roleId: null, url: null, location: "서울", why: "Fits." };
  const postings = [
    { ...base, companyName: "예시페이", title: "백엔드 엔지니어" },
    { ...base, companyName: "Example Labs", title: "Data Engineer" },
    { ...base, companyName: "예시랩", title: "프론트엔드 개발자" },
  ];
  const roles = [{ company: "Yesi Pay", title: "Backend Engineer" }, { company: "Other", title: "Other" }, { company: "예시랩", title: "Frontend Engineer" }];
  const named = withMailNames(postings, roles, "en");
  // Only Korean originals get English names, and only names without Korean letters are taken.
  assert.deepEqual(named.map((posting) => [posting.mailCompany ?? null, posting.mailTitle ?? null]), [
    ["Yesi Pay", "Backend Engineer"], [null, null], [null, "Frontend Engineer"],
  ]);
  assert.match(postingBulletMarkdown(named[0]), /^- Yesi Pay · Backend Engineer/);
  // A Korean mail keeps the names as written (and drops any English ones kept from before).
  const korean = withMailNames(named, roles, "ko");
  assert.equal(korean[0].mailTitle, undefined);
  assert.match(postingBulletMarkdown(korean[0]), /^- 예시페이 · 백엔드 엔지니어/);
});

test("an English mail takes the writer's casing of a job board's lowercase id, and nothing else (11/19)", async () => {
  const { withMailNames } = await import("./postingFrame");
  const base = { kind: "external" as const, roleId: null, url: null, location: "Remote", why: "Fits." };
  const postings = [
    { ...base, companyName: "acmedata", title: "Engineer" },
    { ...base, companyName: "bluewave", title: "Designer" },
    { ...base, companyName: "northstar", title: "Engineer" },
    { ...base, companyName: "Examplepay", title: "Engineer" },
  ];
  const roles = [{ company: "AcmeData", title: "Engineer" }, { company: "BlueWave", title: "Designer" }, { company: "Other Co", title: "Engineer" }, { company: "EXAMPLEPAY", title: "Engineer" }];
  assert.deepEqual(withMailNames(postings, roles, "en").map((posting) => posting.mailCompany ?? null), ["AcmeData", "BlueWave", null, null]);
});

test("a company or title written like a web address keeps its name in the posting line (#117)", async () => {
  const { postingBulletMarkdown, postingBulletText } = await import("./postingFrame");
  const posting = { companyName: "Example3.ai", title: "Senior Backend Engineer, Integrations", location: "United States", why: "Fits.", summary: null, fit: [] };
  assert.equal(postingBulletText(posting), "• Example3.ai · Senior Backend Engineer, Integrations · United States");
  assert.equal(postingBulletMarkdown({ ...posting, companyName: "Sample.io" }), "- Sample.io · Senior Backend Engineer, Integrations · United States");
  assert.equal(postingBulletText({ ...posting, companyName: "Demo Labs", title: "ASP.NET Developer" }), "• Demo Labs · ASP.NET Developer · United States");
  assert.match(postingBoxText(posting), /^■ Example3\.ai │ Senior Backend Engineer, Integrations │ United States/);
  // A link written into a name is still taken out, and model words still lose bare web addresses.
  assert.equal(postingBulletText({ ...posting, companyName: "Example3.ai https://evil.example/x [y](https://evil.example)" }),
    "• Example3.ai y · Senior Backend Engineer, Integrations · United States");
  assert.equal(plainFrameText("see sample.io now", 200), "see now");
});

test("a posting name keeps nothing a mail could open: email addresses, glued links, addresses with a path (#117)", async () => {
  const { postingBulletText } = await import("./postingFrame");
  const posting = { companyName: "Acme", title: "Engineer", location: "Remote", why: "Fits.", summary: null, fit: [] };
  assert.equal(postingBulletText({ ...posting, title: "Engineer, apply jobs@example.com" }), "• Acme · Engineer, apply · Remote");
  assert.equal(postingBulletText({ ...posting, title: "Engineer mailto:jobs@example.com" }), "• Acme · Engineer · Remote");
  assert.equal(postingBulletText({ ...posting, companyName: "Acme _https://example.com/x" }), "• Acme · Engineer · Remote");
  assert.equal(postingBulletText({ ...posting, companyName: "Acme 1https://example.com/x" }), "• Acme · Engineer · Remote");
  assert.equal(postingBulletText({ ...posting, companyName: "Acme _www.example.com" }), "• Acme · Engineer · Remote");
  assert.equal(postingBulletText({ ...posting, title: "Engineer apply at example.io/jobs" }), "• Acme · Engineer apply at · Remote");
});
