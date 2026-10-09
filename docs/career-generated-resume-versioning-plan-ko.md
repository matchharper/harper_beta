# Harper 이력서: JSON 문서와 다운로드 시 PDF 생성

## 제품 계약

- 웹 채팅의 `generate_resume`는 AI가 작성한 전체 내용으로 개인 문서를 생성하고, 이후에는 변경 요청만 받아 저장된 JSON에 적용하거나 생성 문서를 별도 문서로 복사한다. 도구 안에 작성 AI를 두지 않는다.
- `generate_resume`는 사용자가 자신의 이력서/CV/Resume 생성·수정·복사를 명시적으로 요청하거나 Harper의 구체적인 해당 제안을 명확히 수락한 경우에만 호출한다. 짧은 긍정도 바로 관련된 이력서 작업과 범위를 수락한 의미일 때만 유효하다. 특정 단어나 정규식이 아니라 원본 대화 LLM이 맥락과 의미로 판단한다.
- 가벼운 경험·성과 이야기, 사실 정정, 업로드, 검토·상담 요청, Profile·Memory 변경만으로 이력서에 자동 반영하지 않는다. 이전 이력서 작업의 승인은 이후의 별개 경험 공유에 대한 상시 수정 권한이 아니다. 현재 승인된 이력서 작업 범위만 수행하고, 이미 명확히 승인받은 작업의 동의를 반복하지 않는다. 경험을 말할 때마다 이력서 수정 제안을 붙이지 않는다.
- 기존 Profile·경력 메모·관련 Memory·문서를 읽어 작성한다. 없는 수치·날짜·영문 이름을 만들지 않는다. 표현 수정으로 Profile·Memory를 자동 변경하지 않는다.
- `create`에는 특징을 드러내는 `document_name`과 전체 `content`가 필수다. `update`에는 생성 문서의 `document_id`, `expected_revision`과 `changes`만 보내며 전체 `content`를 받지 않는다. 일반 수정은 이름·문서 ID·링크를 유지한다. 별도 문서를 요청하면 `copy`에 원본 생성 문서의 `document_id`, `expected_revision`, 새 `document_name`, 선택적인 `changes`를 보낸다. 복사본은 새 ID와 링크를 가진 비공개 문서이며 원본은 보존한다. 업로드 원본은 복사 대상이 아닌 생성 자료로 사용한다.
- 이름·연락처 → 학력 → 경력 → 프로젝트 → 대외활동·기술·기타 순서다. Summary는 출력하지 않는다.
- 한 페이지를 우선해 간결하게 작성하되 필요한 내용은 여러 페이지로 나눈다. 렌더러는 내용을 삭제하거나 글자를 축소하지 않는다.

## 저장과 동시 수정

원본은 기존 `talent_documents.structured_content`의 JSON이다. `extracted_text`에는 같은 내용에서 만든 일반 텍스트를 저장한다. HTML이나 PDF를 별도로 저장하지 않는다.

수정 전 `read_document(format=structured)`로 현재 revision과 항목 ID를 읽는다. `changes`는 `content` 기준 JSON pointer 경로와 `set`·`add`·`remove` 작업을 담는다. 예를 들어 `{"op":"set","path":"/experience/<기존 항목 ID>/description","value":"수정한 설명"}`은 해당 설명만 바꾼다. 경력·학력·프로젝트 등은 안정적인 ID로 선택하고, bullet·기술 목록·연락처 링크처럼 ID가 없는 배열은 인덱스로 선택한다. `add`는 컬렉션 경로에 새 항목 하나를 추가하며 새 ID는 서버가 부여한다. `remove`는 지정한 필드 또는 항목만 삭제한다.

서버는 기존 JSON의 복사본에 변경을 적용하고 전체 결과를 검증한 뒤 저장한다. 요청하지 않은 항목은 유지하며 잘못된 경로·ID 변경·필수 필드 삭제·유효하지 않은 결과는 저장하지 않는다. DB에는 병합한 JSON 컬럼과 텍스트를 함께 갱신한다. SQL 차원의 부분 JSON 갱신은 아니며, 동시 수정은 기존 revision 조건으로 충돌을 감지한다. 수정 과정에서 PDF를 만들지 않는다. 작은 수정에서는 LLM이 출력하는 양이 줄지만 현재 문서를 읽는 단계와 저장 검증은 남으므로 전체 응답 시간 단축 폭은 별도 측정이 필요하다.

