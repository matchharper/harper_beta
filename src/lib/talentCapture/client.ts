export type TalentCaptureSource =
  | "resume"
  | "linkedin"
  | "github"
  | "scholar"
  | "website";

type PendingTalentCapturePayload = {
  source: TalentCaptureSource;
  link: string | null;
  resumeFileName: string | null;
  resumeFileType: string | null;
  updatedAt: string;
};

type LoadedPendingTalentCapture = PendingTalentCapturePayload & {
  resumeFile: File | null;
};

const STORAGE_KEY = "harper_talent_capture_pending_v1";
const RESUME_DB_NAME = "harper-talent-capture";
const RESUME_STORE_NAME = "pending-files";
const RESUME_FILE_KEY = "resume";

function isBrowser() {
  return typeof window !== "undefined";
}

function openResumeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser() || typeof indexedDB === "undefined") {
      reject(new Error("브라우저 저장소를 사용할 수 없습니다."));
      return;
    }

    const request = indexedDB.open(RESUME_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RESUME_STORE_NAME)) {
        database.createObjectStore(RESUME_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("브라우저 저장소를 열지 못했습니다."));
  });
}

async function writeResumeFile(file: File) {
  const database = await openResumeDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RESUME_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RESUME_STORE_NAME);
    const request = store.put(file, RESUME_FILE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("이력서 임시 저장에 실패했습니다."));
  }).finally(() => {
    database.close();
  });
}

async function readResumeFile(meta: PendingTalentCapturePayload) {
  const database = await openResumeDb();

  return new Promise<File | null>((resolve, reject) => {
    const transaction = database.transaction(RESUME_STORE_NAME, "readonly");
    const store = transaction.objectStore(RESUME_STORE_NAME);
    const request = store.get(RESUME_FILE_KEY);

    request.onsuccess = () => {
      const value = request.result;
      database.close();

      if (!value) {
        resolve(null);
        return;
      }

      if (value instanceof File) {
        resolve(value);
        return;
      }

      if (value instanceof Blob && meta.resumeFileName) {
        resolve(
          new File([value], meta.resumeFileName, {
            type: meta.resumeFileType ?? value.type,
          })
        );
        return;
      }

      resolve(null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("이력서 임시 저장을 읽지 못했습니다."));
    };
  });
}

async function deleteResumeFile() {
  if (!isBrowser() || typeof indexedDB === "undefined") return;

  const database = await openResumeDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RESUME_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RESUME_STORE_NAME);
    const request = store.delete(RESUME_FILE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("임시 이력서를 삭제하지 못했습니다."));
  }).finally(() => {
    database.close();
  });
}

