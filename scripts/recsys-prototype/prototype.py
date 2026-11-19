"""Offline prototype: traditional user -> company recommenders for Harper Career.

Run from harper_beta/:
  output/recsys/.venv/bin/python scripts/recsys-prototype/prototype.py

Inputs: CSVs written by extract.sh into output/recsys/data (gitignored).
Outputs: output/recsys/results.json and output/recsys/examples.md.

Item = company_workspace (Harper-connected internal companies excluded).
Three evaluations:
  A. reaction ranking   - among companies Harper showed after T_TEST, rank liked above disliked
  B. catalog retrieval  - rank the whole external catalog; did the companies the user later liked come up?
  C. career transition  - people DB: hide each person's latest move, predict the company they moved to
"""
import os, re, json, time
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import numpy as np
import pandas as pd
import scipy.sparse as sp
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

D = "output/recsys/data"
OUT = "output/recsys"
T_FEAT = pd.Timestamp("2026-09-20", tz="UTC")   # features for ranker training use data before this
T_TEST = pd.Timestamp("2026-10-20", tz="UTC")   # test period starts here
C_SPLIT = pd.Timestamp("2025-07-01")            # people-DB transition split
POS_STAGES = {"saved", "applied", "connected", "accepted"}
STRONG_STAGES = {"applied", "connected", "accepted"}
RNG = np.random.default_rng(7)
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.0f}s]", *a, flush=True)


def ts(s, tz=True):
    return pd.to_datetime(s, utc=tz, errors="coerce", format="mixed")


def parse_vec(s):
    if not isinstance(s, str):
        return None
    return np.fromstring(s.strip("[]"), sep=",", dtype=np.float32)


def norm_name(s):
    if not isinstance(s, str):
        return ""
    s = s.lower()
    s = re.sub(r"\(주\)|㈜|주식회사|\bco\.?,?\s*ltd\.?|\binc\.?|\bcorp(oration)?\.?|\bllc\b|\bltd\b", " ", s)
    s = re.sub(r"[^0-9a-z가-힣]+", "", s)
    return s


def l2n(m):
    n = np.linalg.norm(m, axis=1, keepdims=True)
    n[n == 0] = 1
    return m / n


def rd(path, **kw):
    return pd.read_csv(path, true_values=["t"], false_values=["f"], low_memory=False, **kw)


# ----------------------------------------------------------------------------- load
log("loading")
comp = rd(f"{D}/companies.csv", dtype={"company_db_id": "Int64"})
roles = rd(f"{D}/roles.csv")
recs = rd(f"{D}/recs.csv")
talents = rd(f"{D}/talents.csv")
texp = rd(f"{D}/talent_exp.csv", dtype={"company_id": str})
tedu = rd(f"{D}/talent_edu.csv")
evals = rd(f"{D}/evals.csv")
xp = rd(f"{D}/experience_user.csv", dtype={"company_id": "Int64"})
edu = rd(f"{D}/edu_user.csv")
cand = rd(f"{D}/candid.csv")
cdb = rd(f"{D}/company_db.csv")
cemb = rd(f"{D}/company_emb.csv")
temb = rd(f"{D}/talent_emb.csv")
log("loaded", {k: len(v) for k, v in dict(comp=comp, roles=roles, recs=recs, xp=xp, edu=edu, evals=evals).items()})

internal = set(comp.loc[comp.is_internal == True, "company_workspace_id"])
roles["created_at"] = ts(roles.created_at)
roles["posted_at"] = ts(roles.posted_at)
ext_roles = roles[(roles.source_type == "external") & (roles.source_provider.fillna("") != "user_submitted")
                  & ~roles.company_workspace_id.isin(internal)]

# ----------------------------------------------------------------------------- items
recs = recs[recs.company_workspace_id.notna() & ~recs.company_workspace_id.isin(internal)].copy()
items = pd.Index(sorted(set(ext_roles.company_workspace_id.dropna()) | set(recs.company_workspace_id)))
NI = len(items)
iidx = pd.Series(np.arange(NI), index=items)
compi = comp.set_index("company_workspace_id").reindex(items)
log("items", NI)

# company_db space (people DB). Every id seen anywhere gets a column.
xp = xp[xp.company_id.notna()].copy()
xp["start_date"] = pd.to_datetime(xp.start_date, errors="coerce")
xp["end_date"] = pd.to_datetime(xp.end_date, errors="coerce")
db_ids = pd.Index(sorted(set(xp.company_id.astype("int64")) | set(cdb.id) | set(comp.company_db_id.dropna().astype("int64"))))
NDB = len(db_ids)
dbidx = pd.Series(np.arange(NDB), index=db_ids)
item_db = compi.company_db_id.map(lambda v: dbidx.get(int(v), -1) if pd.notna(v) else -1).to_numpy()
mapped = item_db >= 0
log("db companies", NDB, "items mapped to company_db", int(mapped.sum()))
# people-DB column -> item(s): items share a db id rarely; one-to-many through a sparse matrix
MAPPED_DB = np.zeros(NDB, bool); MAPPED_DB[item_db[mapped]] = True
DB2ITEM = sp.csr_matrix((np.ones(mapped.sum()), (item_db[mapped], np.arange(NI)[mapped])), shape=(NDB, NI))

