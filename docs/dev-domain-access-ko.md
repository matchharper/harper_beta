# dev.matchharper.com 회사 Google 인증

2026-11-18 기준 로컬 구현이며, 배포와 실제 Google 로그인은 아직 확인하지 않았다. 현재 원격 도메인은 Vercel Authentication으로 보호되어 있다.

## 동작

- `dev.matchharper.com`에서 유효한 입장 인증이 없으면 Google 계정 선택으로 이동한다.
- 서버가 Google ID 토큰의 서명·발급자·대상 앱·만료·로그인 요청 nonce를 확인한다. `email_verified=true`, `hd=matchharper.com`, 이메일의 정확한 도메인이 `matchharper.com`인 계정만 허용한다. 로그인 요청의 `hd` 힌트만 믿고 허용하지 않는다.
- 인증한 뒤 원래 열려던 주소로 돌아간다. API·정적 파일·점이 포함된 경로도 인증을 거치며, 일반 API 호출에는 로그인 리다이렉트 대신 401을 반환한다.
- 입장 인증은 `Secure`, `HttpOnly`, `SameSite=Lax`, host-only 세션 쿠키로 보관한다. 서버 만료 시각은 Google ID 토큰의 만료 시각을 따른다. 쿠키가 없거나 만료되면 다시 Google 인증을 거친다.
- 이 인증으로 Supabase 고객 계정이나 온보딩을 생성하지 않는다. 기존 Harper 로그인과 테스트 계정의 세션도 변경하지 않는다.
- 운영 주소와 localhost에는 입장 인증을 적용하지 않는다. 개발 주소에 필요한 설정이 없으면 503으로 차단한다.

## 적용에 필요한 설정

Google OAuth의 웹 애플리케이션 클라이언트에 다음 redirect URI를 등록한다.

`https://dev.matchharper.com/api/dev-access/callback`

Vercel의 `dev` 브랜치 Preview 환경에 서버 전용 변수를 설정한다. 값은 저장소·로그·문서에 기록하지 않는다.

| 변수 | 용도 |
| --- | --- |
| `DEV_ACCESS_GOOGLE_CLIENT_ID` | 해당 Google 웹 OAuth 클라이언트 ID |
| `DEV_ACCESS_GOOGLE_CLIENT_SECRET` | 해당 클라이언트의 secret |
| `DEV_ACCESS_SESSION_SECRET` | 32바이트 이상의 난수로 만든 입장 인증 서명 키 |

현재 요청에는 명시적인 배포 승인이 없다. 이후 배포할 때에는 아래 순서로 전환한다.

1. Google OAuth와 Preview 환경변수를 설정하고, 승인받은 `dev` revision을 배포한다.
2. 기존 Vercel 인증을 유지한 상태에서 회사 계정 허용, 외부 계정 차단, 직접 API 접근 차단을 실제 브라우저와 HTTP 요청으로 확인한다.
3. 검증한 뒤 `dev.matchharper.com`만 Vercel Deployment Protection Exceptions에 추가한다. 이때부터 앱의 회사 Google 인증이 개발 사이트의 입장을 제어한다. 다른 Preview URL의 Vercel 보호는 유지한다.
4. Vercel에 로그인하지 않은 브라우저에서 Google 인증부터 개발 화면까지 다시 확인한다.

## 확인한 범위

`npx tsx --test src/lib/devAccess.test.ts`는 Next의 실제 matcher, proxy, OAuth 시작·callback 함수를 실행한다. Google 토큰 발급·인증서 조회만 격리한 뒤 RSA 서명 검증은 설치된 `google-auth-library`로 수행한다. 회사 밖 계정, 잘못된 issuer/audience/nonce, 변조한 서명·쿠키, 만료, 설정 누락, 열린 리다이렉트, 고객 세션 분리를 확인한다.

실제 로컬 Next 서버에 개발 Host로 요청해 설정 누락 시 차단되는 것도 확인했다. Google OAuth 클라이언트 설정과 실제 Google 계정 로그인은 남아 있다.

관련 코드: `src/proxy.ts`, `src/lib/devAccess.ts`, `src/lib/devAccessOAuth.ts`, `src/app/api/dev-access/{login,callback}/route.ts`.

Google의 [OpenID Connect 계약](https://developers.google.com/identity/openid-connect/openid-connect)과 Vercel의 [도메인별 보호 예외](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions)를 따른다.
