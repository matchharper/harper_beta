# 보관한 Career 프롬프트

코드가 읽지 않는 옛 프롬프트와 설명이다. 다시 쓰려면 해당 본문을 지금 구조(main.md나 쓰는 쪽의 `.md`)로 옮기고 import한다.

| 파일 | 내용 | 마지막 위치 |
| --- | --- | --- |
| [career-main-legacy.md](./career-main-legacy.md) | 옛 일반 채팅 main prompt(`CAREER_MAIN_PROMPT`). 2026-11-02 본문이 `mainPrompt2.ts`로 바뀐 뒤 어디서도 쓰지 않았다. | `mainPrompts.ts` |
| [refresh-extraction.md](./refresh-extraction.md) | 비어 있는 insight key만 다시 뽑던 추출 지침(`buildCareerRefreshExtractionPrompt`). `{key_list}`, `{output_language}` 자리표시자. | `cases/refreshExtractionPrompt.ts` |
| [resume-policy.md](./resume-policy.md) | `upsert_document`·`ready_for_role`용 이력서 지침(`buildResumePolicy`). 지금은 resume handbook이 맡는다. `{resume_editorial_contract}`는 아직 쓰는 `RESUME_EDITORIAL_CONTRACT`다. | `resumePolicy.ts` |
| [conditional-prompts.md](./conditional-prompts.md) | 2026-10-31 정리 전의 조건부 프롬프트 경로 설명. | `conditional-prompts.md` |
