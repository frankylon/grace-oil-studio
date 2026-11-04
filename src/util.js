export const SYM = { CAD: "CA$", USD: "US$", RMB: "¥" };
export function money(n, c = "CAD") {
  if (n == null || n === "") return "";
  const v = Number(n);
  return (SYM[c] || "") + v.toLocaleString(undefined, { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
export const today = () => new Date().toISOString().slice(0, 10);
export const daysSince = (d) => (d ? Math.floor((Date.parse(today()) - Date.parse(d)) / 864e5) : null);

export function totalDrops(items) { return (items || []).reduce((s, i) => s + (Number(i.drops) || 0), 0); }
export function dilutionPct(items, ml) {
  const tot = totalDrops(items);
  if (!tot || !ml) return null;
  return Math.round((tot / (ml * 20)) * 1000) / 10; // 约 20 滴 = 1ml
}
export function carrierMl(text) {
  const m = String(text || "").match(/(\d+)\s*(ml|g|毫升|克)/i);
  return m ? Number(m[1]) : null;
}

const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/\(.*?\)|（.*?）/g, "").replace(/(复方|呵护|精油|滚珠|\d+ml)$/gi, "").replace(/(复方|呵护|精油)$/g, "").toLowerCase();
// 会员是否买过某产品（按产品 id、中文名或英文名比对）
export function ownedSet(orders) {
  const s = new Set();
  for (const o of orders || []) for (const it of o.items || []) {
    if (it.product) s.add("id:" + it.product);
    if (it.zh) s.add("zh:" + norm(it.zh));
    if (it.en) s.add("en:" + norm(it.en));
  }
  return s;
}
export function owns(set, item, product) {
  if (!set) return null;
  if (item.product && set.has("id:" + item.product)) return true;
  if (set.has("zh:" + norm(item.oil))) return true;
  if (product) { if (set.has("zh:" + norm(product.name_zh))) return true; if (set.has("en:" + norm(product.name_en))) return true; }
  return false;
}

// 等级进度：levels 按 sort 排好；status 为会员数据
function meets(l, s) {
  if (l.req_pv != null && Number(s.pv || 0) < l.req_pv) return false;
  if (l.req_lrp_pv != null && Number(s.lrp_pv || 0) < l.req_lrp_pv) return false;
  if (l.req_ov != null && Number(s.ov || 0) < l.req_ov) return false;
  if (l.req_legs != null && Number(s.legs || 0) < l.req_legs) return false;
  if (l.req_lrp_months != null && Number(s.lrp_months || 0) < l.req_lrp_months) return false;
  if (l.req_points != null && Number(s.points || 0) < l.req_points) return false;
  return true;
}
export function ladder(levels, kind, status, currentCode) {
  const ls = (levels || []).filter((l) => l.kind === kind).sort((a, b) => a.sort - b.sort);
  if (!ls.length) return null;
  let curIdx = -1;
  if (currentCode) curIdx = ls.findIndex((l) => l.code === currentCode);
  if (curIdx < 0) ls.forEach((l, i) => { if (meets(l, status || {})) curIdx = i; });
  const cur = curIdx >= 0 ? ls[curIdx] : null;
  const next = ls[curIdx + 1] || null;
  const gaps = [];
  if (next) {
    const s = status || {};
    const g = (k, label, unit) => { if (next[k] != null) { const have = Number(s[label] || 0); const need = Number(next[k]); gaps.push({ key: label, have, need, left: Math.max(0, need - have), unit }); } };
    g("req_pv", "pv", "PV"); g("req_lrp_pv", "lrp_pv", "PV"); g("req_ov", "ov", "OV"); g("req_legs", "legs", "legs"); g("req_lrp_months", "lrp_months", "months"); g("req_points", "points", "pts");
  }
  return { levels: ls, cur, next, gaps, idx: curIdx };
}

export function buildTree(members, rootId) {
  const kids = new Map();
  for (const m of members) { if (!kids.has(m.sponsor_id)) kids.set(m.sponsor_id, []); kids.get(m.sponsor_id).push(m); }
  const make = (m, depth) => ({ m, depth, children: (kids.get(m.id) || []).sort((a, b) => (a.joined || "").localeCompare(b.joined || "")).map((c) => make(c, depth + 1)) });
  const root = members.find((m) => m.id === rootId);
  return root ? make(root, 0) : null;
}
export function countTree(node) { return node ? node.children.reduce((s, c) => s + 1 + countTree(c), 0) : 0; }
