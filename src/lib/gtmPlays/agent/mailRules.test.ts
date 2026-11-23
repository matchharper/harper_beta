import assert from "node:assert/strict";
import test from "node:test";
import {
  NEAR_ADDRESS_CHARS, SHARED_PLATFORM_DOMAINS, addressIsPersons, agentMailableAddress, agentSenderProblem, isPlatformRoot,
  mailPersonName, mailPlainText, ownDomainAddress, personalAddressesOnPage, profileHandles, withoutLinks,
} from "./mailRules";
import { AGENT_SIGNAL_SOURCES } from "./signals";

test("model-written words reach a mail as plain text: no links, addresses, HTML or markdown", () => {
  assert.equal(
    mailPlainText("결제 경험이 맞아요. [자세히 보기](https://evil.example/x) 그리고 ![](https://evil.example/p.png) 끝", 300),
    "결제 경험이 맞아요. 자세히 보기 그리고 끝",
  );
  assert.equal(mailPlainText("See https://evil.example/a?b=1 or www.evil.example now", 300), "See or now");
  assert.equal(mailPlainText("Visit evil-site.com/path or jane.dev에서 확인", 300), "Visit or 에서 확인");
  assert.equal(mailPlainText("<a href=\"https://evil.example\">click</a> <b>bold</b> <https://evil.example>", 300), "click bold");
  assert.equal(mailPlainText("**굵게** _기울임_ ~~취소~~ `코드` \\[x\\]", 300), "굵게 기울임 취소 코드 x");
  assert.equal(mailPlainText("# 제목\n> 인용\n\n\n\n본문", 300), "제목\n인용\n\n본문");
  assert.equal(mailPlainText("메일: someone@evil.example 로 주세요 (https://evil.example)", 300), "메일: 로 주세요");
  assert.equal(mailPlainText("[ref]: https://evil.example\n본문 [링크][ref]", 300), "본문 링크");
  // Ordinary words stay: tools with dots, numbers, snake_case.
  assert.equal(mailPlainText("Node.js, Vue.js, Python 3.12, snake_case 경험", 300), "Node.js, Vue.js, Python 3.12, snake_case 경험");
  assert.equal(mailPlainText("a".repeat(50), 10), "a".repeat(10));
  assert.equal(mailPlainText(null, 10), "");
});

test("links and addresses come out of a stored body; the postings list's markdown stays", () => {
  const body = "안녕하세요 [여기](https://evil.example) www.evil.example\n\n- **Alpha** · Backend\\_Engineer \\<Seoul\\>  \n  결제 경험이 맞아요";
  assert.equal(withoutLinks(body), "안녕하세요 여기 \n\n- **Alpha** · Backend\\_Engineer \\<Seoul\\>  \n  결제 경험이 맞아요");
});

test("a name from a page: plain words, at most 60 characters, else no name", () => {
  assert.equal(mailPersonName("  Jane   Doe "), "Jane Doe");
  assert.equal(mailPersonName("[Jane](https://evil.example)"), "Jane");
  assert.equal(mailPersonName("**홍길동**"), "홍길동");
  assert.equal(mailPersonName("Jane Doe | Backend Engineer at Acme"), "Jane Doe");
  assert.equal(mailPersonName("x".repeat(61)), null);
  assert.equal(mailPersonName("Jane https://evil.example/claim-your-prize-now-before-it-expires-today"), "Jane");
  assert.equal(mailPersonName("https://evil.example"), null);
  assert.equal(mailPersonName("jane@evil.example"), null);
  assert.equal(mailPersonName("12345678"), null);
  assert.equal(mailPersonName(""), null);
  assert.equal(mailPersonName(null), null);
});

test("own-domain addresses: the address's domain is the found page's domain or its parent, never a shared platform", () => {
  assert.equal(ownDomainAddress("me@janedoe.dev", ["https://janedoe.dev/now"]), true);
  assert.equal(ownDomainAddress("me@janedoe.dev", ["https://blog.janedoe.dev/post/1"]), true);
  assert.equal(ownDomainAddress("me@mail.janedoe.dev", ["https://janedoe.dev"]), false);
  assert.equal(ownDomainAddress("me@other.dev", ["https://janedoe.dev"]), false);
  assert.equal(ownDomainAddress("jane@velog.io", ["https://velog.io/@jane/post"]), false);
  assert.equal(ownDomainAddress("jane@tistory.com", ["https://jane.tistory.com/12"]), false);
  assert.equal(ownDomainAddress("someone@okky.kr", ["https://okky.kr/articles/1"]), false);
  assert.equal(ownDomainAddress("x@co.kr", ["https://jane.co.kr"]), false);
  assert.equal(ownDomainAddress("x@jane.co.kr", ["https://www.jane.co.kr/about"]), true);
  assert.equal(ownDomainAddress("me@janedoe.dev", []), false);
  assert.equal(ownDomainAddress("me@janedoe.dev", [null, "not a url"]), false);
});

