# 메인 랜딩(`index.tsx`) SEO 액션 플랜

기준일: 2026-02-22  
대상 페이지: `src/pages/index.tsx`

## 현재 상태 진단

1. `src/pages/index.tsx`에 페이지 전용 SEO 메타(`title`, `description`, canonical, OG/Twitter)가 없습니다.
2. SEO 관련 메타가 `src/pages/_app.tsx`, `src/pages/_document.tsx`에 분산되어 페이지별 제어가 어렵습니다.
3. `public/robots.txt`, `public/sitemap.xml`이 없어 크롤러 탐색/색인 신호가 약합니다.
4. 랜딩 핵심 타이틀 컴포넌트(`Head1`)가 `<div>` 기반이라 시맨틱 헤딩(`h1/h2`) 구조가 약합니다.
5. 랜딩 URL에 `ab`, `lid`, `cl` 같은 파라미터가 붙을 수 있어 중복 URL 인덱싱 리스크가 있습니다.

## 우선순위 작업

## P0 (가장 먼저)

1. `src/pages/index.tsx`에 `<Head>` 추가
- 필수: `title`, `description`, `robots`, canonical
- 권장: `og:*`, `twitter:*`, `og:image`

2. canonical 고정
- canonical은 항상 `https://matchharper.com/`로 고정
- `?ab=...&lid=...&cl=...` 파라미터 URL이 노출되어도 대표 URL은 루트 1개로 통합

3. 시맨틱 헤딩 정리
- 페이지 대표 헤딩 1개를 실제 `<h1>`로 제공
- 섹션 타이틀은 `<h2>`, 카드/서브는 `<h3>` 사용
- Hero 핵심 카피는 크롤러가 바로 읽을 수 있는 텍스트 노드 유지

4. 크롤링 기본 파일 생성
- `public/robots.txt`
- `public/sitemap.xml` (최소한 `/` 포함)

## P1 (다음 스프린트)

1. 구조화 데이터(JSON-LD) 추가
- 랜딩: `SoftwareApplication` 또는 `Organization` + `WebSite`
- FAQ 섹션: `FAQPage`

2. 내부 링크 시그널 강화
- 헤더의 섹션 이동 버튼을 가능하면 `<a href="#pricing">` 같은 앵커 링크로 전환

3. 다국어 URL 전략 정리
- 현재는 쿠키 기반 locale 전환이라 크롤러 입장에서 URL 분리가 약함
- 필요 시 `/ko`, `/en` 라우트 분리 + `hreflang` 적용

## P2 (지속 개선)

1. Core Web Vitals 개선
- above-the-fold 영상/애니메이션 로딩 비용 축소
- LCP 요소(히어로 텍스트/미디어) 최적화

2. 검색 콘솔 운영
- Google Search Console + Bing Webmaster 등록
- sitemap 제출, 색인 커버리지/쿼리 성과 모니터링

## 바로 적용 가능한 코드 예시

### 1) `src/pages/index.tsx`에 메타 추가

```tsx
import Head from "next/head";

// ...

return (
  <>
    <Head>
      <title>Harper | AI Recruiter for Startup Hiring</title>
      <meta
        name="description"
        content="Harper helps startup teams find high-fit AI and software talent with evidence-based search."
      />
      <meta name="robots" content="index,follow,max-image-preview:large" />
      <link rel="canonical" href="https://matchharper.com/" />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Harper" />
      <meta property="og:title" content="Harper | AI Recruiter for Startup Hiring" />
      <meta
        property="og:description"
        content="Discover and prioritize high-fit candidates faster with AI-powered sourcing."
      />
      <meta property="og:url" content="https://matchharper.com/" />
      <meta property="og:image" content="https://matchharper.com/images/og-main.png" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Harper | AI Recruiter for Startup Hiring" />
      <meta
        name="twitter:description"
        content="Discover and prioritize high-fit candidates faster with AI-powered sourcing."
      />
      <meta name="twitter:image" content="https://matchharper.com/images/og-main.png" />
    </Head>

    <main>{/* existing content */}</main>
  </>
);
```

### 2) JSON-LD 예시 (`src/pages/index.tsx`)

```tsx
const softwareAppLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Harper",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://matchharper.com/",
  description:
    "AI recruiter platform for startup hiring teams to find and evaluate high-fit candidates.",
};

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppLd) }}
/>;
```

### 3) `public/robots.txt` 예시

```txt
User-agent: *
Allow: /

Sitemap: https://matchharper.com/sitemap.xml
```

### 4) `public/sitemap.xml` 최소 예시

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://matchharper.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

## 파일별 적용 포인트

1. `src/pages/index.tsx`
- 페이지 전용 `<Head>` 메타
- `<h1>/<h2>` 시맨틱 구조
- JSON-LD 스크립트

2. `src/components/landing/Head1.tsx`
- `div` 대신 태그를 선택 가능하게(`as="h1" | "h2" | ...`) 개선

3. `public/robots.txt`, `public/sitemap.xml`
- 크롤러 탐색/색인 신호 추가

4. `src/pages/_document.tsx`
- 전역 공통 메타만 유지(페이지 고유 title/description은 페이지로 이동)

## 완료 기준

1. `view-source:https://matchharper.com/`에서 title/description/canonical/OG/Twitter/JSON-LD 확인 가능
2. GSC URL 검사에서 canonical이 루트 URL 1개로 잡힘
3. Search Console에 sitemap 정상 수집됨
4. 랜딩의 대표 키워드가 `<h1>` 및 본문 텍스트에 실제 포함됨
