import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { gtmRequest } from "@/lib/gtm/client";
import { displayValue } from "@/lib/gtm/grid";
import type {
  GtmRelation,
  GtmRow,
  GtmQueryResult,
  GtmSource,
  GtmValue,
} from "@/lib/gtm/types";
import styles from "./GtmWorkspace.module.css";
export default function RelatedRecords({
  account,
  source,
  record,
  relations,
  sources,
  canWrite,
  onOpen,
}: {
  account: string;
  source: GtmSource;
  record: GtmRow;
  relations: GtmRelation[];
  sources: GtmSource[];
  canWrite: boolean;
  onOpen: (
    source: string,
    row: GtmRow | null,
    defaults?: Record<string, GtmValue>
  ) => void;
}) {
  const [selection, setSelection] = useState(0),
    [offset, setOffset] = useState(0);
  const relation = relations[selection];
  const rows = useQuery({
    queryKey: [
      "ops-gtm",
      account,
      "related",
      source.id,
      record.id,
      relation?.source,
      relation?.key,
      offset,
    ],
    queryFn: ({ signal }) =>
      gtmRequest<GtmQueryResult>(
        "related_records",
        {
          source: source.id,
          record_id: record.id,
          target_source: relation.source,
          key: relation.key,
          offset,
          limit: 30,
        },
        signal
      ),
    enabled: Boolean(relation),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const parents = (source.record_fields ?? source.fields).filter(
    (field) => field.reference && record[field.key]
  );
  return (
    <div className={styles.form}>
      {parents.length > 0 && (
        <div className={styles.row} style={{ flexWrap: "wrap" }}>
          {parents.map((field) => (
            <MuteButton
              key={field.key}
              onClick={() =>
                onOpen(field.reference!, { id: String(record[field.key]) })
              }
            >
              {sources.find((item) => item.id === field.reference)?.label ??
                field.label}{" "}
              열기
            </MuteButton>
          ))}
        </div>
      )}
      {relation ? (
        <>
          <div className={styles.row}>
            <select
              aria-label="연결 기록 종류"
              value={selection}
              onChange={(e) => {
                setSelection(Number(e.target.value));
                setOffset(0);
              }}
            >
              {relations.map((item, i) => (
                <option key={`${item.source}:${item.key}`} value={i}>
                  {item.label} · {item.key.replace(/_id$/, "")}
                </option>
              ))}
            </select>
            {canWrite && relation.creatable && (
              <MuteButton
                onClick={() => onOpen(relation.source, null, relation.defaults)}
              >
                연결된 {relation.label} 추가
              </MuteButton>
            )}
          </div>
          {rows.error && (
            <div role="alert" className={styles.error}>
              {rows.error.message}
            </div>
          )}
          <table className={styles.recordTable}>
            <thead>
              <tr>
                <th>기록</th>
                <th>상태</th>
                <th>수정 시각</th>
              </tr>
            </thead>
            <tbody>
              {rows.data?.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <MuteButton
                      variant="transparent"
                      onClick={() => onOpen(relation.source, row)}
                    >
                      #{String(row.ref)}{" "}
                      {displayValue(
                        row.name ??
                          row.title ??
                          row.handle ??
                          row.subject ??
                          row.description ??
                          row.metric
                      )}
                    </MuteButton>
                  </td>
                  <td>{displayValue(row.status ?? row.publish_status)}</td>
                  <td>{displayValue(row.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.row}>
            <span>
              {rows.isFetching ? "불러오는 중…" : `${rows.data?.total ?? 0}개`}
            </span>
            <MuteButton
              disabled={!offset || rows.isFetching}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              이전
            </MuteButton>
            <MuteButton
              disabled={
                rows.isFetching || offset + 30 >= (rows.data?.total ?? 0)
              }
              onClick={() => setOffset(offset + 30)}
            >
              다음
            </MuteButton>
          </div>
        </>
      ) : (
        <div>연결된 하위 기록 없음</div>
      )}
    </div>
  );
}
