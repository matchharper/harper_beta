"""Look at one person's predicted next companies.

Run from harper_beta/:
  output/recsys/.venv/bin/python -W ignore scripts/recsys-prototype/inspect_user.py --random
  output/recsys/.venv/bin/python -W ignore scripts/recsys-prototype/inspect_user.py --talent <talent uuid>
  output/recsys/.venv/bin/python -W ignore scripts/recsys-prototype/inspect_user.py --email someone@example.com
  output/recsys/.venv/bin/python -W ignore scripts/recsys-prototype/inspect_user.py --career "삼성전자 > 토스" --school "서울대학교"

Uses the CSV snapshot from extract.sh. The first run builds output/recsys/cache/state.pkl (about 30s).
Candidates are external Harper companies (company_workspace, internal excluded), minus the person's own past companies.
"""
import argparse, os, pickle, re, subprocess, sys
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy.stats import rankdata

D = "output/recsys/data"
CACHE = "output/recsys/cache/state.pkl"


def rd(path, **kw):
    return pd.read_csv(path, true_values=["t"], false_values=["f"], low_memory=False, **kw)


def norm_name(s):
    if not isinstance(s, str):
        return ""
    s = s.lower()
    s = re.sub(r"\(주\)|㈜|주식회사|\bco\.?,?\s*ltd\.?|\binc\.?|\bcorp(oration)?\.?|\bllc\b|\bltd\b", " ", s)
    return re.sub(r"[^0-9a-z가-힣]+", "", s)


def parse_vec(s):
    return np.fromstring(s.strip("[]"), sep=",", dtype=np.float32) if isinstance(s, str) else None


def l2n(m):
    n = np.linalg.norm(m, axis=1, keepdims=True)
    n[n == 0] = 1
    return m / n


