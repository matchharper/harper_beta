# Agents API만 사용하는 이력서 첨부 실증 — 2026-10-12

**Agents API의 OpenAI-hosted 작업 환경에서 이력서 PDF 첨부에 성공했다.** 브라우저 설치·실행과 파일 첨부는 모두 OpenAI가 할당한 환경 안에서 일어난다. Harper/Vercel 브라우저 서버, 사용자 브라우저, 로컬 Chromium, Responses API는 이 실행에 사용하지 않았다. 로컬 Python은 Agents API 요청·이벤트 수신·증거 다운로드만 수행했다.

## 실제 검증 결과

| 경로·대상 | 확인한 결과 | 전체 시간 |
| --- | --- | --- |
| Native `computer_use`, Astra, Ashby 데모 | 폼 진입·Resume 필드 확인. 에이전트가 workspace 파일 첨부를 지원하지 않는다고 보고했고, 선택된 파일명은 없음 | 66.21초 |
| OpenAI-hosted Playwright, Astra, 합성 접수 폼 | PDF 선택 후 브라우저에서 읽은 이름·크기·SHA-256이 원본과 일치. 테스트 서버가 정확히 한 번 받은 PDF의 이름·크기·SHA-256도 일치 | 95.96초 |
| OpenAI-hosted Playwright, Astra, Ashby 공식 데모 | 중첩 iframe의 실제 Resume 파일 입력에 PDF를 넣음. 화면에 파일명이 표시되고, 브라우저 `files[0]`의 byte identity가 원본과 일치. 최종 Submit은 누르지 않음 | 150.44초 |

시간은 sandbox 준비와 증거 다운로드/cleanup을 포함한다. 원본은 가짜 정보만 들어 있는 유효 PDF `Harper Test Resume.pdf`(833 bytes)다. 모든 run에서 API가 usage를 반환하지 않아 모델 비용은 **unknown/null**로 기록했다.

모델의 완료 문장 외에 Artifacts API에서 JSON·스크린샷을 내려받아 직접 검토했다. 각 세션·환경이 삭제 후 GET 404가 되는 것도 확인했다. 실제 회사 지원·실제 사용자 이력서·production 데이터 사용·push·배포는 없었다.

## 성공한 구성

1. `/v1/agents/sessions`에 `environment.type = openai_hosted`를 지정한다.
2. `environment.files`에 PDF와 재사용 브라우저 helper를 inline bytes로 전달한다. 파일은 `/workspace/...`에 생성된다.
3. `environment.setup_commands`로 **OpenAI 환경 안에** Playwright·Chromium을 준비한다. 시스템이 이미 신뢰하는 CA만 Chromium에도 등록한다. TLS 검증을 끄지 않았다.
4. Agents API 모델이 그 환경의 실행 도구로 페이지를 열고 실제 폼 요소를 찾는다. Playwright `locator.setInputFiles(workspacePath)`로 같은 환경의 파일을 첨부한다.
5. 실제 파일 입력 객체·화면·수신 영수증을 검증하고 `/workspace/outputs`의 증거를 Artifacts API로 내려받는다. 세션을 삭제한다.

이 경로는 `computer_use` 내장 브라우저와 별개의 **OpenAI-hosted sandbox 실행 방식**이다. 둘을 같은 기능으로 설명하면 안 된다. Agents API만으로 가능하다는 실증이며, 현재 제품의 Vercel browser executor를 이 방식으로 전환한 것은 아니다.

공식 계약: [OpenAI-hosted sandbox와 setup commands](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted), [파일 전달·아티팩트](https://developers.openai.com/api/docs/guides/agents-api/environments/files).

## 재현과 증거

Canonical runner: `scripts/agents_api_hosted_upload_probe.py`.

```sh
output/jupyter-notebook/.venv/bin/python scripts/agents_api_hosted_upload_probe.py --method hosted --case ashby_demo --timeout 420
output/jupyter-notebook/.venv/bin/python scripts/agents_api_hosted_upload_probe.py --method hosted --case owned_fixture --timeout 420
```

API key는 client의 기존 환경변수 또는 `.env.local`에서만 읽고, OpenAI 작업 환경·로그·코드에 넣지 않는다. 실행 manifest는 frozen v1, source revision, dirty diff·runner·prompt·PDF hash와 실제 모델 설정을 기록했다. 원문 출력·스크린샷은 ignored owner-only `runs/`에 있다.

- Native run: `20261012T063416Z-native-ashby_demo`
- 합성 접수 run: `20261012T063538Z-hosted-owned_fixture`
- Ashby run: `20261012T063724Z-hosted-ashby_demo`

## 해석의 한계

확인한 것은 두 테스트 폼에서의 첨부와 합성 서버의 수신이다. 실제 employer의 접수 완료, 로그인·CAPTCHA, large/multiple files, production 제출 승인 강제·격리 계약은 이번 gate에 포함하지 않는다. 제품 전환 시에는 기존 승인·문서 소유권·버전·중복 전송 방지 경계를 별도로 유지해야 한다.
