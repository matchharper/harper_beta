# Talent-Career 파일 역할 정리

## 범위
이 문서는 `talent` 랜딩과 `career` 온보딩 채팅 기능에 직접 연결된 파일들의 역할을 정리합니다.

## 사용자 흐름(요약)
1. 사용자가 `/talent`에서 서비스 설명 확인 후 `지금 시작하기` 클릭
2. `/career`에서 로그인/회원가입
3. 로그인 후 `talent_users` 레코드 보장 + 세션(대화방) 로드
4. 이력서/링크 제출
5. LLM 기반 질문-답변 채팅 진행

## 파일별 역할

| 파일 경로 | 역할 | 핵심 책임 |
| --- | --- | --- |
| `src/pages/talent.tsx` | 온보딩 진입 랜딩 페이지 | 화이트 테마 설명형 UI, 프로세스/장점/FAQ/비교 테이블, 캘린더+시간 선택, `/career` 이동 버튼 제공 |
| `src/pages/career.tsx` | 후보자 온보딩 메인 화면 | 로그인/회원가입 UI, 이력서+링크 제출, 채팅 컴포저, 진행률 패널, 어시스턴트 메시지 타이핑 효과(한 글자씩) |
| `src/app/api/talent/auth/bootstrap/route.ts` | 사용자 부트스트랩 API | Bearer 토큰으로 사용자 검증 후 `talent_users` 업서트 보장 |
| `src/app/api/talent/session/route.ts` | 세션 초기화/조회 API | 최신 `talent_conversations` 조회, 없으면 생성, 첫 방문 안내 시스템 메시지 저장 후 전체 메시지 반환 |
| `src/app/api/talent/resume/parse/route.ts` | 이력서 텍스트 추출 API | 인증된 요청의 파일(FormData) 파싱, PDF는 `pdf-parse-fork`로 텍스트 추출, 일반 텍스트 파일도 처리 |
| `src/app/api/talent/onboarding/start/route.ts` | 온보딩 시작 API | 이력서/링크를 대화방에 저장, `profile_submit` 메시지 저장, LLM으로 환영+인사이트+첫 질문 생성 |
| `src/app/api/talent/chat/route.ts` | 온보딩 채팅 API | 사용자 메시지 저장, 최근 메시지+이력서 컨텍스트로 LLM 답변 생성, 5턴 이후 부담완화 문구 1회 삽입 |
| `src/lib/talentOnboarding/server.ts` | Talent 온보딩 서버 공용 유틸 | 첫 방문 고정 텍스트, Supabase admin 클라이언트 생성, 표시명 생성, `talent_users` 업서트, 메시지 로드 |
| `src/lib/talentOnboarding/llm.ts` | LLM 호출 래퍼 | 모델 호출 공통화(xAI 우선, 실패 시 OpenAI fallback), 응답 텍스트 정리 |
| `src/lib/supabaseServer.ts` | 서버 인증 유틸 | 요청 헤더 Bearer 토큰 파싱, `getRequestUser`로 사용자 식별 |
| `src/store/useAuthStore.ts` | 클라이언트 인증 상태 스토어 | Supabase 세션/유저 상태 유지, 인증 상태 변경 구독, 로그아웃 처리 |

## DB 테이블 의존성

| 테이블 | 사용 파일 | 용도 |
| --- | --- | --- |
| `talent_users` | `auth/bootstrap`, `session`, `server.ts` | 후보자 계정 메타 저장(기본 프로필) |
| `talent_conversations` | `session`, `onboarding/start`, `chat` | 온보딩 대화방 메타(단계, 이력서/링크, 진행상태) |
| `talent_messages` | `session`, `onboarding/start`, `chat`, `server.ts` | 시스템/사용자/어시스턴트 메시지 저장 |

## API 호출 관계(`/career` 기준)

1. 로그인 완료 후: `POST /api/talent/auth/bootstrap`
2. 세션 로드: `GET /api/talent/session`
3. 이력서 업로드 시(필요 시): `POST /api/talent/resume/parse`
4. 기본정보 제출: `POST /api/talent/onboarding/start`
5. 대화 입력 전송: `POST /api/talent/chat`

## 환경 변수

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (talent 온보딩 서버 API에서 필수)

