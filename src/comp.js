// dōTERRA「Elevated」奖金制度（2026 年 7 月版，资料：Compensation Plan Elevated Overview v1.9、
// Compensation Plan Booklet、Rank Chart v13、Path to $500、Closing the Gap、Placements Simplified）。
// 系统里的数字是「估算」：佣金用 PV 近似 CV，Unilevel 不做动态压缩，Pools 只算份数（金额取决于全公司业绩）。
// 一切以 doTERRA 后台和政策手册为准。

/* ---------------- 规则 ---------------- */
// 级别：PV 都要 100；OV = 组织业绩；legs = 需要的达标线（must PE = 必须是自己亲自推荐的）
export const RANKS = [
  { code: "wa", zh: "健康倡导者 WA", en: "Wellness Advocate", pv: 0, ov: 0, uni: 1 },
  { code: "manager", zh: "经理 Manager", en: "Manager", pv: 100, ov: 500, uni: 2 },
  { code: "director", zh: "总监 Director", en: "Director", pv: 100, ov: 1000, uni: 3 },
  { code: "executive", zh: "执行 Executive", en: "Executive", pv: 100, ov: 2000, uni: 4 },
  { code: "elite", zh: "精英 Elite", en: "Elite", pv: 100, ov: 3000, uni: 5, tgv: { levels: 3, need: 300, pe: 100, unlock: [4, 5] }, range: [176, 347] },
  { code: "premier", zh: "Premier", en: "Premier", pv: 100, ov: 5000, legs: { n: 2, rank: "executive", pe: true }, uni: 6, tgv: { levels: 4, need: 400, unlock: [5, 6] }, range: [687, 1085] },
  { code: "silver", zh: "银钻 Silver", en: "Silver", pv: 100, legs: { n: 3, rank: "elite", pe: true }, uni: 7, tgv: { levels: 5, need: 500, unlock: [6, 7] }, range: [1627, 2696] },
  { code: "gold", zh: "金钻 Gold", en: "Gold", pv: 100, legs: { n: 3, rank: "premier", pe: true }, uni: 7, tgv: { levels: 6, need: 600, unlock: [6, 7] }, range: [3800, 5148] },
  { code: "platinum", zh: "白金 Platinum", en: "Platinum", pv: 100, legs: { n: 3, rank: "silver" }, uni: 7, tgv: { levels: 7, need: 4000, pool: true }, range: [6774, 9835] },
  { code: "diamond", zh: "钻石 Diamond", en: "Diamond", pv: 100, legs: { n: 4, rank: "silver" }, uni: 7, tgv: { levels: 7, need: 6000, pool: true }, range: [11769, 17659] },
  { code: "blue", zh: "蓝钻 Blue Diamond", en: "Blue Diamond", pv: 100, legs: { n: 5, rank: "gold" }, uni: 7, tgv: { levels: 7, need: 12000, pool: true } },
  { code: "presidential", zh: "总统钻 Presidential", en: "Presidential Diamond", pv: 100, legs: { n: 6, rank: "platinum" }, uni: 7, tgv: { levels: 7, need: 18000, pool: true } },
];
export const RANK_IDX = Object.fromEntries(RANKS.map((r, i) => [r.code, i]));
// Unilevel：第 1 层没有百分比（由 Power of 3 最多 $100 代替）
export const UNI_PCT = { 1: 0, 2: 0.03, 3: 0.05, 4: 0.05, 5: 0.06, 6: 0.06, 7: 0.07 };
export const FAST_START = [0.2, 0.1, 0.05]; // 新会员前 60 天的订单：推荐人 20%、推荐人的推荐人 10%、再上一层 5%（要有 100 QV）
export const PO3 = { personal: 100, pod: 500, podRewards: 300, podFlex: 200, podPE: 100, base: [50, 250, 1250] };
// Power of 3 Boost：按 PGV（亲自推荐、12 个月内入会的会员本月 Rewards 业绩）
export const BOOST = [
  { pgv: 1200, amt: 500, minLevel: 3 },
  { pgv: 800, amt: 250, minLevel: 2 },
  { pgv: 400, amt: 50, minLevel: 1 },
];
export const POOLS = [
  { zh: "赋能奖金池 Empowerment", pct: "1.5%", who: "Premier、Silver 每月亲自推荐一位 100 PV 新会员得 1 份；Gold 推荐 2 位以上得 2 份" },
  { zh: "领导奖金池 Leadership", pct: "2%", who: "Silver 1 份、Gold 5 份、Platinum 10 份；亲自推荐的人第一次达到 Elite，再加 1 份" },
  { zh: "业绩奖金池 Performance", pct: "1.5%", who: "Platinum 1 份（TGV 4,000 达标 3 份）、Diamond 3（6,000：4 份）、Blue Diamond 3（12,000：6 份）、Presidential 3（18,000：8 份）" },
  { zh: "钻石 / 蓝钻 / 总统钻奖金池", pct: "各 1%", who: "达到该级别 2 份，TGV 达标（6,000 / 12,000 / 18,000）共 4 份" },
];
export const REWARDS = { tiers: "每月 Rewards 订单 50 PV 以上，按连续月数返 10%–30% 积分", ship: "100 PV 以上免标准运费", potm: "每月 15 号前下 125 PV 以上，送当月赠品（Product of the Month）", vip: "积分比例到 30% 自动成为 VIP" };
export const rankOf = (code) => RANKS[RANK_IDX[code] ?? 0];

