import { MuteButton } from "@/components/ui/button";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useCareerT } from "@/i18n/useCareerT";
import type {
  StructuredResult,
  Evidence,
} from "@/lib/career/simulation/structured";

function EvidenceList({ items }: { items: Evidence[] }) {
  const t = useCareerT();
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id}>
          <span className="text-xs text-neutral-muted">
            {e.id} ·{" "}
            {e.source === "resume"
              ? t("career.simulation.resumeSource", "이력서")
              : t("career.simulation.profileSource", "프로필")}{" "}
            · {e.location}
          </span>
          <p className="whitespace-pre-wrap break-words">{e.quote}</p>
        </li>
      ))}
    </ul>
  );
}

export function SimulationStructuredResult({
  data,
  requirements = [],
  diagnoses = [],
  onStartAction,
  canStartAction,
  hideActions = false,
}: {
  data: StructuredResult;
  hideActions?: boolean;
  onStartAction?: (actionId: string) => void | Promise<void>;
  canStartAction?: (actionId: string) => boolean;
  requirements?: Extract<StructuredResult, { kind: "role" }>["requirements"];
  diagnoses?: Extract<StructuredResult, { kind: "comparison" }>["diagnoses"];
}) {
  const t = useCareerT();
  const th = "p-2 text-left align-top font-medium";
  const td = "p-2 align-top whitespace-pre-wrap break-words";
  if (data.kind === "role")
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr>
              <th className={th}>
                {t("career.simulation.requirement", "요구사항")}
              </th>
              <th className={th}>
                {t("career.simulation.importance", "중요도")}
              </th>
              <th className={th}>
                {t("career.simulation.basis", "판단 근거")}
              </th>
              <th className={th}>
                {t("career.simulation.evidenceNeeded", "필요한 입증 자료")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.requirements.map((r) => (
              <tr key={r.id} className="border-t border-neutral-1000-a05">
                <td className={td}>
                  {r.id} · {r.requirement}
                </td>
                <td className={td}>
                  {r.importance} ·{" "}
                  {r.importance === 3
                    ? t("career.simulation.decisive", "결정적 요건")
                    : r.importance === 2
                      ? t("career.simulation.major", "주요 역량")
                      : t("career.simulation.bonus", "추가 강점")}
                  <p className="mt-1 text-xs text-neutral-muted">
                    {r.mandatory
                      ? t(
                          "career.simulation.mandatory",
                          "공고에 명시된 필수 조건"
                        )
                      : t(
                          "career.simulation.notMandatory",
                          "명시적 필수 조건 아님"
                        )}
                  </p>
                </td>
                <td className={td}>
                  {r.rationale}
                  <p className="mt-2 text-neutral-muted">{r.source}</p>
                </td>
                <td className={td}>{r.evidenceNeeded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const matches = {
    strong: t("career.simulation.strong", "강하게 충족"),
    met: t("career.simulation.met", "충족"),
    partial: t("career.simulation.partial", "부분 충족"),
    unknown: t("career.simulation.unknown", "정보 부족"),
    unmet: t("career.simulation.unmet", "확인된 미충족"),
  };
  const presentations = {
    clear: t("career.simulation.clear", "충분히 드러남"),
    weak: t("career.simulation.weak", "약하게 드러남"),
    absent: t("career.simulation.absent", "이력서에 빠져 있음"),
    overstated: t("career.simulation.overstated", "실제 근거보다 과장됨"),
    unavailable: t("career.simulation.unavailable", "이력서 표현 평가 불가"),
  };
  if (data.kind === "comparison") {
    const hasEvidence = data.diagnoses.some((d) => d.evidence.length > 0);
    const hasQuestions = data.diagnoses.some((d) => d.questions.length > 0);
    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr>
                <th className={th}>
                  {t("career.simulation.requirement", "요구사항")}
                </th>
                <th className={th}>
                  {t("career.simulation.diagnosis", "진단·이력서 반영 상태")}
                </th>
                {hasEvidence && <th className={th}>
                  {t("career.simulation.evidence", "근거·출처")}
                </th>}
                {hasQuestions && <th className={th}>
                  {t("career.simulation.questions", "확인할 사항")}
                </th>}
              </tr>
            </thead>
            <tbody>
              {data.diagnoses.map((d) => (
                <tr
                  key={d.requirementId}
                  className="border-t border-neutral-1000-a05"
                >
                  <td className={td}>
                    {d.requirementId}
                    <p className="mt-1 text-neutral-muted">{d.target}</p>
                  </td>
                  <td className={td}>
                    <p className="font-medium">{matches[d.match]}</p>
                    <p className="text-neutral-muted">
                      {presentations[d.presentation]}
                    </p>
                    <p className="mt-2">{d.rationale}</p>
                  </td>
                  {hasEvidence && <td className={td}>
                    <EvidenceList items={d.evidence} />
                  </td>}
                  {hasQuestions && <td className={td}>{d.questions.join("\n")}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.observations.map((o) => (
          <div key={o.id} className="space-y-2 text-sm">
            <p className="font-medium">{o.target}</p>
            <p>{o.finding}</p>
            <EvidenceList items={o.evidence} />
          </div>
        ))}
      </div>
    );
  }
  const verdictLabels = {
    strong: t("career.simulation.fitStrong", "강한 핏"),
    moderate: t("career.simulation.fitModerate", "중간"),
    weak: t("career.simulation.fitWeak", "약한 핏"),
    stretch: t("career.simulation.fitStretch", "Stretch · 현실적으로 어려움"),
  };
  const categories = {
    materials: t("career.simulation.actionMaterials", "추가 제출 자료"),
    content: t("career.simulation.actionContent", "경험·내용 보강"),
    wording: t("career.simulation.actionWording", "문구·강조 개선"),
    structure: t("career.simulation.actionStructure", "구성·분량 조정"),
    consistency: t("career.simulation.actionConsistency", "표현·일관성 정리"),
  };
  return (
    <section
      className="min-w-0 space-y-3"
      aria-label={t("career.simulation.actions", "추천 액션")}
    >
      {data.fitVerdict && (
        <div
          className="space-y-2 rounded-lg bg-bg-weak p-3"
          data-fit-verdict={data.fitVerdict.level}
        >
          <p className="text-xs text-neutral-muted">
            {t("career.simulation.fitVerdict", "종합 적합도")}
          </p>
          <Badge
            variant="faded"
            tone={
              data.fitVerdict.level === "strong"
                ? "positive"
                : data.fitVerdict.level === "stretch"
                  ? "warning"
                  : "neutral"
            }
          >
            {verdictLabels[data.fitVerdict.level]}
          </Badge>
          <p className="text-sm">{data.fitVerdict.reason}</p>
        </div>
      )}
      {!hideActions && <>
      <h3 className="font-medium">
        {t("career.simulation.actions", "추천 액션")}
      </h3>
      {data.actions.length === 0 ? (
        <p className="text-sm text-neutral-muted">{data.emptyReason}</p>
      ) : (
        <div
          className="flex min-w-0 gap-3 overflow-x-auto pb-3 snap-x snap-proximity"
          tabIndex={0}
          aria-label={t("career.simulation.actions", "추천 액션")}
        >
          {data.actions.map((a, index) => (
            <Card
              key={a.id}
              className="w-[min(85vw,360px)] max-w-full shrink-0 snap-start space-y-3 break-words p-4 text-sm"
              data-simulation-action={a.id}
            >
              <p className="text-xs text-neutral-muted">
                {categories[a.category]}
              </p>
              <h4 className="font-medium">
                {index + 1}. {a.title}
              </h4>
              <p className="text-neutral-muted">
                {t("career.simulation.target", "대상")}: {a.target}
              </p>
              {(a.originalText || a.suggestedText) && (
                <div className="space-y-3 border-y border-neutral-1000-a05 py-3">
                  {a.originalText && (
                    <div>
                      <p className="mb-1 text-xs text-neutral-muted">
                        {t("career.simulation.originalText", "원문")}
                      </p>
                      <del className="whitespace-pre-wrap text-critical">
                        {a.originalText}
                      </del>
                    </div>
                  )}
                  {a.suggestedText && (
                    <div>
                      <p className="mb-1 text-xs text-neutral-muted">
                        {a.needsConfirmation
                          ? t(
                              "career.simulation.conditionalExample",
                              "경험 확인 후 사용할 예시"
                            )
                          : t(
                              "career.simulation.suggestedExample",
                              "제안 문구 · 예시"
                            )}
                      </p>
                      <p className="whitespace-pre-wrap text-positive">
                        {a.suggestedText}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <p className="whitespace-pre-wrap">{a.proposal}</p>
              <ResponsiveLightTooltip
                side="top"
                trigger={<Badge variant="faded">rational</Badge>}
                contentClassName="max-w-[min(360px,calc(100vw-32px))]"
              >
                <p>{a.reason}</p>
                {a.requirementIds.length > 0 && (
                  <p className="mt-2 text-xs">
                    {t("career.simulation.requirement", "요구사항")}:{" "}
                    {a.requirementIds.join(", ")}
                  </p>
                )}
              </ResponsiveLightTooltip>
              {onStartAction && (
                <MuteButton
                  disabled={!canStartAction?.(a.id)}
                  onClick={() => void onStartAction(a.id)}
                >
                  {t("career.simulation.proceed", "진행하기")}
                </MuteButton>
              )}
            </Card>
          ))}
        </div>
      )}
      </>}
      {data.actionCoverage && (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-muted">
            {data.comparison ? t("career.prep.coverageDebug", "요건·준비 항목 연결 · 디버깅") : t("career.simulation.coverageDebug", "2→3단계 액션 연결 · 디버깅")}
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr>
                  <th className={th}>
                    {t("career.simulation.requirement", "요구사항")}
                  </th>
                  <th className={th}>
                    {t("career.simulation.diagnosis", "진단·이력서 반영 상태")}
                  </th>
                  <th className={th}>
                    {t(
                      "career.simulation.coverageDecision",
                      "3단계 액션·판단 이유"
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.actionCoverage.map((row) => {
                  const requirement = requirements.find(
                    (r) => r.id === row.requirementId
                  );
                  const diagnosis = diagnoses.find(
                    (d) => d.requirementId === row.requirementId
                  );
                  return (
                    <tr
                      key={row.requirementId}
                      className="border-t border-neutral-1000-a05"
                    >
                      <td className={td}>
                        {row.requirementId} · {requirement?.requirement}
                      </td>
                      <td className={td}>
                        {diagnosis && (
                          <>
                            <p>
                              {matches[diagnosis.match]} ·{" "}
                              {presentations[diagnosis.presentation]}
                            </p>
                            <p className="mt-1 text-neutral-muted">
                              {diagnosis.rationale}
                            </p>
                          </>
                        )}
                      </td>
                      <td className={td}>
                        <p>
                          {row.disposition === "action"
                            ? row.actionIds
                                .map(
                                  (id) =>
                                    `${id} · ${data.actions.find((a) => a.id === id)?.title ?? ""}`
                                )
                                .join(" / ")
                            : row.disposition === "deferred"
                              ? t(
                                  "career.simulation.coverageDeferred",
                                  "우선순위상 보류"
                                )
                              : t(
                                  "career.simulation.coverageNone",
                                  "액션 없음"
                                )}
                        </p>
                        <p className="mt-1 text-neutral-muted">{row.reason}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
