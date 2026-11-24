/**
 * Short names and web domains of schools that often appear in profiles.
 * The domain gives the school a logo (favicon) where Harper has none.
 * Safe to import in the browser.
 */

type SchoolEntry = { domain: string; en: string; ko: string; names: string[] };

const SCHOOLS: SchoolEntry[] = [
  {
    ko: "서울대학교",
    en: "Seoul National University",
    domain: "snu.ac.kr",
    names: ["Seoul National University", "서울대학교", "서울대", "SNU"],
  },
  {
    ko: "KAIST",
    en: "KAIST",
    domain: "kaist.ac.kr",
    names: [
      "KAIST",
      "Korea Advanced Institute of Science and Technology",
      "Korea Advanced Institute of Science and Technology (KAIST)",
      "한국과학기술원",
      "한국과학기술원(KAIST)",
      "카이스트",
    ],
  },
  {
    ko: "POSTECH",
    en: "POSTECH",
    domain: "postech.ac.kr",
    names: [
      "POSTECH",
      "Pohang University of Science and Technology",
      "포항공과대학교",
      "포스텍",
    ],
  },
  {
    ko: "연세대학교",
    en: "Yonsei University",
    domain: "yonsei.ac.kr",
    names: ["Yonsei University", "연세대학교", "연세대"],
  },
  {
    ko: "고려대학교",
    en: "Korea University",
    domain: "korea.ac.kr",
    names: ["Korea University", "고려대학교", "고려대"],
  },
  {
    ko: "성균관대학교",
    en: "Sungkyunkwan University",
    domain: "skku.edu",
    names: [
      "Sungkyunkwan University",
      "Sungkyunkwan University (SKKU)",
      "성균관대학교",
      "성균관대",
      "SKKU",
    ],
  },
  {
    ko: "한양대학교",
    en: "Hanyang University",
    domain: "hanyang.ac.kr",
    names: ["Hanyang University", "한양대학교", "한양대"],
  },
  {
    ko: "서강대학교",
    en: "Sogang University",
    domain: "sogang.ac.kr",
    names: ["Sogang University", "서강대학교", "서강대"],
  },
  {
    ko: "이화여자대학교",
    en: "Ewha Womans University",
    domain: "ewha.ac.kr",
    names: ["Ewha Womans University", "이화여자대학교", "이화여대"],
  },
  {
    ko: "중앙대학교",
    en: "Chung-Ang University",
    domain: "cau.ac.kr",
    names: ["Chung-Ang University", "중앙대학교", "중앙대"],
  },
  {
    ko: "경희대학교",
    en: "Kyung Hee University",
    domain: "khu.ac.kr",
    names: ["Kyung Hee University", "경희대학교", "경희대"],
  },
  {
    ko: "서울시립대학교",
    en: "University of Seoul",
    domain: "uos.ac.kr",
    names: ["University of Seoul", "서울시립대학교", "서울시립대"],
  },
  {
    ko: "서울과학기술대학교",
    en: "SeoulTech",
    domain: "seoultech.ac.kr",
    names: [
      "Seoul National University of Science and Technology",
      "서울과학기술대학교",
      "SeoulTech",
    ],
  },
  {
    ko: "건국대학교",
    en: "Konkuk University",
    domain: "konkuk.ac.kr",
    names: ["Konkuk University", "건국대학교", "건국대"],
  },
  {
    ko: "동국대학교",
    en: "Dongguk University",
    domain: "dongguk.edu",
    names: ["Dongguk University", "동국대학교", "동국대"],
  },
  {
    ko: "홍익대학교",
    en: "Hongik University",
    domain: "hongik.ac.kr",
    names: ["Hongik University", "홍익대학교", "홍익대"],
  },
  {
    ko: "아주대학교",
    en: "Ajou University",
    domain: "ajou.ac.kr",
    names: ["Ajou University", "아주대학교", "아주대"],
  },
  {
    ko: "인하대학교",
    en: "Inha University",
    domain: "inha.ac.kr",
    names: ["Inha University", "인하대학교", "인하대"],
  },
  {
    ko: "숭실대학교",
    en: "Soongsil University",
    domain: "ssu.ac.kr",
    names: ["Soongsil University", "숭실대학교", "숭실대"],
  },
  {
    ko: "국민대학교",
    en: "Kookmin University",
    domain: "kookmin.ac.kr",
    names: ["Kookmin University", "국민대학교", "국민대"],
  },
  {
    ko: "광운대학교",
    en: "Kwangwoon University",
    domain: "kw.ac.kr",
    names: ["Kwangwoon University", "광운대학교", "광운대"],
  },
  {
    ko: "세종대학교",
    en: "Sejong University",
    domain: "sejong.ac.kr",
    names: ["Sejong University", "세종대학교", "세종대"],
  },
  {
    ko: "부산대학교",
    en: "Pusan National University",
    domain: "pusan.ac.kr",
    names: ["Pusan National University", "부산대학교", "부산대"],
  },
  {
    ko: "경북대학교",
    en: "Kyungpook National University",
    domain: "knu.ac.kr",
    names: ["Kyungpook National University", "경북대학교", "경북대"],
  },
  {
    ko: "UNIST",
    en: "UNIST",
    domain: "unist.ac.kr",
    names: [
      "UNIST",
      "Ulsan National Institute of Science and Technology",
      "울산과학기술원",
    ],
  },
  {
    ko: "GIST",
    en: "GIST",
    domain: "gist.ac.kr",
    names: [
      "GIST",
      "Gwangju Institute of Science and Technology",
      "광주과학기술원",
    ],
  },
  {
    ko: "DGIST",
    en: "DGIST",
    domain: "dgist.ac.kr",
    names: [
      "DGIST",
      "Daegu Gyeongbuk Institute of Science and Technology",
      "대구경북과학기술원",
    ],
  },
  {
    ko: "한국외국어대학교",
    en: "HUFS",
    domain: "hufs.ac.kr",
    names: [
      "Hankuk University of Foreign Studies",
      "한국외국어대학교",
      "한국외대",
    ],
  },
  {
    ko: "스탠퍼드",
    en: "Stanford",
    domain: "stanford.edu",
    names: ["Stanford University", "Stanford"],
  },
  {
    ko: "MIT",
    en: "MIT",
    domain: "mit.edu",
    names: ["Massachusetts Institute of Technology", "MIT"],
  },
  {
    ko: "하버드",
    en: "Harvard",
    domain: "harvard.edu",
    names: ["Harvard University", "Harvard"],
  },
  {
    ko: "UC Berkeley",
    en: "UC Berkeley",
    domain: "berkeley.edu",
    names: ["University of California, Berkeley", "UC Berkeley"],
  },
  {
    ko: "CMU",
    en: "CMU",
    domain: "cmu.edu",
    names: ["Carnegie Mellon University", "CMU"],
  },
  {
    ko: "UIUC",
    en: "UIUC",
    domain: "illinois.edu",
    names: [
      "University of Illinois Urbana-Champaign",
      "University of Illinois at Urbana-Champaign",
    ],
  },
  {
    ko: "University of Waterloo",
    en: "University of Waterloo",
    domain: "uwaterloo.ca",
    names: ["University of Waterloo"],
  },
  {
    ko: "University of Michigan",
    en: "University of Michigan",
    domain: "umich.edu",
    names: ["University of Michigan"],
  },
  {
    ko: "Georgia Tech",
    en: "Georgia Tech",
    domain: "gatech.edu",
    names: ["Georgia Institute of Technology", "Georgia Tech"],
  },
  {
    ko: "Cornell",
    en: "Cornell",
    domain: "cornell.edu",
    names: ["Cornell University"],
  },
  {
    ko: "Columbia",
    en: "Columbia",
    domain: "columbia.edu",
    names: ["Columbia University"],
  },
  { ko: "NYU", en: "NYU", domain: "nyu.edu", names: ["New York University"] },
  {
    ko: "UCLA",
    en: "UCLA",
    domain: "ucla.edu",
    names: ["University of California, Los Angeles", "UCLA"],
  },
  {
    ko: "USC",
    en: "USC",
    domain: "usc.edu",
    names: ["University of Southern California"],
  },
  {
    ko: "University of Washington",
    en: "University of Washington",
    domain: "washington.edu",
    names: ["University of Washington"],
  },
  {
    ko: "UT Austin",
    en: "UT Austin",
    domain: "utexas.edu",
    names: [
      "The University of Texas at Austin",
      "University of Texas at Austin",
    ],
  },
  {
    ko: "도쿄대학",
    en: "University of Tokyo",
    domain: "u-tokyo.ac.jp",
    names: ["The University of Tokyo", "University of Tokyo"],
  },
];

