import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { Badge } from "@/components/ui/badge";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { BlogLocale } from "@/lib/blog";
import type {
  OpsBlogLocalizedContent,
  OpsBlogPost,
  OpsBlogResponse,
  OpsBlogSaveInput,
  OpsBlogSaveResponse,
} from "@/lib/ops/blogServer";
import type { OfficialJobListItem } from "@/lib/officialJobs";
import {
  ArrowUpRight,
  FilePlus2,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  Upload,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BlogDraft = Omit<OpsBlogPost, "id"> & { id: string | null };

type ThumbnailUploadResponse = {
  bucket: string;
  ok: true;
  storagePath: string;
  thumbnailUrl: string;
};

const EMPTY_LOCALIZED_CONTENT: OpsBlogLocalizedContent = {
  category: "",
  content: "",
  excerpt: "",
  seoDescription: "",
  seoTitle: "",
  title: "",
};

function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).format(new Date());
}

function createEmptyDraft(): BlogDraft {
  const now = new Date().toISOString();
  return {
    authorAvatarUrl: "/images/logo.png",
    authorName: "Harper",
    createdAt: now,
    createdBy: null,
    id: null,
    isPinned: false,
    isPublished: false,
    localized: {
      en: { ...EMPTY_LOCALIZED_CONTENT },
      ko: { ...EMPTY_LOCALIZED_CONTENT },
    },
    publishedAt: getToday(),
    relatedJobSlugs: [],
    relatedPostSlugs: [],
    schemaType: "article",
    slug: "",
    tags: [],
    thumbnailUrl: "",
    updatedAt: now,
    updatedBy: null,
  };
}

function toSaveInput(draft: BlogDraft): OpsBlogSaveInput {
  return {
    id: draft.id ?? undefined,
    isPinned: draft.isPinned,
    isPublished: draft.isPublished,
    localized: {
      en: {
        content: draft.localized.en.content,
        excerpt: draft.localized.en.excerpt,
        title: draft.localized.en.title,
      },
      ko: {
        content: draft.localized.ko.content,
        excerpt: draft.localized.ko.excerpt,
        title: draft.localized.ko.title,
      },
    },
    relatedJobSlugs: draft.relatedJobSlugs,
    relatedPostSlugs: draft.relatedPostSlugs,
    tags: draft.tags,
    thumbnailUrl: draft.thumbnailUrl,
  };
}

function hasLocale(post: BlogDraft | OpsBlogPost, locale: BlogLocale) {
  const content = post.localized[locale];
  return Boolean(content.content && content.excerpt && content.title);
}

function postTitle(post: BlogDraft | OpsBlogPost) {
  return post.localized.ko.title || post.localized.en.title || "새 글";
}

function sortPosts(posts: OpsBlogPost[]) {
  return [...posts].sort((left, right) => {
    if (left.isPublished !== right.isPublished)
      return left.isPublished ? -1 : 1;
    return right.publishedAt.localeCompare(left.publishedAt);
  });
}

