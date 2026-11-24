import assert from "node:assert/strict";
import test from "node:test";
import { stripSentenceSourceLinks } from "./sourceLinks";

test("company research reads without the sources attached to its sentences", () => {
  assert.equal(
    stripSentenceSourceLinks(
      "Veritect is a legal platform [1](https://veritect.ai/about/)[2](https://exa.ai/x). It runs VeriScribe [3](https://en.wikipedia.org/wiki/Veritect_(company)).\n\nUnlinked claim [4]."
    ),
    "Veritect is a legal platform. It runs VeriScribe.\n\nUnlinked claim."
  );
  assert.equal(
    stripSentenceSourceLinks(
      "Backed by ventures ([company role posting](https://ilabs.example/jobs)). 소비자와 연결한다. [회사 소개](https://yindii.co/) 및 [공동 창업자](https://yindii.co/team)\n주소를 기재한다. [채용 공고](https://mitech.example/a). 2022년 설립. [회사 소개](https://convex.dev/about) · [투자](https://convex.dev/b)"
    ),
    "Backed by ventures. 소비자와 연결한다.\n주소를 기재한다. 2022년 설립."
  );
  assert.equal(
    stripSentenceSourceLinks("Founded in 2019. Source: [Apax](https://apax.com/news)."),
    "Founded in 2019."
  );
});

test("links that are part of a sentence stay", () => {
  const markdown =
    "경기 화성에 있다. [회사 공식 사이트](https://unisem.co.kr/kor/main)에 설립 연도가 나온다. Built on [Dapr](https://dapr.io) by its founders.";
  assert.equal(stripSentenceSourceLinks(markdown), markdown);
});
