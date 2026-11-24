# Career 답변 끝맺음

2026-11-23. 운영 Career 대화에서 Harper가 결과만 보고하거나 "이해했어요"로 끝나면, 사용자가 "그래서 다음은?"이라고 되묻는 일이 있었다. 되물으면 Harper는 바로 구체적인 다음 일을 내놓았다. 다음 일을 알면서도 말하지 않은 것이다. 이 평가는 답변 끝에서 사용자가 이어 갈 길이 보이는지 확인한다. 함께 부작용도 본다. 바로 할 수 있는 일을 허락받으려 묻는지, 단순 질문이나 마무리 인사에 쓸데없는 질문·제안을 붙이는지, 외부 제출을 승인 없이 하는지다.

- **평가 단위:** 합성 대화 하나의 전체 provider/tool loop와 마지막 답변.
- **Frozen input / gold:** [cases-v1.json](cases-v1.json), [gold-v1.json](gold-v1.json). 이어 가기 사례 6개(c1~c6)와 부작용 점검 사례 5개(g1~g5)로 이루어진다. 운영 대화의 유형을 보고 Claude가 새로 썼고, 이름·회사·숫자는 지어냈다. 운영 원문은 복사하지 않았다. gold는 모델 입력에 들어가지 않는다.
- **Runner:** [scripts/evalCareerReplyContinuation.ts](../../../scripts/evalCareerReplyContinuation.ts). 제품의 `resolveCareerChatTools`, `CareerCapabilityRuntime`(progressive, loader 허용), `runCareerChatAssistant`와 기본 text chat 모델(`resolveCareerTextChatModel`, 현재 GPT-6.1 Terra high)을 쓴다. `before`는 provider 요청에서 main prompt의 `## Ending a reply` 절만 지운다. 나머지는 현재 코드와 같다.
- **도구:** 실제 도구 schema를 주되 실행하지 않는다. 사례별 `toolResults` 문장을 돌려준다. 배열이면 호출 순서대로 쓴다. 사례에 없는 도구는 runner의 기본값을 받는다. 읽기 도구는 "맥락 밖 기록 없음", 외부 실행 도구는 "보내거나 제출하지 않음", 나머지 저장은 성공이다.
- **판정:** 사람이 마지막 답변과 도구 호출을 읽는다. 문구·분량·형식은 채점하지 않는다. 런타임 키워드 검열이나 심사 LLM을 두지 않는다.
- **개인정보·네트워크:** 합성 데이터만 쓴다. 네트워크는 OpenAI/Anthropic만 허용한다. `runs/`는 git에서 빠지며 디렉터리 0700, 파일 0600이다.
- **한계:** 도구 결과가 고정 문장이라 실제 검색·문서와 다르다. 검색 결과에 공고 원문 링크가 없어 "원문을 확인하지 못했다"는 문장이 자주 나온다. 이것은 fixture가 만든 것이다. 사례마다 2~3회라 비율을 운영 성공률로 읽지 않는다. professional 대화 버전, 웹 채팅만 돌렸다. 친근한 버전과 예약 실행 메일은 확인하지 않았다.

```sh
TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerReplyContinuation.ts --repeat=2
TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerReplyContinuation.ts --variants=after --case=c1-cv-update-report,g5-external-approval --repeat=3
```

실행마다 `runs/<시각>/review.md`에 사례별 도구 호출과 마지막 답변이 모인다. 전후 비교와 판단은 [2026-11-23 보고](reports/2026-11-23-ending-a-reply.md)에 있다.