`copy`도 읽은 원본 revision을 확인하고 같은 변경 계약을 적용한다. 복사본의 항목 ID는 새로 부여하고 출처 문서 ID를 기록한다. 원본의 공개 상태·대표 지정·PDF 파일은 복사하지 않는다. 복사본 이름은 필수이며, 원본 이름과 같아도 문서 ID는 다르다.

`kind=resume`, `origin_type=harper_generated_resume`, `is_primary=false`를 유지하며 생성 시 `is_public=false`로 저장한다. `file_name`은 호환성과 다운로드 이름으로 `.pdf`를 포함한다. 새 문서의 `storage_path`, `content_type`, `size_bytes`, `content_sha256`은 NULL이다.

문서 생성은 요청에서 결정한 UUID와 기존 PK로 중복을 방지한다. 수정은 기존 revision·소유권·삭제 여부를 조건으로 한 UPDATE로 JSON·본문·파일 메타데이터를 함께 교체한다. 기존 trigger가 revision을 올린다. `origin_id`는 마지막 작업 재시도 판별에 사용한다. 작업/버전 테이블·큐·cron·PDF 캐시는 없다.

기존 생성 PDF는 일괄 삭제하지 않는다. 정상적인 내용 수정으로 파일 참조가 비워진 뒤 이전 파일을 최선 노력으로 삭제한다. 삭제 실패는 저장을 되돌리지 않는다. 불확실한 DB 응답에서는 확인할 수 없는 파일을 삭제하지 않는다.

새 스키마/버킷/RLS/Storage 정책 변경은 없다. 새 문서는 비공개이며 사용자가 회사 공개를 선택할 수 있다. 내용 수정은 기존 공개 상태를 유지한다. 대표 지정과 자동 전달은 계속 제한한다. 회사 HTML 열람과 PDF 다운로드마다 기존 워크스페이스·후보자 접근 권한 및 공개 여부를 확인하며, PDF 출력 완료 시에도 재확인한다. 익명 공개 링크는 제공하지 않는다.

## HTML 미리보기

기존 문서 상세 링크와 채팅 문서 카드를 재사용한다. 파일 URL이 없는 생성 문서도 문서 탭에서 열 수 있다.

인증된 content GET은 표시용 내용·revision·렌더링 버전을 반환하며 출처 참조는 노출하지 않는다. 유효한 JSON이 있는 기존 생성 문서도 HTML로 표시한다. JSON이 없거나 읽을 수 없는 기존 문서는 저장 PDF 열람을 유지한다.

공유 템플릿은 A4 세로 1열, 16mm 여백, 10.5pt 본문, Noto Sans KR 400/700이다. Paged.js 0.4.3이 실제 페이지 경계를 만든다. 폰트와 라이브러리는 번들에 포함되며 버전이 붙은 공개 assets API가 사용자 정보 없이 전달한다. iframe은 `sandbox=allow-scripts`로 격리하고 문서 필드는 HTML escape한다. CSP가 외부 네트워크·폼·임의 리소스를 차단한다.

폰트를 로드한 후 배치한다. 화면은 최대 82% 배율로 중앙 정렬하며 회색 배경과 용지 그림자를 표시한다. 좌우 여백은 데스크톱 28px, 모바일 16px 이상 확보한다. 좁은 화면에서는 A4 전체를 축소하며 내부 줄바꿈 폭을 바꾸지 않는다. PDF에는 화면 배율을 적용하지 않는다. revision이 바뀌면 새 iframe으로 이전 배치 결과를 버린다. Chrome/Edge를 기준으로 검증하며 브라우저 간 픽셀 단위 동일성은 보장하지 않는다.

## 다운로드 API

