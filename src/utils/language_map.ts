export const DateMap = {
  "Jan ": "1월 ",
  "Feb ": "2월 ",
  "Mar ": "3월 ",
  "Apr ": "4월 ",
  "May ": "5월 ",
  "Jun ": "6월 ",
  "Jul ": "7월 ",
  "Aug ": "8월 ",
  "Sep ": "9월 ",
  "Oct ": "10월 ",
  "Nov ": "11월 ",
  "Dec ": "12월 ",
};

export function toKoreanMonth(str: string): string {
  const monthMap: Record<string, number> = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12,
  };

  const [mon, year] = str.split(" ");
  const month = monthMap[mon];

  if (str === "Present") {
    return "현재";
  }
  if (!month || !year) return str; // fallback
  return `${year}년 ${month}월`;
}

// countryKorean.ts
type CountryMap = Record<string, string>;

function normKey(s: string) {
  return s.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

const COUNTRY_MAP: CountryMap = {
  // Korea
  "mapo-gu district, south korea": "대한민국 서울 마포구",
  "seongnam, south korea": "대한민국 성남",
  "seoul, south korea": "대한민국 서울",
  "seoul, korea": "대한민국 서울",
  "incheon, south korea": "대한민국 인천",
  "incheon, korea": "대한민국 인천",
  "busan, south korea": "대한민국 부산",
  "busan, korea": "대한민국 부산",
  "daejeon, south korea": "대한민국 대전",
  "daejeon, korea": "대한민국 대전",
  "gwangju, south korea": "대한민국 광주",
  "gwangju, korea": "대한민국 광주",
  "ulsan, south korea": "대한민국 울산",
  "ulsan, korea": "대한민국 울산",
  "south korea": "대한민국",
  "republic of korea": "대한민국",
  "korea republic of": "대한민국",
  "korea, republic of": "대한민국",
  rok: "대한민국",
  korea: "대한민국", // 애매하지만 서비스 성격상 보통 한국 의미로 쓰는 경우가 많아서 넣어둠
  "north korea": "북한",
  "seoul incheon metropolitan area": "대한민국 수도권",
  "democratic people's republic of korea": "북한",
  dprk: "북한",

  // Major 20-ish
  "united states": "미국",
  "united states of america": "미국",
  usa: "미국",
  "u s a": "미국",

  canada: "캐나다",
  mexico: "멕시코",
  brazil: "브라질",

  "united kingdom": "영국",
  uk: "영국",
  "u k": "영국",
  "great britain": "영국",
  england: "영국", // 엄밀히는 국가 아님(구성국)인데 입력으로 자주 들어와서 매핑

  france: "프랑스",
  germany: "독일",
  spain: "스페인",
  italy: "이탈리아",
  netherlands: "네덜란드",
  switzerland: "스위스",
  sweden: "스웨덴",
  norway: "노르웨이",
  denmark: "덴마크",

  russia: "러시아",
  china: "중국",
  japan: "일본",
  india: "인도",
  singapore: "싱가포르",

  australia: "호주",
  "new zealand": "뉴질랜드",

  israel: "이스라엘",
  "united arab emirates": "아랍에미리트",
  uae: "아랍에미리트",
};

export function countryEnToKo(input: string): string {
  const key = normKey(input);
  return COUNTRY_MAP[key] ?? input;
}

// koreaCityKorean.ts
type CityMap = Record<string, string>;

function normCityKey(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .replace(/[-_]/g, " ");
}

const KOREA_CITY_MAP: CityMap = {
  seoul: "서울",
  busan: "부산",
  pusan: "부산", // 구표기
  incheon: "인천",
  daegu: "대구",
  daejeon: "대전",
  gwangju: "광주",
  ulsan: "울산",
  sejong: "세종",

  suwon: "수원",
  goyang: "고양",
  yongin: "용인",
  seongnam: "성남",
  bucheon: "부천",
  anyang: "안양",
  ansan: "안산",
  hwaseong: "화성",
  pyeongtaek: "평택",
  gyeonggi: "경기도",

  jeju: "제주",
  "jeju city": "제주시",
  changwon: "창원",
  gimhae: "김해",
  cheongju: "청주",
  jeonju: "전주",
  pohang: "포항",

  california: "캘리포니아",
  "new york": "뉴욕",
  "new york city": "뉴욕시",
};

export function koreaCityEnToKo(input: string): string {
  const key = normCityKey(input);
  return KOREA_CITY_MAP[key] ?? input;
}

export function locationEnToKo(input: string): string {
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return input;

  // 마지막 토큰을 국가로 가정
  const country = countryEnToKo(parts[parts.length - 1]);
  const cityParts = parts.slice(0, -1).map(koreaCityEnToKo);

  return [...cityParts, country].filter(Boolean).join(", ");
}

// koreaUniversityMap.ts
type UniMap = Record<string, string>;

function normUniKey(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[,()]/g, "")
    .replace(/\s+/g, " ");
}

