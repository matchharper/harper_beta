# 연락 조회 관계 모호성 수정

2026-09-27, 로컬 `codex/company-agent-capabilities`. 미배포. DB migration·운영 쓰기·외부 발송 없음.

## 문제와 변경

실제 회사 대화의 `list_contacts`가 연락이 없어서가 아니라 PostgREST `PGRST201`로 실패했다.
연락 목록 RPC는 성공했지만, 후속 회신 조회가 두 FK 중 어느 방향을 읽을지 결정하지 못했다.
같은 중첩 조회가 연락 상세와 같은 Role/후보자의 대화 이력에도 있었다.

`contacts.ts`의 세 경로를 공통 `attachCandidateContactRelays`로 변경했다.
회사 범위로 확인한 연락 ID를 모아 회신 테이블의 `company_talent_request_id`로 직접 조회한다.
관계 제약 이름을 각 select에 붙이지 않으며 양방향 FK도 그대로 유지한다.
회사 답장의 `in_reply_to_company_talent_relay_id`는 새 후보자 회신으로 간주하지 않는다.
ID 배치·회신 pagination을 사용하고, 목록에는 회신 본문을 읽지 않는다.
권한 검사와 수락 전 비공개 Career 원문·문서·주소 제한은 유지한다.

## 서로 다른 검증 계층

### 실제 DB read-only

사용자가 허용한 internal workspace와 본인 후보자 계정에서 실패했던 연락 2건을 조회했다.
동일 DB에서 기존 중첩 select는 `PGRST201`을 재현했다. 새 코드의 목록은 10개 항목을 반환했고,
해당 2건의 상세와 각 2개 대화 이력을 읽었다. 저장된 제목·본문과 상세 응답을 직접 비교했다.
기존 오류 재현을 제외한 요청은 모두 HTTP 200이었다. GET과 지정된 read-only 목록 RPC 외의
네트워크 쓰기는 smoke에서 차단했다. 모델 호출·메시지·DB 변경은 0이다.
원본 ID가 있는 재현 스크립트는 ignored `.local/check-company-contact-reads-20260927.cjs`에 0600으로 보관한다.

### 비모델 회귀: 10/10

`src/lib/org/agent/contacts.test.ts` 8개와 `contactsPrivacy.test.ts` 2개:

- 실제 Supabase client가 생성하는 요청을 검사하며 모호한 중첩 select는 오류로 응답하는 transport stub.
- 여러 연락을 배치로 조회, 회사 답장과 후보자 회신의 방향 구분, 상세/이력의 회신 중복 방지.
- 회신 201건 pagination, 회신 없는 연락, 아직 전달되지 않은 회신 본문 비노출.
- 다른 workspace 연락의 회신 조회 금지, 최초 권한 검사, 조회 오류를 빈 결과로 위장하지 않음.
- 공유 전 비공개 이메일·Career 원문·문서 접근 금지와 공유된 회신 보존.

```bash
OPENAI_API_KEY=synthetic-test-key \
NEXT_PUBLIC_SUPABASE_URL=https://contact-test.invalid \
NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-key \
TSX_TSCONFIG_PATH=scripts/tsconfig.json \
node --import tsx --test src/lib/org/agent/contacts.test.ts src/lib/org/agent/contactsPrivacy.test.ts
```

이 테스트 자체는 실제 PostgREST 서버가 아니며, 실제 관계 오류 해결의 근거는 위 read-only 확인과 구분한다.

### 동결 모델 회귀: 2변형/2발화

입력/정답 v8은 변경하지 않았다. Run: `20260927-contact-reader-regression`.
Gemini 3.8 Flash/OpenRouter, temperature 0.5, progressive, `--copy=real`.
이 run의 source snapshot 뒤에는 반환 타입 표기와 테스트 fixture만 보완했고 실행 로직·prompt는 같았다.

| 변형 | 실제 호출/효과와 수동 원문 판정 |
| --- | --- |
| `CSCQ802-manual_today` | `read_talent`와 `list_contacts`로 오늘 수동 연락을 확인하고 재발송 여부를 질문. 새 발송·상태 변경 0. 필수 의미 통과. |
| `CSCQ802-already_replied` | `read_contact`까지 읽어 이미 도착한 거절 회신을 안내. 중복 팔로업·임의 단계 변경 0. 종료 정리는 제안만 함. 필수 의미 통과. |

두 답변의 전체 원문과 도구 결과를 읽었다. 설명/CTA가 다소 길고 두 번째 답변은 인용 뒤 같은 의미를
반복하는 사용성 경고가 남는다. 이번 조회 오류 수정과 별개이며 prompt 예외를 추가하지 않았다.
합성 도구 모델 회귀는 실제 DB 조회를 증명하지 않는다. 전체 37변형/양방향 5대화 재실행도 아니다.
원문·provider·source fingerprint는 기존 ignored run에 보존한다.

## 이전 평가의 빈틈과 남는 범위

이전 모델 평가는 합성 조회 응답을 사용했고, 기존 privacy mock은 select 문자열을 검증하지 않았다.
격리 연락 5대화의 성공도 모든 reader 경로를 실행했다는 뜻은 아니었다. 따라서 이전 통과 기록을
실제 DB의 이 중첩 조회까지 검증한 증거로 해석하면 안 된다. 이번 회귀는 그 누락 경계를 보완한다.

전체 TypeScript 검사는 기존 8개 오류(생성된 Next type 2개, ignored 수동 검증 파일 1개,
growth test 5개)로 실패한다. 이번 변경 파일의 타입 오류는 해소했다.
과거 대화에 저장된 진행 로그나 그 표시 순서·오류 문구는 이번에 변경하지 않는다.
배포·브라우저 새 대화·외부 발송 검증을 수행했다고 주장하지 않는다.