export default function OpsBlogPage() {
  const [posts, setPosts] = useState<OpsBlogPost[]>([]);
  const [jobs, setJobs] = useState<OfficialJobListItem[]>([]);
  const [draft, setDraft] = useState<BlogDraft>(() => createEmptyDraft());
  const [locale, setLocale] = useState<BlogLocale>("ko");
  const [query, setQuery] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload =
        await fetchWithInternalAuth<OpsBlogResponse>("/api/internal/blog");
      setPosts(sortPosts(payload.posts));
      setJobs(payload.jobs);
      setDraft((current) => {
        if (!current.id) return current;
        return payload.posts.find((post) => post.id === current.id) ?? current;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "블로그 글을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadPosts(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadPosts]);

  const filteredPosts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return posts;
    return posts.filter((post) =>
      [post.localized.ko.title, post.localized.en.title, ...post.tags]
        .join("\n")
        .toLowerCase()
        .includes(normalized)
    );
  }, [posts, query]);

  const filteredJobs = useMemo(() => {
    const normalized = jobQuery.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) =>
      [job.companyName, job.location, job.roleTitle, job.slug, job.vertical]
        .join("\n")
        .toLowerCase()
        .includes(normalized)
    );
  }, [jobQuery, jobs]);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === draft.id) ?? null,
    [draft.id, posts]
  );

  const updateLocalized = useCallback(
    (field: keyof OpsBlogLocalizedContent, value: string) => {
      setDraft((current) => ({
        ...current,
        localized: {
          ...current.localized,
          [locale]: { ...current.localized[locale], [field]: value },
        },
      }));
    },
    [locale]
  );

  const selectPost = useCallback((post: OpsBlogPost) => {
    setDraft(post);
    setLocale(hasLocale(post, "ko") ? "ko" : "en");
    setError("");
    setNotice("");
  }, []);

  const startNewPost = useCallback(() => {
    setDraft(createEmptyDraft());
    setLocale("ko");
    setError("");
    setNotice("");
  }, []);

  const toggleJob = useCallback((slug: string, checked: boolean) => {
    setDraft((current) => {
      const next = checked
        ? [...current.relatedJobSlugs, slug].slice(0, 4)
        : current.relatedJobSlugs.filter((value) => value !== slug);
      return { ...current, relatedJobSlugs: [...new Set(next)] };
    });
  }, []);

  const toggleRelatedPost = useCallback((slug: string, checked: boolean) => {
    setDraft((current) => {
      const next = checked
        ? [...current.relatedPostSlugs, slug].slice(0, 3)
        : current.relatedPostSlugs.filter((value) => value !== slug);
      return { ...current, relatedPostSlugs: [...new Set(next)] };
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchWithInternalAuth<OpsBlogSaveResponse>(
        "/api/internal/blog",
        {
          body: JSON.stringify(toSaveInput(draft)),
          headers: { "Content-Type": "application/json" },
          method: draft.id ? "PATCH" : "POST",
        }
      );
      setPosts((current) =>
        sortPosts([
          payload.post,
          ...current.filter((post) => post.id !== payload.post.id),
        ])
      );
      setDraft(payload.post);
      setNotice(
        payload.post.isPublished
          ? "저장했고 공개 상태로 반영했습니다."
          : "저장했고 비공개 상태로 반영했습니다."
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "블로그 글을 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const handleThumbnailUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    setUploadingThumbnail(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.set("file", file);
      const payload = await fetchWithInternalAuth<ThumbnailUploadResponse>(
        "/api/internal/blog/thumbnail",
        { body: formData, method: "POST" }
      );
      setDraft((current) => ({
        ...current,
        thumbnailUrl: payload.thumbnailUrl,
      }));
      setNotice("썸네일을 업로드했습니다. 글을 저장하면 적용됩니다.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "썸네일 이미지를 업로드하지 못했습니다."
      );
    } finally {
      setUploadingThumbnail(false);
      if (thumbnailFileInputRef.current) {
        thumbnailFileInputRef.current.value = "";
      }
    }
  }, []);

  const localized = draft.localized[locale];
  const localeTabs = (["ko", "en"] as BlogLocale[]).map((item) => ({
    label: `${item.toUpperCase()} · ${hasLocale(draft, item) ? "완료" : "미완료"}`,
    value: item,
  }));
  const canSave =
    Boolean(
      draft.thumbnailUrl.trim() &&
      draft.tags.some((tag) => tag.trim()) &&
      (hasLocale(draft, "ko") || hasLocale(draft, "en"))
    ) && !saving;

  return (
    <>
      <Head>
        <title>Blog · Harper Ops</title>
      </Head>

      <OpsShell
        title="Blog"
        actions={
          <div className="flex gap-2">
            <MuteButton
              type="button"
              variant="default"
              size="md"
              onClick={() => void loadPosts()}
              disabled={loading}
            >
              <RefreshCw className={cx(loading && "animate-spin")} />
              새로고침
            </MuteButton>
            <MuteButton
              type="button"
              variant="dark"
              size="md"
              onClick={startNewPost}
            >
              <FilePlus2 />새 글
            </MuteButton>
          </div>
        }
      >
        <section className="grid gap-5 xl:grid-cols-[minmax(320px,0.72fr)_minmax(620px,1.28fr)]">
          <aside className={cx(opsTheme.panel, "min-w-0 p-5")}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-medium text-neutral-primary">
                {posts.length}개 글
              </div>
              <span className="text-xs text-neutral-muted">
                공개 {posts.filter((post) => post.isPublished).length}
              </span>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-soft" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목, 태그 검색"
                className="pl-9"
              />
            </div>

            <div className="mt-4 max-h-[calc(100svh-240px)] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center gap-2 rounded-md bg-bg-default/50 px-4 py-5 text-sm text-neutral-muted">
                  <LoaderCircle className="size-4 animate-spin" /> 불러오는
                  중...
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-1000-a10 px-4 py-8 text-center text-sm text-neutral-muted">
                  표시할 글이 없습니다.
                </div>
              ) : (
                filteredPosts.map((post) => {
                  const active = post.id === draft.id;
                  return (
                    <CardButton
                      key={post.id}
                      type="button"
                      selected={active}
                      onClick={() => selectPost(post)}
                      className="block w-full"
                    >
                      <span className="flex w-full items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="line-clamp-2 block text-sm font-medium leading-5">
                            {postTitle(post)}
                          </span>
                          <span className="mt-1 block truncate text-xs text-neutral-muted">
                            {post.tags.join(" · ") || "태그 없음"}
                          </span>
                        </span>
                        <Badge
                          size="sm"
                          tone={post.isPublished ? "positive" : "neutral"}
                          variant="faded"
                        >
                          {post.isPublished ? "공개" : "비공개"}
                        </Badge>
                      </span>
                      <span className="mt-2 flex gap-2 text-[11px] text-neutral-soft">
                        <span>
                          KO {hasLocale(post, "ko") ? "완료" : "없음"}
                        </span>
                        <span>
                          EN {hasLocale(post, "en") ? "완료" : "없음"}
                        </span>
                      </span>
                    </CardButton>
                  );
                })
              )}
            </div>
          </aside>

          <form
            className={cx(opsTheme.panel, "min-w-0 p-5")}
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) void handleSave();
            }}
          >
            <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-lg font-medium text-neutral-primary">
                  {postTitle(draft)}
                </div>
                <div className="mt-1 text-xs text-neutral-muted">
                  {selectedPost
                    ? `마지막 수정 ${new Date(selectedPost.updatedAt).toLocaleString("ko-KR")}`
                    : "새 블로그 글"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {draft.id && draft.isPublished && draft.slug ? (
                  <MuteButton asChild variant="default" size="md">
                    <Link href={`/blog/${draft.slug}`} target="_blank">
                      미리보기 <ArrowUpRight />
                    </Link>
                  </MuteButton>
                ) : null}
                <MuteButton
                  type="submit"
                  variant="dark"
                  size="md"
                  disabled={!canSave}
                >
                  {saving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Save />
                  )}
                  저장
                </MuteButton>
              </div>
            </div>

            {error ? (
              <div className={cx(opsTheme.errorNotice, "mt-4")}>{error}</div>
            ) : null}
            {notice ? (
              <div className={cx(opsTheme.successNotice, "mt-4")}>{notice}</div>
            ) : null}

            <div className="mt-5 grid gap-4">
              <Field label="썸네일 URL" htmlFor="blog-thumbnail">
                <div className="flex items-center gap-2">
                  <Input
                    id="blog-thumbnail"
                    className="min-w-0 flex-1"
                    value={draft.thumbnailUrl}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        thumbnailUrl: event.target.value,
                      }))
                    }
                    placeholder="/images/blog/cover-example.png"
                  />
                  <input
                    ref={thumbnailFileInputRef}
                    type="file"
                    accept="image/avif,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label="블로그 썸네일 이미지 선택"
                    onChange={(event) =>
                      void handleThumbnailUpload(
                        event.target.files?.[0] ?? null
                      )
                    }
                  />
                  <MuteButton
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={uploadingThumbnail}
                    onClick={() => thumbnailFileInputRef.current?.click()}
                  >
                    {uploadingThumbnail ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Upload />
                    )}
                    {uploadingThumbnail ? "업로드 중" : "업로드"}
                  </MuteButton>
                </div>
                <p className="mt-2 text-xs text-neutral-muted">
                  PNG, JPG, WebP, AVIF · 최대 8MB · 1200×630 비율 권장
                </p>
              </Field>
              <Field label="태그" htmlFor="blog-tags">
                <Input
                  id="blog-tags"
                  value={draft.tags.join(", ")}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      tags: event.target.value
                        .split(",")
                        .map((tag) => tag.trim()),
                    }))
                  }
                  placeholder="AI, Careers, Roles"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-5 rounded-md border border-neutral-1000-a05 bg-bg-default/60 px-4 py-3">
              <Checkbox
                checked={draft.isPublished}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    isPublished: event.target.checked,
                  }))
                }
                label="공개"
                size="medium"
              />
              <Checkbox
                checked={draft.isPinned}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    isPinned: event.target.checked,
                  }))
                }
                label="상단 고정"
                size="medium"
              />
            </div>

            <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium text-neutral-primary">
                    언어별 콘텐츠
                  </h2>
                  <p className="mt-1 text-xs text-neutral-muted">
                    제목·요약·본문이 모두 있어야 해당 언어에 노출됩니다.
                  </p>
                </div>
                <Tabs
                  activeValue={locale}
                  items={localeTabs}
                  onValueChange={(value) => setLocale(value as BlogLocale)}
                  size="small"
                  variant="pills-elevated"
                  className="w-fit"
                />
              </div>

              <div className="mt-4 grid gap-4">
                <Field label="제목" htmlFor={`blog-title-${locale}`}>
                  <Input
                    id={`blog-title-${locale}`}
                    value={localized.title}
                    onChange={(event) =>
                      updateLocalized("title", event.target.value)
                    }
                  />
                </Field>
                <Field label="목록 요약" htmlFor={`blog-excerpt-${locale}`}>
                  <Textarea
                    id={`blog-excerpt-${locale}`}
                    rows={3}
                    value={localized.excerpt}
                    onChange={(event) =>
                      updateLocalized("excerpt", event.target.value)
                    }
                  />
                </Field>
                <Field label="Markdown 본문" htmlFor={`blog-content-${locale}`}>
                  <Textarea
                    id={`blog-content-${locale}`}
                    rows={24}
                    value={localized.content}
                    onChange={(event) =>
                      updateLocalized("content", event.target.value)
                    }
                    className="min-h-[560px] font-mono text-[13px]"
                  />
                </Field>
              </div>
            </section>

            <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
              <h2 className="text-base font-medium text-neutral-primary">
                Harper가 살펴보고 있는 자리
              </h2>
              <p className="mt-1 text-xs text-neutral-muted">
                최대 4개를 직접 고릅니다. 선택하지 않으면 공개된 자리 중 4개를
                랜덤으로 보여줍니다.
              </p>
              <div className="relative mt-3 max-w-lg">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-soft" />
                <Input
                  value={jobQuery}
                  onChange={(event) => setJobQuery(event.target.value)}
                  placeholder="회사, 역할, 위치 검색"
                  className="pl-9"
                />
              </div>
              <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto rounded-md border border-neutral-1000-a05 bg-bg-default/50 p-3 md:grid-cols-2">
                {filteredJobs.map((job) => {
                  const checked = draft.relatedJobSlugs.includes(job.slug);
                  const disabled =
                    !checked && draft.relatedJobSlugs.length >= 4;
                  return (
                    <Checkbox
                      key={job.id}
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) =>
                        toggleJob(job.slug, event.target.checked)
                      }
                      label={
                        <span className="block min-w-0">
                          <span className="block truncate text-neutral-primary">
                            {job.roleTitle}
                          </span>
                          <span className="block truncate text-xs text-neutral-muted">
                            {job.companyName} · {job.location}
                          </span>
                        </span>
                      }
                      className="min-w-0 items-start rounded px-2 py-1.5"
                      size="medium"
                    />
                  );
                })}
              </div>
            </section>

            <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
              <h2 className="text-base font-medium text-neutral-primary">
                Blog 더보기
              </h2>
              <p className="mt-1 text-xs text-neutral-muted">
                최대 3개를 직접 고릅니다. 선택하지 않으면 같은 언어의 최신 글을
                자동으로 채웁니다.
              </p>
              <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto rounded-md border border-neutral-1000-a05 bg-bg-default/50 p-3 md:grid-cols-2">
                {posts
                  .filter((post) => post.slug !== draft.slug)
                  .map((post) => {
                    const checked = draft.relatedPostSlugs.includes(post.slug);
                    const disabled =
                      !checked && draft.relatedPostSlugs.length >= 3;
                    return (
                      <Checkbox
                        key={post.id}
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) =>
                          toggleRelatedPost(post.slug, event.target.checked)
                        }
                        label={postTitle(post)}
                        className="min-w-0 rounded px-2 py-1.5"
                        size="medium"
                      />
                    );
                  })}
              </div>
            </section>
          </form>
        </section>
      </OpsShell>
    </>
  );
}

function Field({
  children,
  className,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className={className}>
      <label className={opsTheme.label} htmlFor={htmlFor}>
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
