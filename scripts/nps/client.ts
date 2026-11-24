/**
 * 국민연금공단 가입 사업장 내역 Open API (data.go.kr 3046071).
 *
 * 응답 항목은 이름과 값을 바꾸지 않고 그대로 돌려준다. 항목의 뜻, 공개 범위,
 * 해석할 때 주의할 점은 scripts/nps/README.md에 있다.
 */

export const NPS_WORKPLACE_API_BASE =
  "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2";

/** 오퍼레이션 경로. 포털 페이지에는 한글 이름만 있어 첫 실제 호출로 확인해야 한다. */
export const NPS_WORKPLACE_OPERATIONS = {
  /** 사업장 정보조회: 사업장명 등으로 사업장 목록과 식별번호(seq)를 찾는다. */
  search: "getBassInfoSearchV2",
  /** 상세 정보조회: seq로 가입자수, 당월고지금액 등을 읽는다. */
  detail: "getDetailInfoSearchV2",
  /** 기간별 현황 정보조회: seq와 자료생성년월로 그 달의 신규취득자수·상실가입자수를 읽는다. */
  monthly: "getPdAcctoSttusInfoSearchV2",
} as const;

export type NpsOperation = keyof typeof NPS_WORKPLACE_OPERATIONS;
export type NpsItem = Record<string, unknown>;
export type NpsPage = {
  items: NpsItem[];
  totalCount: number | null;
  pageNo: number | null;
  numOfRows: number | null;
};

export class NpsApiError extends Error {
  constructor(
    message: string,
    readonly details: { code?: string; status?: number; body?: string } = {}
  ) {
    super(message);
    this.name = "NpsApiError";
  }
}

type NpsOptions = {
  serviceKey?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/**
 * 포털 마이페이지의 일반 인증키를 DATA_GO_KR_SERVICE_KEY에 넣는다.
 * Encoding 키(퍼센트 인코딩된 값)를 넣어도 한 번 풀어 이중 인코딩을 막는다.
 */
export function npsServiceKey(raw = process.env.DATA_GO_KR_SERVICE_KEY) {
  const key = raw?.trim();
  if (!key) throw new NpsApiError("DATA_GO_KR_SERVICE_KEY is not set.");
  if (!key.includes("%")) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

const numberOrNull = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return value === "" || value == null || !Number.isFinite(parsed) ? null : parsed;
};

const xmlText = (body: string, tag: string) =>
  body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim();

/** data.go.kr 응답 본문을 항목 목록으로 바꾼다. 게이트웨이 오류는 JSON 요청에도 XML로 온다. */
export function parseNpsResponse(body: string, status = 200): NpsPage {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    const code = xmlText(body, "returnReasonCode") ?? xmlText(body, "resultCode");
    const message =
      xmlText(body, "returnAuthMsg") ?? xmlText(body, "resultMsg") ?? xmlText(body, "errMsg");
    throw new NpsApiError(
      `NPS API returned a non-JSON response${message ? `: ${message}` : ""}.`,
      { code, status, body: body.slice(0, 1_000) }
    );
  }
  const gateway = (json as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: Record<string, unknown> } })
    .OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gateway) {
    const reason = [gateway.errMsg, gateway.returnAuthMsg].filter(Boolean).join(" / ");
    throw new NpsApiError(`NPS API gateway error${reason ? `: ${reason}` : ""}.`, {
      code: gateway.returnReasonCode == null ? undefined : String(gateway.returnReasonCode),
      status,
      body: body.slice(0, 1_000),
    });
  }
  const response = (json as { response?: Record<string, any> }).response;
  const header = response?.header ?? {};
  const code = header.resultCode == null ? undefined : String(header.resultCode);
  if (!response || (code && code !== "00" && code !== "0")) {
    throw new NpsApiError(
      `NPS API error${header.resultMsg ? `: ${header.resultMsg}` : ""}.`,
      { code, status, body: body.slice(0, 1_000) }
    );
  }
  const bodyPart = response.body ?? {};
  const rawItems = bodyPart.items?.item ?? bodyPart.items ?? [];
  const items = (Array.isArray(rawItems) ? rawItems : [rawItems]).filter(
    // 결과가 없으면 API가 빈 객체 하나({})를 돌려준다.
    (item): item is NpsItem =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length > 0
  );
  return {
    items,
    totalCount: numberOrNull(bodyPart.totalCount),
    pageNo: numberOrNull(bodyPart.pageNo),
    numOfRows: numberOrNull(bodyPart.numOfRows),
  };
}