# company names -> db id for unmatched talent experiences
cdb["nn"] = cdb.name.map(norm_name)
xp_cnt = xp.company_id.value_counts()
cdb["xp_n"] = cdb.id.map(xp_cnt).fillna(0)
name2db = (cdb[cdb.nn != ""].sort_values("xp_n", ascending=False).drop_duplicates("nn").set_index("nn").id)

# ----------------------------------------------------------------------------- people DB matrices
log("people DB matrices")
xp["pid"] = xp.candid_id.astype("category").cat.codes
xp["db"] = dbidx.reindex(xp.company_id.astype("int64")).to_numpy()
NP = xp.pid.max() + 1


def build_people(xp_rows):
    """Transition counts prev->next (db x db) and co-employment cosine (db x db)."""
    r = xp_rows[xp_rows.start_date.notna()].sort_values(["pid", "start_date"])
    r = r[(r.pid != r.pid.shift()) | (r.db != r.db.shift())]
    prev = r.db.shift()
    ok = (r.pid == r.pid.shift()).to_numpy()
    T = sp.csr_matrix((np.ones(ok.sum()), (prev[ok].astype(int), r.db[ok])), shape=(NDB, NDB))
    T.setdiag(0); T.eliminate_zeros()
    u = xp_rows[["pid", "db"]].drop_duplicates()
    X = sp.csr_matrix((np.ones(len(u), dtype=np.float32), (u.pid, u.db)), shape=(NP, NDB))
    deg = np.asarray(X.sum(0)).ravel()
    C = (X.T @ (X @ sp.diags(MAPPED_DB.astype(np.float32)))).tocsr()   # only columns that are Harper companies
    C.setdiag(0); C.eliminate_zeros()
    dinv = 1 / np.sqrt(np.maximum(deg, 1))
    C = sp.diags(dinv) @ C @ sp.diags(dinv)
    out = np.asarray(T.sum(1)).ravel()
    inn = np.asarray(T.sum(0)).ravel()
    Tprob = sp.diags(1 / (out + 5)) @ T                       # P(next | prev), smoothed
    Tlift = Tprob @ sp.diags(1 / np.sqrt(inn + 10))            # down-weight hubs everybody moves to
    return dict(T=T, Tprob=Tprob.tocsr(), Tlift=Tlift.tocsr(), C=C.tocsr(), X=X, deg=deg, inn=inn)


PEOPLE = build_people(xp)
log("transitions", int(PEOPLE["T"].sum()), "cooc nnz", PEOPLE["C"].nnz)

# company team facts from the people DB (as of its own latest snapshot)
snap = xp.start_date.max()
cur = xp[xp.end_date.isna() & xp.start_date.notna()]
kor = set(cand.loc[cand.is_korean == True, "candid_id"])
staff = cur.groupby("db").candid_id.nunique()
joined = xp[xp.start_date >= snap - pd.Timedelta(days=365)].groupby("db").candid_id.nunique()
left = xp[xp.end_date >= snap - pd.Timedelta(days=365)].groupby("db").candid_id.nunique()
kshare = cur.assign(k=cur.candid_id.isin(kor)).groupby("db").k.mean()


def db_feat(series):
    v = np.zeros(NI, dtype=np.float32)
    v[mapped] = series.reindex(item_db[mapped]).fillna(0).to_numpy()
    return v


I_STAFF = db_feat(staff)
I_GROWTH = (db_feat(joined) - db_feat(left)) / np.maximum(I_STAFF, 1)
I_KOR = db_feat(kshare)

# schools: school -> current staff counts per item
edu = edu[edu.school.notna()]
sch_ids = pd.Index(sorted(set(edu.school) | set(tedu.school.dropna())))
schidx = pd.Series(np.arange(len(sch_ids)), index=sch_ids)
cur_items = cur[["candid_id", "db"]].drop_duplicates()
se = edu[["candid_id", "school"]].drop_duplicates().merge(cur_items, on="candid_id")
SCH = sp.csr_matrix((np.ones(len(se)), (schidx[se.school].to_numpy(), se.db.to_numpy())), shape=(len(sch_ids), NDB)) @ DB2ITEM
log("school links", len(se))

# company attributes
def size_ord(v):
    try:
        j = json.loads(v)
        lo = j.get("start") or j.get("min") or 0
        return float(lo)
    except Exception:
        return np.nan


I_SIZE = compi.employee_count_range.map(size_ord).to_numpy(dtype=np.float32)
I_FOUNDED = compi.founded_year.to_numpy(dtype=np.float32)
I_INVEST = compi.has_investors.fillna(False).astype(np.float32).to_numpy()
I_CAREER = compi.has_career_page.fillna(False).astype(np.float32).to_numpy()
rc = ext_roles.groupby("company_workspace_id")
role_country = rc.country_code.agg(lambda s: s.mode().iat[0] if s.notna().any() else None).reindex(items)
I_SAL = rc.salary_max.max().reindex(items).notna().astype(np.float32).to_numpy()

# company embedding (mean role-title embedding)
CE = np.zeros((NI, 1536), dtype=np.float32)
has_ce = np.zeros(NI, bool)
for cw, e in zip(cemb.company_workspace_id, cemb.emb):
    j = iidx.get(cw)
    if j is not None:
        CE[j] = parse_vec(e); has_ce[j] = True
