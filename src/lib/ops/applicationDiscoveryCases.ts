import type { InspectionSource } from "./applicationFormInspection";

// Frozen public input only. Expected destinations belong to the evaluation gold,
// never to the agent context. No production role ID means presets never update a role.
export const applicationDiscoveryCases: {
  id: string;
  datasetVersion: string;
  label: string;
  source: InspectionSource;
}[] = [
  {
    id: "liner-security",
    datasetVersion: "v1",
    label: "라이너 · Security Engineer",
    source: {
      id: null,
      company: "라이너",
      name: "Security Engineer",
      homepage: null,
      location: null,
      originalUrl:
        "https://www.wanted.co.kr/wd/375322?client_id=ubRphx9ewFwQvQV3kyJjjFSp",
    },
  },
  {
    id: "liner-performance",
    datasetVersion: "v1",
    label: "라이너 · Performance Marketer",
    source: {
      id: null,
      company: "라이너",
      name: "Performance Marketer",
      homepage: null,
      location: null,
      originalUrl:
        "https://www.wanted.co.kr/wd/393606?client_id=ubRphx9ewFwQvQV3kyJjjFSp",
    },
  },
  {
    id: "channel-pr",
    datasetVersion: "v1",
    label: "채널톡 · PR Manager",
    source: {
      id: null,
      company: "채널톡",
      name: "[채널톡] PR Manager",
      homepage: "https://channel.io/",
      location: null,
      originalUrl:
        "https://www.wanted.co.kr/wd/389784?client_id=ubRphx9ewFwQvQV3kyJjjFSp",
    },
  },
  {
    id: "delightroom-backend",
    datasetVersion: "v2",
    label: "딜라이트룸 · Backend Engineer",
    source: {
      id: null,
      company: "딜라이트룸",
      name: "[알라미] Backend Engineer",
      homepage: "https://alar.my",
      location: null,
      originalUrl:
        "https://www.wanted.co.kr/wd/392107?client_id=ubRphx9ewFwQvQV3kyJjjFSp",
    },
  },
  {
    id: "specter-ai",
    datasetVersion: "v2",
    label: "스펙터 · AI Engineer",
    source: {
      id: null,
      company: "스펙터",
      name: "AI Engineer",
      homepage: "https://www.specter.co.kr",
      location: null,
      originalUrl:
        "https://www.wanted.co.kr/wd/377889?client_id=ubRphx9ewFwQvQV3kyJjjFSp",
    },
  },
  {
    id: "mayi-field",
    datasetVersion: "v2",
    label: "메이아이 · Field Engineer",
    source: {
      id: null,
      company: "메이아이",
      name: "Field Engineer (필드 엔지니어)",
      homepage: null,
      location: null,
      originalUrl:
        "https://www.wanted.co.kr/wd/381123?client_id=ubRphx9ewFwQvQV3kyJjjFSp",
    },
  },
];

export function applicationDiscoveryCase(id: string) {
  const value = applicationDiscoveryCases.find((item) => item.id === id);
  if (!value) throw new Error("등록된 테스트 공고를 선택해 주세요.");
  return value;
}
