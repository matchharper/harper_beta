import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/app";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

const Account = () => {
  const { companyUser, load } = useCompanyUserStore();
  const [name, setName] = useState(companyUser?.name || "");
  const [company, setCompany] = useState(companyUser?.company || "");
  const [companyDescription, setCompanyDescription] = useState(
    companyUser?.company_description || ""
  );
  const [role, setRole] = useState(companyUser?.role || "");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [isModified, setIsModified] = useState(false);

  useEffect(() => {
    if (!companyUser) return;
    setName(companyUser.name || "");
    setCompany(companyUser.company || "");
    setCompanyDescription(companyUser.company_description || "");
    setRole(companyUser.role || "");
    if (companyUser.location) {
      const [city, country] = companyUser.location.split(",");
      setCity(city || "");
      setCountry(country || "");
    }
  }, [companyUser]);

  useEffect(() => {
    if (!companyUser) return;
    if (
      name !== (companyUser?.name ?? "") ||
      company !== (companyUser?.company ?? "") ||
      role !== (companyUser?.role ?? "") ||
      city !== (companyUser?.location?.split(",")[0] ?? "") ||
      country !== (companyUser?.location?.split(",")[1] ?? "") ||
      companyDescription !== (companyUser?.company_description ?? "")
    ) {
      setIsModified(true);
    } else {
      setIsModified(false);
    }
  }, [name, company, role, city, country, companyDescription, companyUser]);

  const handleCancel = () => {
    setIsModified(false);
    setName(companyUser?.name || "");
    setCompany(companyUser?.company || "");
    setRole(companyUser?.role || "");
    setCity(companyUser?.location?.split(",")[0] || "");
    setCountry(companyUser?.location?.split(",")[1] || "");
    setCompanyDescription(companyUser?.company_description || "");
  };

  const handleSave = async () => {
    if (!companyUser?.user_id) return;

    setIsLoading(true);
    await supabase
      .from("company_users")
      .update({
        name: name,
        company: company,
        role: role,
        location: `${city},${country}`,
        company_description: companyDescription,
      })
      .eq("user_id", companyUser?.user_id);

    await load(companyUser?.user_id);
    setIsLoading(false);
  };

  return (
    <AppLayout initialCollapse={false}>
      <div className="min-h-screen w-full">
        {/* Header */}
        <div className="mx-auto w-full px-4 pt-6 pb-2 flex flex-col items-center justify-start">
          <div className="flex items-end justify-between gap-4 w-full">
            <div className="text-3xl font-hedvig font-light tracking-tight text-white">
              Profile
            </div>
          </div>
          <div className="w-full max-w-[770px] flex flex-col items-start justify-start relative pb-32 space-y-4">
            <div className="flex flex-row items-center justify-start gap-4 mt-12 mb-2">
              {companyUser?.profile_picture && (
                <img
                  src={companyUser?.profile_picture}
                  alt="avatar"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-full"
                />
              )}
            </div>
            <div className="flex flex-row items-center justify-between w-full gap-4">
              <InputLabel label="Name" value={name} onChange={setName} />
              <InputLabel label="Role/Title" value={role} onChange={setRole} />
            </div>
            <InputLabel
              label="Company Name"
              value={company}
              onChange={setCompany}
            />
            <TextAreaLabel
              label="Company/Team Description"
              placeholder="Harper - AI-powered hiring assistant. 현재 인원 ~~명, 최근 투자 유치, HR + AI 등"
              value={companyDescription}
              onChange={setCompanyDescription}
            />
            <InputLabel
              label="본사/근무 위치"
              value={country}
              onChange={setCountry}
            />
            {isModified && (
              <div className="sticky bottom-0 bg-black/10 backdrop-blur-md">
                <div className="px-6 py-4 flex items-center justify-between gap-8">
                  <div className="text-sm text-white/60">
                    You have unsaved changes.
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCancel}
                      className="rounded-lg px-4 py-2 text-sm text-white/70 hover:bg-white/[0.05] transition"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={handleSave}
                      disabled={isLoading}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-black bg-accenta1 hover:opacity-90 disabled:opacity-70 transition inline-flex items-center gap-2"
                    >
                      {isLoading && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      Save changes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Account;

const InputLabel = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="text-sm text-white/60">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white/90 placeholder:text-white/30 outline-none
                   focus:border-white/20 transition"
      />
    </div>
  );
};

const TextAreaLabel = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => {
  return (
    <div className="flex flex-col gap-1.5 w-full mt-4">
      <div className="text-sm text-white/60">{label}</div>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white/90 placeholder:text-white/30 outline-none
                   focus:border-white/20 transition leading-relaxed"
      />
      <div className="text-xs text-white/40">
        Optional — helps improve recommendations.
      </div>
    </div>
  );
};
