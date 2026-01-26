import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/app";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

const Account = () => {
  const { companyUser, load } = useCompanyUserStore();
  const [name, setName] = useState(companyUser?.name || "");
  const [company, setCompany] = useState(companyUser?.company || "");
  const [role, setRole] = useState(companyUser?.role || "");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [isModified, setIsModified] = useState(false);

  useEffect(() => {
    if (!companyUser) return;
    setName(companyUser.name || "");
    setCompany(companyUser.company || "");
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
      country !== (companyUser?.location?.split(",")[1] ?? "")
    ) {
      setIsModified(true);
    } else {
      setIsModified(false);
    }
  }, [name, company, role, city, country, companyUser]);

  const handleCancel = () => {
    setIsModified(false);
    setName(companyUser?.name || "");
    setCompany(companyUser?.company || "");
    setRole(companyUser?.role || "");
    setCity(companyUser?.location?.split(",")[0] || "");
    setCountry(companyUser?.location?.split(",")[1] || "");
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
      })
      .eq("user_id", companyUser?.user_id);

    await load(companyUser?.user_id);
    setIsLoading(false);
  };

  return (
    <AppLayout>
      <div className="min-h-screen w-full">
        {/* Header */}
        <div className="mx-auto w-full px-4 pt-6 pb-2 flex flex-col items-center justify-start">
          <div className="flex items-end justify-between gap-4 w-full">
            <div className="text-3xl font-hedvig font-light tracking-tight text-white">
              Settings
            </div>
          </div>
          <div className="w-full max-w-[770px] flex flex-col items-start justify-start relative pb-32">
            <div className="flex flex-row items-center justify-start gap-4 mt-12 mb-2">
              {companyUser?.profile_picture && (
                <img
                  src={companyUser?.profile_picture}
                  alt="avatar"
                  referrerPolicy="no-referrer"
                  className="w-24 h-24 rounded-full"
                />
              )}
            </div>
            <InputLabel label="Name" value={name} onChange={setName} />
            {/* <div className="flex flex-row items-center justify-between w-full gap-4"> */}
            <InputLabel
              label="Company Name"
              value={company}
              onChange={setCompany}
            />
            <InputLabel label="Role/Title" value={role} onChange={setRole} />
            {/* </div> */}
            <div className="flex flex-row items-center justify-between w-full gap-4">
              <InputLabel label="City" value={city} onChange={setCity} />
              <InputLabel
                label="Country"
                value={country}
                onChange={setCountry}
              />
            </div>
            {isModified && (
              <div className="flex flex-row gap-2 w-full items-end justify-end absolute bottom-0 right-0">
                <button
                  onClick={() => handleCancel()}
                  className="transition-all duration-200 inline-flex items-center justify-center rounded-xl px-[18px] py-[10px] text-base font-normal hover:bg-white/5 text-hgray900 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSave()}
                  disabled={isLoading}
                  className="transition-all duration-200 inline-flex items-center justify-center rounded-xl bg-accenta1 px-[18px] py-[10px] text-base font-medium text-black disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </button>
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
  onChange: (value: string) => void;
}) => {
  return (
    <div className="flex flex-col items-start justify-start mt-6 w-full">
      <div className="text-base text-hgray600 font-light">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-white h-[56px] px-5 py-2 border border-white/10 bg-white/5 rounded-xl text-base font-normal leading-5 outline-none mt-1"
      />
    </div>
  );
};
