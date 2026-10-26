import type { RoleStartBrief, RoleStartHardCondition } from "./brief";
import { countriesOfCities, KNOWN_CITIES } from "./regions";
import type { RoleStartChip } from "./session";

/**
 * The role's location and work arrangement, set on the first step, written
 * straight into the Brief's hard conditions (no model call). Used only for
 * the fields the team changed while the Brief was being written from the JD.
 */

/** Korean place names to the city keys the talent location facets use (regions.ts). */
const KOREAN_CITIES: Array<[RegExp, string]> = [
  [/판교/, "pangyo"],
  [/분당/, "bundang"],
  [/성남/, "seongnam"],
  [/경기\s*광주|광주시/, "gwangju-si"],
  [/서울|강남|서초|성수|여의도|종로|마포|을지로|역삼|삼성동|잠실|구로|가산|용산|홍대|합정/, "seoul"],
  [/인천|송도/, "incheon"],
  [/수원/, "suwon"],
  [/용인/, "yongin"],
  [/고양|일산/, "goyang"],
  [/부천/, "bucheon"],
  [/안양/, "anyang"],
  [/화성/, "hwaseong"],
  [/동탄/, "dongtan"],
  [/남양주/, "namyangju"],
  [/김포/, "gimpo"],
  [/하남/, "hanam"],
  [/과천/, "gwacheon"],
  [/의정부/, "uijeongbu"],
  [/파주/, "paju"],
  [/시흥/, "siheung"],
  [/광명/, "gwangmyeong"],
  [/안산/, "ansan"],
  [/구리/, "guri"],
  [/오산/, "osan"],
  [/평택/, "pyeongtaek"],
  [/이천/, "icheon"],
  [/군포/, "gunpo"],
  [/의왕/, "uiwang"],
  [/부산/, "busan"],
  [/울산/, "ulsan"],
  [/창원/, "changwon"],
  [/김해/, "gimhae"],
  [/대구/, "daegu"],
  [/구미/, "gumi"],
  [/포항/, "pohang"],
  [/대전/, "daejeon"],
  [/세종(?!대로)/, "sejong"],
  [/청주/, "cheongju"],
  [/천안/, "cheonan"],
  [/(?<!경기\s*)광주(?!시)/, "gwangju"],
  [/전주/, "jeonju"],
  [/춘천/, "chuncheon"],
  [/원주/, "wonju"],
  [/강릉/, "gangneung"],
  [/제주/, "jeju"],
];

export function citiesOfLocationText(text: string) {
  const lower = text.toLowerCase();
  const cities = new Set<string>();
  for (const [pattern, city] of KOREAN_CITIES) if (pattern.test(text)) cities.add(city);
  for (const city of KNOWN_CITIES) if (new RegExp(`\\b${city}\\b`).test(lower)) cities.add(city);
  return [...cities];
}

export type RoleInfo = { locationText: string | null; workMode: string | null };
export type RoleInfoField = "location" | "workMode";

/** Which of location / work arrangement differ between two readings of the role. */
export function changedRoleInfo(before: RoleInfo, after: RoleInfo): RoleInfoField[] {
  const fields: RoleInfoField[] = [];
  if (String(before.locationText ?? "").trim() !== String(after.locationText ?? "").trim()) fields.push("location");
  if ((before.workMode ?? null) !== (after.workMode ?? null)) fields.push("workMode");
  return fields;
}

/**
 * The Brief with only the given fields brought in line with the role info.
 * A location the table cannot place leaves the condition as the model wrote it.
 */
export function briefWithRoleInfo(brief: RoleStartBrief, info: RoleInfo, fields: RoleInfoField[]): RoleStartBrief {
  let hardConditions: RoleStartHardCondition[] = [...brief.hardConditions];
  const locationText = String(info.locationText ?? "").trim();
  if (fields.includes("location") && locationText) {
    const cities = citiesOfLocationText(locationText);
    const existing = hardConditions.find((condition) => condition.kind === "location");
    const label = `${locationText} 근무`;
    // A place the table cannot locate changes nothing here; the Brief screen's
    // consistency check then shows that the role and the Brief disagree.
    if (existing && existing.kind === "location" && cities.length) {
      hardConditions = hardConditions.map((condition) =>
        condition === existing ? { ...existing, label, cities, countries: countriesOfCities(cities) } : condition
      );
    } else if (!existing && cities.length) {
      hardConditions.push({ id: "role_info_location", kind: "location", label, cities, countries: countriesOfCities(cities), allowRelocation: false });
    }
  }
  if (fields.includes("workMode")) {
    if (info.workMode === "remote") {
      if (!hardConditions.some((condition) => condition.kind === "remote_ok")) {
        hardConditions.push({ id: "role_info_remote", kind: "remote_ok", label: "원격 근무 가능" });
      }
      // Remote work keeps the country, not the commuting area.
      hardConditions = hardConditions.map((condition) =>
        condition.kind === "location"
          ? remoteLocation(condition)
          : condition
      );
    } else if (info.workMode === "onsite" || info.workMode === "hybrid") {
      hardConditions = hardConditions.filter((condition) => condition.kind !== "remote_ok");
    }
  }
  return { ...brief, hardConditions };
}

/** Remote work keeps the country, not the city; a city with no known country stays as it is. */
function remoteLocation<T extends { countries: string[]; cities: string[] }>(condition: T): T {
  const countries = condition.countries.length ? condition.countries : countriesOfCities(condition.cities);
  // Cities with no known country stay, so the condition never silently widens to anywhere.
  const unplaced = condition.cities.filter((city) => !countriesOfCities([city]).length);
  return countries.length ? { ...condition, countries, cities: unplaced } : condition;
}

/** A question whose every answer sets a condition of a changed field: the role info already answered it. */
export function asksRoleInfo(question: { chips: RoleStartChip[] }, fields: RoleInfoField[]) {
  const kinds = new Set<string>([
    ...(fields.includes("location") ? ["location"] : []),
    ...(fields.includes("workMode") ? ["remote_ok"] : []),
  ]);
  return (
    kinds.size > 0 &&
    question.chips.length > 0 &&
    question.chips.every(
      (chip) => chip.effect.type === "add_hard_condition" && kinds.has(String(chip.effect.condition.kind))
    )
  );
}
