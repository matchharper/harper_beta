import React, { useEffect, useState } from "react";
import { LoaderCircle, RefreshCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/toast/toast";

type WaitlistEntry = {
  id?: number | string;
  email: string;
  role?: string | string[] | null;
  expect?: string | string[] | null;
  links?: string | null;
  abtest?: string | null;
  type?: number | null;
  created_at?: string | null;
};

type CompanyWaitlistEntry = {
  id?: number | string;
  name?: string | null;
  email: string;
  company?: string | null;
  company_link?: string | null;
  role?: string | string[] | null;
  size?: string | null;
  needs?: string | null;
  salary?: string | null;
  additional?: string | null;
  expect?: string | string[] | null;
  created_at?: string | null;
};

const PASSWORD = "39775086";

const AdminPage = () => {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [companies, setCompanies] = useState<CompanyWaitlistEntry[]>([]);
  const [counts, setCounts] = useState({ waitlist: 0, companies: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [isPassed, setIsPassed] = useState(false);

  const formatValue = (value?: string | string[] | null) => {
    if (!value) return "-";
    if (Array.isArray(value)) return value.join(", ");
    return value;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    const [waitlistRes, companiesRes] = await Promise.all([
      supabase
        .from("harper_waitlist")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("harper_waitlist_company")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (waitlistRes.error || companiesRes.error) {
      setError(
        waitlistRes.error?.message || companiesRes.error?.message || "Error"
      );
      setLoading(false);
      return;
    }

    setWaitlist((waitlistRes.data as WaitlistEntry[]) || []);
    setCompanies((companiesRes.data as CompanyWaitlistEntry[]) || []);
    setCounts({
      waitlist: waitlistRes.count || 0,
      companies: companiesRes.count || 0,
    });
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {!isPassed ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
          }}
          className="flex flex-col items-center justify-center h-screen font-hedvig gap-6"
        >
          <div>Public access blocked.</div>
          <input
            className="text-lg p-1 border-xgray300 border"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            onClick={() => {
              if (password === PASSWORD) {
                setIsPassed(true);
              } else {
                showToast({
                  message: "Invalid password",
                  variant: "white",
                });
              }
            }}
            className="bg-black text-white px-4 py-2 rounded-md"
          >
            Submit
          </button>
        </form>
      ) : (
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">
                총 개인 {counts.waitlist}명 · 회사 {counts.companies}곳
              </p>
              <h1 className="text-2xl font-semibold">Harper Waitlist Admin</h1>
            </div>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 rounded-md bg-gray-900 text-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-800"
            >
              <RefreshCcw className="w-4 h-4" />
              새로고침
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-600">
              <LoaderCircle className="w-5 h-5 animate-spin" />
              불러오는 중...
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-2 font-inter">
              <section className="space-y-3">
                <header className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">개인 Waitlist</h2>
                    <p className="text-sm text-gray-500">
                      최근 신청 10개만 표시됩니다.
                    </p>
                  </div>
                  <span className="text-sm text-gray-600">
                    총 {counts.waitlist}명
                  </span>
                </header>

                {waitlist.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                    데이터가 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {waitlist.map((item) => (
                      <div
                        key={item.id ?? item.email}
                        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="text-sm text-gray-500">
                              {formatDate(item.created_at)}
                            </div>
                            <div className="text-base font-semibold">
                              {item.email}
                            </div>
                            <div className="text-sm text-gray-700">
                              관심사: {formatValue(item.expect)}
                            </div>
                            <div className="text-sm text-gray-700">
                              역할/직무: {formatValue(item.role)}
                            </div>
                            {item.links && (
                              <div className="text-sm text-blue-600 underline break-all">
                                {item.links}
                              </div>
                            )}
                          </div>
                          {typeof item.type === "number" && (
                            <div className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                              type {item.type}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <header className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">회사 Waitlist</h2>
                    <p className="text-sm text-gray-500">
                      최근 신청 10개만 표시됩니다.
                    </p>
                  </div>
                  <span className="text-sm text-gray-600">
                    총 {counts.companies}곳
                  </span>
                </header>

                {companies.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                    데이터가 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {companies.map((item) => (
                      <div
                        key={item.id ?? item.email}
                        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="text-sm text-gray-500">
                              {formatDate(item.created_at)}
                            </div>
                            <div className="text-base font-semibold">
                              {item.company || "-"}
                            </div>
                            <div className="text-sm text-gray-700">
                              담당자: {item.name || "-"} ({item.email})
                            </div>
                            <div className="text-sm text-gray-700">
                              역할: {formatValue(item.role)}
                            </div>
                            <div className="text-sm text-gray-700">
                              회사 규모: {formatValue(item.size)}
                            </div>
                            <div className="text-sm text-gray-700">
                              필요 포지션: {formatValue(item.needs)}
                            </div>
                            <div className="text-sm text-gray-700">
                              기대 가치: {formatValue(item.expect)}
                            </div>
                            {item.company_link && (
                              <div className="text-sm text-blue-600 underline break-all">
                                {item.company_link}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {item.salary || ""}
                          </div>
                        </div>
                        {item.additional && (
                          <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                            추가 메모: {item.additional}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </main>
  );
};

export default AdminPage;