const KOREA_UNIVERSITY_MAP: UniMap = {
  // SKY
  "seoul national university": "서울대학교",
  snu: "서울대학교",

  "korea university": "고려대학교",
  "korea univ": "고려대학교",
  ku: "고려대학교",

  "yonsei university": "연세대학교",
  "yonsei univ": "연세대학교",

  // KAIST / POSTECH
  kaist: "한국과학기술원(KAIST)",
  "korea advanced institute of science and technology": "한국과학기술원(KAIST)",

  postech: "포항공과대학교(POSTECH)",
  "pohang university of science and technology": "포항공과대학교(POSTECH)",

  // 주요 국립대
  "pusan national university": "부산대학교",
  "busan national university": "부산대학교",
  pnu: "부산대학교",

  "chonnam national university": "전남대학교",
  cnu: "충남대학교",

  "chungnam national university": "충남대학교",
  "chungbuk national university": "충북대학교",

  "kangwon national university": "강원대학교",
  "jeonbuk national university": "전북대학교",
  "gyeongsang national university": "경상국립대학교",

  // 수도권 주요 사립
  "sungkyunkwan university": "성균관대학교",
  skku: "성균관대학교",

  "hanyang university": "한양대학교",
  "hanyang univ": "한양대학교",

  "sogang university": "서강대학교",
  "sogang univ": "서강대학교",

  "ewha womans university": "이화여자대학교",
  "ewha women's university": "이화여자대학교",
  "ewha university": "이화여자대학교",

  "chung ang university": "중앙대학교",
  "chung-ang university": "중앙대학교",

  "kyung hee university": "경희대학교",
  "kyunghee university": "경희대학교",

  "dongguk university": "동국대학교",
  "hongik university": "홍익대학교",

  // 이공계 특화 / 특수대
  unist: "울산과학기술원(UNIST)",
  "ulsan national institute of science and technology": "울산과학기술원(UNIST)",

  gist: "광주과학기술원(GIST)",
  "gwangju institute of science and technology": "광주과학기술원(GIST)",

  dgist: "대구경북과학기술원(DGIST)",
  "daegu gyeongbuk institute of science and technology":
    "대구경북과학기술원(DGIST)",

  // 기타 자주 등장
  "ajou university": "아주대학교",
  "inha university": "인하대학교",
  "konkuk university": "건국대학교",
  "soongsil university": "숭실대학교",
  "kookmin university": "국민대학교",
};

export function koreaUniversityEnToKo(input: string): string {
  const key = normUniKey(input);
  return KOREA_UNIVERSITY_MAP[key] ?? input;
}

export type MajorMap = Record<string, string>;