/* ---------------- 工具 ---------------- */
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const ymOf = (d) => String(d || "").slice(0, 7);
const addMonths = (ym, k) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };
const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 864e5;

/**
 * 按帐户算一个月。
 * data: { members, accts, orders }；ym: "YYYY-MM"
 * 帐户上下线：sponsor_account_id（安置的上线）/ enroller_account_id（亲自推荐人）；
 * 没填时：同一人的子帐户挂主号；主号挂到这个人上线的主号；推荐人默认 = 安置上线。
 */
export function computeMonth(data, ym) {
  const { members = [], accts = [], orders = [] } = data;
  const byId = new Map(accts.map((a) => [a.id, a]));
  const mainOf = new Map();
  for (const a of accts) if (a.is_main || !mainOf.has(a.member_id)) { if (a.is_main || !mainOf.get(a.member_id)?.is_main) mainOf.set(a.member_id, a); }
  const memById = new Map(members.map((m) => [m.id, m]));
  const sponsorOf = (a) => {
    if (a.sponsor_account_id && byId.has(a.sponsor_account_id)) return a.sponsor_account_id;
    const main = mainOf.get(a.member_id);
    if (main && main.id !== a.id) return main.id;
    let up = memById.get(a.member_id)?.sponsor_id; const seen = new Set();
    while (up && !seen.has(up)) { seen.add(up); const m2 = mainOf.get(up); if (m2) return m2.id; up = memById.get(up)?.sponsor_id; }
    return null;
  };
  const S = new Map(accts.map((a) => [a.id, sponsorOf(a)]));
  const E = new Map(accts.map((a) => [a.id, a.enroller_account_id && byId.has(a.enroller_account_id) ? a.enroller_account_id : S.get(a.id)]));
  const kids = new Map(); for (const a of accts) { const p = S.get(a.id); if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(a.id); } }
  const peMap = new Map(); for (const a of accts) { const e = E.get(a.id); if (e) { if (!peMap.has(e)) peMap.set(e, []); peMap.get(e).push(a.id); } }
  // 入会日期：填了用填的；否则用会员加入日期；再否则第一张订单
  const firstOrder = new Map(); for (const o of orders) if (o.account_id && (!firstOrder.has(o.account_id) || o.date < firstOrder.get(o.account_id))) firstOrder.set(o.account_id, o.date);
  const enrollDate = (id) => { const a = byId.get(id); return a?.enroll_date || (a?.is_main && memById.get(a.member_id)?.joined) || firstOrder.get(id) || a?.created_at?.slice(0, 10) || "2000-01-01"; };
  const isNew12 = (id) => { const e = ymOf(enrollDate(id)); return e >= addMonths(ym, -12) && e < ym; }; // 前 12 个月内入会、且不是本月

  // 本月订单按帐户
  const mo = new Map();
  for (const o of orders) {
    if (ymOf(o.date) !== ym || !o.account_id || !byId.has(o.account_id)) continue;
    const x = mo.get(o.account_id) || { pv: 0, rpv: 0, fsPv: 0, uniPv: 0, orders: [] };
    const pv = n(o.total_pv); x.pv += pv; if (o.lrp) x.rpv += pv; x.orders.push(o);
    if (daysBetween(enrollDate(o.account_id), o.date) <= 60) x.fsPv += pv; else x.uniPv += pv;
    mo.set(o.account_id, x);
  }
  const M = (id) => mo.get(id) || { pv: 0, rpv: 0, fsPv: 0, uniPv: 0, orders: [] };

  const R = new Map(); // 结果
  const order = []; const visit = (id, seen = new Set()) => { if (seen.has(id)) return; seen.add(id); (kids.get(id) || []).forEach((k) => visit(k, seen)); order.push(id); };
  const roots = accts.filter((a) => !S.get(a.id)).map((a) => a.id); const seenAll = new Set();
  roots.forEach((r) => visit(r, seenAll)); accts.forEach((a) => visit(a.id, seenAll)); // 防环

  for (const id of order) {
    const me = M(id); const fl = kids.get(id) || [];
    // OV：自己 + 全部下线
    let ov = me.pv; for (const k of fl) ov += R.get(k).ov;
    // 每条线里最高级别（区分是否亲自推荐）
    const legBest = fl.map((k) => R.get(k).subBest);
    const legBestPE = fl.map((k) => R.get(k).subBestPE[id] ?? -1);
    // 级别（从高往低试）
    let rank = 0; const wc = byId.get(id)?.acct_type === "wc"; // 批发客户不拿佣金、没有级别
    for (let i = wc ? 0 : RANKS.length - 1; i >= 1; i--) {
      const r = RANKS[i];
      if (me.pv < r.pv) continue;
      if (r.ov && ov < r.ov) continue;
      if (r.legs) { const need = RANK_IDX[r.legs.rank]; const cnt = (r.legs.pe ? legBestPE : legBest).filter((x) => x >= need).length; if (cnt < r.legs.n) continue; }
      rank = i; break;
    }
    // 给上线用：这条线里最高级别；以及「由某人亲自推荐的」最高级别
    let subBest = rank; for (const k of fl) subBest = Math.max(subBest, R.get(k).subBest);
    const subBestPE = {}; const enr = E.get(id); if (enr) subBestPE[enr] = rank;
    for (const k of fl) for (const [e, v] of Object.entries(R.get(k).subBestPE)) subBestPE[e] = Math.max(subBestPE[e] ?? -1, v);
    // Power of 3
    const podR = fl.reduce((s, k) => s + M(k).rpv, 0), podAll = fl.reduce((s, k) => s + M(k).pv, 0);
    const podOther = podAll - podR; const podVol = podR + Math.min(PO3.podFlex, podOther);
    const podPE = fl.filter((k) => E.get(k) === id).reduce((s, k) => s + M(k).pv, 0);
    const l1 = !wc && me.rpv >= PO3.personal && podR >= PO3.podRewards && podVol >= PO3.pod && podPE >= PO3.podPE;
    const fl1 = fl.filter((k) => R.get(k).po3Level >= 1).length, fl2 = fl.filter((k) => R.get(k).po3Level >= 2).length;
    const po3Level = !l1 ? 0 : fl2 >= 3 ? 3 : fl1 >= 3 ? 2 : 1;
    // PGV：亲自推荐、12 个月内入会的帐户本月 Rewards PV
    const pe = peMap.get(id) || [];
    const pgv = pe.filter(isNew12).reduce((s, k) => s + M(k).rpv, 0);
    const boost = po3Level ? (BOOST.find((b) => pgv >= b.pgv && po3Level >= b.minLevel)?.amt || 0) : 0;
    R.set(id, { id, pv: me.pv, rpv: me.rpv, ov, rank, subBest, subBestPE, fl, pe, po3: { level: po3Level, l1, podR, podOther, podVol, podPE, fl1, fl2, base: po3Level ? PO3.base[po3Level - 1] : 0, boost, pgv }, legBest, legBestPE, orders: me.orders });
  }

  // 第二轮：需要按层往下看的（TGV、Unilevel、Fast Start）
  const levelsOf = (id, depth) => { const out = []; let cur = [id]; for (let d = 1; d <= depth; d++) { cur = cur.flatMap((x) => kids.get(x) || []); out.push(cur); } return out; };
  for (const a of accts) {
    const r = R.get(a.id); if (!r) continue;
    const rk = RANKS[r.rank];
    const lv = levelsOf(a.id, 7);
    // TGV
    let tgv = 0, tgvPE = 0;
    if (rk.tgv) {
      lv.slice(0, rk.tgv.levels).forEach((ids) => ids.forEach((k) => { if (isNew12(k)) { const v = M(k).pv; tgv += v; if (E.get(k) === a.id) tgvPE += v; } }));
    }
    const tgvOk = !rk.tgv || (tgv >= rk.tgv.need && (!rk.tgv.pe || tgvPE >= rk.tgv.pe));
    let maxLevel = rk.uni;
    if (rk.tgv && !rk.tgv.pool && !tgvOk) maxLevel = Math.min(maxLevel, rk.tgv.unlock[0] - 1);
    const wc = a.acct_type === "wc";
    const uni = lv.map((ids, i) => { const level = i + 1; const vol = ids.reduce((s, k) => s + M(k).uniPv, 0); const pct = UNI_PCT[level]; const open = !wc && level >= 2 && level <= maxLevel && r.pv >= 100; return { level, people: ids.length, vol, pct, open, amt: open ? vol * pct : 0 }; });
    // Fast Start：我推荐的（20%）、我推荐的人推荐的（10%）、再一层（5%）
    const fs = []; const qual = !wc && r.pv >= 100;
    const walkE = (id, depth) => { if (depth > 3) return; (peMap.get(id) || []).forEach((xid) => { const v = M(xid).fsPv; if (v) fs.push({ acct: xid, depth, vol: v, amt: qual ? v * FAST_START[depth - 1] : 0 }); walkE(xid, depth + 1); }); };
    walkE(a.id, 1);
    r.tgv = { value: tgv, pe: tgvPE, ok: tgvOk, need: rk.tgv?.need || 0, levels: rk.tgv?.levels || 0 };
    r.uni = uni; r.uniTotal = uni.reduce((s, x) => s + x.amt, 0); r.maxLevel = maxLevel;
    r.fs = fs; r.fsTotal = fs.reduce((s, x) => s + x.amt, 0);
    r.po3Total = r.po3.base + r.po3.boost;
    r.total = r.uniTotal + r.fsTotal + r.po3Total;
    r.sponsor = S.get(a.id); r.enroller = E.get(a.id); r.enrollDate = enrollDate(a.id);
    r.next = nextGap(r, R);
  }
  return R;
}