const normalizeKey = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

const SCHOOL_BY_NAME = new Map<string, SchoolEntry>();
for (const school of SCHOOLS) {
  for (const name of school.names)
    SCHOOL_BY_NAME.set(normalizeKey(name), school);
}

export function findSchool(name: string | null | undefined) {
  const key = normalizeKey(String(name ?? ""));
  return key ? (SCHOOL_BY_NAME.get(key) ?? null) : null;
}

export function getSchoolDisplayName(
  name: string | null | undefined,
  locale: "ko" | "en"
) {
  const school = findSchool(name);
  return school ? school[locale] : String(name ?? "").trim();
}

/** A stable key that merges the spellings of one school. */
export function getSchoolKey(name: string | null | undefined) {
  const school = findSchool(name);
  return school ? school.domain : normalizeKey(String(name ?? ""));
}

export function getFaviconUrlForDomain(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export function getFaviconUrlForWebsite(website: string | null | undefined) {
  const raw = String(website ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url.hostname.includes(".")) return null;
    return getFaviconUrlForDomain(url.hostname.replace(/^www\./, ""));
  } catch {
    return null;
  }
}

export function getSchoolLogoUrl(name: string | null | undefined) {
  const school = findSchool(name);
  return school ? getFaviconUrlForDomain(school.domain) : null;
}
