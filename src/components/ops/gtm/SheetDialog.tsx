import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MuteButton } from "@/components/ui/button";
import { freshDefinition } from "@/lib/gtm/grid";
import { gtmRequest } from "@/lib/gtm/client";
import type { GtmSheet, GtmSource, SheetDefinition } from "@/lib/gtm/types";
import styles from "./GtmWorkspace.module.css";
export default function SheetDialog({
  sources,
  sheet,
  definition,
  onClose,
  onSaved,
  onDeleted,
}: {
  sources: GtmSource[];
  sheet?: GtmSheet;
  definition?: SheetDefinition;
  onClose: () => void;
  onSaved: (sheet: GtmSheet, activate?: boolean) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(sheet?.name ?? "");
  const [sourceId, setSourceId] = useState(
    sheet?.definition.source ?? sources[0]?.id ?? ""
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [savedName, setSavedName] = useState(sheet?.name ?? "");
  const saveInFlight = useRef(false);
  const saveRef = useRef<
    (copy: boolean, closeAfter?: boolean) => Promise<void>
  >(async () => undefined);
  async function save(copy: boolean, closeAfter = true) {
    const source = sources.find((item) => item.id === sourceId);
    if (!source || !name.trim()) {
      setError("시트 이름을 입력하세요.");
      return;
    }
    const initialFields = source.fields
      .filter(
        (field) =>
          ![
            "id",
            "row_version",
            "archived_at",
            "created_by",
            "updated_by",
            "created_at",
          ].includes(field.key)
      )
      .slice(0, 12);
    setPending(true);
    saveInFlight.current = true;
    setError("");
    try {
      const result = await gtmRequest<GtmSheet>("save_sheet", {
        id: copy ? undefined : sheet?.id,
        expected_version: sheet?.row_version,
        name: copy ? `${name} 복사` : name,
        definition: definition ?? freshDefinition(source.id, initialFields),
      });
      onSaved(result, closeAfter);
      setSavedName(result.name);
      if (closeAfter) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다.");
    } finally {
      saveInFlight.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    saveRef.current = save;
  });
  function close() {
    if (pending) return;
    if (sheet && name.trim() && name !== savedName) {
      void saveRef.current(false, true);
      return;
    }
    onClose();
  }
  useEffect(() => {
    if (
      !sheet ||
      deleting ||
      pending ||
      saveInFlight.current ||
      !name.trim() ||
      name === savedName
    )
      return;
    const timer = setTimeout(() => void saveRef.current(false, false), 600);
    return () => clearTimeout(timer);
  }, [deleting, name, pending, savedName, sheet]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className={styles.dialog} aria-describedby={undefined}>
        <DialogTitle>{sheet ? "시트 관리" : "새 시트"}</DialogTitle>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (!sheet) void save(false);
          }}
        >
          <label>
            시트 이름
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            데이터 원본
            <select
              aria-label="데이터 원본"
              disabled={Boolean(sheet)}
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          {deleting && (
            <div className={styles.error}>
              이 시트 구성을 삭제합니다. 원본 기록은 유지됩니다.
            </div>
          )}
          <div
            className={styles.row}
            style={{ justifyContent: "flex-end", flexWrap: "wrap" }}
          >
            {sheet && (
              <MuteButton
                type="button"
                disabled={pending}
                variant="warn"
                onClick={async () => {
                  if (!deleting) {
                    setDeleting(true);
                    return;
                  }
                  setPending(true);
                  setError("");
                  try {
                    await gtmRequest("delete_sheet", {
                      id: sheet.id,
                      expected_version: sheet.row_version,
                    });
                    onDeleted();
                    onClose();
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "삭제하지 못했습니다."
                    );
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {deleting ? "시트 삭제 확인" : "시트 삭제"}
              </MuteButton>
            )}
            {sheet && (
              <MuteButton
                type="button"
                disabled={pending}
                onClick={() => void save(true)}
              >
                복제
              </MuteButton>
            )}
            <MuteButton type="button" disabled={pending} onClick={close}>
              닫기
            </MuteButton>
            {sheet ? (
              <span className={styles.autoSaveStatus} role="status">
                {pending ? "저장 중…" : name !== savedName ? "" : ""}
              </span>
            ) : (
              <MuteButton variant="dark" type="submit" disabled={pending}>
                {pending ? "만드는 중…" : "시트 만들기"}
              </MuteButton>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