/** 下一级还差什么（逐项列出） */
function nextGap(r, R) {
  const i = r.rank + 1; if (i >= RANKS.length) return null;
  const nx = RANKS[i]; const items = [];
  items.push({ key: "pv", zh: "个人 PV", en: "Personal PV", have: r.pv, need: nx.pv });
  if (nx.ov) items.push({ key: "ov", zh: "组织业绩 OV", en: "Organisation volume", have: r.ov, need: nx.ov });
  if (nx.legs) {
    const need = RANK_IDX[nx.legs.rank]; const arr = nx.legs.pe ? r.legBestPE : r.legBest;
    const have = arr.filter((x) => x >= need).length;
    items.push({ key: "legs", zh: `达到 ${RANKS[need].zh} 的${nx.legs.pe ? "亲自推荐" : ""}线`, en: `${nx.legs.pe ? "Personally enrolled " : ""}${RANKS[need].en} legs`, have, need: nx.legs.n, unit: "legs" });
  }
  return { rank: nx, items: items.map((x) => ({ ...x, left: Math.max(0, x.need - x.have), ok: x.have >= x.need })) };
}

export const fmtUsd = (v) => `$${Math.round(n(v)).toLocaleString()}`;

/* ---------------- 自动分析：离每个奖金还差什么、补多少能多拿多少 ----------------
 * 做法：对每一个可行的动作，真的把订单加进去重新算一次，比较这个帐户（和整个团队）的预计奖金。
 */