def build():
    print("상태를 처음 만드는 중입니다(약 30초)...", file=sys.stderr)
    comp = rd(f"{D}/companies.csv", dtype={"company_db_id": "Int64"})
    roles = rd(f"{D}/roles.csv")
    recs = rd(f"{D}/recs.csv")
    xp = rd(f"{D}/experience_user.csv", dtype={"company_id": "Int64"})
    edu = rd(f"{D}/edu_user.csv")
    cdb = rd(f"{D}/company_db.csv")
    texp = rd(f"{D}/talent_exp.csv", dtype={"company_id": str})
    tedu = rd(f"{D}/talent_edu.csv")
    cemb = rd(f"{D}/company_emb.csv")
    temb = rd(f"{D}/talent_emb.csv")

    internal = set(comp.loc[comp.is_internal == True, "company_workspace_id"])
    ext = roles[(roles.source_type == "external") & (roles.source_provider.fillna("") != "user_submitted")]
    items = pd.Index(sorted(set(ext.company_workspace_id.dropna()) - internal))
    iidx = pd.Series(np.arange(len(items)), index=items)
    compi = comp.set_index("company_workspace_id").reindex(items)
    n_roles = ext.groupby("company_workspace_id").size().reindex(items).fillna(0).to_numpy()

    xp = xp[xp.company_id.notna()].copy()
    xp["start_date"] = pd.to_datetime(xp.start_date, errors="coerce")
    xp["end_date"] = pd.to_datetime(xp.end_date, errors="coerce")
    db_ids = pd.Index(sorted(set(xp.company_id.astype("int64")) | set(cdb.id)))
    dbidx = pd.Series(np.arange(len(db_ids)), index=db_ids)
    NDB = len(db_ids)
    item_db = compi.company_db_id.map(lambda v: dbidx.get(int(v), -1) if pd.notna(v) else -1).to_numpy()
    mapped = item_db >= 0
    DB2ITEM = sp.csr_matrix((np.ones(mapped.sum()), (item_db[mapped], np.arange(len(items))[mapped])), shape=(NDB, len(items)))

    xp["pid"] = xp.candid_id.astype("category").cat.codes
    xp["db"] = dbidx.reindex(xp.company_id.astype("int64")).to_numpy()
    r = xp[xp.start_date.notna()].sort_values(["pid", "start_date"])
    r = r[(r.pid != r.pid.shift()) | (r.db != r.db.shift())]
    ok = (r.pid == r.pid.shift()).to_numpy()
    T = sp.csr_matrix((np.ones(ok.sum()), (r.db.shift()[ok].astype(int), r.db[ok])), shape=(NDB, NDB))
    T.setdiag(0); T.eliminate_zeros()
    u = xp[["pid", "db"]].drop_duplicates()
    X = sp.csr_matrix((np.ones(len(u), np.float32), (u.pid, u.db)), shape=(xp.pid.max() + 1, NDB))
    deg = np.asarray(X.sum(0)).ravel()
    Craw = (X.T @ (X @ DB2ITEM)).tocsr()          # people who worked at db company AND at item
    out = np.asarray(T.sum(1)).ravel()
    T_item = (T @ DB2ITEM).tocsr()                 # moves db company -> item

    import implicit
    P = recs[recs.feedback.isin(["like", "positive"]) | recs.saved_stage.isin(["saved", "applied", "connected"])]
    Xi = (X @ DB2ITEM).tocsr(); Xi.data[:] = 1
    als = implicit.als.AlternatingLeastSquares(factors=64, regularization=0.05, iterations=15, alpha=2.0, random_state=7)
    als.fit(Xi.astype(np.float32), show_progress=False)
    Y = als.item_factors
    Y = Y.to_numpy() if hasattr(Y, "to_numpy") else np.asarray(Y)

    cur = xp[xp.end_date.isna() & xp.start_date.notna()][["candid_id", "db"]].drop_duplicates()
    se = edu[edu.school.notna()][["candid_id", "school"]].drop_duplicates().merge(cur, on="candid_id")
    sch_ids = pd.Index(sorted(set(se.school)))
    schidx = pd.Series(np.arange(len(sch_ids)), index=sch_ids)
    SCH = (sp.csr_matrix((np.ones(len(se)), (schidx[se.school].to_numpy(), se.db.to_numpy())), shape=(len(sch_ids), NDB)) @ DB2ITEM).tocsr()

    CE = np.zeros((len(items), 1536), np.float32); has_ce = np.zeros(len(items), bool)
    for cw, e in zip(cemb.company_workspace_id, cemb.emb):
        j = iidx.get(cw)
        if j is not None:
            CE[j] = parse_vec(e); has_ce[j] = True
    TEMB = {t: parse_vec(e) for t, e in zip(temb.talent_id, temb.emb_all) if isinstance(e, str)}

    cdb["nn"] = cdb.name.map(norm_name)
    cdb["xp_n"] = cdb.id.map(xp.company_id.value_counts()).fillna(0)
    pop_in = np.asarray(T_item.sum(0)).ravel()     # moves into each item, all time
    liked = P.assign(cw=P.company_workspace_id)
    state = dict(items=items, iidx=iidx, names=compi.company_name.fillna("?").to_numpy(), n_roles=n_roles,
                 db_ids=db_ids, dbidx=dbidx, dbname=cdb.set_index("id").name, item_db=item_db,
                 cdb_lookup=cdb[cdb.nn != ""][["nn", "id", "name", "xp_n"]], deg=deg, out=out, T_item=T_item,
                 Craw=Craw, Y=Y, SCH=SCH, schidx=schidx, CE=l2n(CE), has_ce=has_ce, TEMB=TEMB, pop_in=pop_in,
                 texp=texp, tedu=tedu, liked=liked.groupby("talent_id").cw.apply(lambda s: list(dict.fromkeys(s.dropna()))).to_dict())
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    pickle.dump(state, open(CACHE, "wb"))
    return state


S = pickle.load(open(CACHE, "rb")) if os.path.exists(CACHE) else build()
NI = len(S["items"])