CE = l2n(CE)
log("company embeddings", int(has_ce.sum()))

# ----------------------------------------------------------------------------- talents
tids = pd.Index(sorted(set(talents.talent_id) | set(recs.talent_id)))
tidx = pd.Series(np.arange(len(tids)), index=tids)
NT = len(tids)
TE = np.zeros((NT, 1536), dtype=np.float32)
has_te = np.zeros(NT, bool)
for t, e in zip(temb.talent_id, temb.emb_all):
    j = tidx.get(t)
    if j is not None and isinstance(e, str):
        TE[j] = parse_vec(e); has_te[j] = True
TE = l2n(TE)

# past companies -> db ids, recency weighted
texp["start_date"] = pd.to_datetime(texp.start_date, errors="coerce")
num = texp.company_id.fillna("").str.fullmatch(r"\d+")
texp["dbid"] = np.where(num, pd.to_numeric(texp.company_id, errors="coerce"), np.nan)
miss = texp.dbid.isna()
texp.loc[miss, "dbid"] = texp.loc[miss, "company_name"].map(norm_name).map(name2db)
texp = texp[texp.dbid.notna() & texp.talent_id.isin(tidx.index)].copy()
texp["db"] = dbidx.reindex(texp.dbid.astype("int64")).to_numpy()
texp = texp[texp.db.notna()]
texp = texp.sort_values(["talent_id", "start_date"], ascending=[True, False])
texp["r"] = texp.groupby("talent_id").cumcount()
texp["w"] = 0.6 ** texp.r
tp = texp.groupby(["talent_id", "db"]).w.max().reset_index()
TP = sp.csr_matrix((tp.w, (tidx[tp.talent_id].to_numpy(), tp.db.astype(int))), shape=(NT, NDB))
PAST_ITEMS = (TP > 0).astype(np.float32) @ DB2ITEM
log("talents", NT, "with past companies", int((TP.getnnz(1) > 0).sum()), "with profile emb", int(has_te.sum()))

ts_ = tedu[tedu.school.notna() & tedu.talent_id.isin(tidx.index) & tedu.school.isin(schidx.index)].drop_duplicates(["talent_id", "school"])
TS = sp.csr_matrix((np.ones(len(ts_)), (tidx[ts_.talent_id].to_numpy(), schidx[ts_.school].to_numpy())), shape=(NT, len(sch_ids)))
T_COUNTRY = talents.set_index("talent_id").country_code.reindex(tids)

# ----------------------------------------------------------------------------- reactions
for c in ["recommended_at", "feedback_at", "dismissed_at", "clicked_at", "viewed_at"]:
    recs[c] = ts(recs[c])
fb = recs.feedback.fillna("")
st = recs.saved_stage.fillna("")
recs["pos"] = fb.isin(["like", "positive"]) | st.isin(POS_STAGES)
# saved_stage='hidden' is written automatically when an external role expires (talentOpportunity.ts), so it is not a reaction
recs["neg"] = ~recs.pos & ((fb == "dislike") | recs.dismissed_at.notna())
recs["strong"] = st.isin(STRONG_STAGES)
recs["label_at"] = recs.feedback_at.fillna(recs.dismissed_at).fillna(recs.clicked_at).fillna(recs.viewed_at).fillna(recs.recommended_at)
pairs = recs.groupby(["talent_id", "company_workspace_id"]).agg(
    first_rec=("recommended_at", "min"), label_at=("label_at", "max"), pos=("pos", "any"), neg=("neg", "any"),
    strong=("strong", "any"), sys_score=("score", "max"), sys_rank=("rank", "min")).reset_index()
pairs["neg"] = pairs.neg & ~pairs.pos
pairs["ti"] = tidx[pairs.talent_id].to_numpy()
pairs["ii"] = iidx[pairs.company_workspace_id].to_numpy()
log("pairs", len(pairs), "pos", int(pairs.pos.sum()), "neg", int(pairs.neg.sum()))

evals["first_evaluated_at"] = ts(evals.first_evaluated_at)
evals = evals[evals.company_workspace_id.isin(iidx.index) & evals.talent_id.isin(tidx.index)].copy()
evals["ti"] = tidx[evals.talent_id].to_numpy()
evals["ii"] = iidx[evals.company_workspace_id].to_numpy()
EV_COLS = ["mutual_fit", "candidate_interest", "company_interest", "role_fit"]


# ----------------------------------------------------------------------------- ALS with fold-in
def train_als(rows_extra, factors=64, iters=15, reg=0.05):
    """Items learned from people careers + Harper positives before cutoff."""
    import implicit
    Xp = PEOPLE["X"] @ DB2ITEM
    Xp.data[:] = 1.0
    M = sp.vstack([Xp, rows_extra]).tocsr().astype(np.float32)
    m = implicit.als.AlternatingLeastSquares(factors=factors, regularization=reg, iterations=iters, alpha=2.0,
                                             random_state=7, calculate_training_loss=False)
    m.fit(M, show_progress=False)
    Y = m.item_factors
    Y = Y.to_numpy() if hasattr(Y, "to_numpy") else np.asarray(Y)
    return Y


