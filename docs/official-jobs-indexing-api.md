# Google 채용 공고 Indexing API 운영

Harper는 공식 공고가 공개·수정되면 `URL_UPDATED`, 공개 해제되면
`URL_DELETED`를 Google Indexing API에 전송한다. 전송 실패가 공고 저장이나
Ashby 동기화를 되돌리지는 않으며, 실패 내용은 서버 로그에 남는다.

## 설정

1. Google Cloud에서 Indexing API를 활성화하고 서비스 계정을 만든다.
2. Search Console에서 `matchharper.com` 속성의 소유자로 서비스 계정 이메일을
   추가한다.
3. 서버에 다음 환경 변수를 설정한다.

   - `GOOGLE_INDEXING_API_ENABLED=true`
   - `GOOGLE_INDEXING_CLIENT_EMAIL`: 서비스 계정 이메일
   - `GOOGLE_INDEXING_PRIVATE_KEY`: 서비스 계정 private key (`\n` 문자열 형식 지원)

   Google Application Default Credentials를 제공하는 실행 환경에서는 마지막 두
   변수를 생략하고 `GOOGLE_APPLICATION_CREDENTIALS` 등의 표준 인증 설정을 사용할
   수 있다.

기능 플래그가 없거나 `true`가 아니면 API 호출은 하지 않는다. 공고 페이지의
404 응답과 sitemap 제외는 이 설정과 무관하게 동작한다.