export const MAJOR_MAP: MajorMap = {
  // Computer Science / Engineering
  "computer science": "컴퓨터과학",
  "computer science and engineering": "컴퓨터공학",
  "computer engineering": "컴퓨터공학",
  computing: "컴퓨터공학",
  cs: "컴퓨터과학",
  cse: "컴퓨터공학",

  // Electrical / Electronics
  "electrical engineering": "전기공학",
  "electrical and computer engineering": "전기전자공학",
  ee: "전기공학",
  ece: "전기전자공학",

  "electronics engineering": "전자공학",
  "electronic engineering": "전자공학",

  // AI / Data
  "artificial intelligence": "인공지능",
  ai: "인공지능",

  "data science": "데이터사이언스",
  "data analytics": "데이터분석",
  "data engineering": "데이터엔지니어링",

  // Math / Stats
  mathematics: "수학",
  "applied mathematics": "응용수학",
  math: "수학",

  statistics: "통계학",
  "applied statistics": "응용통계학",
  stats: "통계학",

  // Physics / Chemistry
  physics: "물리학",
  "applied physics": "응용물리학",

  chemistry: "화학",
  "chemical engineering": "화학공학",
  che: "화학공학",

  // Mechanical / Industrial
  "mechanical engineering": "기계공학",
  me: "기계공학",

  "industrial engineering": "산업공학",
  ie: "산업공학",

  // Materials
  "materials science": "재료과학",
  "materials science and engineering": "신소재공학",
  mse: "신소재공학",

  // Bio / Life
  "biological sciences": "생명과학",
  "life sciences": "생명과학",
  biology: "생물학",

  biotechnology: "생명공학",
  bioengineering: "바이오공학",

  // Cognitive / Brain
  "cognitive science": "인지과학",
  "brain and cognitive science": "뇌인지과학",
  neuroscience: "신경과학",

  // Robotics / Aero
  robotics: "로봇공학",
  "aerospace engineering": "항공우주공학",

  // Design / HCI
  "human computer interaction": "인간컴퓨터상호작용",
  hci: "HCI",

  "interaction design": "인터랙션디자인",
  "industrial design": "산업디자인",

  // Business / Econ
  "business administration": "경영학",
  mba: "경영학",

  economics: "경제학",
  "applied economics": "응용경제학",

  "civil engineering": "토목공학",
  civil: "토목공학",

  architecture: "건축학",
  "architectural engineering": "건축공학",

  // Environmental / Energy
  "environmental engineering": "환경공학",
  environmental: "환경공학",

  "energy engineering": "에너지공학",
  "renewable energy": "신재생에너지공학",

  // Ocean / Earth
  "earth science": "지구과학",
  "earth sciences": "지구과학",
  geology: "지질학",
  geophysics: "지구물리학",

  // Humanities
  literature: "문학",
  "english literature": "영문학",
  "korean literature": "국문학",
  "comparative literature": "비교문학",

  history: "사학",
  "world history": "세계사",
  "korean history": "한국사",

  philosophy: "철학",
  ethics: "윤리학",

  linguistics: "언어학",
  "applied linguistics": "응용언어학",

  // Languages
  "english language": "영어학",
  "korean language": "국어학",
  "foreign languages": "외국어학",

  "chinese language": "중국어학",
  "japanese language": "일본어학",
  "french language": "프랑스어학",
  "german language": "독일어학",
  "spanish language": "스페인어학",

  // Social Sciences
  "political science": "정치외교학",
  politics: "정치학",
  "international relations": "국제관계학",

  "public administration": "행정학",
  administration: "행정학",

  law: "법학",
  "legal studies": "법학",

  sociology: "사회학",
  "social sciences": "사회과학",

  anthropology: "인류학",
  archaeology: "고고학",

  "area studies": "지역학",
  "asian studies": "아시아학",
  "korean studies": "한국학",

  // Economics / Business 확장
  commerce: "상학",
  accounting: "회계학",
  taxation: "세무학",

  marketing: "마케팅",
  management: "경영학",
  "international business": "국제경영",

  // Communication / Media
  communication: "커뮤니케이션학",
  "mass communication": "언론정보학",
  journalism: "언론학",
  "media studies": "미디어학",

  advertising: "광고학",
  "public relations": "홍보학",

  // Education / Society
  pedagogy: "교육학",
  "early childhood education": "유아교육학",
  "elementary education": "초등교육학",
  "secondary education": "중등교육학",

  // Arts
  finearts: "순수미술",
  "fine arts": "순수미술",
  art: "미술학",
  painting: "회화",
  sculpture: "조소",

  music: "음악학",
  "music theory": "음악이론",
  composition: "작곡",
  performance: "연주",

  theater: "연극학",
  drama: "연극학",

  film: "영화학",
  cinema: "영화학",

  // Religion / Culture
  religion: "종교학",
  theology: "신학",

  "cultural studies": "문화연구",
  "culture studies": "문화연구",
};

export function majorEnToKo(input: string): string {
  if (!input) return "";
  const key = normUniKey(input);
  return MAJOR_MAP[key] ?? input;
}

export type DegreeMap = Record<string, string>;