def foldin(Y, R, alpha=2.0, reg=0.05):
    """User factors for rows of R (users x items) given fixed item factors (implicit ALS fold-in)."""
    YtY = Y.T @ Y
    k = Y.shape[1]
    U = np.zeros((R.shape[0], k), dtype=np.float32)
    for u in range(R.shape[0]):
        s, e = R.indptr[u], R.indptr[u + 1]
        if s == e:
            continue
        idx, c = R.indices[s:e], R.data[s:e]
        Yi = Y[idx]
        A = YtY + (Yi.T * (alpha * c)) @ Yi + reg * np.eye(k)
        b = (Yi * (1 + alpha * c)[:, None]).sum(0)
        U[u] = np.linalg.solve(A, b)
    return U


# ----------------------------------------------------------------------------- context at a cutoff
class Ctx:
    def __init__(self, cutoff):
        self.cutoff = cutoff
        seen = pairs[pairs.first_rec < cutoff]
        lab = seen[seen.label_at < cutoff]
        self.seen = seen
        self.pop_exp = np.bincount(seen.ii, minlength=NI).astype(np.float32)
        self.pop_pos = np.bincount(lab.ii[lab.pos], minlength=NI).astype(np.float32)
        self.pop_neg = np.bincount(lab.ii[lab.neg], minlength=NI).astype(np.float32)
        self.pop_rate = (self.pop_pos + 1) / (self.pop_pos + self.pop_neg + 3)
        w = np.where(lab.strong, 3.0, 1.0)[lab.pos.to_numpy()]
        P = sp.csr_matrix((w, (lab.ti[lab.pos], lab.ii[lab.pos])), shape=(NT, NI))
        N = sp.csr_matrix((np.ones(int(lab.neg.sum())), (lab.ti[lab.neg], lab.ii[lab.neg])), shape=(NT, NI))
        self.P, self.N = P, N
        self.SEEN = sp.csr_matrix((np.ones(len(seen)), (seen.ti, seen.ii)), shape=(NT, NI))
        self.u_pos = np.asarray(P.getnnz(1)).astype(np.float32)
        self.u_neg = np.asarray(N.getnnz(1)).astype(np.float32)
        # liked / disliked centroids in embedding space
        self.LC = l2n(np.asarray((P.multiply(1.0).tocsr() @ CE)))
        self.NC = l2n(np.asarray(N @ CE))
        # catalog = external companies with a role created before cutoff
        live = ext_roles[ext_roles.created_at < cutoff].company_workspace_id
        self.catalog = np.zeros(NI, bool)
        self.catalog[iidx.reindex(live.unique()).dropna().astype(int).to_numpy()] = True
        # ALS: people careers + Harper positives + talents' own past companies
        R = (P + 1.0 * PAST_ITEMS).tocsr()
        self.Y = train_als(R)
        self.U = foldin(self.Y, R)
        ev = evals[evals.first_evaluated_at < cutoff]
        self.ev = ev
        self.EV = {c: sp.csr_matrix((ev[c].fillna(0).to_numpy() + 1e-3, (ev.ti, ev.ii)), shape=(NT, NI)) for c in EV_COLS}
        log(f"ctx {cutoff.date()}: seen {len(seen)} pos {int(lab.pos.sum())} catalog {int(self.catalog.sum())}")

    def dense(self, tix):
        """Per-talent dense score vectors over all items for the base generators."""
        tix = np.asarray(tix)
        out = {}
        tp_ = TP[tix]
        out["trans"] = np.asarray((tp_ @ PEOPLE["Tprob"] @ DB2ITEM).todense(), dtype=np.float32)
        out["trans_lift"] = np.asarray((tp_ @ PEOPLE["Tlift"] @ DB2ITEM).todense(), dtype=np.float32)
        out["cooc"] = np.asarray((tp_ @ PEOPLE["C"] @ DB2ITEM).todense(), dtype=np.float32)
        sc = np.asarray((TS[tix] @ SCH).todense(), dtype=np.float32)
        out["school_n"] = np.log1p(sc)
        out["school_frac"] = sc / np.maximum(I_STAFF, 5)[None, :]
        out["emb"] = (TE[tix] @ CE.T) * has_ce[None, :]
        out["liked_cos"] = (self.LC[tix] @ CE.T) * has_ce[None, :]
        out["disliked_cos"] = (self.NC[tix] @ CE.T) * has_ce[None, :]
        out["als"] = self.U[tix] @ self.Y.T
        n = len(tix)
        out["pop_pos"] = np.broadcast_to(np.log1p(self.pop_pos), (n, NI))
        for c in EV_COLS:
            out["ev_" + c] = np.asarray(self.EV[c][tix].todense(), dtype=np.float32)
        return out


