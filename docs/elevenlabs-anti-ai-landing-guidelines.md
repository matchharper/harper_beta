# ElevenLabs Reference And Anti-AI Landing Guidelines

작성일: 2026-06-08

대상 페이지: `src/pages/index2.tsx`

## 기준 요약

Harper 랜딩은 “AI 툴 소개 페이지”가 아니라 “프라이빗 커리어 브리핑 서비스의 첫 화면”이어야 한다.

현재 수정 기준은 다음이다.

- 장식보다 실제 제품 화면을 먼저 둔다.
- 타이틀, 설명, CTA 아래에 Harper 실제 스크린샷을 배치한다.
- 작은 선행 라벨은 쓰지 않는다.
- shadow, glow, 그라데이션 배경을 쓰지 않는다.
- glass/blur는 배경 장식이나 카드 장식으로 쓰지 않는다. 이메일 소개 장면도 반투명 glass가 아니라 실제 메일 클라이언트처럼 평평한 표면으로 만든다.
- 반복 정보는 카드가 아니라 문서, 표, 리스트, 행 구조로 보여준다.
- 섹션 사이를 두꺼운 박스나 상하 border로 나누지 않는다.
- 문구는 “AI가 해준다”보다 “기준 정리, 기회 브리핑, 정보 공개 제어, 수락한 기회만 연결”을 앞세운다.

## 2026-06-08 재검수 방식

이번 패스는 말로만 기준을 세우지 않고 실제 화면을 같은 뷰포트에서 다시 비교했다.

캡처:

- ElevenLabs hero: `output/playwright/elevenlabs-redesign-pass/elevenlabs-01-hero.png`
- ElevenLabs product/section: `output/playwright/elevenlabs-redesign-pass/elevenlabs-03-section.png`
- Harper hero before: `output/playwright/elevenlabs-redesign-pass/harper-01-hero-before.png`
- Harper workflow before: `output/playwright/elevenlabs-redesign-pass/harper-02-workflow-before.png`

현재 Harper 점수: 4/10.

감점 이유:

- H1이 ElevenLabs보다 훨씬 무겁고 크다. 첫 화면에서 제품보다 문장이 먼저 보인다.
- 섹션 제목도 너무 커서 정보 페이지가 아니라 랜딩 템플릿처럼 보인다.
- workflow의 우측 UI가 실제 제품 결과물보다 큰 카드 mockup처럼 보인다.
- 제품 스크린샷은 실제 이미지지만, 크롭과 배치가 ElevenLabs의 넓은 제품 패널 밀도보다 덜 정교하다.
- 정보 구조가 “Hero → 로고 → 3단계 → 3개 기회 → privacy → start → use case → FAQ”로 길게 늘어져 AI 랜딩 기본 구조처럼 읽힌다.
- `AI/ML`, `Founder`, `Harper Briefing` 같은 단어가 섹션마다 크게 반복되어 실제 판단 정보보다 라벨이 먼저 보인다.

수정 목표:

- H1 desktop 최대 56px 수준으로 낮춘다. 섹션 제목은 36px 안팎으로 낮춘다.
- display weight는 400~500만 쓴다. bold display를 피한다.
- workflow는 세 개의 큰 카드가 아니라 하나의 제품 모듈 안에서 `기준 정리`, `브리핑`, `소개 이메일` 상태를 보여주는 구조로 바꾼다.
- 기회 섹션에는 full-time, fractional/part-time, advisory, confidential opportunity가 빠지지 않게 넣는다.
- privacy는 유지하되 카드 세 개보다 공개 단계 리스트로 보여준다.
- FAQ에는 기존 Notion/과거 카피에 있던 `등록하면 어떻게 되는지`, `헤드헌터/채용공고와 다른 점`, `당장 이직 생각이 없어도 되는지`를 반드시 포함한다.

## 2026-06-08 수정 후 재점수

캡처:

- Harper hero after: `output/playwright/elevenlabs-redesign-pass/harper-07-hero-final.png`
- Harper workflow after: `output/playwright/elevenlabs-redesign-pass/harper-08-workflow-final.png`
- Harper mobile hero: `output/playwright/elevenlabs-redesign-pass/harper-10-mobile-hero-final.png`
- Harper mobile email: `output/playwright/elevenlabs-redesign-pass/harper-14-mobile-second-email-final.png`

수정 후 점수: 6/10.

좋아진 점:

- Hero H1과 section H2가 이전보다 덜 과하고, ElevenLabs와 비슷한 좌측 H1/우측 설명 구조가 유지된다.
- workflow가 세 개의 큰 카드 행에서 하나의 제품 모듈로 바뀌어, 기준 정리 → 브리핑 → 소개 이메일이 한 화면에서 비교된다.
- `수락하면 바로 소개합니다`의 결과물은 휴대폰이 아니라 이메일 두 개로 보인다.
- 기회 섹션에 정규직, 파트타임, 자문, 비공개 포지션이 모두 들어갔다.
- FAQ에 등록 후 흐름, 헤드헌터/채용공고와 차이, 당장 이직 생각이 없는 경우가 포함됐다.

아직 남은 리스크:

- ElevenLabs의 hero product panel은 하나의 완성도 높은 콘텐츠 오브젝트인데, Harper의 hero screenshot은 기존 앱 캡처라 정보 밀도는 좋지만 이미지 자체의 조형 완성도는 낮다.
- 모바일에서는 제품 플로우가 길게 쌓인다. 이메일 두 개는 보이지만 한 번에 모든 흐름을 보기 어렵다.
- 현재 점수는 “AI스러운 카드/그라데이션/섀도우 제거” 기준으로는 개선됐지만, ElevenLabs 수준의 시각 자산 완성도까지는 아직 아니다.

## 2026-06-08 ElevenAgents 채팅 모듈 비교

사용자 요청 기준:

- ElevenLabs 섹션: `Deploy agents that talk, type, and take action`
- 비교 캡처:
  - ElevenLabs: `output/playwright/elevenlabs-chat-compare/elevenlabs-agents-section-01.png`
  - Harper before: `output/playwright/elevenlabs-chat-compare/harper-chat-before-01.png`
  - Harper first pass: `output/playwright/elevenlabs-chat-compare/harper-chat-after-01.png`
  - Harper final: `output/playwright/elevenlabs-chat-compare/harper-chat-after-03-final.png`
  - Harper mobile: `output/playwright/elevenlabs-chat-compare/harper-chat-mobile-final.png`

ElevenLabs 채팅 카드의 특징:

- 큰 미디어 카드 안에 채팅이 떠 있다.
- 배경은 단색 UI가 아니라 추상적인 질감/이미지다.
- 메시지는 작고 둥근 bubble로 중앙에 모여 있다.
- user message는 outlined/transparent 느낌, agent message는 white solid bubble이다.
- 하단에는 카드의 의미를 설명하는 짧은 caption이 있다.
- 채팅 카드 자체가 제품 기능을 설명하는 visual anchor이고, 주변 설명보다 먼저 읽힌다.

Harper 기존 채팅 문제:

- 검은 배경과 흰 직사각형 메시지가 console/wireframe처럼 보였다.
- 하단 빈 검은 면적이 커서 임시 mockup처럼 느껴졌다.
- 메시지가 실제 대화보다 UI placeholder처럼 보였다.
- ElevenLabs처럼 “대화 장면”이 아니라 “검은 제품 카드”로 읽혔다.

수정:

- 검은 콘솔 배경을 제거하고 이미지 기반 미디어 카드로 변경했다.
- 메시지를 ElevenLabs처럼 rounded bubble로 바꿨다.
- user bubble은 outlined/transparent, Harper bubble은 white solid로 분리했다.
- 마지막 상태는 이전 피드백대로 입력 중인 UI로 유지했다.
- 첫 패스에서 배경이 인물처럼 보여 산만했기 때문에, 최종 패스에서 비인물 배경 이미지로 교체했다.

현재 평가:

- 채팅 카드 구조는 ElevenLabs에 가까워졌다.
- 아직 ElevenLabs처럼 완전히 추상적인 grain material은 아니고, 기존 이미지 자산을 쓰기 때문에 배경 완성도는 낮다.
- 다음 개선이 가능하다면 전용 추상/제품 배경 이미지를 제작하는 것이 가장 크다.

## 2026-06-08 상세 재검수 패스

비교 캡처:

- ElevenLabs agents section: `output/playwright/final-ui-detail-pass/elevenlabs-agents-before.png`
- Harper workflow before: `output/playwright/final-ui-detail-pass/index2-workflow-before.png`
- Harper opportunities before: `output/playwright/final-ui-detail-pass/index2-opportunities-before.png`

ElevenLabs와 다시 비교해 확인한 문제:

- Harper workflow의 3개 제품 패널이 서로 다른 폭이라 한 제품 모듈이 아니라 임의 배치처럼 보였다.
- 채팅 배경 설명 캡션이 커서 실제 대화보다 랜딩 장식처럼 읽혔다.
- 이메일 두 개가 narrow glass card처럼 보여 실제 소개 메일보다 장식 목업처럼 보였다.
- opportunity 섹션의 선택된 행만 하얗게 떠 있어 과한 카드 하이라이트처럼 읽혔다.
- 오른쪽 상세 영역의 제목 크기와 하단 3개 태그의 면적이 정보 밀도에 비해 컸다.

이번 패스에서 적용할 기준:

- Product flow의 세 칸은 같은 폭으로 둔다.
- 채팅은 작은 버블과 마지막 입력 상태만 남긴다.
- 이메일은 두 개의 실제 메일 메시지로 보이게 하고 blur/glass를 쓰지 않는다.
- Opportunity는 선택 카드가 아니라 같은 높이의 행 리스트로 보여준다.
- 하단 3개 조건은 같은 폭, 같은 높이의 평평한 셀로 둔다.

최종 확인 캡처:

- Harper workflow final: `output/playwright/final-ui-detail-pass/index2-workflow-after-05.png`
- Harper opportunities final: `output/playwright/final-ui-detail-pass/index2-opportunities-after-02.png`
- Harper mobile email final: `output/playwright/final-ui-detail-pass/index2-email-mobile-after-05.png`

이번 패스 후 평가:

- 세 개 제품 패널의 폭이 같아져 임의 배치 느낌이 줄었다.
- 마지막 입력 UI는 채팅 끝에만 남아 대화 흐름이 자연스럽다.
- 이메일은 반투명 glass 카드가 아니라 두 개의 실제 메일 row로 보인다.
- 모바일에서 이메일 제목은 줄바꿈되고, 메시지는 회색 placeholder 없이 바로 보인다.

## ElevenLabs에서 참고할 점

확인 기준:

- ElevenLabs 홈페이지: https://elevenlabs.io/
- Playwright 캡처: `.playwright-cli/page-2026-06-07T17-51-20-171Z.png`
- 재확인 캡처: `.playwright-cli/page-2026-06-07T18-02-44-556Z.png`
- 텍스트 구조 확인: H1 `Bringing technology to life`, 제품군 탭, 고객/기업 리스트, 플랫폼별 섹션, 연구/안전/업데이트 흐름.

관찰:

- 첫 화면의 H1은 짧고 직접적이다.
- 설명 문단은 길게 설득하지 않고 제품 범위를 압축한다.
- 내비게이션은 작고 조용하다.
- 화면의 중심은 실제 제품/콘텐츠 모듈이다.
- 고객/기업 리스트는 큰 홍보 문구보다 이름 목록으로 신뢰를 만든다.
- 섹션은 제품군, 기능, 고객 사례, 연구, 안전처럼 정보 구조가 명확하다.
- 과한 장식보다 제품 UI와 실제 사례가 페이지의 밀도를 만든다.

Harper에 적용:

- 히어로는 카피보다 실제 Harper 화면이 더 큰 증거가 되어야 한다.
- “좋은 기회는 놓치지 않게” 이후 바로 제품 스크린샷을 보여준다.
- 별도의 긴 애니메이션 데모보다 정적인 실제 화면과 짧은 설명을 우선한다.
- 섹션은 `기회 유형`, `정보 공개 제어`, `시작 단계`, `사용 상황`, `FAQ`처럼 판단에 필요한 정보로 구성한다.

## Cursor와 Alt 재확인 후 수정한 기준

확인 기준:

- Cursor 홈페이지: https://cursor.com/
- Cursor 캡처: `.playwright-cli/page-2026-06-07T18-03-11-153Z.png`
- Alt 홈페이지: https://www.altalt.io/en/
- Alt 캡처: `.playwright-cli/page-2026-06-07T18-03-29-014Z.png`

추가 관찰:

- Cursor와 Alt 모두 첫 화면은 “짧은 선언 + CTA + 큰 제품 미디어”다.
- 제품 미디어는 작게 보조하지 않고, 첫 화면의 주인공처럼 넓게 배치한다.
- 로고/신뢰 섹션은 작고 조용하다.
- 설명 섹션도 텍스트만 나열하지 않고, 실제 제품 상태를 크게 보여준다.
- 블러 애니메이션으로 텍스트가 흐려지는 느낌은 레퍼런스와 맞지 않는다.

이번 수정에서 바로 반영한 점:

- hero를 ElevenLabs처럼 좌측 선언, 우측 설명, CTA 아래 실제 Harper 스크린샷 구조로 바꿨다.
- header에 작은 product nav를 추가해 Cursor/ElevenLabs처럼 조용한 상단 구조로 맞췄다.
- workflow는 문서형 행이 아니라 제품 패널이 중심이 되도록 비례를 바꿨다.
- `Reveal`의 blur를 0으로 낮춰 캡처와 실제 화면에서 흐릿한 AI 쇼케이스 느낌을 제거했다.
- `수락하면 바로 소개합니다` 오른쪽에는 휴대폰 목업이 아니라 메일 두 개를 배치한다.

## AI스럽게 보이는 패턴

인터넷 리서치 기준:

- designdotmd는 최근 AI 랜딩의 반복 패턴으로 보라/파랑 그라데이션, glass 박스, pill 버튼 shadow, 3개 기능 박스 반복을 지적한다. https://freedesignmd.com/blog/why-ai-landing-page-looks-generic
- Shuffle은 AI 생성 웹사이트가 모호한 프롬프트에서 hero, 3 feature blocks, testimonials, pricing, CTA 구조로 수렴한다고 설명한다. https://shuffle.dev/blog/2026/01/why-do-most-ai-generated-websites-look-the-same/
- Weabers는 추상 3D 일러스트, 회전 텍스트, heavy blur glass, dated gradient를 낡은 SaaS/AI 클리셰로 정리한다. https://www.weabers.com/blog/web-design-trends-ai-saas-2026

Harper에서 금지:

- “AI”, “agent”, “완벽한”, “압도적인” 중심 카피.
- shadow로 띄운 반복 박스.
- 그라데이션 배경, radial glow, mesh, blur 장식.
- 휴대폰 프레임, 3D 디바이스 목업, 가짜 앱 데모를 레퍼런스 오해로 넣는 것.
- 의미 없는 상태 배지, live indicator, fake precision score.
- 중첩 박스 구조.
- 검증되지 않은 후기와 파트너십 암시.

## 이번 수정의 정보 구조

1. Hero
   타이틀, 설명, CTA, 실제 스크린샷.

2. Social proof
   큰 문구나 상하 라인 없이 작은 로고와 짧은 설명.

3. Product flow
   대화로 기준 정리, 기회 브리핑, 수락한 기회만 연결.
   채팅 예시는 마지막 입력 영역만 진행 상태로 보이게 한다.

4. Opportunity modes
   공개 포지션, Harper 연결 제안, 회사 직접 요청의 차이를 행 단위로 설명.

5. Privacy control
   회사에 공유되는 정보는 사용자가 정한다는 점을 별도 섹션으로 둔다.

6. Start steps
   LinkedIn/이력서, 조건 확인, 프로필 정리, 브리핑 수신.

7. Use cases
   지금 구직 중이 아닌 사람, 글로벌 AI 기회, 비자/리모트/보상 조건, 파트타임/자문 기회.

8. FAQ
   정보 공유, 비용, 추천 시점, 헤드헌터와의 차이.

## 20회 화면 검수 체크리스트

각 검수는 데스크톱 또는 모바일 캡처를 보고 아래 항목을 확인한다.

1. 작은 선행 라벨이 남아 있지 않은가.
2. shadow 클래스가 남아 있지 않은가.
3. 그라데이션 배경이나 glow가 남아 있지 않은가.
4. hero 스크린샷이 타이틀/설명/CTA 아래에 있는가.
5. hero 첫 화면에서 다음 섹션 힌트가 보이는가.
6. 채팅 예시의 진행 상태가 마지막 입력 UI에만 있는가.
7. `Harper가 대신 준비하는 단계` 문구가 제거됐는가.
8. 소셜 섹션 폰트가 작고 조용한가.
9. 소셜 섹션에 상하 라인이 없는가.
10. 반복 정보가 카드식 shadow 박스로 보이지 않는가.
11. 섹션 제목이 과하게 크지 않은가.
12. 모바일에서 텍스트가 버튼/이미지와 겹치지 않는가.
13. CTA가 과장 없이 제품 행동을 말하는가.
14. 개인정보 공개 제어가 중간에서 분명히 보이는가.
15. 기회 유형 섹션이 빠지지 않았는가.
16. 시작 단계 섹션이 빠지지 않았는가.
17. 사용 상황 섹션이 빠지지 않았는가.
18. FAQ가 빠지지 않았는가.
19. 전체가 베이지 단일 톤으로 흐려지지 않는가.
20. ElevenLabs처럼 제품/정보 중심으로 읽히는가.