/** 오퍼레이션 하나를 호출한다. params는 포털 명세의 요청 변수 이름(camelCase)을 그대로 쓴다. */
export async function callNps(
  operation: NpsOperation,
  params: Record<string, string | number | undefined>,
  options: NpsOptions = {}
): Promise<NpsPage> {
  const url = new URL(`${NPS_WORKPLACE_API_BASE}/${NPS_WORKPLACE_OPERATIONS[operation]}`);
  url.searchParams.set("serviceKey", npsServiceKey(options.serviceKey));
  url.searchParams.set("dataType", "json");
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
  }
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await (options.fetch ?? fetch)(url, { signal });
  const body = await response.text();
  if (!response.ok && !body.trim().startsWith("{")) {
    throw new NpsApiError(`NPS API HTTP ${response.status}.`, {
      status: response.status,
      body: body.slice(0, 1_000),
    });
  }
  return parseNpsResponse(body, response.status);
}

export type NpsWorkplaceQuery = {
  /** 사업장명. 포털 명세상 필수다. */
  name: string;
  /** 사업자등록번호 앞 6자리. */
  bizRegPrefix?: string;
  /** 법정동 주소 시도·시군구·읍면동 코드. */
  sidoCode?: string;
  sigunguCode?: string;
  emdCode?: string;
  pageNo?: number;
  numOfRows?: number;
};

export function searchNpsWorkplaces(query: NpsWorkplaceQuery, options?: NpsOptions) {
  return callNps(
    "search",
    {
      wkplNm: query.name.trim(),
      bzowrRgstNo: query.bizRegPrefix?.replace(/\D/g, "").slice(0, 6) || undefined,
      ldongAddrMgplDgCd: query.sidoCode,
      ldongAddrMgplSgguCd: query.sigunguCode,
      ldongAddrMgplSgguEmdCd: query.emdCode,
      pageNo: query.pageNo ?? 1,
      numOfRows: query.numOfRows ?? 100,
    },
    options
  );
}

export function readNpsWorkplaceDetail(seq: string, options?: NpsOptions) {
  return callNps("detail", { seq }, options);
}

/**
 * 그 달의 신규취득자수(nwAcqzrCnt)·상실가입자수(lssJnngpCnt).
 * seq는 달마다 다르다. 그 달 검색 결과의 seq와 dataCrtYm을 함께 넣어야 값이 나온다.
 */
export function readNpsWorkplaceMonth(seq: string, month: string, options?: NpsOptions) {
  return callNps("monthly", { seq, dataCrtYm: month }, options);
}

/** 검색 결과를 모든 페이지에 걸쳐 모은다. */
export async function searchAllNpsWorkplaces(query: NpsWorkplaceQuery, options?: NpsOptions) {
  const items: NpsItem[] = [];
  for (let pageNo = 1; ; pageNo++) {
    const page = await searchNpsWorkplaces({ ...query, pageNo, numOfRows: query.numOfRows ?? 100 }, options);
    items.push(...page.items);
    if (!page.items.length || page.totalCount == null || items.length >= page.totalCount) return items;
  }
}

export type NpsMonthRow = {
  month: string;
  seq: string;
  name: unknown;
  address: unknown;
  /** 상세 정보조회 응답 그대로 (jnngpCnt 가입자수, crrmmNtcAmt 당월고지금액 등) */
  detail: NpsItem | null;
  /** 기간별 현황 응답 그대로 (nwAcqzrCnt 신규취득자수, lssJnngpCnt 상실가입자수) */
  flow: NpsItem | null;
  errors: string[];
};

/**
 * 사업장 검색 결과는 같은 사업장이 달마다 다른 seq로 한 줄씩 나온다(최근 12개월).
 * 검색된 줄마다 상세와 그 달 현황을 읽어 달별 행으로 돌려준다. 같은 회사인지와 지점 합산은 호출한 쪽이 판단한다.
 */
export async function readNpsWorkplaceHistory(query: NpsWorkplaceQuery, options?: NpsOptions) {
  const found = await searchAllNpsWorkplaces(query, options);
  const message = (error: unknown) => (options?.signal?.throwIfAborted(), error instanceof Error ? error.message : String(error));
  const first = (items: NpsItem[]) => items[0] ?? null;
  const rows = await Promise.all(found.map(async (item): Promise<NpsMonthRow> => {
    const seq = String(item.seq), month = String(item.dataCrtYm), errors: string[] = [];
    const [detail, flow] = await Promise.all([
      readNpsWorkplaceDetail(seq, options).then(page => first(page.items), error => (errors.push(`detail: ${message(error)}`), null)),
      readNpsWorkplaceMonth(seq, month, options).then(page => first(page.items), error => (errors.push(`monthly: ${message(error)}`), null)),
    ]);
    return { month, seq, name: item.wkplNm, address: item.wkplRoadNmDtlAddr, detail, flow, errors };
  }));
  return rows.sort((a, b) => a.month.localeCompare(b.month) || String(a.name).localeCompare(String(b.name)));
}