def pair_features(ctx, tix, iix, dense_cache=None, eval_override=None):
    """Feature frame for (talent, item) pairs."""
    tix = np.asarray(tix); iix = np.asarray(iix)
    F = {}
    order = np.argsort(tix, kind="stable")
    ut, starts = np.unique(tix[order], return_index=True)
    ends = np.r_[starts[1:], len(order)]
    cols = None
    for b in range(0, len(ut), 400):
        batch = ut[b:b + 400]
        dn = ctx.dense(batch)
        if cols is None:
            cols = {k: np.zeros(len(tix), np.float32) for k in dn}
        for j, t in enumerate(batch):
            sel = order[starts[b + j]:ends[b + j]]
            for k, v in dn.items():
                cols[k][sel] = v[j, iix[sel]]
    F.update(cols)
    F["has_eval"] = (F["ev_mutual_fit"] > 0).astype(np.float32)
    for c in EV_COLS:
        F["ev_" + c] = np.where(F["has_eval"] > 0, F["ev_" + c], np.nan)
    if eval_override is not None:  # time-valid evaluator scores at the moment of recommendation
        for c in EV_COLS:
            F["ev_" + c] = eval_override[c]
        F["has_eval"] = (~np.isnan(eval_override["mutual_fit"])).astype(np.float32)
    F["pop_neg"] = np.log1p(ctx.pop_neg[iix]); F["pop_exp"] = np.log1p(ctx.pop_exp[iix]); F["pop_rate"] = ctx.pop_rate[iix]
    F["is_past"] = np.asarray(PAST_ITEMS[tix, iix]).ravel()
    F["u_pos"] = np.log1p(ctx.u_pos[tix]); F["u_neg"] = np.log1p(ctx.u_neg[tix])
    F["u_has_emb"] = has_te[tix].astype(np.float32); F["u_n_past"] = np.asarray(TP[tix].getnnz(1), np.float32)
    F["i_staff"] = np.log1p(I_STAFF[iix]); F["i_growth"] = I_GROWTH[iix]; F["i_kor"] = I_KOR[iix]
    F["i_size"] = I_SIZE[iix]; F["i_founded"] = I_FOUNDED[iix]; F["i_invest"] = I_INVEST[iix]
    F["i_career"] = I_CAREER[iix]; F["i_salary"] = I_SAL[iix]
    tc = T_COUNTRY.to_numpy()[tix]; rcn = role_country.to_numpy()[iix]
    F["country_match"] = np.where(pd.isna(tc) | pd.isna(rcn), 0.5, (tc == rcn).astype(np.float32))
    return pd.DataFrame(F)


def eval_at_rec(df):
    """Evaluator scores that existed when the pair was first recommended."""
    m = df[["ti", "ii", "first_rec"]].reset_index().merge(evals[["ti", "ii", "first_evaluated_at"] + EV_COLS], on=["ti", "ii"], how="left")
    ok = m.first_evaluated_at <= m.first_rec + pd.Timedelta(hours=1)
    return {c: np.where(ok, m[c], np.nan).astype(np.float32) for c in EV_COLS}


def auc_report(y, s, users):
    y = np.asarray(y); s = np.nan_to_num(np.asarray(s, dtype=float), nan=-1e9)
    g = roc_auc_score(y, s) if len(set(y)) > 1 else np.nan
    per = []
    for u in np.unique(users):
        m = users == u
        if 0 < y[m].sum() < m.sum():
            per.append(roc_auc_score(y[m], s[m]))
    return dict(global_auc=round(g, 4), user_auc=round(float(np.mean(per)), 4), users=len(per))


RESULTS = {}
GBDT_PARAMS = dict(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=40, l2_regularization=1.0, random_state=7)

# ============================================================================= A. reaction ranking
log("== A: reaction ranking among shown companies")
ctx_f = Ctx(T_FEAT)
ctx_t = Ctx(T_TEST)
lab = pairs[pairs.pos | pairs.neg]
trA = lab[(lab.first_rec >= T_FEAT) & (lab.first_rec < T_TEST)].reset_index(drop=True)
teA = lab[lab.first_rec >= T_TEST].reset_index(drop=True)
XtrA = pair_features(ctx_f, trA.ti, trA.ii, eval_override=eval_at_rec(trA))
XteA = pair_features(ctx_t, teA.ti, teA.ii, eval_override=eval_at_rec(teA))
log("A train nan share", XtrA.isna().mean().round(3)[lambda x: x > 0].to_dict())
log("A test nan share", XteA.isna().mean().round(3)[lambda x: x > 0].to_dict())
FEATS = [c for c in XtrA.columns if not c.startswith("ev_") and c != "has_eval"]  # evaluator logs start 2026-11-04
gbA = HistGradientBoostingClassifier(**GBDT_PARAMS).fit(XtrA[FEATS], trA.pos)
pA = gbA.predict_proba(XteA[FEATS])[:, 1]
has_ev = XteA.has_eval.to_numpy() > 0
cold = (ctx_t.u_pos[teA.ti] + ctx_t.u_neg[teA.ti]) == 0
A = {"train_pairs": len(trA), "test_pairs": len(teA), "test_pos_rate": round(float(teA.pos.mean()), 3)}
cands = {"current_system_score": teA.sys_score, "current_system_rank(-)": -teA.sys_rank.fillna(999),
         "llm_eval_mutual_fit": XteA.ev_mutual_fit, "llm_eval_candidate_interest": XteA.ev_candidate_interest,
         "popularity_like_rate": XteA.pop_rate, "transition": XteA.trans, "cooccurrence": XteA.cooc,
         "school_reach": XteA.school_n, "profile_embedding": XteA.emb, "liked_centroid": XteA.liked_cos - XteA.disliked_cos,
         "als": XteA.als, "GBDT(all)": pA}
