import React, { useMemo, useState } from "react";
import ConnectionModal from "../Modal/ConnectionModal";
import { CandidateTypeWithConnection } from "@/hooks/useSearchCandidates";
import { useMessages } from "@/i18n/useMessage";

type ModalMode = "request" | "cancel";

const Requestbutton = ({
  c,
  isBeta = false,
}: {
  c: CandidateTypeWithConnection;
  isBeta?: boolean;
}) => {
  const initialRequested = useMemo(
    () => c.connection?.some((con: any) => con.typed === 1) ?? false,
    [c.connection]
  );

  const [isRequested, setIsRequested] = useState(initialRequested);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("request");
  const { m } = useMessages();
  const openRequestModal = () => {
    setModalMode("request");
    setIsConnectionModalOpen(true);
  };

  const openCancelModal = () => {
    setModalMode("cancel");
    setIsConnectionModalOpen(true);
  };

  const handleConfirm = async () => {
    // TODO: Call your API here (insert/delete on supabase).
    // Keep UI update only after success if you want strict consistency.
    if (modalMode === "request") {
      setIsRequested(true);
    } else {
      setIsRequested(false);
    }
    setIsConnectionModalOpen(false);
  };

  return (
    <>
      <ConnectionModal
        candidId={c.id}
        open={isConnectionModalOpen}
        name={c.name ?? ""}
        headline={c.headline ?? ""}
        location={c.location ?? ""}
        profilePicture={c.profile_picture ?? ""}
        isRequested={isRequested}
        onClose={() => setIsConnectionModalOpen(false)}
        onConfirm={handleConfirm}
      />

      {!isRequested ? (
        <div
          onClick={openRequestModal}
          className="transition-all duration-200 font-normal cursor-pointer items-center justify-center flex h-10 px-4 rounded-xl text-sm bg-accenta1/20 text-accenta1 hover:bg-accenta1/25"
        >
          <div className="flex items-center flex-row">
            <span>{m.data.request}</span>
            {isBeta && (
              <span className="ml-1 text-[10px] font-light text-hgray900 border border-white/10 rounded-md px-1 py-0.5">
                BETA
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Requested: show status + cancel */
        <div className="flex items-center gap-2">
          <div
            onClick={openCancelModal}
            className="transition-all duration-200 cursor-pointer items-center justify-center flex h-10 px-4 rounded-xl text-sm bg-accenta1/20 text-accenta1 hover:bg-accenta1/25"
            aria-disabled="true"
          >
            {m.data.request_cancel}
          </div>

          {/* <div
            onClick={openCancelModal}
            className="cursor-pointer flex items-center justify-center h-10 px-4 rounded-xl text-sm text-red-400 bg-transparent hover:bg-red-500/10"
          >
            Cancel
          </div> */}
        </div>
      )}
    </>
  );
};

export default React.memo(Requestbutton);