def find_company(name):
    nn = norm_name(name)
    L = S["cdb_lookup"]
    hit = L[L.nn == nn].sort_values("xp_n", ascending=False)
    if len(hit) == 0 and nn:
        hit = L[L.nn.str.contains(re.escape(nn))].sort_values("xp_n", ascending=False)
    if len(hit) == 0:
        return None, []
    return int(hit.id.iat[0]), hit.name.head(4).tolist()


def talent_career(tid):
    e = S["texp"][S["texp"].talent_id == tid].copy()
    e["start_date"] = pd.to_datetime(e.start_date, errors="coerce")
    e = e.sort_values("start_date")
    career = []
    for _, row in e.iterrows():
        dbid = int(row.company_id) if isinstance(row.company_id, str) and row.company_id.isdigit() else None
        if dbid is None or dbid not in S["dbidx"].index:
            dbid, _ = find_company(row.company_name)
        career.append((str(row.company_name), dbid, str(row.start_date.date()) if pd.notna(row.start_date) else "?"))
    schools = S["tedu"][S["tedu"].talent_id == tid].school.dropna().unique().tolist()
    return career, schools


def email_to_talent(email):
    env = dict(os.environ)
    for line in open(".env.local"):
        if line.startswith("DATABASE_URL="):
            env["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"')
    q = "begin transaction read only; select user_id from talent_users where lower(email) = lower(:'e'); commit;"
    res = subprocess.run(["psql", env["DATABASE_URL"], "-At", "-v", f"e={email}"], input=q, capture_output=True, text=True, env=env)
    ids = [l for l in res.stdout.split("\n") if re.fullmatch(r"[0-9a-f-]{36}", l)]
    return ids[0] if ids else None


def recommend(career, schools, talent_id=None, top=15):
    """career: [(label, company_db id or None, start)] oldest first."""
    w = np.zeros(len(S["db_ids"]), np.float32)
    known = [(lab, dbid) for lab, dbid, _ in career if dbid is not None]
    for rnk, (lab, dbid) in enumerate(reversed(known)):
        j = S["dbidx"][dbid]
        w[j] = max(w[j], 0.6 ** rnk)
    wv = sp.csr_matrix(w)
    past_items = np.zeros(NI, bool)
    for _, dbid in known:
        past_items |= S["item_db"] == S["dbidx"][dbid]
    out_total = np.maximum(S["out"], 0)
    scores, why = {}, {}
    trans = np.asarray((wv @ sp.diags(1 / (out_total + 5)) @ S["T_item"]).todense()).ravel()
    scores["이동 확률"] = trans
    co = np.asarray((wv @ S["Craw"]).todense()).ravel()
    scores["공동 재직"] = co / np.sqrt(np.maximum(S["deg"][np.maximum(S["item_db"], 0)], 1)) * (S["item_db"] >= 0)
    hist = np.zeros(NI, np.float32)
    for _, dbid in known:
        hist[S["item_db"] == S["dbidx"][dbid]] = 1
    idx = np.where(hist > 0)[0]
    if len(idx):
        Y = S["Y"]; k = Y.shape[1]
        A = Y.T @ Y + 2.0 * Y[idx].T @ Y[idx] + 0.05 * np.eye(k)
        scores["ALS"] = Y @ np.linalg.solve(A, 3.0 * Y[idx].sum(0))
    sv = np.zeros(NI, np.float32)
    for sc in schools:
        if sc in S["schidx"].index:
            sv += np.asarray(S["SCH"][S["schidx"][sc]].todense()).ravel()
    if sv.any():
        scores["같은 학교 재직자"] = sv
    if talent_id is not None and talent_id in S["TEMB"]:
        te = S["TEMB"][talent_id]; te = te / (np.linalg.norm(te) or 1)
        scores["프로필 임베딩"] = (S["CE"] @ te) * S["has_ce"]
    scores["인기도(이직해 들어온 수)"] = S["pop_in"].astype(np.float32)

    mask = past_items
    fused = np.zeros(NI)
    top_sets = {}
    for name, v in scores.items():
        v = np.where(mask, -np.inf, v)
        nz = np.isfinite(v) & (v > 0)
        r = rankdata(-v, method="average")
        fused += np.where(nz, 1.0 / (60 + r), 0)
        top_sets[name] = set(np.argsort(-v)[:100][nz[np.argsort(-v)[:100]]].tolist())
        scores[name] = v
    scores["종합(RRF)"] = np.where(mask | (fused == 0), -np.inf, fused)
    return scores, top_sets, known


def evidence(i, known, schools):
    parts = []
    db = S["item_db"][i]
    if db >= 0:
        for lab, dbid in known:
            j = S["dbidx"][dbid]
            m = int(S["T_item"][j, i]); c = int(S["Craw"][j, i])
            if m:
                parts.append(f"{lab}→여기 {m}명")
            elif c:
                parts.append(f"{lab}·여기 둘 다 다닌 {c}명")
    for sc in schools:
        if sc in S["schidx"].index:
            n = int(S["SCH"][S["schidx"][sc], i])
            if n:
                parts.append(f"{sc} 출신 재직 {n}명")
    return "; ".join(parts[:3])


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--talent"); g.add_argument("--email"); g.add_argument("--career"); g.add_argument("--random", action="store_true")
    ap.add_argument("--school", action="append", default=[])
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--seed", type=int)
    a = ap.parse_args()

    tid = a.talent
    if a.email:
        tid = email_to_talent(a.email)
        if not tid:
            sys.exit("그 이메일의 사용자를 찾지 못했습니다.")
    if a.random:
        rng = np.random.default_rng(a.seed)
        cands = S["texp"].talent_id.dropna().unique()
        tid = str(rng.choice(cands))
    if tid:
        career, schools = talent_career(tid)
        schools += [s.lower().strip() for s in a.school]
        print(f"사용자 {tid}")
    else:
        career = []
        for part in [p.strip() for p in a.career.split(">") if p.strip()]:
            dbid, alts = find_company(part)
            career.append((part, dbid, "?"))
            if alts:
                print(f"  '{part}' → {alts[0]}" + (f"  (다른 후보: {', '.join(alts[1:])})" if len(alts) > 1 else ""))
        schools = [s.lower().strip() for s in a.school]

    print("\n경력 (오래된 순)")
    for lab, dbid, start in career:
        if dbid is None:
            print(f"  - {lab} ({start}): 사람 DB에서 회사를 찾지 못함 → 이 회사는 계산에 못 씀")
            continue
        j = S["dbidx"][dbid]
        n, o = int(S["deg"][j]), int(S["out"][j])
        flag = "  ← 데이터 적음" if n <= 5 else ""
        print(f"  - {lab} ({start}): 사람 DB에 다닌 사람 {n}명, 여기서 다른 회사로 옮긴 기록 {o}건{flag}")
    if schools:
        print(f"학교: {', '.join(schools)}")

    scores, top_sets, known = recommend(career, schools, tid, a.top)
    names = S["names"]
    for name, v in scores.items():
        order = np.argsort(-v)
        order = [i for i in order[:a.top] if np.isfinite(v[i]) and v[i] > 0]
        print(f"\n[{name}]" + ("" if order else "  점수를 낼 근거가 없음"))
        for r, i in enumerate(order, 1):
            extra = ""
            if name == "종합(RRF)":
                srcs = [k.split("(")[0] for k, s in top_sets.items() if i in s and k != "종합(RRF)"]
                extra = f"  [{', '.join(srcs)}]"
            ev = evidence(i, known, schools) if name in ("이동 확률", "공동 재직", "종합(RRF)", "같은 학교 재직자") else ""
            print(f"  {r:2d}. {names[i]}  (공고 {int(S['n_roles'][i])}개){extra}" + (f"  — {ev}" if ev else ""))
    if tid and S["liked"].get(tid):
        lk = [names[S["iidx"][c]] for c in S["liked"][tid] if c in S["iidx"].index]
        print(f"\n[참고: 이 사용자가 Harper에서 좋아하거나 저장한 회사] {', '.join(lk[:15])}")


if __name__ == "__main__":
    main()