for name, s in cands.items():
    A[name] = {"all": auc_report(teA.pos, s, teA.ti.to_numpy()),
               "cold_users": auc_report(teA.pos[cold], np.asarray(s)[cold], teA.ti.to_numpy()[cold]),
               "llm_evaluated_subset": auc_report(teA.pos[has_ev], np.asarray(s)[has_ev], teA.ti.to_numpy()[has_ev])}
RESULTS["A_reaction_ranking"] = A
from sklearn.inspection import permutation_importance
samp = XteA[FEATS].sample(min(20000, len(XteA)), random_state=7)
pi = permutation_importance(gbA, samp, teA.pos.loc[samp.index], scoring="roc_auc", n_repeats=3, random_state=7)
RESULTS["A_feature_importance"] = dict(sorted(zip(samp.columns, np.round(pi.importances_mean, 4)), key=lambda x: -x[1])[:15])
log("A done", {k: v["all"]["user_auc"] for k, v in A.items() if isinstance(v, dict)})

# ============================================================================= B. catalog retrieval
log("== B: catalog retrieval")
GEN = ["pop_pos", "trans", "trans_lift", "cooc", "school_n", "emb", "liked_cos", "als"]
K_GEN = 300


def candidates(ctx, tix_list):
    """Union of top-K from each generator, excluding companies already shown before cutoff."""
    out = {}
    per_gen = {g: {} for g in GEN}
    for b in range(0, len(tix_list), 400):
        batch = np.asarray(tix_list[b:b + 400])
        dn = ctx.dense(batch)
        mask = ~ctx.catalog[None, :] | (ctx.SEEN[batch].toarray() > 0) | (PAST_ITEMS[batch].toarray() > 0)
        for g in GEN:
            v = np.where(mask, -np.inf, dn[g])
            top = np.argpartition(-v, K_GEN, axis=1)[:, :K_GEN]
            for j, t in enumerate(batch):
                tt = top[j][np.isfinite(v[j, top[j]]) & (v[j, top[j]] > 0)]
                per_gen[g][t] = tt[np.argsort(-v[j, tt])]
                out.setdefault(t, set()).update(tt.tolist())
    return out, per_gen


def targets(cutoff_lo, cutoff_hi, ctx):
    p = pairs[pairs.pos & (pairs.first_rec >= cutoff_lo) & (pairs.first_rec < cutoff_hi)]
    seen = set(zip(ctx.seen.ti, ctx.seen.ii))
    p = p[[(a, b) not in seen for a, b in zip(p.ti, p.ii)] & ctx.catalog[p.ii]]
    return p.groupby("ti").ii.apply(set).to_dict()


tgt_te = targets(T_TEST, pd.Timestamp("2100-01-01", tz="UTC"), ctx_t)
tgt_tr = targets(T_FEAT, T_TEST, ctx_f)
log("B targets: train users", len(tgt_tr), "test users", len(tgt_te))
cand_te, gen_te = candidates(ctx_t, list(tgt_te))
cand_tr, _ = candidates(ctx_f, list(tgt_tr))

# ranker trained on catalog candidates (hard negatives) of the training window
rows = []
for t, pos in tgt_tr.items():
    c = list(cand_tr.get(t, set()) | pos)
    neg = [x for x in c if x not in pos]
    if len(neg) > 150:
        neg = list(RNG.choice(neg, 150, replace=False))
    rows += [(t, x, 1) for x in pos] + [(t, x, 0) for x in neg]
trB = pd.DataFrame(rows, columns=["ti", "ii", "y"])
XtrB = pair_features(ctx_f, trB.ti, trB.ii)
gbB = HistGradientBoostingClassifier(**GBDT_PARAMS).fit(XtrB[FEATS], trB.y)
rows = [(t, x) for t, c in cand_te.items() for x in c]
teB = pd.DataFrame(rows, columns=["ti", "ii"])
XteB = pair_features(ctx_t, teB.ti, teB.ii)
teB["s"] = gbB.predict_proba(XteB[FEATS])[:, 1]
gb_rank = {t: g.sort_values("s", ascending=False).ii.to_numpy() for t, g in teB.groupby("ti")}

KS = [10, 50, 100]


def recall(rankings, tg, ks=KS):
    r = {k: [] for k in ks}
    for t, pos in tg.items():
        lst = rankings.get(t, np.array([], int))
        for k in ks:
            r[k].append(len(set(lst[:k].tolist()) & pos) / len(pos))
    return {f"recall@{k}": round(float(np.mean(v)), 4) for k, v in r.items()}


cold_te = {t for t in tgt_te if ctx_t.u_pos[t] + ctx_t.u_neg[t] == 0}
B = {"test_users": len(tgt_te), "cold_test_users": len(cold_te), "catalog": int(ctx_t.catalog.sum()),
     "avg_targets": round(float(np.mean([len(v) for v in tgt_te.values()])), 2),
     "union_coverage": round(float(np.mean([len(cand_te.get(t, set()) & p) / len(p) for t, p in tgt_te.items()])), 4),
     "avg_union_size": int(np.mean([len(v) for v in cand_te.values()]))}
