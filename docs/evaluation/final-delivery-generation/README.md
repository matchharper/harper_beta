# Final-delivery generation evaluation

## 목적

같은 완료 discovery run 입력을 여러 모델에 전달해 최종 추천 메일의 사실성, 개인화, trade-off 설명, 상태·다음 행동 표현과 비용·지연을 비교한다.

## Canonical assets

- 실행 계약과 프리셋: [harper_worker final-delivery 평가](../../../../harper_worker/llm_evals/final_delivery/README.md)
- notebook/helper: `harper_worker/llm_evals/final_delivery/`
- 동결 입력과 raw output: `harper_worker/llm_evals/final_delivery/results/`의 gitignored local-only 파일

## 고정과 변경

- 한 번 동결한 case input은 모델 간에 동일하게 유지한다.
- 모델/provider/reasoning 변경은 새 run이다. Prompt, role reader, input builder나 finalization 로직 변경은 별도의 dataset/prompt revision으로 기록한다.
- Aggregate 비용·latency뿐 아니라 사실 왜곡, internal/external 상태 혼동, 후보 수락과 Harper 최종 확인·회사 연결 순서 오류를 사례별로 검토한다.

## 안전과 한계

평가는 DB write, 추천 저장, discovery run 생성, 메일 발송을 하지 않는다. 실제 사용자·role·메일 내용은 local-only다. 완료 run에서 현재 live context를 재구성하므로 과거 실행 당시의 완전한 causal replay는 아니며, 한국어 품질은 충분한 한국어 표본 없이 일반화하지 않는다.

