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

test("a posting as a mail bullet: bold company | title | place, then the reason sentence", async () => {
  const { postingBulletMarkdown, postingBulletText } = await import("./postingFrame");
  const posting = { companyName: "예시페이", title: "백엔드 엔지니어", location: "서울", why: "맞아요.", summary: "필요한 것과 경험이 맞아요.", fit: ["결제 → 결제 6년"] };
  // The mail shows the reason sentence only (no check marks or arrows); the need → experience lines stay on the log.
  assert.equal(postingBulletMarkdown(posting), "- **예시페이** │ 백엔드 엔지니어 │ 서울  \n  필요한 것과 경험이 맞아요.");
  assert.equal(postingBulletText(posting), "• 예시페이 │ 백엔드 엔지니어 │ 서울\n  필요한 것과 경험이 맞아요.");
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