top100 = set(np.argsort(-ctx_t.pop_exp)[:100])
for name, rk in [(g, gen_te[g]) for g in GEN] + [("GBDT(all)", gb_rank)]:
    B[name] = {"all": recall(rk, tgt_te), "cold": recall(rk, {t: tgt_te[t] for t in cold_te}),
               "top10_share_of_top100_popular": round(float(np.mean([np.isin(v[:10], list(top100)).mean() for v in rk.values() if len(v)])), 3),
               "distinct_companies_in_top10": int(len(set(np.concatenate([v[:10] for v in rk.values() if len(v)]))))}
RESULTS["B_catalog_retrieval"] = B
log("B done", {k: v["all"] for k, v in B.items() if isinstance(v, dict)})

# ============================================================================= C. career transitions (people DB)
log("== C: career transitions in the people DB")
xr = xp[xp.start_date.notna()].sort_values(["pid", "start_date"])
xr = xr[(xr.pid != xr.pid.shift()) | (xr.db != xr.db.shift())]
last = xr.groupby("pid").tail(1)
last = last[last.start_date >= C_SPLIT]
target_db_ok = MAPPED_DB
last = last[target_db_ok[last.db.to_numpy()]]
hist = xr[xr.pid.isin(last.pid) & (xr.start_date < C_SPLIT)]
last = last[last.pid.isin(hist.pid)]
if len(last) > 20000:
    last = last.sample(20000, random_state=7)
log("C test people", len(last))
before = xp[xp.start_date < C_SPLIT]
PC = build_people(before)
H = hist[hist.pid.isin(last.pid)].copy()
H = H.sort_values(["pid", "start_date"], ascending=[True, False])
H["w"] = 0.6 ** H.groupby("pid").cumcount()
pids = last.pid.to_numpy()
pmap = pd.Series(np.arange(len(pids)), index=pids)
HP = sp.csr_matrix((H.w, (pmap[H.pid].to_numpy(), H.db.to_numpy())), shape=(len(pids), NDB))
recent_in = xr[(xr.start_date >= C_SPLIT - pd.Timedelta(days=365)) & (xr.start_date < C_SPLIT)]
pop_in = np.bincount(recent_in.db, minlength=NDB).astype(np.float32)
cols = np.where(target_db_ok)[0]
# ALS on careers before the split (items = db companies that are Harper workspaces)
import implicit
Xb = PC["X"][:, cols].tocsr(); Xb.data[:] = 1
als = implicit.als.AlternatingLeastSquares(factors=64, regularization=0.05, iterations=15, alpha=2.0, random_state=7)
als.fit(Xb.astype(np.float32), show_progress=False)
Yc = als.item_factors; Yc = Yc.to_numpy() if hasattr(Yc, "to_numpy") else np.asarray(Yc)
Uc = foldin(Yc, (HP[:, cols] > 0).astype(np.float32).tocsr())
truth = last.db.to_numpy()
col_of = pd.Series(np.arange(len(cols)), index=cols)
tcol = col_of[truth].to_numpy()
_unused = {
    "popularity(recent moves in)": lambda s, e: np.broadcast_to(pop_in[cols], (e - s, len(cols))),
    "transition P(next|prev)": lambda s, e: np.asarray((HP[s:e] @ PC["Tprob"])[:, cols].todense()),
    "transition lift": lambda s, e: np.asarray((HP[s:e] @ PC["Tlift"])[:, cols].todense()),
    "co-employment": lambda s, e: np.asarray((HP[s:e] @ PC["C"])[:, cols].todense()),
    "als": lambda s, e: Uc[s:e] @ Yc.T,
}
from scipy.stats import rankdata
BLEND = ("transition P(next|prev)", "co-employment", "als", "popularity(recent moves in)")


def summarize(rk):
    return {f"recall@{k}": round(float((rk < k).mean()), 4) for k in [10, 50, 100]} | {"median_rank": int(np.median(rk)) + 1}


def rank_eval(HPm, Um, tcol_, fns, subset=None, buckets=None):
    """Rank of the true next company among all candidates. Ties count as half (random tie-break),
    so a model that gives everything 0 does not get credit."""
    hm = (HPm[:, cols] > 0)
    ranks = {n: [] for n in list(fns) + ["blend(RRF)"]}

    def tie_rank(v, t):
        tv = v[np.arange(v.shape[0]), t][:, None]
        return (v > tv).sum(1) + 0.5 * ((v == tv).sum(1) - 1)

    for s in range(0, HPm.shape[0], 2000):
        e = min(s + 2000, HPm.shape[0])
        t = tcol_[s:e]
        fused = np.zeros((e - s, len(cols)), np.float32)
        for name, fn in fns.items():
            v = np.array(fn(HPm, Um, s, e), dtype=np.float32, copy=True)
            v[hm[s:e].toarray()] = -np.inf
            ranks[name].append(tie_rank(v, t))
            if name in BLEND:
                fused += 1.0 / (60 + rankdata(-v, axis=1, method="average"))
        fused[hm[s:e].toarray()] = -np.inf
        ranks["blend(RRF)"].append(tie_rank(fused, t))
    ranks = {k: np.concatenate(v) for k, v in ranks.items()}
    sel = np.ones(HPm.shape[0], bool) if subset is None else subset
    res = {k: summarize(v[sel]) for k, v in ranks.items()}
    if buckets is not None:
        res["by_latest_company_size"] = {}
        for bname, bm in buckets.items():
            m = bm & sel
            if m.sum() >= 20:
                res["by_latest_company_size"][bname] = {"people": int(m.sum()), "share": round(float(m.mean()), 3)} | {k: summarize(v[m]) for k, v in ranks.items()}
    return res


