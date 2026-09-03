# Internal/external fit model benchmark

## 목적

Internal prefilter와 external scoring의 production prompt·입력 builder·normalizer를 그대로 사용해 모델/provider/reasoning 교체의 품질, 비용, 지연, 출력 안정성을 비교한다. 새 A/B/C internal-fit 판단은 별도 [internal-fit-abc](../internal-fit-abc/README.md) 태스크다.

## Canonical assets

- 실행 계약과 명령: [harper_worker model benchmark](../../../../harper_worker/llm_evals/model_benchmark/README.md)
- runner: `harper_worker/llm_evals/model_benchmark/llm_model_benchmark.py`
- fixture와 raw result: `harper_worker/llm_evals/model_benchmark/results/<suite>/`의 gitignored local-only 파일

Runner를 이 폴더로 복사하지 않는다. 실제 worker import 경로와 함께 움직이는 worker 버전이 canonical하다.

## 고정과 변경

- 같은 모델 비교에서는 suite의 fixture와 human gold를 다시 capture하지 않는다.
- 모델/provider/reasoning/routing만 바꾸면 같은 suite에 새 run으로 남긴다.
- retrieval, prompt, input builder, gold 또는 표본이 달라지면 새 suite/version을 만든다.
- Internal은 label accuracy와 second-stage recall, external은 human gold 기반 score/rank·precision/recall을 주 지표로 본다. JSON/role coverage와 DeepSeek distance만으로 품질을 주장하지 않는다.

## 안전과 한계

Production capture와 실행은 DB write, recommendation 저장, discovery run 생성, 발송을 하지 않는다. 실제 후보자와 role 원문이 포함된 fixture·manual review·raw result는 local-only다. External score gold가 없는 suite는 모델 대체의 품질 결론이 아니라 동작·비용·drift 진단만 제공한다.