const SIM_DATE = (ym) => `${ym}-15`;
function withOrders(data, adds, ym) {
  const extra = adds.filter((a) => a.pv > 0).map((a, i) => ({ id: `sim-${i}`, account_id: a.acct, member_id: a.member_id, date: SIM_DATE(ym), total_pv: a.pv, lrp: a.lrp !== false }));
  return { ...data, accts: data.accts.concat(adds.filter((a) => a.newAcct).map((a) => a.newAcct)), orders: data.orders.concat(extra) };
}
const teamTotal = (R, ids) => ids.reduce((s, id) => s + (R.get(id)?.total || 0), 0);

export function advise(data, ym, acctId, R0) {
  const R = R0 || computeMonth(data, ym);
  const r = R.get(acctId); if (!r) return null;
  const byId = new Map(data.accts.map((a) => [a.id, a]));
  const me = byId.get(acctId);
  const name = (id) => { const a = byId.get(id); const m = data.members.find((x) => x.id === a?.member_id); return a ? `${m?.name || ""}${a.label ? ` · ${a.label}` : ""}` : "?"; };
  const ours = data.accts.map((a) => a.id); // 能看到的都是我们团队
  const base = r.total, baseTeam = teamTotal(R, ours);
  const tips = [];
  const sim = (key, title, detail, adds, extra = {}) => {
    const cost = adds.reduce((s, a) => s + (a.pv || 0), 0);
    const R2 = computeMonth(withOrders(data, adds, ym), ym);
    const gain = (R2.get(acctId)?.total || 0) - base;
    const teamGain = teamTotal(R2, ours) - baseTeam;
    const r2 = R2.get(acctId);
    tips.push({ key, title, detail, cost, gain, teamGain, roi: cost ? gain / cost : 0, rankAfter: r2?.rank, po3After: r2?.po3.level, ...extra });
  };
  const fl = r.fl || [];
  const pe = (id) => data.accts.filter((a) => a.enroller_account_id === id || (!a.enroller_account_id && R.get(a.id)?.enroller === id)).map((a) => a.id);
  const needPersonal = Math.max(0, PO3.personal - r.rpv);
  const personalAdd = needPersonal ? [{ acct: acctId, member_id: me.member_id, pv: needPersonal }] : [];

  // 1) 自己的 100 PV
  if (r.pv < 100 || needPersonal) sim("personal", `自己补 ${Math.ceil(needPersonal || 100 - r.pv)} PV 的 Rewards 订单`, "每个奖金都要先有自己当月 100 PV（Power of 3 要求是 Rewards 订单）。补了才能拿 Fast Start、Unilevel 和 Power of 3。", personalAdd.length ? personalAdd : [{ acct: acctId, member_id: me.member_id, pv: 100 - r.pv }]);

  // 2) Power of 3 第 1 级：第一层 Pod
  const po = r.po3;
  if (po.level < 1) {
    const need = Math.max(0, PO3.podRewards - po.podR, PO3.pod - po.podVol, PO3.podPE - po.podPE);
    const peFl = fl.filter((k) => R.get(k)?.enroller === acctId);
    const target = peFl.sort((a, b) => (R.get(b).rpv) - (R.get(a).rpv))[0] || fl[0];
    if (need > 0 && target) sim("po3_1", `Power of 3 第 1 级：第一层再做 ${Math.ceil(need)} PV`, `第一层（Pod）现在 ${Math.round(po.podVol)} / 500 PV，其中 Rewards ${Math.round(po.podR)} / 300、亲自推荐的 ${Math.round(po.podPE)} / 100。建议由 ${name(target)} 补一张 Rewards 单${needPersonal ? `，再加上你自己的 ${Math.ceil(needPersonal)} PV` : ""}。`, [...personalAdd, { acct: target, member_id: byId.get(target).member_id, pv: need }]);
    else if (need > 0) sim("po3_1n", "Power of 3 第 1 级：第一层还没有人", `要在你第一层放会员，合计 500 PV（至少 300 Rewards，100 是你亲自推荐的）。下面按「新推荐一位 500 PV 的会员」估算。`, [...personalAdd, { acct: `sim-new-${acctId}`, member_id: null, pv: 500, newAcct: { id: `sim-new-${acctId}`, member_id: null, label: "（新会员）", sponsor_account_id: acctId, enroller_account_id: acctId, enroll_date: SIM_DATE(ym), acct_type: "wa" } }]);
  }
  // 3) Power of 3 第 2 / 3 级：帮第一层的人拿到 $50 / $250
  if (po.level >= 1 && po.level < 3) {
    const wantLv = po.level; // 第 2 级要第一层 3 人到第 1 级；第 3 级要 3 人到第 2 级
    const have = wantLv === 1 ? po.fl1 : po.fl2;
    const cand = fl.filter((k) => (R.get(k)?.po3.level || 0) < wantLv).map((k) => {
      const c = R.get(k); const kp = c.po3; const adds = [];
      const pNeed = Math.max(0, PO3.personal - c.rpv); if (pNeed) adds.push({ acct: k, member_id: byId.get(k).member_id, pv: pNeed });
      const podNeed = Math.max(0, PO3.podRewards - kp.podR, PO3.pod - kp.podVol, PO3.podPE - kp.podPE);
      const kfl = c.fl || []; const t = kfl.sort((a, b) => R.get(b).rpv - R.get(a).rpv)[0];
      if (podNeed > 0 && t) adds.push({ acct: t, member_id: byId.get(t).member_id, pv: podNeed });
      return { k, adds, cost: adds.reduce((s, a) => s + a.pv, 0), blocked: podNeed > 0 && !t, pNeed, podNeed };
    });
    const doable = cand.filter((c) => !c.blocked && wantLv === 1).sort((a, b) => a.cost - b.cost);
    const missing = 3 - have;
    if (missing > 0 && doable.length >= missing) {
      const pick = doable.slice(0, missing);
      sim(`po3_${wantLv + 1}`, `Power of 3 第 ${wantLv + 1} 级：帮第一层 ${missing} 个人拿到 $50`, pick.map((c) => `${name(c.k)}：${c.pNeed ? `自己补 ${Math.ceil(c.pNeed)} PV` : "自己已够"}${c.podNeed ? `，他的第一层补 ${Math.ceil(c.podNeed)} PV` : ""}`).join("；"), pick.flatMap((c) => c.adds), { people: pick.map((c) => c.k) });
    } else if (missing > 0) {
      tips.push({ key: `po3_${wantLv + 1}_info`, title: `Power of 3 第 ${wantLv + 1} 级：还要 ${missing} 个第一层的人拿到 ${wantLv === 1 ? "$50" : "$250"}`, detail: cand.map((c) => `${name(c.k)}${c.blocked ? "（他的第一层还没有人，需要先推荐新会员）" : c.cost ? `（差 ${Math.ceil(c.cost)} PV）` : ""}`).join("；") || "第一层的人数不够，需要再推荐新会员放到你第一层。", cost: 0, gain: 0, teamGain: 0, roi: 0, info: true });
    }
  }
  // 4) Power of 3 加码（PGV）
  if (po.level >= 1) {
    const next = [...BOOST].reverse().find((b) => po.pgv < b.pgv && po.level >= b.minLevel);
    if (next) {
      const newPE = pe(acctId).filter((k) => { const e = R.get(k)?.enrollDate || ""; return e >= addMonths(ym, -12) && e.slice(0, 7) < ym; });
      const gap = next.pgv - po.pgv;
      if (newPE.length) sim("boost", `加码：PGV 再做 ${Math.ceil(gap)}（到 ${next.pgv}）`, `PGV 现在 ${Math.round(po.pgv)}。可以请 12 个月内由你推荐的会员（例如 ${name(newPE[0])}）多下 Rewards 单。`, [{ acct: newPE[0], member_id: byId.get(newPE[0]).member_id, pv: gap }]);
      else tips.push({ key: "boost_info", title: `加码：PGV 还差 ${Math.ceil(gap)}（到 ${next.pgv} 加 $${next.amt}）`, detail: "PGV 只算你亲自推荐、在之前 12 个月内入会的会员的 Rewards 订单（入会当月不算）。现在没有这样的会员，需要先推荐新人，从下个月起算。", cost: 0, gain: 0, teamGain: 0, roi: 0, info: true });
    }
  }
  // 5) 下一个级别
  if (r.next) {
    const nx = r.next.rank; const ovItem = r.next.items.find((x) => x.key === "ov");
    const adds = [...personalAdd];
    if (ovItem && ovItem.left > 0) { const t = fl.sort((a, b) => R.get(b).ov - R.get(a).ov)[0] || acctId; adds.push({ acct: t, member_id: byId.get(t).member_id, pv: ovItem.left }); }
    const legItem = r.next.items.find((x) => x.key === "legs");
    if (ovItem && ovItem.left > 0 && (!legItem || legItem.ok)) sim("rank", `升到 ${nx.zh}：团队再做 ${Math.ceil(ovItem.left)} PV${needPersonal ? `（另加自己补 ${Math.ceil(needPersonal)} PV）` : ""}`, `组织业绩现在 ${Math.round(ovItem.have)} / ${ovItem.need}。升级后 Unilevel 拿到第 ${nx.uni} 层。`, adds);
  }
  // 6) TGV（解锁较深的层）
  if (r.tgv.need && !r.tgv.ok && !RANKS[r.rank].tgv?.pool) tips.push({ key: "tgv", title: `TGV 还差 ${Math.ceil(r.tgv.need - r.tgv.value)}，解锁第 ${RANKS[r.rank].tgv.unlock.join("、")} 层`, detail: `TGV 只算 ${r.tgv.levels} 层内、之前 12 个月内新入会会员的业绩（入会当月不算）。现在 ${Math.round(r.tgv.value)} / ${r.tgv.need}。`, cost: 0, gain: 0, teamGain: 0, roi: 0, info: true });

  // 每条线（为下一个级别）
  let legs = null;
  if (r.next?.items.find((x) => x.key === "legs")) {
    const L = r.next.rank.legs; const needIdx = RANK_IDX[L.rank];
    legs = { need: L, rows: fl.map((k) => {
      // 这条线里级别最高（或最接近）的那个帐户
      const ids = []; const stack = [k]; while (stack.length) { const x = stack.pop(); ids.push(x); (R.get(x)?.fl || []).forEach((y) => stack.push(y)); }
      const elig = ids.filter((x) => !L.pe || R.get(x)?.enroller === acctId);
      const best = elig.sort((a, b) => R.get(b).rank - R.get(a).rank || R.get(b).ov - R.get(a).ov)[0];
      const br = best ? R.get(best) : null;
      const ok = br && br.rank >= needIdx;
      const T = RANKS[needIdx]; let gap = null, add = 0;
      if (!ok && br) {
        gap = [];
        if (br.pv < T.pv) { gap.push({ zh: "个人 PV", en: "PV", left: T.pv - br.pv }); add += T.pv - br.pv; }
        if (T.ov && br.ov < T.ov) { gap.push({ zh: "组织业绩 OV", en: "OV", left: T.ov - br.ov }); add += T.ov - br.ov - Math.max(0, T.pv - br.pv); }
        if (T.legs) gap.push({ zh: `还要自己的 ${T.legs.n} 条 ${RANKS[RANK_IDX[T.legs.rank]].zh} 线`, en: "legs", left: 0 });
      }
      return { head: k, best, bestRank: br?.rank ?? -1, ok, gap, add, simple: !T.legs, ov: R.get(k).ov };
    }).sort((a, b) => b.bestRank - a.bestRank || (a.add || 1e9) - (b.add || 1e9)) };
    const okN = legs.rows.filter((l) => l.ok).length, missing = L.n - okN;
    const near = legs.rows.filter((l) => !l.ok && l.best && l.simple).sort((a, b) => a.add - b.add).slice(0, missing);
    if (missing > 0 && near.length === missing) {
      const adds = [...personalAdd, ...near.map((l) => ({ acct: l.best, member_id: byId.get(l.best).member_id, pv: l.add }))];
      sim("legs", `升到 ${r.next.rank.zh}：帮 ${missing} 条线升到 ${RANKS[needIdx].zh}`, near.map((l) => `${name(l.best)} 补 ${Math.ceil(l.add)} PV`).join("；") + "。", adds);
      tips.sort((a, b) => (b.info ? -1 : 0) - (a.info ? -1 : 0) || b.roi - a.roi || b.gain - a.gain);
    }
  }
  // Fast Start 期内的会员
  const fsWin = [];
  const walk = (id, depth) => { if (depth > 3) return; pe(id).forEach((k) => { const ed = R.get(k)?.enrollDate; const left = 60 - Math.floor((new Date(SIM_DATE(ym)) - new Date(ed)) / 864e5); if (left > 0 && left <= 75) fsWin.push({ acct: k, depth, daysLeft: Math.min(60, left), rate: FAST_START[depth - 1] }); walk(k, depth + 1); }); };
  walk(acctId, 1);
  tips.sort((a, b) => (b.info ? -1 : 0) - (a.info ? -1 : 0) || b.roi - a.roi || b.gain - a.gain);
  return { r, tips, legs, fsWin, name };
}