test("which address the agent may mail", () => {
  assert.equal(agentMailableAddress("jane@gmail.com", "lookup"), true);
  // An address Gmail cannot have ("_" or "-" in the name) never passes, whatever the source; a +tag is fine.
  assert.equal(agentMailableAddress("jane_doe@gmail.com", "import"), false);
  assert.equal(agentMailableAddress("jane-doe@googlemail.com", "post"), false);
  assert.equal(agentMailableAddress("jane.doe+jobs@gmail.com", "import"), true);
  assert.equal(agentMailableAddress("jane_doe@naver.com", "import"), true);
  assert.equal(agentMailableAddress("test@matchharper.com", "import"), true);
  assert.equal(agentMailableAddress("jane@acme.example", "import"), false);
  assert.equal(agentMailableAddress("jane@acme.example", "lookup", ["https://acme.example/team"]), false);
  // An address from their post: only on the domain of the page they were found on.
  assert.equal(agentMailableAddress("me@janedoe.dev", "post", ["https://janedoe.dev/now"]), true);
  assert.equal(agentMailableAddress("me@janedoe.dev", "post"), false);
  assert.equal(agentMailableAddress("ceo@bigcorp.example", "post", ["https://velog.io/@someone/post"]), false);
  assert.equal(agentMailableAddress("ceo@bigcorp.example", "post", ["https://someone.dev/post"]), false);
  assert.equal(agentMailableAddress(null, "post", ["https://someone.dev"]), false);
  assert.equal(agentSenderProblem({ senderEmail: "sender@matchharper.com", senderName: "Sender" }), null);
});

test("every default source's domain is a shared platform", () => {
  for (const domain of AGENT_SIGNAL_SOURCES.flatMap((source) => source.domains)) {
    assert.ok(SHARED_PLATFORM_DOMAINS.some((shared) => domain === shared || domain.endsWith(`.${shared}`)), domain);
  }
  assert.equal(isPlatformRoot("medium.com"), true);
  assert.equal(isPlatformRoot("blog.naver.com"), true);
  assert.equal(isPlatformRoot("news.ycombinator.com"), true);
  assert.equal(isPlatformRoot("jane.tistory.com"), false);
  assert.equal(isPlatformRoot("janedoe.dev"), false);
});

test("handles a person's pages show", () => {
  assert.deepEqual(profileHandles(["https://www.linkedin.com/in/jane-doe-000/"]), ["jane-doe-000"]);
  assert.deepEqual(profileHandles(["https://velog.io/@jane/some-post"]), ["jane"]);
  assert.deepEqual(profileHandles(["https://jane.tistory.com/12"]), ["jane"]);
  assert.deepEqual(profileHandles(["https://blog.janedoe.dev/about"]), ["janedoe"]);
  assert.deepEqual(profileHandles(["https://okky.kr/articles/123", "https://news.ycombinator.com/item?id=1"]), []);
  assert.deepEqual(profileHandles(["https://x.com/jdoe42/status/1", null]), ["jdoe42"]);
});

test("addresses that look like one person's", () => {
  assert.deepEqual(personalAddressesOnPage("Write info@acme.example or jane [at] gmail [dot] com. logo@2x.png noreply@x.example"), ["jane@gmail.com"]);
});

const near = (text: string, extra: Partial<Parameters<typeof addressIsPersons>[0]> = {}) => addressIsPersons({
  email: "jane.doe@gmail.com", text, names: ["Jane Doe"], handles: [], ownPage: false, ...extra,
});

test("an address counts only near the person's name or handle", () => {
  assert.equal(near("Jane Doe, backend engineer in Seoul. Email: jane.doe@gmail.com"), true);
  assert.equal(near("Contact jane.doe [at] gmail [dot] com — Jane Doe"), true);
  assert.equal(near("Email: jane.doe@gmail.com"), false);
  // The address itself does not count as the name.
  assert.equal(near("jane.doe@gmail.com"), false);
  const far = `Jane Doe writes about backends. ${"Lorem ipsum dolor sit amet. ".repeat(Math.ceil(NEAR_ADDRESS_CHARS / 20))} jane.doe@gmail.com`;
  assert.equal(near(far), false);
  assert.equal(near("By jdoe42 · Email jane.doe@gmail.com", { names: [], handles: ["jdoe42"] }), true);
  assert.equal(near("Jane Doe: jane.doe@gmail.com", { email: "" }), false);
});

test("a page listing several people's addresses is not one person's, unless it is their own page", () => {
  const team = "Our team: Jane Doe jane.doe@gmail.com, John Roe john.roe@gmail.com. Questions: info@acme.example";
  assert.equal(near(team), false);
  assert.equal(near(team, { ownPage: true }), true);
  // A team address next to theirs does not count as another person's.
  assert.equal(near("Jane Doe — jane.doe@gmail.com (press: press@acme.example)"), true);
});

