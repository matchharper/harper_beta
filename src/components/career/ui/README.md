# Career UI Guide

Career 화면을 수정할 때는 이 문서를 먼저 확인한다. 같은 역할의 UI를 새로 만들기보다 아래 컴포넌트를 우선 사용한다.

## Buttons

### `CareerActionButton`

- 위치: `src/components/career/ui/CareerActionButton.tsx`
- 사용처: Career 화면의 기본 버튼. 새 버튼을 만들거나 `Button`을 직접 쓰기 전에 이 컴포넌트를 먼저 확인한다.
- 주요 옵션:
  - `actionVariant="primary"`: 주요 CTA
  - `actionVariant="secondary"`: 보조 액션, 툴바 버튼, 작은 모달 액션
  - `actionVariant="icon"`: 아이콘 버튼
  - `buttonRadius="pill"`: 기본 버튼 형태
  - `buttonRadius="rounded"`: 아이콘 버튼 또는 작은 선택 UI

```tsx
<CareerActionButton actionVariant="secondary" onClick={onSuggestUpdate}>
  제안하기
</CareerActionButton>
```

### `CareerPrimaryButton` / `CareerSecondaryButton`

- 위치: `src/components/career/ui/CareerPrimitives.tsx`
- 사용처: 기존 profile, history, chat form footer에서 쓰는 단순 버튼.
- 새 toolbar, modal header, compact action에는 `CareerActionButton`을 우선 사용한다.
- 이미 이 버튼들로 통일된 파일 안에서는 같은 버튼을 유지한다.

### `CareerInteractiveCard`

- 위치: `src/components/career/ui/CareerActionButton.tsx`
- 사용처: 카드처럼 보이는 클릭 영역이 필요할 때.
- 주의: 단순 리스트, 문서형 모달, 업데이트 노트처럼 card 디자인을 피해야 하는 화면에는 사용하지 않는다.

### `CareerChoiceCard`

- 위치: `src/components/career/ui/CareerActionButton.tsx`
- 사용처: 선택 가능한 옵션 카드.
- `selected`로 선택 상태를 통일한다.

## Form Controls

### `CareerField`

- 위치: `src/components/career/ui/CareerPrimitives.tsx`
- 사용처: label, hint, control이 함께 있는 Career form row.

### `CareerTextInput`

- 위치: `src/components/career/ui/CareerPrimitives.tsx`
- 사용처: Career 화면의 텍스트 입력.
- 내부에서 beige input 스타일을 사용한다.

### `CareerTextarea`

- 위치: `src/components/career/ui/CareerPrimitives.tsx`
- 사용처: Career 화면의 긴 텍스트 입력.
- 모달이 열리자마자 입력을 받아야 하는 경우 `ref`로 focus를 연결한다.

### `CareerLinkInputRow`

- 위치: `src/components/career/ui/CareerLinkInputRow.tsx`
- 사용처: 라벨과 링크 input이 한 줄로 배치되는 resume/profile 링크 편집 UI.

### `CareerToggleButton`

- 위치: `src/components/career/ui/CareerPrimitives.tsx`
- 사용처: 여러 선택지를 토글 버튼 묶음으로 보여줄 때.
- 단순 yes/no나 segmented choice가 아니라 카드형 선택이면 `CareerChoiceCard`를 쓴다.

## Text

### `Text`

- 위치: `src/components/ui/typography.tsx`
- 사용처: 공통 타이포그래피.
- `className`으로 매번 `text-*`, `leading-*`, `font-*`를 새로 만들지 말고 `type` 값을 먼저 고른다.
- 현재 권장 타입:
  - `head1`: 화면의 가장 큰 제목
  - `head2`: 모달/섹션 제목
  - `title`: 작은 섹션 제목, 리스트 아이템 제목
  - `body`: 일반 본문
  - `desc`: 설명 본문
  - `subtle`: 보조 정보
  - `caption`: 날짜, 짧은 메타 정보
  - `eyebrow`: 짧은 uppercase 라벨

```tsx
<Text as="h2" type="head2">
  Harper 업데이트 노트
</Text>
```

## Pills

### `Pill` / `PillLink`

- 위치: `src/components/ui/pill.tsx`
- 사용처: 작고 조용한 상태 표시, 외부 링크, 보조 링크 묶음.
- Career 화면에서도 작은 링크 pill이 필요하면 사용한다. Career 전용 pill 스타일이 더 필요해질 때만 `career/ui`에서 래핑한다.

```tsx
<PillLink href="https://matchharper.com">Website</PillLink>
```

## Rich Text

### `CareerRichText`

- 위치: `src/components/career/ui/CareerRichText.tsx`
- 사용처: markdown/html이 섞여 들어올 수 있는 career 본문 렌더링.
- `<<강조>>` 패턴, URL 라벨링, source link 렌더링 같은 career 전용 규칙이 들어있다.
- 단순한 정적 텍스트에는 쓰지 말고 `Text`를 쓴다.

## Layout Helpers

### `CareerInlinePanel`

- 위치: `src/components/career/ui/CareerPrimitives.tsx`
- 사용처: form 안의 작은 묶음 영역.
- 주의: 업데이트 노트, 문서형 모달처럼 card 디자인을 피해야 하는 화면에는 쓰지 않는다.

### `CareerProgressBar`

- 위치: `src/components/career/ui/CareerPrimitives.tsx`
- 사용처: Career 진행률 표시.

## When To Use Global UI

- `src/components/ui/button.tsx`의 `Button`은 shadcn 기반의 전역 버튼이다.
- Career 화면에서는 `CareerActionButton`, `CareerPrimaryButton`, `CareerSecondaryButton`을 먼저 사용한다.
- `Card`나 카드형 surface는 반복 아이템이나 명확한 카드 UI에만 쓴다. 문서형 모달, 업데이트 노트, 설정 설명 영역은 보통 border/divider 기반으로 단순하게 유지한다.