`POST /api/talent/documents/[documentId]/pdf`에 `expected_revision`, `render_version`을 보낸다. 서버는 인증된 사용자 소유의 저장 JSON만 읽는다. 클라이언트 HTML을 받지 않는다.

공유 템플릿·페이지 분할·폰트를 서버 Chromium에서 실행하고 PDF 본문 누락과 페이지 수를 검증한다. 출력 전 문서 revision·삭제 여부를 다시 확인한다. 변경 시 409, 찾을 수 없으면 404, JSON을 읽을 수 없으면 422를 반환한다. 생성 실패는 저장 문서를 변경하지 않는다.

PDF는 서버 메모리에서 다운로드 응답으로 전달한다. `application/pdf`, UTF-8 다운로드 파일명, `private, no-store`를 사용한다. Storage 업로드나 DB UPDATE는 없으며 다운로드로 revision이 증가하지 않는다. 다시 다운로드하면 다시 생성한다. 버튼이 실행 중 중복 클릭을 막는다.

PDF 렌더링 제한은 30초, API maxDuration은 60초다. 배포 tracing에 Chromium·PDF worker·폰트·Paged.js를 포함한다. 실제 배포 환경의 메모리·실행 시간 검증은 릴리스 전 확인한다.

## 검증과 관측

로컬 PDF 변환에는 Chromium이 필요하다. `pnpm exec playwright-core install chromium`으로 설치한다. `RESUME_CHROMIUM_EXECUTABLE_PATH`가 있으면 우선 사용하며, macOS에서는 설치된 Google Chrome을 사용하고 없으면 Playwright Chromium을 사용한다. Linux 서버는 배포에 포함한 `@sparticuz/chromium` 실행 파일을 사용한다. 사용자 브라우저에 Chrome 설치를 요구하지 않는다.

실제 PDF·미리보기 검증: `RESUME_PDF_TEST=1 pnpm exec tsx --test src/lib/resumes/resume.test.ts src/lib/resumes/export.test.ts src/lib/resumes/preview.test.ts`. 로컬 통과와 별개로 배포된 다운로드 API의 성공 여부를 확인해야 서버 검증이 완료된다.

- 저장: 동일 요청 재시도·동시 수정·삭제·소유권·실패·이전 파일 정리 실패.
- 출력: 한국어·영어·긴 URL·긴 문단·여러 페이지·모바일 축소·본문 일치.
- 다운로드: 시작/종료 시 revision 검증, 삭제/변경 중단, 렌더링 실패 시 원본 보존.
- 호환: 일반 업로드 파일과 텍스트 문서 기능 유지, 생성 PDF의 오래된 signed URL 미노출.
- 로그: 저장 성공/실패·소요 시간, 열기, 미리보기 페이지 수/소요 시간, PDF 다운로드 성공/실패·소요 시간·페이지 수. 내용·파일명·개인정보는 기록하지 않는다.

## 2026-09-29 로컬 다운로드·미리보기 문제 확인

### 확정된 PDF 실패 원인

로컬 `.env.local`의 `RESUME_CHROMIUM_EXECUTABLE_PATH`가 존재하지 않는 실행 파일을 가리켰다. 이 변수는 자동 경로 선택보다 우선하므로, Playwright Chromium을 설치하고 기본 경로를 수정해도 잘못된 override가 남아 있으면 PDF 생성은 계속 실패한다. Safari가 PDF를 생성하는 것이 아니라 Next.js 서버가 Chromium을 실행하는 단계의 문제였다.

설치된 Playwright Chromium의 실제 경로로 로컬 override를 수정하고 개발 서버를 재시작했다. 기존 코드의 macOS Google Chrome 고정 경로 의존도 제거했다. 환경변수가 없으면 설치된 macOS Google Chrome을 확인하고, 없으면 Playwright Chromium 경로를 사용한다. Chromium 설치 자체는 필요하며 경로 fallback이 자동 설치를 뜻하지 않는다.

첫 검증은 `.env.local` 없이 실행한 renderer 테스트였으므로 실제 개발 서버의 잘못된 override를 발견하지 못했다. 이후 검증은 `--env-file=.env.local`을 포함하고 실제 브라우저의 다운로드 요청까지 확인했다.