export function normalizeTalentCaptureLink(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function validateTalentCaptureLink(
  source: Exclude<TalentCaptureSource, "resume">,
  raw: string
) {
  const normalized = normalizeTalentCaptureLink(raw);
  if (!normalized) {
    return { ok: false, error: "링크를 입력해 주세요.", normalized: "" };
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return {
      ok: false,
      error: "올바른 링크 형식으로 입력해 주세요.",
      normalized,
    };
  }

  const host = url.hostname.toLowerCase();
  const isLinkedin = host === "linkedin.com" || host.endsWith(".linkedin.com");
  const isGithub = host === "github.com" || host.endsWith(".github.com");
  const isScholar = host.includes("scholar.google.");

  if (source === "linkedin" && !isLinkedin) {
    return {
      ok: false,
      error: "LinkedIn 프로필 링크를 입력해 주세요.",
      normalized,
    };
  }

  if (source === "github" && !isGithub) {
    return {
      ok: false,
      error: "GitHub 링크를 입력해 주세요.",
      normalized,
    };
  }

  if (source === "scholar" && !isScholar) {
    return {
      ok: false,
      error: "Google Scholar 링크를 입력해 주세요.",
      normalized,
    };
  }

  return { ok: true, normalized, error: "" };
}

function writePendingPayload(payload: PendingTalentCapturePayload) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function readPendingPayload(): PendingTalentCapturePayload | null {
  if (!isBrowser()) return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingTalentCapturePayload>;
    if (!parsed?.source) return null;

    return {
      source: parsed.source,
      link: typeof parsed.link === "string" ? parsed.link : null,
      resumeFileName:
        typeof parsed.resumeFileName === "string" ? parsed.resumeFileName : null,
      resumeFileType:
        typeof parsed.resumeFileType === "string" ? parsed.resumeFileType : null,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function savePendingTalentCapture(args: {
  source: TalentCaptureSource;
  link?: string;
  resumeFile?: File | null;
}) {
  if (!isBrowser()) return;

  if (args.source === "resume") {
    if (!args.resumeFile) {
      throw new Error("이력서 파일을 선택해 주세요.");
    }

    await writeResumeFile(args.resumeFile);
    writePendingPayload({
      source: args.source,
      link: null,
      resumeFileName: args.resumeFile.name,
      resumeFileType: args.resumeFile.type || null,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  await deleteResumeFile();
  writePendingPayload({
    source: args.source,
    link: normalizeTalentCaptureLink(args.link ?? ""),
    resumeFileName: null,
    resumeFileType: null,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearPendingTalentCapture() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  await deleteResumeFile();
}

export async function loadPendingTalentCapture(): Promise<LoadedPendingTalentCapture | null> {
  const payload = readPendingPayload();
  if (!payload) return null;

  if (payload.source !== "resume") {
    return {
      ...payload,
      resumeFile: null,
    };
  }

  const resumeFile = await readResumeFile(payload);
  return {
    ...payload,
    resumeFile,
  };
}

async function fetchWithAccessToken(
  accessToken: string,
  url: string,
  init?: RequestInit
) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(url, {
    ...init,
    headers,
  });
}

async function parseResumeText(accessToken: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAccessToken(
    accessToken,
    "/api/talent/resume/parse",
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    return "";
  }

  const payload = await response.json().catch(() => ({}));
  return typeof payload?.text === "string" ? payload.text.trim().slice(0, 20000) : "";
}

async function uploadResume(accessToken: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAccessToken(
    accessToken,
    "/api/talent/resume/upload",
    {
      method: "POST",
      body: formData,
    }
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error ?? "이력서 업로드에 실패했습니다.");
  }

  return {
    resumeFileName:
      typeof payload?.resumeFileName === "string" ? payload.resumeFileName : file.name,
    resumeStoragePath:
      typeof payload?.resumeStoragePath === "string" ? payload.resumeStoragePath : "",
  };
}

export async function finalizePendingTalentCapture(accessToken: string) {
  const pending = await loadPendingTalentCapture();
  if (!pending) {
    return { ok: true, saved: false };
  }

  const body: {
    links: string[];
    resumeFileName?: string;
    resumeStoragePath?: string;
    resumeText?: string;
  } = {
    links: [],
  };

  if (pending.source === "resume") {
    if (!pending.resumeFile) {
      throw new Error("선택한 이력서 파일을 찾지 못했습니다.");
    }

    const uploadResult = await uploadResume(accessToken, pending.resumeFile);
    const resumeText = await parseResumeText(accessToken, pending.resumeFile);
    body.resumeFileName = uploadResult.resumeFileName;
    body.resumeStoragePath = uploadResult.resumeStoragePath;
    if (resumeText) {
      body.resumeText = resumeText;
    }
  } else if (pending.link) {
    body.links = [pending.link];
  } else {
    throw new Error("저장할 링크 정보가 없습니다.");
  }

  const response = await fetchWithAccessToken(
    accessToken,
    "/api/talent/profile/update",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error ?? "식별자 저장에 실패했습니다.");
  }

  await clearPendingTalentCapture();
  return { ok: true, saved: true };
}
