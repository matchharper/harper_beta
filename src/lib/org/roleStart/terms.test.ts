import assert from "node:assert/strict";
import test from "node:test";
import { termPattern } from "./terms";

function hits(term: string, text: string) {
  return new RegExp(termPattern(term)).test(text.toLowerCase());
}

test("a tool name does not match inside a longer Latin word", () => {
  assert.equal(hits("java", "JavaScript developer"), false);
  assert.equal(hits("sql", "MySQL, NoSQL"), false);
  assert.equal(hits("sql", "PostgreSQL"), false);
  assert.equal(hits("rust", "trust & safety"), false);
  assert.equal(hits("scala", "scalable systems"), false);
});

test("a tool name matches next to punctuation and Korean particles", () => {
  assert.equal(hits("java", "Java/Spring 백엔드"), true);
  assert.equal(hits("sql", "SQL 튜닝"), true);
  assert.equal(hits("kafka", "Kafka를 운영"), true);
  assert.equal(hits("c++", "C++ 개발"), true);
  assert.equal(hits("node.js", "Node.js 서버"), true);
  assert.equal(hits("카프카", "카프카 클러스터"), true);
});
