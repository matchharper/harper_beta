# Demo Section Design Notes

검색일: 2026-05-13

## 참고한 내용

- Fountain Institute의 글은 vibe-coded UI를 "AI가 만든 평균적인 현대 UI"로 설명한다. 대표 신호는 과한 네온, 의미 없는 상태점, 제품 맥락과 상관없는 장식적 데이터, 결정되지 않은 시각 계층이다.
- designdotmd 글은 AI 랜딩 페이지가 비슷해지는 이유를 기본값 문제로 본다. 흰 카드, 보라 그라데이션, pill 버튼, 세 개짜리 카드 그리드 같은 조합이 반복된다는 지적이다.
- vibe coding 자체는 자연어로 AI에 코드를 생성하게 하는 방식이며, 결과물을 충분히 검토하지 않으면 품질과 유지보수 리스크가 커진다는 설명이 많다.

Sources:
- https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
- https://freedesignmd.com/blog/why-ai-landing-page-looks-generic
- https://en.wikipedia.org/wiki/Vibe_coding

## 이번 데모에 적용할 기준

- 보라/파랑 그라데이션, 유리 카드, 의미 없는 status dot은 쓰지 않는다.
- `rounded + 연한 bg + 연한 border + shadow` 조합을 반복하지 않는다. 정보 구분은 선, 여백, 타이포그래피로 먼저 해결한다.
- `uppercase + tracking` 조합은 브랜드/시스템 라벨처럼 꼭 필요한 곳이 아니면 쓰지 않는다.
- 말투는 짧게 쓴다. "압도적", "완벽히", "AI agent가 전부" 같은 표현은 줄인다.
- 추천 점수는 96% 같은 가짜 정밀도보다 "소개 가능", "비자 이력", "조건 맞음"처럼 행동 가능한 라벨로 쓴다.
- 기업 브리핑은 투자 뉴스 장식보다 후보자가 판단할 정보 순서로 정리한다: 왜 맞는지, 확인된 조건, 리스크, 다음 단계.
- 반경은 8~18px 선에서 제한하고, 그림자는 낮게 둔다. 카드가 아니라 업무 화면처럼 보이게 한다.
- 색은 기존 Harper의 베이지 톤을 유지하되, 잉크색과 muted green을 보조로 써서 한 가지 색조로만 보이지 않게 한다.

## 디자인 확인용 URL

- `/?demo=final#demo`로 열면 데모가 마지막 상태에서 멈춘다.
- 같은 용도로 `/?demoState=final#demo`도 지원한다.
