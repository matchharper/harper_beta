# Career Design Guidelines

이 문서는 `/career` 관련 화면을 구현할 때 계속 기준으로 삼는 디자인 메모다.
새 지침을 받으면 이 문서에 먼저 추가하고, 그 다음 구현한다.

## Current Rules

1. 유저에게 보여줄 화면에는 내부 계획이나 시스템 설명을 적지 않는다.
예: "이 영역은 이후 매칭된 회사와 진행 내역을 보여주는 공간으로 사용할 예정입니다." 같은 문구는 금지.

2. 링크 입력 UI는 [`onboarding2.tsx`](/Users/gimhojin/Desktop/harper/harper_beta/src/pages/onboarding2.tsx)의 `BeigeLinkInput` 스타일을 기준으로 맞춘다.
이 규칙은 이름 입력이 아니라 LinkedIn, GitHub, Scholar, personal website, resume link 같은 URL 입력에 적용한다.

3. rounded는 과하게 쓰지 않는다.
필요한 경우에도 작고 절제된 반경만 쓴다.

4. 메인 화면과 모달은 같은 디자인 언어를 유지한다.
색, 테두리, 간격, 버튼 톤이 따로 놀지 않게 맞춘다.

5. placeholder나 empty state도 사용자 관점의 문장으로 쓴다.
내부 구현 상태, 향후 계획, 관리자 관점 설명은 넣지 않는다.

6. 설명 문장은 꼭 필요한 경우에만 넣는다.
섹션 제목 아래에 구현 설명, 데이터 출처 설명, 사용법 설명을 습관적으로 붙이지 않는다.

7. `/career`의 전체 톤은 [`index.tsx`](/Users/gimhojin/Desktop/harper/harper_beta/src/pages/index.tsx)와 [`network.tsx`](/Users/gimhojin/Desktop/harper/harper_beta/src/pages/ops/network.tsx)에서 쓰는 밀도와 균형을 참고한다.
과하게 장식하기보다 단정하고 밀도 있게 맞춘다.

8. Tailwind 색상 opacity는 항상 5단위만 쓴다.
예: `text-white/20`, `border-beige900/15`, `bg-white/35`.
`/24`, `/34`, `/72` 같은 값은 쓰지 않는다.

9. 전체 레이아웃은 modern application workspace처럼 보여야 한다.
왼쪽에는 현재 상태와 이동 구조가 보이는 floating panel, 오른쪽에는 넓고 정돈된 form canvas를 둔다.

10. 참고 이미지를 베끼지 않되, 정보 밀도와 위계는 참고한다.
큰 제목, 분명한 section 구분, 넓은 입력 영역, 절제된 border 중심의 UI를 사용한다.

11. 주 색상은 beige 계열로 유지하되, 채도가 낮은 warm neutral을 기본으로 쓴다.
강조는 진한 beige/brown으로 처리하고, 차가운 accent 색은 쓰지 않는다.

12. 사용자가 [`old.tsx`](/Users/gimhojin/Desktop/harper/harper_beta/src/pages/career/old.tsx)를 기준으로 지정하면, 그 파일의 spacing, type scale, visual density를 우선한다.
왼쪽 탭 / 오른쪽 화면 구조는 유지하되, 과장된 canvas, 큰 헤드라인, 넓은 여백보다 기존 career의 촘촘하고 실무적인 화면 밀도를 따른다.

13. 프로필 화면 안에서는 상단에 content tabs를 둔다.
탭은 스크롤 이동용 anchor가 아니라, 선택된 탭의 내용만 보이게 전환하는 방식으로 구현한다. 탭 디자인은 과장된 pill이 아니라 얇은 underline 기반의 단정한 horizontal nav를 우선한다.

14. `/career`에서는 uppercase와 tracking을 조합한 라벨을 쓰지 않는다.
예: all caps 섹션 태그, 작은 영문 eyebrow에 자간을 강하게 벌리는 표현은 금지. 강조가 필요하면 weight, color, spacing으로 해결한다.
