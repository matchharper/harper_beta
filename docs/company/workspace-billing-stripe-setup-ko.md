# Workspace 구독 구현과 Stripe 설정

## 2026-10-09 공개 결제 보류

- 결제 검증이 끝날 때까지 공개 직접 가입을 중단한다. `/company`와 `/pricing`의 시작 버튼은 기존 미팅 신청 폼으로 연결하고, `/org`는 기존 초대 기반 로그인 화면을 사용한다. 직접 가입 API도 중단하며 새 화면 코드는 주석으로 보존한다.
- Slots와 Billing은 Harper Workspace에서만 노출한다. 다른 회사에서는 직접 URL 접근도 회사 화면으로 돌려보내고 결제 API 접근을 차단한다. 일반 채용 흐름이 읽는 이용 권한 조회는 유지한다.
- 초대받은 팀원의 온보딩에는 요금제 선택이 없다. 요금제 단계는 보류된 직접 가입 흐름의 생성자용 코드로 남아 있다.
- 운영 internal Workspace 29개 중 기존 계약 28개는 그대로 유지한다. OptimizerAI 한 곳만 운영자가 승인한 무제한(`scale`) 상태로 전환했다. 전환 후 29개 모두 슬롯·크레딧 한도가 없음을 운영 DB에서 확인했다. 별도 결제나 Stripe 구독은 생성하지 않았다.
- 아래의 공개 가입·결제 설명은 재개 시 사용할 기능 계약이다. 현재 공개 접근 범위는 이 절을 우선한다.


> **2026-10-08 Free 변경 · 로컬 구현:** Role 생성·시작·재개는 무제한이다. 모든 Role이 공용 월 10크레딧을 함께 사용하며 유료 Slot 추가 후에도 별도로 유지된다. 아래 14절이 종전의 Free 1 Role/5크레딧·용량 초과 중지 규칙을 대체한다. 운영 DB 반영·배포는 하지 않았다.


> **2026-10-08 여러 슬롯 구매:** 수량 선택과 슬롯별 취소·갱신의 로컬 구현 및 Stripe Test 검증은 13절을 따른다. 운영 DB 반영과 앱 배포는 아직 진행하지 않았다.

> **2026-10-08 로컬 구현 추가:** 결제 없는 한 달 제공 슬롯과 구독 종료 뒤 기존 후보자 수락의 검증 범위는 12절을 따른다. 해당 migration은 아직 운영에 적용하지 않았다.

문서 기준: 2026-10-07. 앱은 로컬 구현 기준이다. DB의 준비 단계와 사용자 대상 구독 활성화는 별도로 진행하며, 실제 반영 기록은 문서 마지막에서 확인한다.

## 회사 약관과 공개 준비 상태 · 2026-10-07

[회사 약관·개인정보·추천 프로그램 개정안](../legal/2026-10-subscription/README.md)을 국문·영문으로 작성했다. 아직 시행하지 않은 검토본이며 결제 화면의 약관 동의 연결도 이번 문서 작업에 포함하지 않았다. 공개 버전·기존 동의 기록은 그대로 유지한다.

사용자가 확정한 상업 조건은 **Free·표준 Slot 성공보수 없음, 고객이 요청한 Enterprise만 별도 비용 모델 계약 가능**, **월간·연간 모두 중도 취소의 일할·월할 환불 없이 결제 기간 끝까지 이용**이다. 법정 환불 권리, 중복·오류 결제와 Harper 귀책은 별도로 처리한다. 기존에 체결한 개별 계약을 소급 변경하지 않는다.

공개 전에 미국 계약 사업자의 정확한 법인명·주소, Stripe 개인정보 처리와 국외 이전 세부사항, 시행일을 확정해야 한다. 기존 무료 고객의 최초 유료 전환 14일 전 안내와 명시적 구매 동의는 별도 운영 절차가 필요하다. 한국 원화 가격·초기 할인·추가 크레딧 판매는 참고 계획에 있으나 현재 Stripe 상품과 앱에서 제공된다고 설명하지 않는다. 상세한 차이와 필요한 연결 작업은 위 문서에 기록했다.