### Chrome 미리보기와 확인 범위

Chrome에서 문서 조회 후 미리보기 로딩이 지속되다가 실패 화면으로 전환되는 현상을 관찰했다. 기존 UI는 페이지 계산 완료 메시지를 받기 전까지 계산을 수행하는 iframe 자체를 `visibility:hidden`으로 숨겼다. 이 숨김을 제거해 미리보기 표시가 숨겨진 프레임의 작업 완료에 의존하지 않게 했다. `A4 · 2p` 같은 상단 규격·페이지 수 표시도 제거했다.

변경 및 개발 서버 재시작 후 같은 실제 문서의 Chrome 미리보기와 다운로드가 정상 동작했다. 다만 숨김 처리와 개발 서버 재시작을 독립적으로 비교한 A/B 검증은 하지 않았으므로, Chrome 내부 스케줄링이 유일한 원인이었다고 확정하지 않는다.

검증 결과:

- 실제 문서 JSON을 `.env.local`과 함께 읽은 renderer에서 2페이지 PDF 생성 성공.
- Chrome 실제 문서 화면에서 2페이지 미리보기 확인. 다운로드 API `200`, 서버 PDF 생성 약 4초, 브라우저 다운로드 기록 `18.1 KB · Done` 확인.
- Safari 다운로드 기록에서 같은 문서의 PDF 저장(`19 KB`) 확인.
- `.env.local`을 로드한 한국어·영어·여러 페이지 출력, 미리보기, revision·권한 변경 검증 총 12개 통과. 병렬 검증 중 30초 제한에 걸린 실행도 있어, 단일 실행 통과를 모든 부하 조건에서의 시간 보장으로 해석하지 않는다.
- Safari는 이후 개발 서버 재시작·페이지 재로딩 과정에서 페이지 전체가 빈 화면으로 남는 별도 현상이 관찰됐다. 다운로드 성공과 별개로 이 재로딩 현상의 원인·해결은 아직 확인되지 않았다.

### 배포 서버에서는 어떻게 동작하는가

사용자의 Safari/Chrome 설치 여부와 서버 PDF 변환은 분리되어 있다. Linux 배포에서는 `@sparticuz/chromium` 패키지의 실행 파일을 풀어 `playwright-core`로 실행한다. `package.json`에 해당 패키지가 고정 버전으로 포함되어 있고, `next.config.mjs`는 다운로드 API 배포 파일에 Chromium 바이너리·PDF worker·폰트·Paged.js를 포함하도록 설정되어 있다. 서버에 데스크톱 Google Chrome을 별도로 설치하는 방식이 아니다.

따라서 **로컬 Mac의 Chrome 설치 경로가 없어서 실패한 문제는 정상적인 Linux 배포 경로에는 적용되지 않는다.** 프레임 숨김 제거는 배포된 클라이언트에도 적용된다. 다만 이번 작업에서 배포 서버를 실제로 호출한 것은 아니므로 배포 성공을 보장하거나 검증 완료로 기록하지 않는다.

배포 확인 조건:

1. Vercel Preview/Production 환경의 `RESUME_CHROMIUM_EXECUTABLE_PATH`에 로컬 Mac 경로를 복사하지 않는다. 별도 서버 실행 파일을 의도적으로 관리하지 않는 한 이 변수는 설정하지 않아 패키지 경로를 사용한다. 이번 로컬 `.env.local` 수정은 배포 환경변수를 수정하지 않는다.
2. 배포 결과에 위 실행 파일과 리소스가 포함됐는지 확인하고, 실제 배포 URL에서 인증된 PDF 다운로드를 실행한다. 응답 `200`, `application/pdf`, 정상적으로 열리는 PDF까지 확인한다.
3. 배포 URL의 Safari·Chrome에서 미리보기와 다운로드를 확인하고, 긴 문서 및 동시 요청에서도 30초 renderer 제한과 서버 메모리 한도를 충족하는지 확인한다. 이것이 완료돼야 배포 환경 검증 완료다.