def size_buckets(HPm):
    """Bucket each person by how many people the people DB has for their latest previous company."""
    latest = np.asarray(HPm.argmax(axis=1)).ravel()
    deg = PC["deg"][latest]
    n_prev = np.asarray(HPm.getnnz(1)).ravel()
    return {"latest<=5ppl": deg <= 5, "latest<=5ppl & only_company": (deg <= 5) & (n_prev == 1),
            "latest 6-20": (deg > 5) & (deg <= 20), "latest 21-100": (deg > 20) & (deg <= 100), "latest 100+": deg > 100}


FNS = {
    "popularity(recent moves in)": lambda H_, U_, s, e: np.broadcast_to(pop_in[cols], (e - s, len(cols))),
    "transition P(next|prev)": lambda H_, U_, s, e: np.asarray((H_[s:e] @ PC["Tprob"])[:, cols].todense()),
    "transition lift": lambda H_, U_, s, e: np.asarray((H_[s:e] @ PC["Tlift"])[:, cols].todense()),
    "co-employment": lambda H_, U_, s, e: np.asarray((H_[s:e] @ PC["C"])[:, cols].todense()),
    "als": lambda H_, U_, s, e: U_[s:e] @ Yc.T,
}
C = {"test_people": len(pids), "candidate_companies": len(cols), "split": str(C_SPLIT.date())}
C.update(rank_eval(HP, Uc, tcol, FNS, buckets=size_buckets(HP)))
is_k = last.candid_id.isin(kor).to_numpy()
C["korean_only"] = {"people": int(is_k.sum())} | rank_eval(HP, Uc, tcol, FNS, subset=is_k)
RESULTS["C_career_transition"] = C
log("C done", C)

# ============================================================================= D. Harper users' own latest move
log("== D: Harper talents' own latest move (profile experiences)")
te_ = texp.copy()
te_["db"] = te_.db.astype(int)
te_ = te_[te_.start_date.notna()].sort_values(["talent_id", "start_date"])
te_ = te_[(te_.talent_id != te_.talent_id.shift()) | (te_.db != te_.db.shift())]
lastT = te_.groupby("talent_id").tail(1)
lastT = lastT[(lastT.start_date >= C_SPLIT) & MAPPED_DB[lastT.db.to_numpy()]]
histT = te_[te_.talent_id.isin(lastT.talent_id) & (te_.start_date < C_SPLIT)].copy()
lastT = lastT[lastT.talent_id.isin(histT.talent_id)]
histT = histT.sort_values(["talent_id", "start_date"], ascending=[True, False])
histT["w"] = 0.6 ** histT.groupby("talent_id").cumcount()
tl = lastT.talent_id.to_numpy()
tm = pd.Series(np.arange(len(tl)), index=tl)
HT = sp.csr_matrix((histT.w, (tm[histT.talent_id].to_numpy(), histT.db.to_numpy())), shape=(len(tl), NDB))
UT = foldin(Yc, (HT[:, cols] > 0).astype(np.float32).tocsr())
RESULTS["D_harper_talent_latest_move"] = {"talents": len(tl)} | rank_eval(HT, UT, col_of[lastT.db.to_numpy()].to_numpy(), FNS, buckets=size_buckets(HT))
log("D done", RESULTS["D_harper_talent_latest_move"])
# ============================================================================= examples
log("examples")
names = compi.company_name.fillna("?").to_numpy()
dbname = cdb.set_index("id").name
lines = ["# 추천 예시 (로컬 전용, 공유 금지)", "", f"기준 시점 {T_TEST.date()} 이전 데이터로 만든 추천과, 그 뒤 사용자가 실제로 좋아한 회사.", ""]
ex_users = [t for t in tgt_te if TP[t].nnz >= 2][:6]
dn = ctx_t.dense(np.array(ex_users))
for j, t in enumerate(ex_users):
    past = [str(dbname.get(int(db_ids[d]), "?")) for d in TP[t].indices[np.argsort(-TP[t].data)]][:5]
    lines += [f"## 사용자 {j + 1}", f"- 경력: {' → '.join(reversed(past))}",
              f"- 이후 좋아한 회사: {', '.join(names[list(tgt_te[t])][:8])}"]
    for g in ["trans_lift", "cooc", "als", "emb"]:
        v = np.where(ctx_t.catalog & (ctx_t.SEEN[t].toarray().ravel() == 0) & (PAST_ITEMS[t].toarray().ravel() == 0), dn[g][j], -np.inf)
        top = np.argsort(-v)[:10]
        lines.append(f"- {g}: {', '.join(names[top])}")
    lines.append(f"- GBDT: {', '.join(names[gb_rank.get(t, np.array([], int))[:10]])}")
    lines.append("")
open(f"{OUT}/examples.md", "w").write("\n".join(lines))
json.dump(RESULTS, open(f"{OUT}/results.json", "w"), ensure_ascii=False, indent=1, default=str)
log("wrote", f"{OUT}/results.json", f"{OUT}/examples.md")
