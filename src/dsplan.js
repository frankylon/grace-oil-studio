// 合作伙伴分成计划（对外方案，2026 年 12 月起）——分销结算按这里算。
// 谁成交算谁的：每张单只看是谁下的（销售员链接 → 销售员；门店链接没有销售员 → 店主自己）。
// 客人不绑定在某个销售员名下，也不分新客人 / 老客人：只看订单。
// 冲量奖按当月「有效订单」张数（每张满 $100 算一张），取最高一档。
export const PLAN = {
  rep: [[0, 0.08], [1000, 0.10], [3000, 0.12], [10000, 0.13]],   // 独立销售伙伴（前台、外场）
  staff: [[0, 0.05], [2000, 0.07], [5000, 0.09]],                 // 门店的店员 / 店主自己卖
  store: 0.05,                                                     // 门店分成：店里卖出的全部
  validMin: 100,                                                   // 有效订单：每张满 $100
  mile: [[100, 450], [50, 200], [25, 80], [10, 30]],               // 当月有效订单冲量奖（取最高一档）
};
export const tierRate = (t, s) => t.filter(([a]) => s >= a).pop()[1];
export const milestone = (nc) => (PLAN.mile.find(([a]) => nc >= a) || [0, 0])[1];
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const live = (o) => o.status !== "cancelled";
export const isValid = (o) => n(o.subtotal) >= PLAN.validMin;

/** 某个月的结算：每位成交人（销售员 / 店主）和每个门店各拿多少 */
export function monthStatement(d, ym) {
  const os = d.orders.filter((o) => live(o) && String(o.created_at).slice(0, 7) === ym);
  const sellers = new Map();
  for (const o of os) {
    const rep = d.reps.find((r) => r.id === o.rep_id);
    const k = rep ? `rep:${rep.id}` : `store:${o.store_id || "none"}`;
    const x = sellers.get(k) || { key: k, rep, store: d.stores.find((s) => s.id === (rep ? rep.store_id : o.store_id)) || null, kind: rep ? (rep.store_id ? "staff" : "rep") : "owner", orders: [], sales: 0, nc: 0 };
    x.orders.push(o); x.sales += n(o.subtotal); if (isValid(o)) x.nc++;
    sellers.set(k, x);
  }
  const people = [...sellers.values()].map((x) => {
    const rate = tierRate(x.kind === "rep" ? PLAN.rep : PLAN.staff, x.sales);
    const comm = x.sales * rate, mile = milestone(x.nc);
    const nextMile = [...PLAN.mile].reverse().find(([a]) => x.nc < a);
    return { ...x, rate, comm, mile, nextMile, total: comm + mile };
  }).sort((a, b) => b.total - a.total);
  const stores = d.stores.map((s) => {
    const mine = os.filter((o) => o.store_id === s.id);
    const sales = mine.reduce((a, o) => a + n(o.subtotal), 0);
    const share = sales * PLAN.store;
    const owner = people.find((p) => p.kind === "owner" && p.store?.id === s.id);
    const staff = people.filter((p) => p.kind === "staff" && p.store?.id === s.id);
    const staffTotal = staff.reduce((a, p) => a + p.total, 0);
    const collected = mine.filter((o) => o.payment === "store_collected").reduce((a, o) => a + n(o.subtotal), 0);
    // 店家应交回 ＝ 店里代收的款 − 门店分成 − 店主自己卖的提成（− 店员的提成，如果由店家发）
    const net = collected - share - (owner?.total || 0) - (s.staff_paid_by === "store" ? staffTotal : 0);
    return { s, orders: mine, sales, share, owner, staff, staffTotal, collected, net, settled: mine.length > 0 && mine.every((o) => o.settled) };
  }).filter((x) => x.orders.length);
  const payout = people.reduce((a, p) => a + p.total, 0) + stores.reduce((a, x) => a + x.share, 0);
  const sales = os.reduce((a, o) => a + n(o.subtotal), 0);
  return { os, people, stores, sales, payout };
}

/** 单张订单的估算（月底按当月总额定档，这里先用这位成交人到这张单为止的当月销售额估） */
export function orderEstimate(d, o) {
  const st = monthStatement(d, String(o.created_at || new Date().toISOString()).slice(0, 7));
  const p = st.people.find((x) => x.orders.some((y) => y.id === o.id));
  return { store: o.store_id ? n(o.subtotal) * PLAN.store : 0, rate: p?.rate ?? PLAN.rep[0][1], seller: p ? n(o.subtotal) * p.rate : 0, valid: isValid(o), kind: p?.kind, p };
}