export const DEGREE_MAP: DegreeMap = {
  // Bachelor
  "bachelor's degree": "학사",
  "bachelor of arts - ba": "학사",
  "bachelor of science - bs": "학사",
  "bachelor of engineering - be": "학사",
  "bachelor of laws": "학사",
  ba: "학사",
  bs: "학사",
  be: "학사",
  llb: "학사",
  bsc: "학사",

  // Master
  "master's degree": "석사",
  "master of arts": "석사",
  "master of science": "석사",
  "master of engineering": "석사",
  "master of laws": "석사",
  ma: "석사",
  ms: "석사",
  me: "석사",
  llm: "석사",
  msc: "석사",

  // Doctor
  "doctor of philosophy": "박사",
  phd: "박사",
  "ph.d": "박사",
  dphil: "박사",

  // Integrated / Professional
  "integrated ms phd": "석·박사통합",
  "ms phd": "석·박사통합",
  "ms/phd": "석·박사통합",
  "combined ms phd": "석·박사통합",

  // Professional / Special
  mba: "전문석사",
  mpa: "전문석사",
  mph: "전문석사",
  mfa: "전문석사",

  // Post
  "doctor of philosophy - phd": "박사",
  postdoc: "박사후연구원",
  "post doctoral researcher": "박사후연구원",
  "postdoctoral researcher": "박사후연구원",

  "high school diploma": "졸업",
};

export function degreeEnToKo(input: string): string {
  if (!input) return "";
  const key = normUniKey(input);
  return DEGREE_MAP[key] ?? input;
}

export type CompanyMap = Record<string, string>;

/**
 * 한국 주요 대기업 및 IT 기업 영-한 매핑 테이블
 * (그룹사, 주요 계열사, 빅테크 포함)
 */
