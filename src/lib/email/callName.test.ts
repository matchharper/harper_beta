import assert from "node:assert/strict";
import test from "node:test";
import { mailCallName } from "./callName";

test("a name in Latin letters goes by its first word", () => {
  assert.equal(mailCallName("Dana Lee"), "Dana");
  assert.equal(mailCallName("  Dana   Lee "), "Dana");
  assert.equal(mailCallName("Mary-Jane O'Neil"), "Mary-Jane");
  assert.equal(mailCallName("Dana"), "Dana");
});

test("Hangul and other scripts stay whole", () => {
  assert.equal(mailCallName("김하늘"), "김하늘");
  assert.equal(mailCallName("김 하늘"), "김 하늘");
  assert.equal(mailCallName("김하늘 Dana"), "김하늘 Dana");
});

test("a name that starts with a known surname, a title or an initial stays whole", () => {
  assert.equal(mailCallName("Kim Minji"), "Kim Minji");
  assert.equal(mailCallName("LEE Minho"), "LEE Minho");
  assert.equal(mailCallName("Rhee Minho"), "Rhee Minho");
  assert.equal(mailCallName("Zhang Wei"), "Zhang Wei");
  assert.equal(mailCallName("Nguyen Van An"), "Nguyen Van An");
  assert.equal(mailCallName("Dr. Jane Doe"), "Dr. Jane Doe");
  assert.equal(mailCallName("J. Smith"), "J. Smith");
});

test("a given name written as two syllables before the surname goes by both", () => {
  assert.equal(mailCallName("Tae Ho Kim"), "Tae Ho");
  assert.equal(mailCallName("seo yun park"), "seo yun park"); // Starts with a surname spelling.
  assert.equal(mailCallName("Jason Min Kim"), "Jason");
  assert.equal(mailCallName("Tae Ho Smith"), "Tae");
});

test("no name gives an empty string", () => {
  assert.equal(mailCallName(""), "");
  assert.equal(mailCallName(null), "");
  assert.equal(mailCallName(undefined), "");
});