/* ---------------- 分销订单 → 团队里怎样下单最划算 ----------------
 * units：拆好的单品 [{ id, label, pv, order }]（套组算一件，不拆）。
 * 逐件（PV 大的先）试放到每个候选帐户，按规则重算全团队奖金，放到多拿最多的那个；
 * 多开一张单有运费，所以放到「这次还没用到的帐户」时扣一点（shipPenalty）。
 * 另外比较：整张单让客人开新会员帐户下（挂在某个帐户下面，拿 Fast Start）。
 */
export function allocate(data, ym, units, opt = {}) {
  const o = { lrp: true, shipPenalty: 5, maxCand: 60, ...opt };
  const ours = data.accts.filter((a) => a.acct_type !== "wc" || true).map((a) => a.id);
  const R0 = computeMonth(data, ym);
  const total = (R) => teamTotal(R, ours);
  const base = total(R0);
  const byId = new Map(data.accts.map((a) => [a.id, a]));
  // 候选：有缺口的帐户（自己不到 100、Po3 没到第 3 级、离下一级 OV 不远）＋默认帐户
  let cand = data.accts.filter((a) => {
    const r = R0.get(a.id); if (!r) return false;
    if (r.rpv < 100) return true;
    if (r.po3.level < 3) return true;
    const ov = r.next?.items.find((x) => x.key === "ov"); return ov && ov.left <= 1500;
  }).map((a) => a.id);
  if (o.defaultAcct && !cand.includes(o.defaultAcct)) cand.unshift(o.defaultAcct);
  cand = cand.slice(0, o.maxCand);
  let cur = data, curTotal = base, curR = R0; const used = new Set(); const plan = [];
  const sorted = [...units].sort((a, b) => b.pv - a.pv);
  for (const u of sorted) {
    let best = null;
    for (const id of cand) {
      const a = byId.get(id);
      const d2 = withOrders(cur, [{ acct: id, member_id: a.member_id, pv: u.pv, lrp: o.lrp }], ym);
      const R2 = computeMonth(d2, ym); const t = total(R2);
      const score = t - curTotal - (used.has(id) ? 0 : o.shipPenalty) + (id === o.defaultAcct ? 0.01 : 0);
      if (!best || score > best.score) best = { id, d2, R2, t, score };
    }
    if (!best) break;
    // 谁因为这件多拿了：找变化最大的帐户
    let ben = null, bd = 0;
    for (const id of ours) { const dlt = (best.R2.get(id)?.total || 0) - (curR.get(id)?.total || 0); if (dlt > bd) { bd = dlt; ben = id; } }
    const why = [];
    if (ben) {
      const a0 = curR.get(ben), a1 = best.R2.get(ben);
      if (a1.rank > a0.rank) why.push(`升到 ${RANKS[a1.rank].zh}`);
      if (a1.po3.level > a0.po3.level) why.push(`Power of 3 到第 ${a1.po3.level} 级`);
      if (a1.po3.boost > a0.po3.boost) why.push("拿到加码");
      if (a0.pv < 100 && a1.pv >= 100) why.push("够 100 PV，佣金资格达标");
      if (!why.length) why.push("层级提成增加");
      if (ben !== best.id) { const ba = byId.get(ben); const bm = data.members.find((x) => x.id === ba?.member_id); why.unshift(`${bm?.name || ""}${ba?.label ? ` · ${ba.label}` : ""}：`); }
    }
    plan.push({ unit: u, acct: best.id, gain: best.t - curTotal, ben, benGain: bd, why: why[0]?.endsWith("：") ? why[0] + why.slice(1).join("、") : why.join("、") });
    used.add(best.id); cur = best.d2; curTotal = best.t; curR = best.R2;
  }
  // 全部下在默认帐户（对照）
  let baseline = null;
  if (o.defaultAcct) { const a = byId.get(o.defaultAcct); const sumPv = units.reduce((s, u) => s + u.pv, 0); baseline = total(computeMonth(withOrders(data, [{ acct: o.defaultAcct, member_id: a.member_id, pv: sumPv, lrp: o.lrp }], ym), ym)) - base; }
  // 新会员：整张单（这次全部件数）由客人开新帐户下，挂在某个帐户下面
  let newMember = null;
  const sumPv = units.reduce((s, u) => s + u.pv, 0);
  const hubs = data.accts.filter((a) => (R0.get(a.id)?.pv || 0) >= 100 && a.acct_type !== "wc").map((a) => a.id).slice(0, 40);
  for (const h of hubs) {
    const na = { id: `sim-nm-${h}`, member_id: null, label: "新会员", sponsor_account_id: h, enroller_account_id: h, enroll_date: SIM_DATE(ym), acct_type: "wc" };
    const t = total(computeMonth(withOrders(data, [{ acct: na.id, member_id: null, pv: sumPv, lrp: false, newAcct: na }], ym), ym)) - base;
    if (!newMember || t > newMember.gain) newMember = { hub: h, gain: t };
  }
  // 合并成「每个帐户下一张单」
  const byAcct = new Map();
  for (const p of plan) { const x = byAcct.get(p.acct) || { acct: p.acct, units: [], pv: 0, gain: 0, why: new Set() }; x.units.push(p.unit); x.pv += p.unit.pv; x.gain += p.gain; if (p.why) x.why.add(p.why); byAcct.set(p.acct, x); }
  return { plan, orders: [...byAcct.values()].map((x) => ({ ...x, why: [...x.why].join("；") })).sort((a, b) => b.gain - a.gain), gain: curTotal - base, baseline, newMember, sumPv };
}