test("on a comment thread an address near someone else's name is not this person's", () => {
  const thread = "jroe 2 days ago | Seoul, backend. Email: john.roe@gmail.com. jdoe 1 day ago | Seoul, data. Ping me";
  assert.equal(addressIsPersons({ email: "john.roe@gmail.com", text: thread, names: ["jdoe"], handles: [], ownPage: false, others: ["jroe"] }), false);
  // Their own comment: the next commenter's name after it does not count against them.
  assert.equal(addressIsPersons({ email: "john.roe@gmail.com", text: thread, names: ["jroe"], handles: [], ownPage: false, others: ["jdoe"] }), true);
  // Without comment times, another commenter named in the same stretch makes it nobody's.
  const flat = "jroe: Seoul, backend. Email: john.roe@gmail.com. jdoe: Seoul, data. Ping me";
  assert.equal(addressIsPersons({ email: "john.roe@gmail.com", text: flat, names: ["jroe"], handles: [], ownPage: false, others: ["jdoe"] }), false);
  // Without a list of the others: the comment around the address (from its author and time) is what counts.
  const comments = "jdoe 3 days ago | Seoul, data. Nice thread. jroe 2 days ago | Seoul, backend. Email: john.roe@gmail.com";
  assert.equal(addressIsPersons({ email: "john.roe@gmail.com", text: comments, names: ["jdoe"], handles: [], ownPage: false }), false);
  assert.equal(addressIsPersons({ email: "john.roe@gmail.com", text: comments, names: ["jroe"], handles: [], ownPage: false }), true);
  assert.equal(addressIsPersons({
    email: "john.roe@gmail.com", text: "홍길동 3일 전 좋은 글이에요. 김철수 2일 전 연락: john.roe@gmail.com", names: ["홍길동"], handles: [], ownPage: false,
  }), false);
  // One time phrase in a bio is not a thread: the stretch is not cut.
  const bio = "I'm Jane Doe, a backend engineer in Seoul building payment systems since I started 10 years ago. Email: jane.doe@gmail.com";
  assert.equal(near(bio), true);
  const one = "jroe 2 days ago | Seoul, backend. Email: john.roe@gmail.com";
  assert.equal(addressIsPersons({ email: "john.roe@gmail.com", text: one, names: ["jroe"], handles: [], ownPage: false, others: [] }), true);
});

test("on the person's own page an address that carries their handle or name counts", () => {
  const page = `Jane Doe. ${"I build payment systems and write about them. ".repeat(12)} Say hi: me@janedoe.dev or jane.doe@gmail.com`;
  assert.equal(addressIsPersons({ email: "me@janedoe.dev", text: page, names: ["Jane Doe"], handles: ["janedoe"], ownPage: true }), true);
  assert.equal(addressIsPersons({ email: "jane.doe@gmail.com", text: page, names: ["Jane Doe"], handles: [], ownPage: true }), true);
  assert.equal(addressIsPersons({ email: "jane.doe@gmail.com", text: page, names: ["Jane Doe"], handles: [], ownPage: false }), false);
});

test("a site named after the person's handle, and a Latin name a handle spells", async () => {
  const { handleCore, siteNameIsHandle, handleDomainAddress, handleLatinName, nameOnPage } = await import("./mailRules");
  assert.equal(handleCore("jane-doe-1a2b3c"), "janedoe");
  assert.equal(handleCore("jane_doe"), "janedoe");
  assert.equal(siteNameIsHandle("janedoe", ["jane-doe-1a2b3c"]), true);
  assert.equal(siteNameIsHandle("janedoe", ["janedoe-dev"]), true);
  // Too short, or another name.
  assert.equal(siteNameIsHandle("jane", ["jane-doe-1a2b3c"]), false);
  assert.equal(siteNameIsHandle("example", ["jane-doe-1a2b3c"]), false);
  assert.equal(handleDomainAddress("me@janedoe.dev", ["jane-doe-1a2b3c"]), true);
  assert.equal(handleDomainAddress("me@janedoe.co.kr", ["jane-doe-1a2b3c"]), true);
  assert.equal(handleDomainAddress("jane@acme.example", ["jane-doe-1a2b3c"]), false);
  assert.equal(handleDomainAddress("jane@janedoe.github.io", ["jane-doe-1a2b3c"]), false);
  assert.equal(handleLatinName("haneul-kim-1a2b3c"), "haneul kim");
  assert.equal(handleLatinName("janedoe"), null);
  assert.equal(nameOnPage("Min Jun Lee", "about: lee min-jun, backend"), true);
  assert.equal(nameOnPage("Min Jun Lee", "about: minjun lee"), true);
  assert.equal(nameOnPage("Min Jun Lee", "about: jun lee"), false);
});