export const COMPANY_MAP: CompanyMap = {
  "yonsei university": "연세대학교",
  "seoul national university": "서울대학교",
  "korea university": "고려대학교",
  "korea advanced institute of science and technology": "카이스트",
  // --- Samsung Group ---
  samsung: "삼성",
  "samsung electronics": "삼성전자",
  "samsung sds": "삼성SDS",
  "samsung display": "삼성디스플레이",
  "samsung sdi": "삼성SDI",
  "samsung electro-mechanics": "삼성전기",
  "samsung biologics": "삼성바이오로직스",
  "samsung c&t": "삼성물산",
  "samsung life insurance": "삼성생명",
  "samsung fire & marine insurance": "삼성화재",
  "samsung heavy industries": "삼성중공업",
  "samsung securities": "삼성증권",

  // --- Hyundai Motor Group ---
  hyundai: "현대",
  "hyundai motor company": "현대자동차",
  "hyundai motor": "현대자동차",
  kia: "기아",
  "hyundai mobis": "현대모비스",
  "hyundai steel": "현대제철",
  "hyundai engineering": "현대엔지니어링",
  "hyundai e&c": "현대건설",
  "hyundai glovis": "현대글로비스",
  "hyundai rotem": "현대로템",
  "hyundai card": "현대카드",

  // --- SK Group ---
  sk: "SK",
  "sk hynix": "SK하이닉스",
  "sk telecom": "SK텔레콤",
  "sk innovation": "SK이노베이션",
  "sk on": "SK온",
  "sk e&s": "SK E&S",
  "sk square": "SK스퀘어",
  "sk networks": "SK네트웍스",
  "sk chemicals": "SK케미칼",
  "sk bioscience": "SK바이오사이언스",
  "sk c&c": "SK C&C",

  // --- LG Group ---
  lg: "LG",
  "lg electronics": "LG전자",
  "lg energy solution": "LG에너지솔루션",
  "lg display": "LG디스플레이",
  "lg chem": "LG화학",
  "lg chemical": "LG화학",
  "lg uplus": "LG유플러스",
  "lg u+": "LG유플러스",
  "lg cns": "LG CNS",
  "lg household & health care": "LG생활건강",
  "lg innotek": "LG이노텍",
  naver: "네이버",
  "naver cloud": "네이버클라우드",
  "naver webtoon": "네이버웹툰",
  "naver financial": "네이버파이낸셜",

  kakao: "카카오",
  "kakao bank": "카카오뱅크",
  "kakao pay": "카카오페이",
  "kakao mobility": "카카오모빌리티",
  "kakao games": "카카오게임즈",
  "kakao entertainment": "카카오엔터테인먼트",
  "kakao enterprise": "카카오엔터프라이즈",
  "kakao brain": "카카오브레인",

  line: "라인",
  "line plus": "라인플러스",
  "line financial": "라인파이낸셜",
  "line studio": "라인스튜디오",
  "line next": "라인넥스트",

  coupang: "쿠팡",
  "coupang pay": "쿠팡페이",
  "coupang eats": "쿠팡이츠",

  "woowahan brothers": "우아한형제들",
  "woowa brothers": "우아한형제들",
  baemin: "배달의민족",

  karrot: "당근",
  "karrot pay": "당근 페이",
  "karrot market": "당근",
  danggeun: "당근",

  "viva republica": "비바리퍼블리카",
  toss: "토스",
  "toss pay": "토스 페이",
  "toss bank": "토스뱅크",
  "toss securities": "토스증권",
  "toss payments": "토스페이먼츠",

  // --- Gaming (3N + Major Players) ---
  nexon: "넥슨",
  "nexon korea": "넥슨코리아",
  "nexon games": "넥슨게임즈",
  ncsoft: "엔씨소프트",
  nc: "엔씨소프트",
  netmarble: "넷마블",
  "netmarble neo": "넷마블네오",

  krafton: "크래프톤",
  bluehole: "블루홀",
  smilegate: "스마일게이트",
  "smilegate rpg": "스마일게이트RPG",
  "pearl abyss": "펄어비스",
  com2us: "컴투스",
  "com2us holdings": "컴투스홀딩스",
  neowiz: "네오위즈",
  devsisters: "데브시스터즈",
  wemade: "위메이드",
  "shift up": "시프트업",

  // --- Unicorns & Lifestyle Platforms ---
  yanolja: "야놀자",
  kurly: "컬리",
  "market kurly": "마켓컬리",
  musinsa: "무신사",
  bucketplace: "버킷플레이스",
  ohouse: "오늘의집",
  ably: "에이블리",
  "ably corporation": "에이블리코퍼레이션",
  zigbang: "직방",
  socar: "쏘카",
  "tmap mobility": "티맵모빌리티",
  kream: "크림",

  // --- Fintech & Blockchain ---
  dunamu: "두나무",
  upbit: "업비트",
  bithumb: "빗썸",
  coinone: "코인원",
  "korea credit data": "한국신용데이터",
  sentbe: "센트비",

  // --- AI, SaaS & B2B Tech ---
  sendbird: "센드버드",
  "megazone cloud": "메가존클라우드",
  "bespin global": "베스핀글로벌",
  upstage: "업스테이지",
  "wrtn technologies": "뤼튼테크놀로지",
  wrtn: "뤼튼",
  riiid: "뤼이드",
  elice: "엘리스",
  "elice group": "엘리스그룹",
  class101: "클래스101",
  "42dot": "포티투닷",
  moloco: "몰로코",
  fadu: "파두",
  deepx: "딥엑스",
  furiosaai: "퓨리오사AI",
  lunit: "루닛",
  vuno: "뷰노",
  wantedlab: "원티드랩",
  wanted: "원티드",

  // --- Other Major Groups ---
  posco: "포스코",
  "posco holdings": "포스코홀딩스",
  "posco future m": "포스코퓨처엠",
  lotte: "롯데",
  "lotte shopping": "롯데쇼핑",
  "lotte chemical": "롯데케미칼",
  cj: "CJ",
  "cj cheiljedang": "CJ제일제당",
  "cj enm": "CJ ENM",
  "cj logistics": "CJ대한통운",
  hanwha: "한화",
  "hanwha solutions": "한화솔루션",
  "hanwha aerospace": "한화에어로스페이스",
  "hanwha ocean": "한화오션",
  gs: "GS",
  "gs caltex": "GS칼텍스",
  "gs retail": "GS리테일",
  "gs e&c": "GS건설",
  shinsegae: "신세계",
  emart: "이마트",
  kt: "KT",
  "kt corp": "KT",
  "kt corporation": "KT",
};

/**
 * 회사 영문명을 한글명으로 변환하는 함수
 */
export function companyEnToKo(input: string): string {
  if (!input) return "";
  const key = normUniKey(input); // 기존 코드에 정의된 정규화 함수 사용 가정
  return COMPANY_MAP[key] ?? input;
}
