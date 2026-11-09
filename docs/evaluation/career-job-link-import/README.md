# Career 공고 링크 저장 복구

공고 읽기 실패와 저장 결과를 원본 대화 LLM이 구분하고, 요약 없이도 본문에서 확인한 제목·회사명으로 같은 턴에 저장을 이어가는지 확인한다. 평가 단위는 독립된 한 턴이다.

- 입력/gold: `cases-v1.json`, `gold-v1.json`의 합성 2건. 실제 사건의 빈 Exa 요약을 일반화했으며 실제 사용자·회사·공고 원문은 포함하지 않는다. 실행 전에 manifest의 SHA-256으로 동결한다. 라벨은 Codex가 실행 전 작성했다.
- 정본 runner: `scripts/evalCareerJobLinkImport.ts`. production conversation prompt builder, 도구 schema/executor, importer, formatter, streaming provider adapter를 재사용한다. Exa는 합성 응답, DB는 읽기/저장 경계를 메모리에서 대체한다. 의미 판단용 새 production 분기는 없다.
- 모델/설정: 사건과 같은 `claude-haiku-5-5`, 현재 production reasoning/sampling/output 설정. 요청별 90초 제한. 다른 모델 fallback은 실행 실패로 처리한다. prompt fingerprint와 실제 provider body/model은 각 run에 보존한다.
- gate: 읽을 수 있는 본문 사례는 정확한 제목·회사·본문으로 단 한 번 import, 읽기 실패 사례는 쓰기 0. 요청 payload에 전용 텍스트 projection과 실패 원인이 도달해야 한다. 원문 응답을 직접 검토하며 의미·문체를 키워드로 채점하지 않는다.
- 개인정보/외부 전송: 합성 입력과 repository prompt만 Anthropic에 보낸다. provider 외 네트워크 차단, usage DB 기록도 로컬 capture. 운영 DB·회사 연락·공고 생성·배포 없음. raw output과 요청은 ignored `runs/` 아래 0600으로 저장한다.
- 재현 manifest: source revision, dirty diff fingerprint, frozen input/gold hash, prompt fingerprint, provider/model과 실행 설정, 결과와 raw 경로를 기록한다. 재실행은 새 run을 만들고 frozen 입력을 덮어쓰지 않는다.
- 한계: 2건의 좁은 복구 확인이며 실제 DB transaction, 전체 capability 선택, UI, production 성공률은 입증하지 않는다. 공개 올리브영 링크의 실제 Exa 본문 조회는 별도 읽기 전용 점검이다.

```sh
TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerJobLinkImport.ts
```

## 2026-10-28 로컬 검증

실제 Haiku streaming 요청에서 본문·원인 projection이 전달됐고, 빈 요약 사례는 같은 턴에 2회 tool 호출 후 정확한 제목·회사·전체 본문으로 import 1회, 조회 불가 사례는 import 0회를 확인했다. 첫 run에서 모델이 조회 API의 503을 공고 사이트 장애로 추정해, 도구 결과에 확인된 범위(조회 경로 실패이며 사이트 장애 여부 미확인)를 명시했다. 후속 run `2026-10-28T07-17-06-561Z`에서는 그 불확실성을 유지했다. Codex가 두 응답 원문을 검토했다.

모델의 저장 후 답변에 요청하지 않은 지원 경로 안내가 덧붙는 기존 문체/기능 설명 한계가 관찰됐다. 이번 검증은 저장 복구·실패 원인 전달 범위이며 전체 Career 답변 품질 통과로 해석하지 않는다. 신규 본문 저장/실패 원인 및 기존 소유권·test-only 경계 관련 단위 테스트는 22개 통과했다. 실제 올리브영 URL은 수정 경로로 본문 3,223자를 읽고 저장 입력을 구성했으며 운영 DB에는 쓰지 않았다. 저장 transaction은 mock으로 대체했다.

변경 파일의 타입 확인에서는 작업 전부터 비어 있던 `src/types/database.types.ts` 때문에 importer의 기존 `Json` import가 막혔다. 해당 파일은 변경하지 않았으며 전체 build 성공을 주장하지 않는다. 웹·Worker·DB 배포 없음.