한국 카드 지원은 계정 상태와 구분해서 안내한다. [Stripe Atlas 공식 안내](https://docs.stripe.com/atlas/signup)는 EIN 발급 전에 미국 카드 결제를 지원하고, 미국 카드 이외의 추가 결제 수단은 EIN 발급 이후 가능하다고 설명한다. EIN 대기 중인 계정에 한국 카드 결제가 된다고 보장하지 않는다. 이 문서 작업에서 EIN 상태나 한국 카드 실결제를 새로 확인하지 않았다.

## 1. 이번 구현 범위

- `/pricing`: Free / Slot / Enterprise 세 상품. Enterprise는 Contact로 상담한다. Slot의 금액·통화는 서버가 Stripe Price에서 읽는다. 임의의 판매 가격을 코드에 넣지 않는다.
- Organization 왼쪽 메뉴에 **Slots** (`/org/slots`)와 Owner 전용 **Billing** (`/org/billing`)을 각각 제공한다. 화면 내부 탭은 없다. 결제·사용 내역은 해당 페이지를 열 때만 조회한다. 이전 `/org/billing`의 `slots`·`credits`·`subscription` 링크와 슬롯 구매·결제 복귀 링크는 Slots로 이동한다.
- Slots 페이지: 최대 3열 카드에 Slot별 담당 Role·남은 크레딧·월 갱신일·결제 주기·종료일을 모으고, ellipsis에서 취소·취소 철회·담당 Role 변경을 제공한다. 상단에는 특정 Role에 귀속되지 않는 공용 크레딧을 별도로 표시하고, 유료·제공 Slot만 배정 카드로 표시한다. 마지막 점선 추가 카드에서 월/연 구독 결제로 이어진다. 유효한 빈 Slot에는 채용 중인 Role을 자동 배정하며, 공용 크레딧은 그대로 남는다. 아래 크레딧 사용 내역은 표와 `useQuery` 페이지 조회로 20개씩 표시한다.
- Billing 페이지: 위에는 현재 플랜·다음 결제와 결제 관리, 아래에는 플랜·금액·날짜·상태·원문 청구서/영수증·PDF 다운로드 표를 제공한다. 결제 내역도 20개씩 이전·다음 페이지로 조회한다. 모바일 표는 표 안에서 가로 스크롤한다. 기존 구독의 금액은 현재 판매 가격이 아니라 해당 Slot의 Stripe Price에서 읽는다.
- Role 화면의 데스크톱 왼쪽 메뉴 하단에는 **현재 Role의 슬롯 잔액이 0~10개일 때만** Slot 이름과 잔액을 표시한다. 11개 이상·무제한·불러오기 실패·Role 미선택에서는 숨긴다. 문의 문구를 붙이지 않는다. Intro/수락 완료 후 조용히 재조회하며 차감 toast는 없다.
- Owner/Admin이 슬롯 구매·취소·배정을 관리한다. 모든 팀원이 슬롯·크레딧 사용 내역을 조회할 수 있으며 Viewer는 변경할 수 없다. Billing 메뉴·페이지, 결제 내역·서류 조회와 결제 수단 관리는 Owner만 가능하고 서버에서도 제한한다. 후보자 요청에는 기존 후보자 관리 권한을 적용한다.
- Stripe Hosted Checkout에서 월간 또는 연간 카드 구독을 선택한다. 결제 통화는 USD로 고정한다. **구매 한 번 = Stripe Subscription 하나, quantity = 선택한 슬롯 수(1~100)**. 한 번에 산 슬롯들은 결제일이 같고, 다른 날 추가 구매한 슬롯들은 별도 Subscription으로 각자의 갱신일을 유지한다. 내부 Slot·Role 배정·50크레딧은 각각 독립적이다.
- Free·표준 Slot 모두 Role 수는 무제한이다. 공용 월 10개와 각 Slot 월 50개는 독립적으로 유지한다. 첫 구매 때 사용한 공용 크레딧은 복구하지 않고, Slot 50개는 별도로 제공한다.
- Intro 요청과 연결 대기 수락은 각각 1개를 사용한다. 회사가 먼저 요청한 Intro의 후속 자동 연결은 추가 차감하지 않는다. 조회·거절·작성·Role 중지에는 차감이 없다.
- 유료 크레딧은 슬롯에 귀속된다. 배정 Role의 슬롯 잔액을 먼저 사용하고 부족하면 공용 크레딧을 쓴다. 다른 유료 슬롯의 잔액은 사용할 수 없다. 교환·중지·재시작으로 크레딧을 이동하거나 다시 지급하지 않는다. 월 기간 말에 남은 수는 소멸한다. 새 요청에는 채용 중인 Role이 필요하다. 슬롯 없는 Role은 공용 크레딧으로 Intro를 요청할 수 있지만 연결 대기 수락에는 해당 Role의 유료 Slot이 필요하다.
- Role 초안 등록·채용 시작·재개 모두 수량 제한이 없다. 크레딧 소진도 Role 생성·활성화를 막지 않는다. 기존 Role 등록 대화의 채용 시작 확인·담당자 동의는 유지한다.
- 유료 Slot에 배정되지 않은 Role의 연결 대기는 회사 화면에서 잠금으로 표시하고 수락을 서버에서도 차단한다. `role_matching_slot_type_v1`은 유료 Workspace 안의 미배정 Role도 Free로 분류한다. 이 함수를 사용하는 기존 매칭 경로를 재사용하며, Worker 배포나 운영 함수 반영 여부는 별도로 확인한다.
- `/company`는 후속 직접 가입 요청에 따라 신청 폼 대신 회사 계정 가입으로 연결한다. 절차와 적용 준비는 9절에 정리했다. 새 `/org` 구독은 기존 `payments`, `payment_attempts`, `plans`, `billing_sessions`를 읽거나 쓰지 않는다. 레거시 테이블 정리는 별도 범위다.
- 크레딧 차감 성공 toast·LLM 설명·prompt 지시를 추가하지 않는다. 차감량·잔액·이력은 company-side LLM context 및 정상 도구 결과에 넣지 않는다. 잔액 부족은 웹 채팅의 답변 아래, Slack의 같은 답변 내 별도 블록, 작업 모달 안에 명확한 문구로 표시한다. 채팅과 Slack에는 Harper 문의 링크도 제공한다. LLM은 실행이 차단됐으며 같은 요청의 반복으로 해결되지 않는다는 일반 실패 사실만 받는다. 별도 표시 정보는 이후 대화·요약·도구 조회에도 전달하지 않는다.
- Intro 모달의 오류는 보드·Pipeline·후보자 상세에서 모달 안에 한 번만 표시한다. 연결 수락/종료 모달도 동일하게 처리한다. 한국어·영어 UI 설정을 따르고 실패 시 작성 내용은 유지한다. 모달 없는 작업의 오류 toast는 유지한다.
- 서비스 core와 FAQ 원본은 Free·Slot 구독·Enterprise의 차이를 설명하며 과거 수수료 전용 예시보다 현재 정책을 우선한다. 기존 회사의 개별 계약·구독 상태는 공개 가격만으로 추측하지 않는다. [이번 오류 표시 및 모델 검증](../evaluation/company-side-conversational-qa/reports/2026-10-07-billing-notices.md)은 로컬 코드·합성 실행 기준이며 운영 FAQ DB 갱신이나 Slack 실제 발송 검증을 포함하지 않는다.

## 2. Stripe에서 준비할 것

### 계정과 사업자

Stripe 계정의 결제 수취 가능 여부와 사업자/대표 확인, 고객지원 정보를 확인한다. 이번 계정은 Payments가 Active다. 사용자 요청에 따라 은행 계좌가 준비될 때까지 정산 계좌를 등록하지 않고 Payouts 중지를 유지한다. 한국어 UI나 KRW 가격을 쓰는 것과 Stripe 계정 개설 가능 국가는 별개다. 사업자 소재지의 지원 여부는 [Stripe 지원 국가](https://stripe.com/global)에서 확인한다.

먼저 Sandbox/Test 환경에서 준비하고 테스트한다. Live 전환 때는 키·Price·Portal·Webhook을 **모두 Live 환경 것으로** 교체한다. 서로 다른 Stripe 계정이나 Test/Live 객체를 섞지 않는다. 키는 채팅이나 Git에 올리지 않는다.

### 확정한 판매 가격과 Price

2026-10-07 사용자 결정: **월 결제 USD 249, 연 결제 USD 2,388 선결제(월 환산 USD 199)**. 월·연 결제 모두 Slot 하나당 배정한 Role의 유료 기능과 매월 50 credits를 제공한다. 연 결제도 600개를 한 번에 지급하지 않으며, 사용하지 않은 월 제공량은 이월하지 않는다.

월/연 선택, 각 Price 검증, 연간 이용권과 월별 크레딧 분리, 기간 말 취소를 구현했다. 연간 결제 완료 Invoice 하나가 월별 크레딧 기간 12개를 확정한다. 현재 시각이 속한 기간만 사용할 수 있어 600개가 한 번에 잔액에 더해지지 않는다. 별도 테이블이나 매월 가상 청구서는 만들지 않는다. 월말은 최초 기준일을 유지하고 해당 월에 없는 날만 말일로 조정한다.

Stripe Dashboard의 Product catalog에서 아래 상품을 만든다.

| 설정 | 값 |
| --- | --- |
| 상품 이름 | Harper Slot |
| 가격 형태 | Recurring. 월간은 매월, 연간은 매년, 각각 interval count 1 |
| 가격 모델 | 고정 단가 / per unit / licensed |
| 통화 | USD |
| 금액 | 월간 249.00 / 연간 2,388.00 |
| Lookup key | `harper_agent_usd_monthly_v1` / `harper_agent_usd_annual_v1` |
| 수량 | 앱이 항상 1로 보냄. 조절 가능 옵션을 넣지 않음 |
| 세금 | 세금 포함/별도 여부를 명확히 결정 |

월간 **`price_...` ID**는 `STRIPE_SLOT_PRICE_ID`, 연간 ID는 `STRIPE_SLOT_ANNUAL_PRICE_ID`에 넣는다. `prod_...` ID가 아니다. 사용량 과금, tiered 가격, 무료 trial, coupon 입력, 기존 구매에 슬롯 추가, 별도 credit pack은 제공하지 않는다. 추가 구독할 때 선택한 월/연 Price로 새 Subscription을 만든다. 추가 구매는 새 Subscription으로 처리한다. 기존 Subscription 수량은 슬롯별 다음 갱신 취소·철회에 한해 변경한다.

시각 검증 fixture의 예시 금액은 판매 가격이 아니다. 가격을 바꿀 때는 새 Price를 만들고 이 설정을 바꾼다. 기존 Slot은 원래 Subscription/Price와 갱신 기준을 유지한다.

### Customer Portal

Billing → Customer Portal에서 다음과 같이 설정하고 해당 **`bpc_...` configuration ID**를 확보한다.

| 기능 | 설정 |
| --- | --- |
| Payment method update | 켜기 |
| Invoice history | 켜기 |
| Subscription update / plan / quantity 변경 | 끄기 |
| Subscription cancellation | 끄기 — 취소는 Harper의 Slot 행에서 제공 |
| 상호, 로고, 고객지원/개인정보/약관 URL | 실제 운영 정보 |

Portal은 결제 수단과 청구서 확인을 담당하고, 개별 Slot 취소는 Harper 화면에서 Role 영향을 확인한 뒤 처리한다. 서버는 Portal 설정이 잘못되어 외부에서 상품/수량/취소를 바꿀 수 있으면 Portal 생성을 거부한다. [Portal 설정 설명](https://docs.stripe.com/customer-management/configure-portal)

Configuration ID를 찾기 어렵다면 로그인한 Stripe CLI에서 `stripe billing_portal configurations list --limit 10`으로 확인할 수 있다. Test와 Live 설정은 각각 필요하다.

### Webhook

Workbench/Webhooks에서 **snapshot event** 목적지를 만든다.

- URL: `https://<실제 Harper 도메인>/api/billing/webhook`
- API version: Dashboard에서는 **`2026-08-26.dahlia`**를 선택한다. 코드가 허용하는 snapshot 버전은 Dahlia와 `2026-09-30.endive`다. 이벤트에서는 Subscription/Invoice ID 등 동기화에 필요한 식별자만 사용하며, 실제 이용권 검증은 `stripe@23.0.0`의 Endive 버전으로 다시 조회한 응답을 사용한다. 계정 전체 API 버전은 변경하지 않는다.
- Connected accounts가 아닌 이 사업자의 계정 이벤트를 수신한다.
- Signing secret `whsec_...`를 `STRIPE_WEBHOOK_SECRET`에 넣는다.

수신할 이벤트:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.finalization_failed
```

서명은 원문 request body로 확인한다. redirect URL이나 브라우저가 보내는 결제 성공 값만으로 크레딧을 지급하지 않는다. 이벤트는 동기화 계기이며 서버가 Stripe의 최신 Subscription/Invoice를 다시 조회한다. 실제 지급은 결제 완료된 최초/정기 갱신 Invoice의 기간에만 이루어진다. 수동 standalone invoice, proration, 다른 고객·다른 상품, 미결제 내역은 지급 근거로 인정하지 않는다. 중복·역순 전달은 period unique key와 Slot revision으로 처리한다. [Stripe Webhook](https://docs.stripe.com/webhooks), [구독 이벤트](https://docs.stripe.com/billing/subscriptions/webhooks)

### 환경 변수

| 이름 | 용도 / 저장 위치 |
| --- | --- |
| `STRIPE_SECRET_KEY` | 서버 전용 Stripe 키. Test `sk_test_...`/`rk_test_...`, Live `sk_live_...`/`rk_live_...` |
| `STRIPE_SLOT_PRICE_ID` | 동일 환경의 월 Price `price_...` |
| `STRIPE_SLOT_ANNUAL_PRICE_ID` | 동일 환경의 연간 Price `price_...`. 월간과 같은 상품·통화여야 함 |
| `STRIPE_WEBHOOK_SECRET` | 동일 환경 목적지의 서명 secret `whsec_...` |
| `STRIPE_PORTAL_CONFIGURATION_ID` | 위 Portal 설정 `bpc_...` |
| `NEXT_PUBLIC_SITE_URL` | canonical 앱 origin. 예: `https://matchharper.com`. 실제 운영 도메인에 맞춤 |
| `CRON_SECRET` | Vercel Cron 인증용 서버 secret. 기존 설정 재사용 가능 |
| `STRIPE_AUTOMATIC_TAX` | 선택. Stripe Tax 설정을 마친 경우 `true`, 기본은 꺼짐 |
| 기존 Supabase 서버 설정 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

로컬은 `.env.local`, 배포 환경은 해당 프로젝트의 서버 환경 변수에 설정한다. Stripe 설정에는 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. Hosted Checkout으로 이동하므로 Stripe publishable key나 브라우저용 Stripe SDK는 필요하지 않다. 환경 변수 변경 후 해당 앱 프로세스를 다시 시작해야 한다.

Stripe Tax는 Stripe 내 등록·설정이 완료된 뒤 켠다. 앱에서 해당 flag를 켠 것만으로 필요한 세무 설정이 완료되는 것은 아니다. Checkout이 주소와 세금 ID를 수집하며 최종 금액을 보여준다. [Checkout과 세금 설정](https://docs.stripe.com/tax/checkout)

### 청구 실패와 이메일

Stripe에서 성공 영수증과 카드 결제 실패/인증 요청 이메일을 설정한다. Subscription에는 실제 고객 이메일이 설정된다. 카드 실패 뒤 재시도 정책도 운영자가 정한다. 결제되지 않은 새 월에는 50개를 지급하지 않는다. 이전에 결제한 기간은 그 종료까지 유지한다. 미결제 월을 무제한 grace period로 연장하지 않는다. 결제가 뒤늦게 성공하면 그 Invoice의 남은 기간에 이용권이 복구되지만 자동으로 중지했던 Role을 임의로 다시 시작하지 않는다.

## 3. 준비된 로컬 Test 환경

운영 Supabase와 완전히 분리된 기존 Colima/Supabase 로컬 환경을 사용한다. 결제용 앱은 다른 개발 앱과 충돌하지 않도록 **http://localhost:3100**에서 실행한다. 추천·매칭·메일 Worker는 실행하지 않는다.

- Stripe Test 상품·월/연 Price·Portal은 생성 완료했다. 자격 증명은 Git에서 제외된 `.local/billing-test/private/stripe.env`에만 저장한다. Live `.env.local`을 Test 값으로 덮어쓰지 않는다.
- 로컬 DB에 billing migration 두 개와 현재 `/org` shell에 필요한 선행 schema를 적용했다. 전용 합성 계정과 `Harper Billing Test` Organization을 준비했다. 운영 회사·후보자 데이터는 복사하지 않았다.
- `node scripts/workspaceBillingTest.mjs`는 로컬 DB 마커를 검사하고 Test 키만 허용한다. 실제 Live 키나 운영 DB로 대체하지 않는다. 테스트 앱과 Stripe listener만 함께 실행한다.
- 실행한 터미널을 유지한다. 종료할 때 Ctrl+C로 앱·listener를 함께 종료한다. DB는 남는다. 컴퓨터 재시작 후에는 기존 로컬 Supabase 환경부터 켜야 한다.
- 로그인 URL은 `.local/billing-test/private/login-url.txt`에 저장된다. `node scripts/workspaceBillingTest.mjs login`으로 로컬 테스트 계정의 로그인 URL만 다시 만들 수 있다. 이 파일과 `runtime.env`, 로그는 비공개 파일이며 공유·커밋하지 않는다.
- 이미 Chrome에서 테스트 계정으로 로그인해 두었다. `/org/billing`에서 `Slot 추가` → 월간/연간 → 결제 화면으로 이동한다. `/pricing`에서도 시작할 수 있다.
- 성공 카드: **4242 4242 4242 4242**, 만료 **12/34**, CVC **123**. 실제 카드와 실제 금액은 사용하지 않는다. 실패 확인용은 **4000 0000 0000 9995**, 추가 인증 확인용은 **4000 0025 0000 3155**다. [Stripe 테스트 카드](https://docs.stripe.com/testing)
- Stripe CLI의 로컬 서명 키는 launcher가 자동으로 받는다. 운영 Dashboard webhook의 서명 키를 로컬 listener에 사용하지 않는다.

반복 확인할 항목:

1. 월간 $249 / 연간 $2,388, 연간은 월 환산 $199와 선결제 안내가 함께 보인다.
2. 첫 결제 후 Slot 1개·그 슬롯에 50개, 두 번째 결제 후 각 슬롯에 별도로 50개씩이다. 각 Slot의 결제일과 월 크레딧 만료일을 따로 확인한다.
3. 실패한 결제로 Slot이나 잔액이 늘지 않는다. 새로고침·동일 webhook 재전송으로 이미 사용한 크레딧을 다시 지급하지 않는다.
4. 취소는 유료 기간 말에 적용한다. 연간 취소 시 당장 역할이나 잔액이 사라지지 않고 결제한 1년 종료일까지 이용한다. 취소 철회는 기존 기준일을 유지한다.
5. 결제 수단 관리에서 카드와 청구서를 확인할 수 있고, 구독 취소·상품 변경은 Harper 화면에서 관리한다.
6. Role/후보자 테스트를 추가할 때는 비운영 DB만 사용하고 Role 삽입 전에 `information.testOnly=true`와 안정적인 `testFixture`를 지정한다.

### 실제 Test Clock 왕복 테스트

위 로컬 앱과 listener가 실행 중일 때 다른 터미널에서 실행한다.

```sh
node scripts/testWorkspaceBillingClock.mjs
```

runner는 Test 키·localhost·로컬 DB 마커를 검사하고 매번 전용 Stripe Customer/Test Clock과 합성 workspace를 만든다. 테스트 workspace는 일반 팀원 메뉴에 추가하지 않는다. 월간 구독은 서로 다른 날에 두 개, 연간 구독은 윤년의 1월 31일 기준으로 생성한다. Stripe 시간을 옮겨 최초 결제, 자동 갱신, 실패, 복구, 취소를 진행하고 **실제 서명된 웹훅 → 로컬 앱 → DB**에 기록된 Invoice와 월 기간을 확인한다. Stripe의 자동 청구서 확정까지 기다리기 위해 해당 갱신 경계에서 2시간을 추가 진행한다. [Stripe Test Clock API](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage)

Stripe Test Clock은 Stripe의 시간만 이동시킨다. DB의 현재 시각은 함께 이동하지 않는다. 따라서 `scripts/localE2e/billingClock.py`는 로컬 DB의 한 transaction 안에서만 실제 billing 함수의 시계를 해당 시각으로 바꾸어 잔액·기간 만료·차감·용량을 검사하고 **함수 변경과 테스트 차감을 항상 rollback**한다. 앱이나 운영 DB에 테스트용 시계 분기를 넣지 않는다. 마지막 1개에 대한 동시 요청은 실제 현재 시각과 서로 다른 두 PostgreSQL 연결로 별도 검증한다.

결과는 `.local/billing-test/private/clock-<실행시각>.json`에 저장한다. Stripe Test 객체와 합성 workspace/결제 기간은 검증 근거로 남기며 실제 운영 데이터나 후보자 연락은 사용하지 않는다. 테스트용 Role은 삽입부터 `testOnly`·`testFixture`를 표시하고 종료 시 rollback/정리한다. 운영 DB와 Live 키에는 이 runner를 사용할 수 없다.

## 4. DB와 배포 순서

신규 테이블은 **3개**다.

| 테이블 | 보존하는 사실 |
| --- | --- |
| `company_workspace_slots` | Subscription ID, 상태, 기간 종료/취소 시각, 현재 담당 Role, 동시 변경 revision |
| `company_workspace_credit_periods` | Free 또는 Slot의 한 월 기간, Stripe 지급 근거 Invoice, 확정 시각, 제공량/잔량 |
| `company_workspace_credit_events` | 한번 승인한 Intro/Connect, 사용한 기간, -1/0 차감, 업무 중복 방지 key. Connect 재시도에 필요한 승인 입력과 실행 lease도 같은 행에 보존 |

금액·영수증 원장은 Stripe다. Harper에 Invoice 원장을 복제하지 않는다. 결제 내역은 권한 확인 후 Stripe Customer의 Invoice를 직접 페이지 조회하고 원문 청구서로 연결한다. 환불 상세는 Stripe의 원문 청구서/Portal에서 확인한다. 금전 환불은 자동 크레딧 지급이나 계약 연장으로 해석하지 않는다.

Migration: `supabase/migrations/20261007052736_workspace_agent_subscriptions.sql`, `supabase/migrations/20261007061858_workspace_billing_annual_credits.sql`. 후자는 기존 3개 테이블을 유지하면서 Slot 결제 주기와 Invoice별 월 기간 중복 방지 키를 추가한다.

운영 반영은 별도 배포 승인 후 다음 순서로 진행한다.

1. 검토된 migration을 적용하기 전에 실제 schema와 기존 Intro 함수 signature를 확인한다. migration 기록만으로 적용 여부를 추측하지 않는다. 기존 Intro 함수의 본문은 복사하지 않고 rename/wrapper로 보존한다.
2. 동일 schema의 비운영 DB에서 테스트를 통과시킨다. 연결 수락의 원자 commit은 기존 `talent_progress`, 추천·태그 테이블을 사용한다.
3. 운영 migration은 명시적으로 승인받아 적용한다. RLS와 service-role-only RPC 권한, 일반 사용자의 billing 필드 변경 차단을 확인한다.
4. 환경 변수를 설정하고 앱을 배포한다. 코드만 먼저 배포하면 새로운 RPC가 없어 `/org`가 동작하지 않으므로 순서가 중요하다.
5. Stripe webhook의 실접속/서명과 Cron 동작을 확인한다. 일반 릴리스는 `origin/main` Git 배포 경로를 사용하며 이 작업에서 실행하지 않았다.
6. 기존 workspace의 계약을 명시적으로 분류하고 전환한다. **기존 workspace는 자동 Free 강등하지 않고 `legacy` 상태로 기존 권한을 유지한다.** Legacy의 새 구매는 진행 중 Role이 1개 이하일 때만 가능하다.

DB를 앱보다 먼저 반영할 수 있도록 이 migration은 `billing_started_at`과 `billing_free_anchor_at`의 기본값을 NULL로 둔다. 따라서 **이전 앱에서 새로 생성되는 workspace도 `legacy`이며, DB 반영만으로 용량 제한·크레딧 차감이 켜지지 않는다.** 기존 Intro 함수 본문과 호출 인자·서비스 권한을 보존하고, 미전환 workspace는 원래 함수로 바로 전달한다.

구독 기능을 갖춘 앱이 실제 배포되고 Stripe 검증을 마친 뒤, 신규 workspace를 Free로 시작할 운영 전환이 별도로 승인되면 다음 기본값 변경을 별도 migration으로 적용한다. 지금의 DB 준비 단계에서는 실행하지 않는다. 기존 행은 이 기본값 변경으로 전환되지 않는다.

```sql
alter table public.company_workspace alter column billing_started_at set default now();
alter table public.company_workspace alter column billing_free_anchor_at set default now();
```

이는 `/org`뿐 아니라 같은 테이블을 쓰는 생성 경로에 공통으로 적용된다. 전환할 때에는 신규 workspace의 회사 측 사용 경로까지 함께 확인한다. 특정 workspace만 먼저 전환할 때는 아래 명시적 enrollment 명령을 사용한다.

기존 계약 분류에는 아래 명령을 사용한다. 기본은 읽기 전용 preview다.

```sh
pnpm exec tsx scripts/enrollWorkspaceBilling.ts --workspace=<workspace-id> --model=scale
pnpm exec tsx scripts/enrollWorkspaceBilling.ts --workspace=<workspace-id> --model=free --keep-role=<role-id>
```

확정된 workspace에만 `--apply`를 붙인다. Free 전환 시 Role이 여럿이면 유지할 Role을 명시해야 한다. 나머지는 데이터가 남는 paused가 된다. 살아 있는 Stripe 구독이 있으면 Free/Scale 강제 전환을 거부한다. 먼저 실제 반복 청구와 계약을 정리해야 한다. 이 명령은 이번 작업에서 운영에 실행하지 않았다.

`/api/internal/org/billing/reconcile`은 5분마다 만료된 배정을 정리하고 Stripe 누락 동기화와 미완료 연결 요청을 복구한다. 사용자 조회와 채용 시작도 유효 기간을 재검사한다. 외부 API 장애와 무관하게 로컬에서 확인된 만료 경계를 먼저 반영한다. 많은 workspace에서 Cron batch가 밀리는지 모니터링한다.

## 5. 재시도와 운영 예외

- Intro: 기존 요청 승인/전달 등록 transaction 안에서 차감한다. 잔액 부족이면 기존 변경도 rollback된다.
- Connect: 권한과 요청 유효성을 확인한 뒤 승인 입력과 차감을 한 번 기록한다. 발송은 기존 deterministic email identity와 Resend idempotency key를 재사용한다. 추천 단계·태그·진행 이력은 같은 DB transaction에서 commit한다.
- 중간 장애가 나면 같은 승인 입력으로만 재시도한다. 갱신된 담당자나 새 LLM 판단으로 수신자를 다시 바꾸지 않는다. 같은 승인에 서로 다른 실행자가 동시에 발송하지 못하도록 lease를 건다.
- 자동 복구는 최대 5회, 승인 후 23시간 이내다. 그 이후이거나 원래 승인한 팀원의 권한/후보자 접근 상태가 바뀐 경우 Ops 확인이 필요하다. Cron은 미해결 건을 503으로 보고해 모니터링에 드러낸다. 실제 발송 여부가 불명확한 메일을 idempotency 보존 기간 밖에서 다시 보내지 않는다.
- 차감 후 복구 중인 요청은 사용 기록에 남는다. 자동 환불·수동 보정 UI는 제공하지 않는다. 기술 실패의 보정은 발송 여부 확인 후 별도 운영 조치가 필요하다. 확실하지 않은 발송을 환불한 뒤 새 요청으로 재전송하는 흐름을 자동으로 만들지 않는다.
- 취소는 기간 말 적용이 기본이다. 담당 Role을 중지하면 담당 Role 배정만 해제되고 Slot 구독은 유지한다. 다른 빈 Slot이 있으면 만료 Role을 자동 이동한다. 마지막 유료 Slot이 끝나면 Free의 Role 1개를 유지한다.
- 여러 Slot이 정확히 같은 시각에 마지막으로 끝나는 경우 유효한 기존 배정을 우선하고 Role 생성일/ID 순으로 하나를 유지한다. **이번 버전은 별도의 미래 종료 Role 예약/동시 종료 선택 테이블을 두지 않는다.** 중요한 Role은 종료 전에 직접 중지/재개·배정 변경으로 현재 운영 대상을 정리한다.
- Stripe Dashboard에서 수량·다중 상품·주기를 임의 변경하는 것은 지원하지 않는다. 앱 동기화는 이런 구독을 정상 Slot로 추측하지 않고 오류로 드러낸다.

## 6. 이번 로컬 검증과 남은 확인

- 격리 PostgreSQL(PGlite)에서 실제 migration을 실행해 Free/유료 용량, draft 보존, Free→유료 50개, 기간 만료 순서, 중복 차감 방지, Intro rollback, Connect 승인 lease·원자 commit, Role 교환·취소, 월말 anchor, Scale, 일반 사용자 접근 차단을 검증했다.
- Stripe 기간 추출·다른 Customer/Price 차단·미결제/수동 Invoice/proration 배제, webhook 변조/서명 만료, KRW/USD 표기, LLM 오류 정보 경계를 단위 테스트했다.
- 실제 로컬 앱·Supabase·Stripe Test Checkout을 연결해 연간 $2,388 결제, 월간 $249 추가 결제, 잔액 부족 테스트 카드의 거절 후 정상 카드 재시도, 연간 취소 예약과 철회, Customer Portal 왕복을 Chrome에서 확인했다. 결제·구독 웹훅 8건이 모두 200으로 반영됐다. 연간 Invoice 1개가 월 기간 12개를 만들고, 월간 추가 후 각 Slot에 50개가 기록됨을 대조했다. 당시 UI의 공용 100개 표시는 아래 슬롯 귀속 수정으로 대체했다.
- 실제 Stripe Test Clock 시나리오 **15개 + 두 DB 연결의 동시 차감 1개, 총 16개를 통과**했다. 해당 시나리오의 구독·결제 웹훅 **19건 모두 HTTP 200**, 결제 완료 Invoice **6건(월 $249 네 건, 연 $2,388 두 건)**을 확인했다. 결과는 `.local/billing-test/private/clock-1791356949.json`에 보존했다.
- 월간: 첫 50개 소진과 다음 요청 차단, 10일 뒤 두 번째 Slot의 독립 갱신, 자동 재청구 후 50개 갱신, 미사용분 이월 없음, 한 Slot의 기간 말 취소와 다른 Slot 유지, 갱신 결제 실패 시 유료 지급 없음, 실패 Invoice를 정상 결제한 뒤 정확히 50개 복구를 검증했다.
- 연간: $2,388 최초 결제 시 현재 월 50개만 사용 가능, 1/31→윤년 2/29→3/31 갱신, 미사용분 이월 없음, 1년 후 자동 $2,388 재청구와 새 월 기간 12개 생성, 취소 예약 후에도 이미 결제한 월별 50개 유지, 연간 종료 후 추가 청구 없이 Free 5개 전환을 검증했다.
- 경쟁 실행: 남은 1개에 서로 다른 두 요청을 실제 DB 연결 두 개로 동시에 실행했다. 한 요청만 차감되고 다른 요청은 차단됐으며 차감 이벤트는 정확히 하나였다. 시험에 쓴 Role·이벤트는 삭제하고 잔액을 복원했다.
- 데스크톱·390px 모바일에서 새 구독/크레딧/결제 내역, 구매 주기 선택, 취소 예약과 철회, 원문 청구서·PDF 링크를 확인했다. 당시 사이드바의 공용 잔액·문의 안내는 아래 슬롯 귀속 수정 이전 결과다. 화면 검증용 잔액은 각 Slot의 원래 값으로 복원했다.
- 관련 단위 테스트 **20개**와 격리 DB 계약 테스트를 통과했다. 인증 없는 billing API는 401, 설정 없는 webhook은 503, 설정 없는 catalog는 구매 불가 상태를 반환함을 로컬 서버에서 확인했다. 신규 billing 코드 ESLint는 통과했고 해당 파일의 TypeScript 오류는 없었다. 전체 repo typecheck는 기존 평가 산출물, 다른 로컬 개발 출력, `OfficialJobsExperience.tsx`, `TalentDetailSimpleView.tsx` 등의 오류로 통과하지 못했다.
- **앱 배포·Live 결제·신규 workspace 자동 Free 전환은 하지 않았다.** 실제 카드 3DS, 운영 webhook/Cron, Stripe 자동 재시도 정책 전체는 검증 범위 밖이다. 실패 복구 테스트는 카드 교체 후 같은 Invoice를 명시적으로 결제한 결과이며, 모든 자동 재시도 일정을 검증했다는 뜻이 아니다.

재현:

```sh
pnpm exec tsx --test src/lib/org/billing/stripe.test.ts src/lib/org/billing/presentation.test.ts src/lib/org/agent/draftRoleActivationContract.test.ts src/lib/org/roleStatus.test.ts
PGLITE_MODULE_PATH=<격리 설치한 @electric-sql/pglite 경로> node scripts/testWorkspaceBilling.mjs
node scripts/workspaceBillingTest.mjs
# 위 앱과 listener를 켜 둔 상태에서 별도 터미널:
node scripts/testWorkspaceBillingClock.mjs
```

PGlite는 SQL 기능/원자성 확인용이다. 위 실제 Stripe/PostgreSQL 테스트와 구분한다. 이 결제 검증에서 후보자·회사 메일을 보내지는 않는다.

화면 구성에는 [Linear의 결제 관리](https://linear.app/docs/billing-and-plans), [Claude의 사용 크레딧 관리](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans), [Notion의 크레딧 대시보드](https://www.notion.com/help/track-usage-in-the-notion-credits-dashboard), [Juicebox 가격 화면](https://juicebox.ai/pricing)을 참고했다. Harper의 기존 흰색 Organization 화면과 공유 UI 구성 요소를 유지하면서 구독 관리, 크레딧 확인, 청구서 조회의 목적을 세 탭으로 나눴다.

## 7. 운영 DB 반영 기록 — 2026-10-07

- 사용자 승인 범위에 따라 Harper 운영 프로젝트 `zzojrniuppueizhnmqfd`에 migration `20261007052736_workspace_agent_subscriptions`를 적용했다. 로컬 파일명도 실제 적용된 migration version과 맞췄다.
- 신규 테이블 3개와 workspace 칼럼·구독 함수·guard만 준비했다. 기존 행의 요금제 전환, 카드 등록, 실제 결제, 새 앱 배포, Worker 재시작은 하지 않았다.
- 신규 생성 기본값도 비활성으로 유지했다. 기존 앱에서 만든 workspace는 계속 `legacy`이며 새 제한과 차감이 자동 적용되지 않는다. 신규 Free 자동 적용은 4절의 별도 운영 전환이 필요하다.
- 반영 직후 전체 workspace 26,252개 중 `billing_started_at` 설정은 0개, Stripe 고객 연결·결제 세션은 0개였다. 새 Slot·크레딧 기간·사용 기록도 모두 0행이었다.
- 진행 중인 내부 Role 37개의 ID·상태 fingerprint가 적용 전후 동일했다. 실제 기존 Role·후보자에 테스트 변경이나 연락은 실행하지 않았다.
- 기존 Intro 함수의 원본 본문과 OID를 보존했고 기존 public 이름·인자·service-role 호출 권한을 확인했다. 기존 함수는 내부 호출 전용으로 보존하며 새 wrapper가 미전환 workspace를 바로 위임한다.
- 운영 API 도메인 `auth.matchharper.com`이 위 Supabase 프로젝트로 연결됨을 확인했다. 기존 workspace REST 조회는 200, null 필수 인자로 호출한 Intro는 기존 `company_intro_missing_input` / `22023` 응답을 반환했다. 후자는 발송 없이 입력 검증만 확인했다.
- RLS를 켠 신규 3개 테이블은 anon/authenticated 직접 조회를 허용하지 않고 서버만 접근한다. 전후 Security Advisor 비교에서 신규 WARN/ERROR는 없었다. 서버 전용 테이블에 사용자 정책을 두지 않은 것에 대한 [RLS Enabled No Policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 3건은 의도한 접근 차단과 일치한다.
- 운영 앱은 `bceafc57657bb2c7bb1c98793fbf2ab3c84697cf` / `dpl_FAxWU47zstjQ78eJcjrvgfYWvBwZ` 그대로다. 사용자에게 활성화된 제품 동작 변경이 없어 Notion 제품 문서는 수정하지 않았다.

## 8. Stripe 설정과 서버 준비 기록 — 2026-10-07

사용자는 상품·Portal·제한 권한 서버 키 설정을 승인했고, 본인 인증 후 Live 서버 키를 `.env.local`에 저장한 뒤 나머지 설정과 테스트 결제 준비를 요청했다.

| 항목 | Live | Test |
| --- | --- | --- |
| 계정 | Harper Intelligence, Inc. `acct_1UI4sARuvsHFZ4Z5` | 같은 계정의 Test mode |
| Product | `prod_VOb3zkkbd1qoZt` | `prod_VObIKV4EMwLcti` |
| 월 Price | `price_1UNnreRuvsHFZ4Z54yLWmYzi` | `price_1UNo5YRuvsHFZ4Z55EhXPpxS` |
| 연 Price | `price_1UNnreRuvsHFZ4Z5yGkYBGEK` | `price_1UNo5YRuvsHFZ4Z5nwBaxzfW` |
| Portal | `bpc_1UNnrpRuvsHFZ4Z5bpWaBq7H` | `bpc_1UNo5ZRuvsHFZ4Z5aydjazsy` |
| Webhook | `we_1UNo7tRuvsHFZ4Z5Mf7D4NXd`, **Disabled** | 실행 중인 로컬 Stripe CLI listener |

- Live 키는 기존에 승인한 6개 권한을 가진 제한 키다. 월·연 Price, Portal, Invoice Payments 읽기를 실제 호출해 확인했다. 기존 키의 권한·유효성·계정 전체 API 버전은 바꾸지 않았다.
- 운영 webhook은 `https://matchharper.com/api/billing/webhook`, Dahlia snapshot, 자기 계정의 10개 이벤트로 만들고 **배포 전 Disabled**로 두었다. Signing secret을 로컬 `.env.local`에 저장했다. 계좌 정보는 입력하지 않았다.
- `harper-beta` Vercel 프로젝트의 **Production에만** Stripe 설정 5개와 `NEXT_PUBLIC_SITE_URL=https://matchharper.com`을 저장했다. Secret key와 Webhook secret은 sensitive 유형이며 값은 문서에 남기지 않는다. 기존 `CRON_SECRET`을 유지했다. Preview/Development에는 Live 키를 추가하지 않았다.
- 환경 변수 저장만 했으며 배포를 실행하지 않았다. 운영 앱에 적용하려면 사용자의 명시적인 배포 승인 후 정상 Git 배포를 진행해야 한다. 배포된 수신 경로를 확인한 다음 Live webhook을 Enable한다.
- 연간 지원 migration `20261007061858_workspace_billing_annual_credits`도 운영에 적용했다. 전후 Slot·credit period·enrolled workspace는 모두 0개이며, 진행 중 Role의 ID/상태 fingerprint는 동일했다. 신규 자동 Free 기본값도 NULL을 유지했다. 익명 호출은 차단되고 service-role 호출만 허용됨을 확인했다.
- 위 DB 준비 및 Vercel 설정은 기존 조직의 구독 활성화가 아니다. 은행 계좌 등록, Payouts 재개, 실제 유료 결제, Worker 배포·재시작, 앱 배포는 하지 않았다. Notion은 배포된 동작 문서이므로 이번 준비 단계에서 갱신하지 않았다.

## 9. 회사 직접 가입과 온보딩

2026-10-07 후속 요청을 반영한 **로컬 구현**이다. 이 절의 가입 migration은 로컬에서만 검증했으며 운영 DB와 운영 앱에는 적용하지 않았다. 기존의 `/company` 유지 조건은 이 후속 요청으로 대체한다. 매칭·추천 Worker는 변경하지 않는다.

### 사용자 흐름

1. `/company`의 **무료로 시작하기**에서 `/org`로 이동한다. 신청 폼을 제출하거나 Harper의 승인을 기다리지 않는다. Enterprise와 도입 상담 문의 경로는 남긴다.
2. Google 회사 계정 또는 이메일 로그인 링크로 인증한다. 새 Workspace는 인증된 회사 이메일이 필요하다. Gmail·네이버 등 개인 이메일은 새 회사 생성 대신 회사 계정으로 다시 로그인하도록 안내한다. 기존 초대 접근 권한은 이메일 도메인으로 확대하지 않는다.
3. 아직 참여한 회사가 없으면 **Workspace 만들기**를 누른다. 단순 페이지 방문이나 로그인만으로 Workspace를 만들지 않는다.
4. 기존 온보딩 UI에서 **이름·직함 → Slack 연결(선택) → 회사 정보 확인 → 요금제 선택 → 완료**를 진행한다. 신규 회사에는 Role이 없으므로 역할 목록 단계가 없다. 완료 후 회사 화면에서 첫 채용 등록 대화를 시작할 수 있다.
5. Free를 선택하면 카드 없이 월 5크레딧·동시 채용 1개로 시작한다. Slot을 선택하면 Stripe에서 월 USD 249 또는 연 USD 2,388을 결제한다. 연 결제도 매월 50크레딧이다. 성공한 결제가 서버에서 확인되어야 유료 선택을 완료한다. Enterprise는 문의만 열며 자동 유료 권한을 부여하지 않는다.
6. Stripe 결제를 취소하면 선택했던 결제 주기를 유지해 요금제 단계로 돌아온다. 재결제 또는 Free 선택이 가능하다. 새로고침·결제 복귀에는 저장한 회사 정보와 진행 상태를 재사용한다.

### 회사 정보와 기존 회사

Workspace 생성 직후 Exa 조사를 시작해 앞 단계 동안 회사명·소개·선택적 LinkedIn 회사 페이지를 준비한다. Exa에는 **이메일 도메인과 공개 페이지**만 전달하며 이름·개인 이메일 주소는 전달하지 않는다. 회사 공식 도메인의 출처가 있는 결과만 제안값으로 저장한다. 화면에서 수정·확인한 뒤 회사 정보로 확정한다. 이미 직접 입력한 필드는 늦게 도착한 결과가 덮어쓰지 않는다.

공개 페이지에 확인되는 소재지·투자 정보도 기존 회사 데이터에 초기 반영할 수 있다. 확인되지 않은 정보는 빈 값으로 두며, 이미 공유되는 회사 DB 레코드를 신규 가입 내용으로 덮어쓰지 않는다. 조회 오류·제한 시간 초과·키 미설정이어도 수동 입력으로 진행할 수 있다. 실패한 조회를 최신 회사 조사로 표시하지 않는다.

기존 팀원은 해당 회사로 진입한다. 같은 회사 이메일 도메인으로 이미 Workspace가 있거나, 등록된 회사 홈페이지·관리자 도메인과 일치하면 새로 만들지 않고 **관리자에게 초대 요청**을 안내한다. 초대가 확인되면 기존 참여 절차를 따른다. 동일 LinkedIn 회사 페이지를 다른 도메인에서 동시에 등록하는 경우에도 한 회사만 확정한다. 여러 회사가 도메인을 공유하거나 다른 도메인을 사용하는 예외는 Harper 팀이 회사와 초대 경로를 확인한다. 도메인 일치는 조회 권한이나 관리자 권한의 근거가 아니다.

### 화면과 저장 구조

| 항목 | 구현 |
| --- | --- |
| `/company` | 가입 CTA, 신청 폼 대신 시작 안내, 상담 연락 경로 |
| `/org` 로그인·가입 입구 | Google/이메일 인증, 회사 이메일 필요 안내, 기존 회사 초대 안내 |
| `/org/onboarding` | 기존 프레임과 진행 표시 재사용, 회사 정보 폼과 요금제 단계 추가 |
| `/pricing` 및 요금제 선택 | Free / Slot / Enterprise 3개 패널, 큰 가격 영역, 아래 기능 목록·버튼, 모바일 세로 배치 |
| 신규 테이블 | 없음 |
| `company_workspace` | `signup_domain`과 `signup_state` 두 칼럼. 회사 도메인 중복 방지와 생성자·확인·선택·조사 진행 상태 저장 |
| 기존 테이블 | `company_users`, `company_user_workspace`, `company_data`, `company_db` 및 기존 billing 테이블 사용 |
| 조사 제안값 | `company_data.source_payload.signupResearch`와 공개 출처. 확인된 회사 정보는 Workspace와 새 회사 DB에 반영 |

생성은 사용자·회사 도메인 단위로 잠금 처리해 여러 탭에서도 하나만 만든다. 상태 변경은 생성자이자 Owner인 사용자만 가능하다. 관련 RPC는 서버 권한으로만 호출하며, 일반 클라이언트는 가입 출처·완료 상태를 직접 변경할 수 없다. 결제 없는 유료 선택과 회사 확인 없는 Checkout은 서버에서 차단한다.

### 적용 준비와 검증 범위

- 운영 적용 시 `20261007083520_company_self_serve_onboarding.sql`을 앱보다 먼저 준비해야 한다. 기존 Workspace의 두 칼럼은 NULL로 남고 기존 이용권·역할·팀원은 변경하지 않는다. 새 가입으로 만든 Workspace만 처음부터 Free에 등록한다.
- **`EXA_API_KEY`**가 회사 검색에 필요하다. 로컬 `.env.local`과 배포 환경의 서버 변수에 각각 설정한다. 브라우저 공개 변수에 넣지 않는다. `.env.local`의 실제 키로 Exa 검색을 검증했다. 격리된 로컬 회사 계정의 `vercel.com` 도메인으로 공식 About 페이지를 찾아 이름·소개·출처가 회사 정보 화면에 미리 채워졌고, 확인 후 Workspace·회사 데이터·회사 DB에 저장됨을 확인했다. 출처에서 확인되지 않은 선택적 LinkedIn 주소는 비워 두었다. 별도 테스트용 환경 파일의 빈 값이 실제 키를 덮어쓰지 않도록 주의한다.
- 기존 Stripe Price·Portal·Webhook 설정을 재사용한다. 별도 상품이나 가격은 필요 없다. 배포·Live Webhook 활성화는 여전히 별도 실행 단계다.
- Supabase의 Google 로그인과 이메일 로그인을 활성화하고 사용하는 도메인의 `/auths/callback`을 redirect allowlist에 포함해야 한다. 실제 Google 인증·이메일 발송은 이번 테스트에 포함하지 않았다. 브라우저 가입 검증은 격리된 로컬 Auth의 인증 완료 계정으로 실행했다. 인증 실패 시 기존 가입·초대 목적지를 유지하고 로그인 화면에서 재시도 안내가 표시됨을 확인했다.
- 검증: 로컬 DB에서 사용자 동시 생성·동일 회사·동일 LinkedIn 동시 등록·권한·회사 확인·무료/유료 선택 제한을 확인했다. 브라우저에서 회사 정보 저장, 결제 취소 복귀, Stripe **Sandbox 월 USD 249 실제 테스트 카드 결제**, 결제 후 온보딩 완료, **1 Slot·1 slot·50크레딧**, Free 완료 후 **1 slot·5크레딧**, 회사 화면 진입을 확인했다. 테스트 Role이나 후보자 연락은 만들지 않았다.
- 모바일 390px 화면에서 가로 넘침이 없고 Free 선택부터 회사 화면까지 진행됨을 확인했다. 로컬 보안 Advisor에서 이번 가입 함수 관련 지적은 없었다. 전체 저장소 타입 검사에는 이 변경과 무관한 기존 오류가 남아 있고, 수정한 가입 코드에서는 새 타입 오류가 나오지 않았다.
- 관련 단위 테스트 29개가 통과했다. 같은 도메인의 다른 계정은 초대 전 접근이 차단되고, 로컬 초대를 받은 뒤에는 회사 확인·요금제 선택을 반복하지 않고 기존 팀원 온보딩으로 합류하는 브라우저 흐름을 확인했다.
- SQL 재검증: 격리 로컬 스택과 migration 준비 후 `node scripts/testCompanySignup.mjs`. 테스트는 실행 중 만든 회사·계정을 정확한 ID로 정리한다.

## 10. 슬롯별 크레딧 수정 — 운영 DB 반영 완료, 앱 화면은 로컬 검증 (2026-10-07)

크레딧은 각 슬롯에 귀속되며 그 슬롯에 연결된 Role만 사용한다. A에 0개, B에 50개가 있어도 A의 Intro·Connect는 차단한다. Role을 교환하거나 중지 후 재개해도 잔액을 이동·초기화하지 않는다. 새 요청은 현재 배정을 사용하고, 이미 승인한 요청의 재시도는 원래 사용 기록을 유지한다. 슬롯 없는 Role은 채용 시작 후 새 요청을 진행한다.

- 신규 테이블·칼럼 없이 `20261007113918_workspace_slot_credits.sql`이 기존 차감·요약 함수를 교체한다. 사용자 승인에 따라 Harper 운영 프로젝트에 반영했고, 실제 적용 이력은 `20261007123725_workspace_slot_credits`다. 과거 잔액과 사용 기록은 재분배하지 않았다.
- 클라이언트에는 `creditSlots`로 슬롯·담당 Role·잔액·갱신일을 반환한다. 이전 진단용 SQL의 `balance` 합계는 호환용으로만 남기며 앱 API에서는 제외한다. 차감 판단에 사용하지 않는다.
- 크레딧 탭은 슬롯별 잔액과 사용 내역만 표시한다. 상시 추가 크레딧 문의·현재 기간 설명·저잔액 문의 문단·빈 사용 내역 설명을 제거했다. 실제 잔액 부족으로 차단된 요청의 안내는 유지한다.
- Role 화면의 왼쪽 메뉴는 현재 Role의 슬롯 잔액이 10개 이하일 때만 표시한다. 구독 탭의 월 제공량도 공용 합계 대신 슬롯당 5/50개로 표시한다.
- 가격 FAQ와 국문·영문 회사 약관 검토본을 같은 슬롯 귀속 기준으로 정리했다. 약관 공개·시행이나 Worker의 추천·매칭 변경은 포함하지 않는다.

검증: `scripts/testWorkspaceBilling.mjs`에서 슬롯 간 차감 격리, 무료→유료 50개, 월별 독립 갱신, 연간 구독의 미래 크레딧 차단, Role 교환·중지·재시작, 멱등 재시도, 취소·Scale·권한을 확인했다. 실제 로컬 PostgreSQL의 동시 요청에서는 슬롯 잔액 1개로 두 요청 중 하나만 승인되고 다른 슬롯의 50개는 보존됐다. UI·오류 표시 테스트 11개가 통과했고, 실제 로컬 앱에서 슬롯별 표시와 사용 이력, 요약·용량·사용 내역 API의 200 응답을 확인했다. 실제 배정 변경 API도 200으로 응답했고, Role 교환 뒤 슬롯 잔액·갱신일과 과거 사용 내역의 슬롯 귀속이 유지됐다. 테스트 Role·사용 기록은 삭제하고 기존 로컬 슬롯 잔액은 복원했다. 로컬 보안 점검 40건은 기존 비결제 항목이며 이번 결제 함수 관련 항목은 없다. 전체 타입 검사는 기존 비결제 파일의 오류 때문에 통과하지 않으며, 이번 수정 파일에서 보고된 타입 오류는 없다.

운영 반영 검증: 적용 전후 크레딧 기간 1행·잔액 합계 5개와 잔액 fingerprint가 동일했다. 두 함수의 service-role 전용 실행 권한과 빈 search path를 유지했다. 운영 요약에서 `creditSlots` 배열과 Free 5/5를 확인했고, 운영 DB를 사용하는 로컬 청구 화면에서도 오류 없이 같은 잔액과 갱신일이 표시됐다. 이 작업에서는 운영 웹앱을 새로 배포하지 않았다. 슬롯별 차감과 새 Intro 요청 조건은 기존 운영 Intro 함수에서 적용되며, 새 앱의 Connect 처리 경로가 운영에 배포됐다고 주장하지 않는다. 팀원 문서는 Notion의 「역할·후속 연락·인재 상태가 바뀌는 기준」과 「후보자 수락부터 회사 미팅까지」의 해당 크레딧 조건과 변경 이력에 반영했다.


## 11. Agent 상품 개념을 Slot으로 통일 — 2026-10-07

구독 단위는 Slot이다. 유료 슬롯 하나에 진행 중인 채용 하나와 월별 50 크레딧을 연결한다.
화면 문장에서는 `슬롯 추가`라고 쓰고, 실제 AI agent의 이름이나 경로는 변경하지 않는다.

- 코드: `BillingSlot`, `slots`, `slotId`, `model: slot`, `SLOT_MONTHLY_CREDITS`, 슬롯 구매·취소·배정 함수와 API 입력으로 통일했다. Pricing·가입 플랜 선택·결제·역할 용량 제한·연결 대기 안내·FAQ·약관 검토본도 같은 용어를 쓴다.
- 운영 DB: `20261007125852_workspace_billing_slot_terminology.sql`, `20261007130037_workspace_slot_free_period_terminology.sql`을 반영했다. `company_workspace_agents`의 실데이터 테이블을 `company_workspace_slots`로, 월 기간의 FK를 `slot_id`로 제자리 변경했다. 슬롯 테이블을 복제하거나 구독·잔액을 다시 만들지 않았다. `workspace_billing_summary_v2`와 슬롯 동기화·배정 RPC가 정본이다.
- 구버전 호환: 현재 배포 앱·웹훅을 위해 이전 이름의 service-role 전용 view/RPC, 파생 읽기 전용 `agent_id` 칼럼과 이전 summary 응답을 남겼다. 새 로직은 이 이름을 사용하지 않는다. 새 앱 배포와 이전 Checkout 정리가 확인되기 전까지 삭제하지 않는다.
- 설정: 새 이름은 `STRIPE_SLOT_PRICE_ID`, `STRIPE_SLOT_ANNUAL_PRICE_ID`다. 로컬 Live·Test 설정에 같은 Price ID의 새 별칭을 추가했다. 새 코드는 기존 배포 설정의 이전 변수 이름도 fallback으로 읽으므로 키 재발급이 필요 없다. 새 Stripe metadata는 `workspace_slot_v1`이며 이전 `workspace_agent_v1`도 기존 구독·진행 중인 Checkout 조회에서 허용한다.
- Stripe Live/Test 상품명과 월·연 가격 설명을 `Harper Slot`으로 변경했다. 설명의 공용 크레딧 표현도 슬롯 귀속으로 수정했다. 상품·Price ID, 월 USD 249 / 연 USD 2,388, 결제 주기는 보존했다. Live의 기존 Lookup key는 연결 호환을 위해 유지한다. 서버키 권한과 정산 설정은 바꾸지 않았다.
- 운영 FAQ: 회사 가격 답변 3개의 본문을 Slot과 확정된 Enterprise 정책으로 갱신했다. 질문·검색 embedding·식별자는 유지했다. embedding은 질문에만 기반하므로 본문 수정에는 재생성이 필요 없다.

검증: SQL 계약 테스트에서 기존 구독·소진된 크레딧을 담은 상태로 migration을 적용하고 모든 필드 보존, 이전 summary/webhook 호출, 권한, 슬롯별 차감·갱신·Role 교환·취소를 확인했다. 관련 코드/UI 테스트 **33개 통과**. 운영 적용 전후 유료 슬롯 0행·차감 0행·Free 기간 1행과 5개 잔액이 같고, 새/이전 RPC 모두 Free 5개를 반환했다. 권한은 anon/authenticated 접근 불가, service_role만 허용한다. 보안 advisor의 슬롯 테이블 정책 없음 항목은 서버 전용·직접 접근 불가 구조에서 발생하며 공개 권한을 추가하지 않았다.

실제 로컬 브라우저의 Pricing FAQ와 운영 DB를 읽는 `/org/billing`에서 슬롯 명칭, 월 249달러·연 2,388달러 추가 모달을 확인했다. 운영 Stripe 상품명·설명과 가격 ID/금액 보존도 다시 조회했다. 전체 타입 검사는 기존 비결제 오류 때문에 통과하지 않으며 변경 파일의 타입 오류는 없다. 로컬 전체 스택은 Lima 아키텍처 문제로 시작되지 않아 이번 용어 변경에서 새 실제 결제나 Test Clock을 다시 실행하지 않았다. 모델 평가 결과와 최초 실패는 [구독 안내 검증 기록](../evaluation/company-side-conversational-qa/reports/2026-10-07-billing-notices.md)의 v16 절에 남긴다.

이번 작업에서는 운영 웹앱 배포·push·Worker 재시작을 하지 않았다. 운영 DB·Stripe·FAQ의 반영과 로컬 앱 변경을 구분한다. Notion은 배포 시점의 문서 동기화 규칙에 따라 이번 작업에서 수정하지 않았다.

## 12. 한 달 제공 슬롯과 기존 추천 수락 — 2026-10-08 로컬 구현

### 제공 슬롯

운영자가 Workspace에 지정한 수의 슬롯을 제공할 수 있다. 각 슬롯은 **지급 시점부터 한 달**, **슬롯별 50크레딧**, **동시 채용 1개**를 제공하며 유료 슬롯과 같은 이용 권한을 갖는다. 서울 시간 기준 같은 날짜·시각에 종료하며 다음 달에 해당 날짜가 없으면 말일을 사용한다. 자동 갱신·자동 결제는 없다.

- Free와 합산하지 않는다. 무료 크레딧을 모두 사용했어도 제공 슬롯은 각각 50개로 시작한다. 기존 유료 슬롯과는 함께 사용할 수 있다.
- Role 배정·교환·차감은 기존 슬롯 규칙을 재사용한다. 다른 슬롯 잔액을 가져오거나 역할 교환으로 충전하지 않는다. 중지된 Role은 지급만으로 다시 시작하지 않는다.
- 종료 순간부터 잔액을 사용할 수 없다. 남은 슬롯에 빈자리가 있으면 Role을 이동하고 초과한 Role만 중지한다. 슬롯이 모두 종료되면 Free의 동시 채용 1개와 기존 Free 월 기간으로 돌아간다. 남은 지급 크레딧은 이월하지 않는다.
- `/org/slots`에는 **제공 슬롯**, **자동 결제 없음**, 종료일을 표시한다. 담당 Role 변경은 가능하지만 구독 취소·유지·결제 수단 메뉴는 없다. 결제 페이지의 다음 결제일은 실제 Stripe 구독에서만 계산한다. 지급 기록을 청구서로 만들지 않는다.
- 기존 계약(`legacy`)이나 Enterprise를 지급 작업만으로 표준 플랜으로 바꾸지 않는다. 이 경우 먼저 별도의 명시적인 계약 전환이 필요하다.

새 테이블은 없다. `company_workspace_slots`에 `source`, `grant_request_id`, `grant_metadata`를 추가하며 기존 행은 `source=stripe`다. 지급 사유·담당 운영자·요청 수량을 해당 슬롯에 남긴다. 지급 슬롯에는 Stripe ID가 없고, 기존 크레딧 기간 테이블에 인보이스 없는 50개 기간을 만든다. DB는 Stripe 슬롯의 인보이스 필수 조건을 계속 검증하고, 지급 슬롯에는 지정된 기간 외의 크레딧 기간을 추가하지 못하게 한다.

지급 함수 `workspace_billing_grant_slots_v1`은 서버 전용이다. 일반 팀원·Workspace Owner·Admin이 브라우저에서 자신에게 지급할 수 없다. Workspace와 지급 요청을 잠그고 전체 슬롯을 한 트랜잭션으로 만든다. 같은 요청 ID는 원래 슬롯·종료일을 반환하며 다시 충전하거나 기간을 연장하지 않는다. 다른 Workspace·수량·사유·운영자로 같은 ID를 재사용하면 거절한다.

### 운영자 사용 방법

아래 도구는 기본적으로 조회와 미리보기만 한다. 실제 Workspace UUID와 수량, 운영자, 사유를 입력한다. 키는 `.env.local`의 기존 Supabase 서버 설정을 사용하며 출력하지 않는다.

```sh
pnpm exec tsx scripts/grantWorkspaceSlots.ts \
  --workspace=<workspace-uuid> --quantity=2 \
  --granted-by=<operator> --reason='<grant reason>'
```

미리보기의 회사명과 수량을 확인한 뒤, 출력된 `requestId`를 **같은 인수에** 추가해 실행한다.

```sh
pnpm exec tsx scripts/grantWorkspaceSlots.ts \
  --workspace=<workspace-uuid> --quantity=2 \
  --granted-by=<operator> --reason='<grant reason>' \
  --request-id=<preview-request-uuid> --apply
```

응답이 끊기거나 결과가 불확실하면 **같은 요청 ID와 인수로 재실행**한다. 새 지급을 의도할 때만 새 요청 ID를 쓴다. 일반 결제 경로·Stripe 설정 변경은 필요 없다.

### 구독 종료 뒤 후보자 수락

기존 후보자 수락 경로는 회사의 현재 결제 상태로 차단하지 않는다. 구독 또는 제공 기간 종료 때문에 Role이 `paused`가 되었더라도, 이미 추천받은 후보자는 수락할 수 있다. 새 유료 추천 권한은 종료되며 이 예외가 Role을 다시 활성화하거나 새 추천을 만들지는 않는다.

실제 종료·삭제·만료된 Role, 프로필 공유 차단, 온보딩 미완료, 다른 추천으로 대체된 이전 카드, 테스트 대상 격리 검증은 그대로 적용한다. 후보자의 수락 자체는 회사 크레딧을 차감하지 않는다. 이미 회사에 제안 가능한 후보 카드가 있었다면 기존 수락 트랜잭션에서 그 카드를 닫고 연결 대기로 넘기는 동작도 유지한다. 그 외 수락만으로 소개 전달 완료를 주장하지 않는다.

**회사의 최종 연결 수락은 별도 행동**이다. 현재는 해당 Role에 유효한 슬롯과 크레딧이 필요하다. 후보자가 늦게 수락했다는 이유로 만료 크레딧을 복구하거나 회사의 연결 수락을 무료로 만들지 않는다. 이 경계의 변경 여부는 별도 확인 대상으로 남겼다.

### 검증·적용 상태

- `node scripts/testWorkspaceBilling.mjs`: 실제 migration 적용, 기존 구독 호환, 지급 중복·변경 요청 차단, Free 5개 소진 후 50개 지급, 슬롯별 Intro/Connect 차감, 잔액 격리, Stripe 구독과 공존, 만료 후 자동 배정/중지·Free 복귀, 서버 전용 권한.
- `node scripts/testWorkspaceSlotAcceptance.mjs`: 실제 결제/지급·수락 RPC를 같은 격리 PostgreSQL 환경에서 연결. Stripe/지급 슬롯 만료 후 `paused` Role 수락, 회사 제안 카드의 연결 대기 전환, 수락 시 차감 없음, 종료·만료·개인정보·테스트 격리 경계 확인.
- 관련 코드·화면 렌더링 테스트 38개 통과. 지급 슬롯을 Stripe로 취소·유지하려는 요청 차단, Stripe 가격 조회 제외, 혼합 플랜의 다음 결제일과 지급 슬롯 문구를 확인했다.
- 수정 파일의 ESLint 검사 통과. 전체 타입 검사는 기존 생성 파일·평가 실행 자료 등 다른 파일의 오류로 통과하지 않았으며, 이번 수정 파일의 타입 오류는 없었다.
- 위 SQL 검증은 PGlite에서 실행한다. 네이티브 PostgreSQL의 다중 세션 잠금 경쟁, 실제 외부 발송, 브라우저 로그인·실결제 E2E를 이번 검사로 검증했다고 주장하지 않는다.
- `20261008062440_workspace_slot_grants.sql`과 앱 변경은 로컬 상태다. **운영 DB 반영·배포·실제 Workspace 지급은 하지 않았다.** 운영에서 사용하려면 이 migration과 지급 슬롯 UI/API를 먼저 적용한다. 이번 변경으로 Worker의 추천·매칭 판단을 수정하지 않았다.


## 13. 여러 슬롯을 한 번에 구매 — 2026-10-08 로컬 구현

- 온보딩, `/org/slots`, `/org/billing`의 동일한 `SlotPurchaseDialog`에서 1~100개를 선택한다. 슬롯 단가 × 수량과 실제 월간/연간 선결제 합계를 표시한다. 공개 pricing의 기존 디자인은 바꾸지 않는다.
- 월간 3개는 **$747/월**, 연간 3개는 **$7,164/년 선결제**다. 세금은 Checkout의 실제 설정과 고객 주소에 따라 별도 적용된다. 각 슬롯은 각각 월 50크레딧과 1개의 Role 배정을 갖는다.
- 기존 월간·연간 per-unit Stripe Price를 그대로 사용한다. 새 상품·가격·키·포털 설정은 필요하지 않다. 한 번의 Checkout에 수량을 넣고, 별도 구매는 새 Subscription으로 만든다.
- 3개 중 1개 취소: Stripe의 다음 갱신 수량을 2로 변경하고 `proration_behavior=none`을 적용한다. 취소 슬롯은 이미 결제한 월/연 이용 기간 끝까지 그대로 사용할 수 있다. Role을 옮겨도 취소 대상은 슬롯에 남는다.
- 모두 취소: Stripe에서 기간 말 구독 종료를 예약한다. 종료 전 일부만 철회하면 해당 슬롯들만 다음 갱신에 포함한다. 이미 끝난 슬롯을 철회하거나 예전 청구서를 다시 처리해 되살리지 않는다.
- 갱신 결제가 실패하여 유료 이용이 정지된 상태에서도 다음 갱신은 취소할 수 있다. 미납 청구서의 결제·재시도 자체를 면제하거나 환불하는 동작은 아니다.

### 데이터와 복구

새 테이블은 없다. `20261008080835_workspace_bulk_slot_checkout.sql`은 기존 슬롯 테이블에 구매 내 순번, 개별 종료 예정일, 진행 중인 구독 변경을 추가한다. Subscription ID의 단독 유일 제약을 구매 내 순번과의 복합 제약으로 바꾸고, Invoice·월 시작일·Slot별로 지급을 한 번만 허용한다.

취소·철회는 DB에 요청을 먼저 저장하고 같은 Stripe idempotency key로 실행한다. 응답이나 로컬 확정이 유실되면 기존 정기 점검이 같은 요청을 복구한다. 작업 중에는 새 취소 요청과 오래된 동기화가 덮어쓰지 못한다. 23시간 이상 확정되지 않은 요청은 오래된 Stripe 요청을 다시 실행하지 않고 운영 점검 대상으로 남긴다. 권한은 기존 서버 전용 RPC와 동일하다.

Checkout의 수량·가격·주기 등도 생성 전에 고정한다. 같은 선택의 중복 클릭은 동일한 결제 창을 반환한다. 수량/주기를 바꾸면 이전 열린 창을 만료시킨 뒤 새 창을 생성한다. 결제가 완료된 창을 새 구매로 오인하지 않도록 먼저 기존 결제를 반영한다.

### 검증 범위와 적용 상태

- `node scripts/testWorkspaceBilling.mjs`: 실제 migration/RPC를 격리 Postgres에서 실행. 기존 Free·단일 슬롯·제공 슬롯 회귀, 구매 3개, 개별 차감, 부분 취소·철회·전체 취소, 갱신, 중복·역순 처리, 권한, 동시 요청 잠금 계약 검증.
- `pnpm exec tsx scripts/testWorkspaceBulkSlots.ts`: **실제 Stripe TEST API/결제/Test Clock + 격리 PGlite + 실제 서버 service/RPC**. 월간·연간 Checkout 수량/합계/재사용/선택 변경, 3개 결제와 슬롯별 50개, 일부 취소와 철회, 추가 일할 청구 없음, 응답 유실 복구, 연간 중간 월 크레딧 갱신, 다음 갱신 때 2개분 결제와 해당 슬롯만 지급을 확인했다. 테스트 고객·Clock은 종료 시 삭제한다. Live 키를 거부한다.
- 결과: `.local/billing-test/private/bulk-slots-report.json` (비공개 로컬 산출물). 이 runner는 실제 webhook 수신 경로 대신 서비스 동기화 함수를 직접 호출한다. Stripe Hosted Checkout 생성은 검증했으며, 이 runner에서 Hosted Checkout 카드 입력 화면을 완료한 것은 아니다.
- 기존 서버 단위 테스트 30개와 실제 SQL 회귀 검증을 통과했다. 공유 구매 창은 한국어·영어, 데스크톱·390px 모바일, 월/연 합계, 잘못된 수량 차단, 선택한 수량의 제출을 브라우저에서 확인했다. 변경 파일의 타입 오류와 린트 오류는 없다. 기존 온보딩 effect에는 이전부터 있던 린트 경고 1개가 있다. 전체 프로젝트 타입 검사는 기존 다른 작업의 오류 때문에 통과로 보고하지 않는다.
- **운영 미반영**: 제공 슬롯 migration이 선행되어야 한다. 기존 1개짜리 Subscription과 예전 단일 슬롯 RPC 호출은 호환된다. 앱 배포와 운영 migration 적용 완료를 의미하지 않는다.


## 14. 무제한 Role과 독립 공용 크레딧 · 2026-10-08 로컬 구현

- 모든 Free·표준 Slot Workspace에 전체 Role이 함께 쓰는 월 10크레딧을 제공한다. 기존 월 주기·시작일과 미사용분 이월 없음은 유지한다. 월 주기와 유료 우선 차감은 이번 구현의 기본값이다.
- 유료·한 달 제공 Slot은 배정된 Role의 월 50크레딧과 유료 기능을 제공한다. 해당 Role은 자기 Slot 크레딧 → 공용 크레딧 순서로 쓴다. 다른 Slot 잔액은 사용하지 않는다. 공용 크레딧은 연결 대기 유료 권한을 만들지 않는다.
- Role 생성·시작·재개 수량 제한과 Slot 만료 시 자동 중지를 제거한다. 빈 유효 Slot 자동 배정은 유지한다. 배정받지 못한 Role도 Free 기능을 유지하며, 유료 Workspace 안에서도 Free 매칭 경로로 분류한다. 테스트 Role 격리는 기존 guard가 계속 담당한다.
- Slot 구매·교체·취소로 공용 잔액이나 갱신일을 바꾸지 않는다. 기존 공용 월 기간의 사용량을 보존하고 제공량만 5→10으로 한 번 올린다. 이전 월 이력·이벤트·유료 기간은 유지한다. 과거 한도 때문에 이미 중지된 Role은 사용자의 중지와 구분할 수 없으므로 임의 재개하지 않는다.
- Slots 상단 공용 잔액·월 갱신일, 아래 유료 Slot별 잔액·배정·결제 상태를 표시한다. Billing·가격표·가입 플랜·공개 FAQ·Harper 서비스 설명·작업 실패 안내를 같은 정책으로 맞춘다.
- 신규 migration: `20261008115719_workspace_shared_free_credits.sql`. 앱과 새 SQL 계약을 함께 출시해야 하며, 이 작업에서는 운영 적용·배포·Notion 수정은 하지 않았다. 결제 상품·가격·기존 계약은 변경하지 않는다.
- 검증: `node scripts/testWorkspaceBilling.mjs`, `node scripts/testWorkspaceSlotAcceptance.mjs`, `node scripts/testWorkspaceSharedCredits.mjs` (독립 PostgreSQL 설치 경로를 `--pg-bin`으로 지정 가능). 마지막 검증은 임시 Unix socket 전용 PostgreSQL을 띄우고 폐기하며 동시 요청·중복 재시도·공용 fallback·유료 권한을 실제 SQL로 검사한다. 컴포넌트/API 테스트, 정적 렌더 브라우저 확인과 [v18 모델 평가](../evaluation/company-side-conversational-qa/README.md)도 별도 수행한다. 기존 Stripe Test clock runner의 기대값은 갱신했지만 이번 작업에서 Stripe를 호출해 다시 실행하지 않았다.

## 15. 배포 전 실제 결제 점검 · 2026-10-09

**로컬 구현 검증은 통과했다. 운영 반영 완료를 의미하지 않는다.** 실제 금액을 청구하지 않고 Stripe TEST와 기존 로컬 Supabase를 사용했다. 평소 `localhost:3000`은 운영 Supabase·Live Stripe 설정을 읽으므로 결제 테스트는 별도 `localhost:3100`에서 진행했다. 운영 데이터에 테스트 Role·추천을 만들거나 운영 Worker를 실행하지 않았다.

### 검증 결과

| 검사 | 결과와 범위 |
| --- | --- |
| 브라우저 · 실제 Hosted Checkout | 잔액 부족 카드 거절, 3D Secure 실패 후 재시도·인증 성공, 월간 2개 합계 $498와 구매 후 슬롯별 50개, 공용 10개 보존 |
| 브라우저 · 구독 변경 | 구매한 2개 중 1개만 기간 말 해지·철회. 해지 중에도 50개와 이용 종료일까지의 권한을 보존. DB와 Stripe에서 철회 후 수량 2·자동 갱신 확인 |
| 브라우저 · 결제 관리 | TEST Customer Portal 진입·Harper 복귀, 실제 구독·결제 수단·청구 내역, $498 결제 완료 영수증과 PDF 다운로드 |
| 브라우저 · 모바일·미결제 | 390px에서 페이지 넘침 없음, 연간 3개 $7,164 합계와 Checkout 금액 일치, 결제 없이 돌아오면 안내 표시·슬롯 4개 유지 |
| 브라우저 · 실패 후 복구 | 로컬 합성 Workspace에만 일시적인 잘못된 고객 참조를 넣어 질문의 오류를 재현. 원래 참조 복원 후 ‘다시 시도’ 성공 시 오류 안내 제거. 최종 참조 원복 확인 |
| 코드/API/UI 테스트 | 관련 42개 통과. Owner 재무 권한, Admin·Viewer 제한, 다른 Workspace 접근 차단, 페이지 처리, 잘못된 요청, 웹훅 서명 등 |
| SQL 계약 | `node scripts/testWorkspaceBilling.mjs` 통과. 실제 migration과 기존 슬롯·제공 슬롯·여러 슬롯·공용 크레딧의 RPC 계약 확인 |
| 실제 Stripe TEST · 여러 슬롯 | `node --import tsx scripts/testWorkspaceBulkSlots.ts`의 월·연 11개 검사 통과. 중복 Checkout, 선택 변경, 부분 해지·철회, 추가 일할 청구 없음, 응답 유실 복구, 2개분 갱신·과거 인보이스 재처리 |
| 실제 Stripe TEST Clock → 서명 웹훅 → 로컬 앱 → PostgreSQL | `node scripts/testWorkspaceBillingClock.mjs`의 16개 검사 통과. 월·연 자동 갱신, 실패 후 납부 복구, 이월 없음, 윤년·월말 갱신, 선결제 연간 기간 중 해지, 종료, 마지막 크레딧을 두 DB 연결에서 동시에 차감 |
| 배포 빌드 | `pnpm build` 성공. 전체 앱 컴파일·타입 검사·377개 정적 페이지 생성 완료. 수정 파일 ESLint 통과 |

자동 검증은 42 + 11 + 16 = **69개**이며 SQL 계약과 브라우저 검사는 별도다. 여러 슬롯 runner는 서비스 동기화를 직접 호출하고, Clock runner는 실제 Stripe CLI의 서명 웹훅을 전달한다. 이 결과로 운영 Live 결제·운영 웹훅 수신까지 검증했다고 주장하지 않는다.

비공개 산출물은 `.local/billing-test/private/`의 `bulk-slots-report.json`, `clock-1791526448.json`, `unit-20261009.log`, `build-clean-20261009.log`, `slots-success-20261009.jpg`다. 이 파일과 테스트 자격 증명은 커밋하지 않는다. TEST Clock 자료와 합성 Workspace 구독은 확인용으로 보존하며, 실제 요금·운영 고객에는 영향을 주지 않는다.

### 이번에 수정한 오류

- 결제 관리 등의 요청이 실패한 뒤 데이터 조회가 성공해도 과거 오류가 남던 Slots 화면을 수정했다. 재시도 중 중복 클릭을 막고 조회 성공 시 과거 오류를 지운다. 실패 상태에서는 오류를 유지한다.
- 제공 슬롯 UI 검증 2개가 현재 화면과 달라 실패하던 기대값을 실제 만료일과 Role 목록 기준으로 정리했다.
- 전체 앱 타입 검사에서 설명 본문이 없는 채용 안내 항목 접근과 내부 Role의 `is_anonymous` 타입 누락을 수정했다. 문구·기능·판단 규칙은 바꾸지 않았다.
- 앱 빌드의 타입 입력을 `src`와 현재 Next 생성 파일로 한정했다. 과거 로컬 Slack 생성 파일, 비공개 평가 결과의 진단 코드, 별도 실행 스크립트가 앱 빌드를 막던 문제를 해결했다. 스크립트용 타입 설정에는 자체 소스 범위를 명시해 별도 검사 범위를 유지했다.

### 최초 점검 당시 운영에서 필요했던 작업

운영 DB의 실제 열과 함수, Stripe Dashboard, Vercel 환경 변수 메타데이터를 읽어 확인했다. migration history의 누락만으로 판단한 것이 아니다.

1. 운영 DB에는 제공 슬롯과 여러 슬롯 관련 열·함수가 없고 공용 정책도 기존 5개 계약이다. 새 앱을 출시할 때 아래 3개 migration을 순서대로 적용하고 실제 계약을 확인해야 한다.
   - `20261008062440_workspace_slot_grants.sql`
   - `20261008080835_workspace_bulk_slot_checkout.sql`
   - `20261008115719_workspace_shared_free_credits.sql`
2. Live의 `Harper workspace billing` 웹훅은 **Disabled**다. URL과 10개 이벤트·API 버전은 코드에 맞지만, 새 앱을 출시한 뒤 활성화하고 실제 서명 검증·수신을 확인해야 한다. Vercel에 웹훅 secret이 있다는 사실만으로 값의 일치나 수신 성공을 주장하지 않는다.
3. Live 상품의 월 $249·연 $2,388 Price와 Portal 구성, production 결제 환경 변수는 준비되어 있다. API key의 필요한 6개 권한도 확인했다. Stripe Account status에서 **Payments는 Active**이며 외부 정산 계좌 누락은 **payouts만 제한**한다고 표시한다. 정산 제한을 결제 정보 조회 오류의 정상 원인으로 취급하지 않는다.

이번 작업에서는 운영 DB 변경·Live 웹훅 활성화·push·앱 배포·Worker 재시작을 하지 않았다. Notion은 성공한 배포 이후에만 갱신한다. 배포 후 운영 웹훅 수신과 배포된 버전의 결제 경로 확인이 남아 있다.

## 16. 운영 DB 반영 · 2026-10-09

사용자의 명시적인 운영 DB 반영 요청 후, 위 점검에서 빠져 있던 3개 변경을 Supabase 운영 프로젝트에 순서대로 적용했다. 이 절의 상태가 15절 최초 점검 시점의 미반영 상태를 대체한다.

| 원본 migration | 운영 적용 기록 | 결과 |
| --- | --- | --- |
| `20261008062440_workspace_slot_grants.sql` | `20261009065055_workspace_slot_grants` | 성공 |
| `20261008080835_workspace_bulk_slot_checkout.sql` | `20261009065104_workspace_bulk_slot_checkout` | 성공 |
| `20261008115719_workspace_shared_free_credits.sql` | `20261009065110_workspace_shared_free_credits` | 성공 |

- 실제 신규 열 6개와 새 결제 함수 5개가 존재한다. 함수 실행 권한은 service_role만 허용하며 anon/authenticated에는 없다. 함수의 고정 search_path도 확인했다.
- 적용 전후 슬롯 0행·크레딧 기간 1행·사용 이벤트 0행을 유지했다. 기존 공용 기간의 ID·시작·종료·사용량을 보존하면서 현재 제공량과 잔액이 5→10으로 갱신되는 것을 확인했다. 임의로 Role을 재개하거나 유료 슬롯을 지급하지 않았다.
- 운영 DB를 읽는 원래 `localhost:3000/org/slots`를 브라우저로 새로고침해 공용 10개·사용 내역·기존 중단 Role이 오류 없이 표시되는 것을 확인했다. 이 로컬 화면 확인은 운영 웹앱 배포를 의미하지 않는다.
- 변경 전 함수·제약·기간의 비공개 스냅샷은 `.local/billing-test/private/production-schema-before-20261009.json`에 owner-only 권한으로 저장했다. 확인 화면은 같은 디렉터리의 `billing-production-db-20261009.jpg`다. 커밋하지 않는다.

**웹훅은 아직 비활성 상태로 유지한다.** 운영 URL `https://matchharper.com/api/billing/webhook`에 서명 없는 빈 JSON을 POST했을 때 404가 반환됐다. Vercel이 확인한 현재 운영 revision `bceafc57657bb2c7bb1c98793fbf2ab3c84697cf`에는 수신 route가 없다. 새 앱을 배포해 서명 없는 요청이 정상적으로 거절되는 것을 확인한 뒤 Live 웹훅을 활성화하고 실제 이벤트 수신을 검증해야 한다. 지금 활성화하면 Stripe의 결제 알림이 404로 실패한다.

이 요청에서는 DB만 반영했다. 앱 push·배포·Worker 재시작·Live 요금 청구는 하지 않았다. Notion의 팀원용 앱 기능 문서는 새 앱의 성공한 배포와 실제 수신 확인 이후에 동기화한다.
