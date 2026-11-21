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
    const pe = accts.filter((a) => E.get(a.id) === id).map((a) => a.id);
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
    const walkE = (id, depth) => { if (depth > 3) return; accts.filter((x) => E.get(x.id) === id).forEach((x) => { const v = M(x.id).fsPv; if (v) fs.push({ acct: x.id, depth, vol: v, amt: qual ? v * FAST_START[depth - 1] : 0 }); walkE(x.id, depth + 1); }); };
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
