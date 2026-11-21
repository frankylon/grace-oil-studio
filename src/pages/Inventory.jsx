// 库存管理：谁手上有什么货、货从哪里来去了哪里、会员之间互相借了什么还欠多少
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { useCatalog, useToast } from "../ctx";
import { db } from "../api";
import { Loading } from "../components";
import { today } from "../util";

/* ---------- 动作类型 ---------- */
export const KINDS = {
  in: { zh: "采购入库", en: "Stock in", hint: ["新买的货进到某人手上。用下属的帐户帮他下单，就入库到他那里。", "New stock arrives with someone. Ordered on a downline's account? Stock it in to them."], from: false, to: true, price: true, ref: true },
  out: { zh: "出库", en: "Stock out", hint: ["卖出、自用、送人或损耗，货离开某人手上。", "Sold, used, gifted or lost: stock leaves someone."], from: true, to: false, price: true, reason: true },
  transfer: { zh: "调拨", en: "Move", hint: ["货从一个人搬到另一个人，不产生欠款，比如从仓库拿到自己手上。", "Move stock between holders with no debt, e.g. from the studio to yourself."], from: true, to: true },
  loan: { zh: "借货", en: "Lend", hint: ["一方把货借给另一方：借出的人记为债主，拿走的人欠他。", "One side lends stock to the other: the receiver now owes the lender."], from: true, to: true, fromLabel: ["借出方（债主）", "Lender"], toLabel: ["借入方（欠货的人）", "Borrower"] },
  repay: { zh: "还货", en: "Return", hint: ["欠货的人把货还回去，欠数相应减少。", "The borrower returns stock; the debt goes down."], from: true, to: true, fromLabel: ["还货的人（原借入方）", "Returned by (borrower)"], toLabel: ["收回的人（原借出方）", "Returned to (lender)"] },
  settle: { zh: "折现结清", en: "Settle in cash", hint: ["不还货，改用钱结清部分或全部欠货，库存不变。", "Settle some or all of a debt with money instead of stock; stock doesn't change."], from: true, to: true, amount: true, fromLabel: ["付钱的人（原借入方）", "Paid by (borrower)"], toLabel: ["收钱的人（原借出方）", "Paid to (lender)"] },
  adjust: { zh: "盘点调整", en: "Count adjust", hint: ["实际点数和系统不一样时用。填正数是多了，负数是少了。", "When a count differs from the system: positive adds, negative removes."], from: false, to: true, toLabel: ["盘点的人", "Holder"], signed: true },
};
const CATS = { oil: ["精油", "Oils"], bottle: ["瓶子 / 配件", "Bottles & parts"], print: ["宣传品", "Printed"], other: ["其他", "Other"] };
const REASONS = [["卖出", "Sold"], ["自用", "Own use"], ["送人 / 活动", "Gift / event"], ["配油用掉", "Used in a blend"], ["损耗", "Damaged / lost"], ["其他", "Other"]];
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmtQ = (n) => (Math.round(n * 100) / 100).toString();

/* ---------- 计算 ---------- */
export function computeStock(moves) {
  const s = {};
  const add = (h, i, q) => { if (!h) return; (s[h] = s[h] || {})[i] = (s[h][i] || 0) + q; };
  for (const m of moves) {
    const q = num(m.qty);
    if (m.kind === "in") add(m.to_holder, m.item_id, q);
    else if (m.kind === "out") add(m.from_holder, m.item_id, -q);
    else if (["transfer", "loan", "repay"].includes(m.kind)) { add(m.from_holder, m.item_id, -q); add(m.to_holder, m.item_id, q); }
    else if (m.kind === "adjust") add(m.to_holder || m.from_holder, m.item_id, q);
  }
  return s;
}
// 返回 [{debtor, creditor, items:[{item_id, qty}], cash}]：debtor 欠 creditor
export function computeDebts(moves) {
  const raw = {};
  const add = (b, l, i, q) => { if (!b || !l || b === l) return; const k = [b, l].sort().join("|"); const sign = b < l ? 1 : -1; const r = (raw[k] = raw[k] || { a: [b, l].sort()[0], b: [b, l].sort()[1], items: {} }); r.items[i] = (r.items[i] || 0) + sign * q; };
  for (const m of moves) {
    const q = num(m.qty);
    if (m.kind === "loan") add(m.to_holder, m.from_holder, m.item_id, q); // 借入方欠借出方
    else if (m.kind === "repay" || m.kind === "settle") add(m.from_holder, m.to_holder, m.item_id, -q);
  }
  const out = [];
  for (const r of Object.values(raw)) {
    const pos = [], neg = [];
    for (const [i, q] of Object.entries(r.items)) { if (q > 0.0001) pos.push({ item_id: i, qty: q }); else if (q < -0.0001) neg.push({ item_id: i, qty: -q }); }
    if (pos.length) out.push({ debtor: r.a, creditor: r.b, items: pos });
    if (neg.length) out.push({ debtor: r.b, creditor: r.a, items: neg });
  }
  return out;
}

function useInv() {
  const [d, setD] = useState(null);
  const load = useCallback(async () => {
    const [items, holders, moves, members] = await Promise.all([
      db.select("inv_items", { order: ["name", true] }).catch(() => []),
      db.select("inv_holders", { order: ["created_at", true] }).catch(() => []),
      db.select("inv_moves", { order: ["date", false] }).catch(() => []),
      db.select("members", { order: ["name", true] }).catch(() => []),
    ]);
    const rank = (h) => (members.find((m) => m.id === h.member_id)?.tier === "super" ? 0 : h.kind === "place" ? 2 : 1);
    holders.sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), "zh"));
    setD({ items, holders, moves, members });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { d, reload: load };
}

/* ---------- 主界面 ---------- */
export function InventoryAdmin() {
  const { pick } = useLang();
  const { d, reload } = useInv();
  const [sub, setSub] = useState("stock");
  const [draft, setDraft] = useState(null);
  if (!d) return <Loading />;
  const startDraft = (x) => { setDraft({ ...x, key: Date.now() }); setSub("new"); };
  const SUBS = [["stock", pick("库存总览", "Stock")], ["new", pick("记一笔", "New entry")], ["debts", pick("借货往来", "Loans")], ["log", pick("流水", "History")], ["items", pick("品项", "Items")], ["holders", pick("持有人", "Holders")]];
  return (
    <div className="inv">
      <div className="fseg" style={{ marginBottom: 20 }}>{SUBS.map(([k, l]) => <button key={k} aria-pressed={sub === k} onClick={() => { setSub(k); if (k !== "new") setDraft(null); }}>{l}</button>)}</div>
      {sub === "stock" && <StockView d={d} onNew={startDraft} />}
      {sub === "new" && <MoveForm key={draft?.key || "blank"} d={d} draft={draft} onSaved={() => { reload(); setDraft(null); setSub("log"); }} />}
      {sub === "debts" && <DebtsView d={d} onNew={startDraft} />}
      {sub === "log" && <LogView d={d} reload={reload} />}
      {sub === "items" && <ItemsView d={d} reload={reload} />}
      {sub === "holders" && <HoldersView d={d} reload={reload} />}
    </div>
  );
}

const hName = (d, id) => d.holders.find((h) => h.id === id)?.name || "—";
const iOf = (d, id) => d.items.find((x) => x.id === id);

function StockView({ d, onNew }) {
  const { pick } = useLang();
  const [h, setH] = useState("");
  const [c, setC] = useState("");
  const [q, setQ] = useState("");
  const stock = useMemo(() => computeStock(d.moves), [d.moves]);
  const holders = d.holders.filter((x) => x.active !== false);
  const cols = h ? holders.filter((x) => x.id === h) : holders;
  const rows = d.items.filter((it) => (!c || it.category === c) && (!q || it.name.toLowerCase().includes(q.toLowerCase())))
    .map((it) => { const per = cols.map((x) => stock[x.id]?.[it.id] || 0); const total = per.reduce((a, b) => a + b, 0); return { it, per, total }; })
    .filter((r) => r.per.some((v) => Math.abs(v) > 0.0001));
  const value = rows.reduce((a, r) => a + r.total * num(r.it.cost), 0);
  if (!d.items.length) return <div className="empty">{pick("还没有任何库存。先到「记一笔」做一次采购入库。", "No stock yet. Start with a stock-in under “New entry”.")}<p style={{ marginTop: 16 }}><button className="btn primary" onClick={() => onNew({ kind: "in" })}>{pick("采购入库", "Stock in")}</button></p></div>;
  return (
    <>
      <div className="inv-bar">
        <select value={h} onChange={(e) => setH(e.target.value)} aria-label={pick("持有人", "Holder")}><option value="">{pick("全部持有人", "All holders")}</option>{holders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={c} onChange={(e) => setC(e.target.value)} aria-label={pick("类别", "Category")}><option value="">{pick("全部类别", "All categories")}</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select>
        <input type="search" placeholder={pick("搜索品项", "Search items")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="acts"><button className="btn primary sm" onClick={() => onNew({ kind: "in" })}>{pick("入库", "Stock in")}</button><button className="btn sm" onClick={() => onNew({ kind: "out" })}>{pick("出库", "Stock out")}</button><button className="btn sm" onClick={() => onNew({ kind: "loan" })}>{pick("借货", "Lend")}</button></div>
      </div>
      <p className="muted small" style={{ margin: "4px 0 12px" }}>{rows.length} {pick("个品项", "items")}{value ? ` · ${pick("按成本估值", "value at cost")} CA $${value.toFixed(2)}` : ""}</p>
      {!rows.length ? <div className="empty">{pick("这里没有库存。", "Nothing in stock here.")}</div> :
        <div className="inv-tbl-wrap"><table className="inv-tbl">
          <thead><tr><th>{pick("品项", "Item")}</th>{cols.map((x) => <th key={x.id} className="n">{x.name}</th>)}{cols.length > 1 && <th className="n">{pick("合计", "Total")}</th>}</tr></thead>
          <tbody>{rows.map(({ it, per, total }) => (
            <tr key={it.id}><td><b>{it.name}</b><span className="muted small"> · {pick(...(CATS[it.category] || CATS.other))}</span></td>
              {per.map((v, k) => <td key={k} className={`n ${v < 0 ? "neg" : v === 0 ? "zero" : ""}`}>{v ? `${fmtQ(v)} ${it.unit || ""}` : "—"}</td>)}
              {cols.length > 1 && <td className="n"><b>{fmtQ(total)}</b></td>}</tr>))}</tbody>
        </table></div>}
      {rows.some((r) => r.per.some((v) => v < 0)) && <p className="small" style={{ color: "var(--warn)", marginTop: 10 }}>{pick("红色负数表示出库比入库多，可能漏记了入库，或需要盘点调整。", "Red negatives mean more went out than came in: a stock-in may be missing, or a count adjustment is needed.")}</p>}
    </>
  );
}

function DebtsView({ d, onNew }) {
  const { pick } = useLang();
  const debts = useMemo(() => computeDebts(d.moves), [d.moves]);
  if (!debts.length) return <div className="empty">{pick("现在没有人互相欠货。", "Nobody owes anyone stock right now.")}<p style={{ marginTop: 16 }}><button className="btn primary" onClick={() => onNew({ kind: "loan" })}>{pick("记一笔借货", "Record a loan")}</button></p></div>;
  return (
    <div className="inv-debts">
      <p className="muted" style={{ marginTop: 0 }}>{pick("按成本估算金额，只作参考。还货或折现后会自动减少。", "Amounts are estimated at cost, for reference. They drop when stock is returned or settled.")}</p>
      {debts.map((x) => { const val = x.items.reduce((a, i) => a + i.qty * num(iOf(d, i.item_id)?.cost), 0); return (
        <div key={x.debtor + x.creditor} className="inv-debt">
          <div className="who"><b>{hName(d, x.debtor)}</b><span>{pick("欠", "owes")}</span><b>{hName(d, x.creditor)}</b></div>
          <ul>{x.items.map((i) => { const it = iOf(d, i.item_id); return <li key={i.item_id}>{it?.name || "?"} × {fmtQ(i.qty)} {it?.unit || ""}</li>; })}</ul>
          <div className="foot"><span className="muted small">{val ? `${pick("约", "about")} CA $${val.toFixed(2)}` : ""}</span>
            <span className="acts">
              <button className="btn sm" onClick={() => onNew({ kind: "repay", from: x.debtor, to: x.creditor, lines: x.items.map((i) => ({ item_id: i.item_id, qty: fmtQ(i.qty) })) })}>{pick("还货", "Return")}</button>
              <button className="btn sm" onClick={() => onNew({ kind: "settle", from: x.debtor, to: x.creditor, lines: x.items.map((i) => ({ item_id: i.item_id, qty: fmtQ(i.qty) })), amount: val ? val.toFixed(2) : "" })}>{pick("折现结清", "Settle in cash")}</button>
            </span></div>
        </div>); })}
    </div>
  );
}

/* 把收据上的货品名对到目录里的精油（英文名或中文名） */
const STOP = new Set(["essential", "oil", "oils", "blend", "nhp", "doterra", "ml", "mL", "the"]);
const toks = (x) => String(x || "").toLowerCase().replace(/[®™©]/g, "").replace(/\d+(\.\d+)?\s*(ml|毫升|oz|g|ct|pk)\b/g, " ").replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").split(" ").filter((w) => w && !STOP.has(w));
const isTouch = (t) => t.some((w) => /^(touch|roll|on)$/.test(w));
export function matchProduct(name, products) {
  const raw = String(name || "");
  if (/[\u4e00-\u9fff]/.test(raw)) { // 中文名：找包含关系最长的
    let best = null, sc = 0, alt = null, al = 1e9;
    for (const p of products || []) { const z = (p.name_zh || "").replace(/\s*[（(].*?[)）]/g, ""); if (!z) continue; if (raw.includes(z) && z.length > sc) { sc = z.length; best = p; } else if (z.includes(raw) && z.length < al) { al = z.length; alt = p; } }
    return best || alt;
  }
  const lt = toks(raw), set = new Set(lt); if (!lt.length) return null;
  let best = null, score = 0;
  for (const p of products || []) {
    const pt = toks(p.name_en); if (!pt.length || !pt.every((w) => set.has(w))) continue;
    const sc = pt.length * 10 + (isTouch(pt) === isTouch(lt) ? 5 : 0) - (/nhp/i.test(p.name_en) ? 1 : 0);
    if (sc > score) { score = sc; best = p; }
  }
  return best;
}
export const productItem = (p) => ({ product_id: p.id, name: p.name_zh.replace(/\s*[（(]天然健康产品[)）]/, ""), category: "oil", cost: parseFloat(String(p.wholesale || "").replace(/[^0-9.]/g, "")) || 0, unit: "瓶" });
/* 找到或新建品项，返回 id */
export async function ensureItem(items, l) {
  if (l.item_id) return l.item_id;
  const ex = items.find((x) => (l.product_id && x.product_id === l.product_id) || x.name === l.name);
  if (ex) return ex.id;
  const r = await db.insert("inv_items", { name: l.name, product_id: l.product_id || null, category: l.category || "other", unit: l.unit || "个", cost: l.cost || 0 });
  items.push(r); return r.id;
}

/* 品项选择：已有品项 + 目录里的精油 + 直接新建 */
export function ItemPicker({ d, value, onChange }) {
  const { pick } = useLang();
  const cat = useCatalog();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const cur = value?.item_id ? iOf(d, value.item_id)?.name : value?.name;
  const ql = q.trim().toLowerCase();
  const have = new Set(d.items.map((x) => x.product_id).filter(Boolean));
  const own = d.items.filter((x) => !ql || x.name.toLowerCase().includes(ql)).slice(0, 8);
  const prods = ql && cat.ready ? cat.products.filter((p) => !have.has(p.id) && (p.name_zh + " " + p.name_en).toLowerCase().includes(ql)).slice(0, 6) : [];
  const choose = (v) => { onChange(v); setQ(""); setOpen(false); };
  return (
    <div className="ipick">
      <input type="text" value={open ? q : cur || ""} placeholder={pick("搜索或输入新品项", "Search or type a new item")} onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} aria-label={pick("品项", "Item")} />
      {open && (own.length > 0 || prods.length > 0 || ql) && <div className="ipick-list">
        {own.map((x) => <button type="button" key={x.id} onMouseDown={() => choose({ item_id: x.id })}>{x.name}<span>{pick(...(CATS[x.category] || CATS.other))}</span></button>)}
        {prods.map((p) => <button type="button" key={p.id} onMouseDown={() => choose(productItem(p))}>{p.name_zh}<span>{pick("目录精油", "Catalog oil")}</span></button>)}
        {ql && !own.some((x) => x.name.toLowerCase() === ql) && <button type="button" className="new" onMouseDown={() => choose({ name: q.trim(), category: "other", unit: "个", isNew: true })}>{pick(`新建品项「${q.trim()}」`, `New item “${q.trim()}”`)}</button>}
      </div>}
    </div>
  );
}

function MoveForm({ d, draft, onSaved }) {
  const { pick } = useLang();
  const toast = useToast();
  const [kind, setKind] = useState(draft?.kind || "in");
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState(draft?.from || "");
  const [to, setTo] = useState(draft?.to || (d.holders.find((h) => h.kind === "self")?.id || ""));
  const [lines, setLines] = useState(draft?.lines?.length ? draft.lines.map((l) => ({ ...l, price: "" })) : [{ qty: "", price: "" }]);
  const [reason, setReason] = useState(REASONS[0][0]);
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState(draft?.amount || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const K = KINDS[kind];
  const holders = d.holders.filter((x) => x.active !== false);
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = lines.some((l) => (l.item_id || l.name) && num(l.qty) !== 0) && (!K.from || from) && (!K.to || to) && !(K.from && K.to && from === to);
  const save = async () => {
    if (!valid) return; setBusy(true);
    try {
      const batch = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const good = lines.filter((l) => (l.item_id || l.name) && num(l.qty) !== 0);
      const amt = num(amount), totalQty = good.reduce((a, l) => a + Math.abs(num(l.qty)), 0);
      for (const l of good) {
        let item_id = l.item_id;
        if (!item_id) {
          const ex = d.items.find((x) => (l.product_id && x.product_id === l.product_id) || x.name === l.name);
          item_id = ex ? ex.id : (await db.insert("inv_items", { name: l.name, product_id: l.product_id || null, category: l.category || "other", unit: l.unit || "个", cost: l.cost || 0 })).id;
        }
        const q = K.signed ? num(l.qty) : Math.abs(num(l.qty));
        await db.insert("inv_moves", {
          batch, date, kind, item_id, qty: q,
          from_holder: K.from ? from : null, to_holder: K.to ? to : null,
          unit_price: K.price && l.price !== "" ? num(l.price) : null,
          amount: K.amount && amt ? Math.round((amt * Math.abs(q)) / (totalQty || 1) * 100) / 100 : null,
          reason: K.reason ? reason : "", order_ref: K.ref ? ref : "", note,
        });
      }
      toast(pick("已记录", "Saved")); onSaved();
    } catch (e) { toast(pick("保存失败：", "Save failed: ") + (e.message || "")); }
    setBusy(false);
  };
  const hSel = (val, set, label) => <div className="field"><label>{label}</label><select value={val} onChange={(e) => set(e.target.value)}><option value="">{pick("请选择…", "Choose…")}</option>{holders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>;
  return (
    <div className="inv-form">
      <div className="inv-kinds" role="radiogroup" aria-label={pick("类型", "Type")}>
        {Object.entries(KINDS).map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{pick(v.zh, v.en)}</button>)}
      </div>
      <p className="muted" style={{ margin: "14px 0 22px" }}>{pick(...K.hint)}</p>
      <div className="grid3">
        <div className="field"><label htmlFor="iv_d">{pick("日期", "Date")}</label><input id="iv_d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {K.from && hSel(from, setFrom, pick(...(K.fromLabel || ["从谁那里", "From"])))}
        {K.to && hSel(to, setTo, pick(...(K.toLabel || [kind === "in" ? "入库到谁那里" : "到谁那里", kind === "in" ? "Stock in to" : "To"])))}
        {K.ref && <div className="field"><label htmlFor="iv_r">{pick("用谁的帐户下单 / 订单号", "Ordered on whose account / order no.")}</label><input id="iv_r" type="text" value={ref} onChange={(e) => setRef(e.target.value)} /></div>}
        {K.reason && <div className="field"><label>{pick("原因", "Reason")}</label><select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map(([z, e]) => <option key={z} value={z}>{pick(z, e)}</option>)}</select></div>}
        {K.amount && <div className="field"><label htmlFor="iv_a">{pick("结清金额 CA $", "Amount paid CA $")}</label><input id="iv_a" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>}
      </div>
      <div className="inv-lines">
        <div className="inv-line head"><span>{pick("品项", "Item")}</span><span>{K.signed ? pick("数量（可负）", "Qty (±)") : pick("数量", "Qty")}</span>{K.price && <span>{kind === "in" ? pick("单价（成本）", "Unit cost") : pick("单价（售价）", "Unit price")}</span>}<span /></div>
        {lines.map((l, i) => (
          <div key={i} className="inv-line">
            <ItemPicker d={d} value={l} onChange={(v) => setLine(i, { item_id: undefined, product_id: undefined, name: undefined, ...v })} />
            <input type="number" step="any" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label={pick("数量", "Qty")} placeholder={pick("数量", "Qty")} />
            {K.price && <input type="number" step="0.01" min="0" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} aria-label={pick("单价", "Unit price")} placeholder={pick("单价", "Price")} />}
            <button type="button" className="btn ghost sm" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ qty: "", price: "" }]))}>{pick("删除", "Remove")}</button>
          </div>))}
        <button type="button" className="btn sm" onClick={() => setLines((ls) => [...ls, { qty: "", price: "" }])}>{pick("再加一项", "Add a line")}</button>
      </div>
      <div className="field" style={{ marginTop: 16 }}><label htmlFor="iv_n">{pick("备注", "Note")}</label><input id="iv_n" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={pick("例如：11 月活动采购", "e.g. November event order")} /></div>
      {K.from && K.to && from && from === to && <p className="small" style={{ color: "var(--warn)" }}>{pick("两边不能是同一个人。", "Both sides can't be the same holder.")}</p>}
      <div className="acts" style={{ marginTop: 20 }}><button className="btn primary" disabled={!valid || busy} onClick={save}>{pick("保存", "Save")}</button></div>
    </div>
  );
}

function LogView({ d, reload }) {
  const { pick } = useLang();
  const toast = useToast();
  const [h, setH] = useState("");
  const [k, setK] = useState("");
  const list = d.moves.filter((m) => (!h || m.from_holder === h || m.to_holder === h) && (!k || m.kind === k));
  const del = async (m) => { if (!window.confirm(pick("删除这一笔记录？删除后库存和欠货会重新计算。", "Delete this entry? Stock and loans will be recalculated."))) return; try { await db.remove("inv_moves", m.id); reload(); } catch (e) { toast(e.message || "error"); } };
  return (
    <>
      <div className="inv-bar">
        <select value={h} onChange={(e) => setH(e.target.value)} aria-label={pick("持有人", "Holder")}><option value="">{pick("全部持有人", "All holders")}</option>{d.holders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={k} onChange={(e) => setK(e.target.value)} aria-label={pick("类型", "Type")}><option value="">{pick("全部类型", "All types")}</option>{Object.entries(KINDS).map(([x, v]) => <option key={x} value={x}>{pick(v.zh, v.en)}</option>)}</select>
      </div>
      {!list.length ? <div className="empty">{pick("还没有记录。", "No entries yet.")}</div> :
        <div className="inv-tbl-wrap"><table className="inv-tbl">
          <thead><tr><th>{pick("日期", "Date")}</th><th>{pick("类型", "Type")}</th><th>{pick("品项", "Item")}</th><th className="n">{pick("数量", "Qty")}</th><th>{pick("从 → 到", "From → To")}</th><th>{pick("备注", "Note")}</th><th /></tr></thead>
          <tbody>{list.map((m) => { const it = iOf(d, m.item_id); const K = KINDS[m.kind]; return (
            <tr key={m.id}><td className="nw">{m.date}</td><td className="nw"><span className={`tag k-${m.kind}`}>{pick(K?.zh, K?.en)}</span></td><td>{it?.name || "?"}</td><td className="n">{fmtQ(num(m.qty))} {it?.unit || ""}</td>
              <td>{m.from_holder ? hName(d, m.from_holder) : ""}{m.from_holder && m.to_holder ? " → " : ""}{m.to_holder ? hName(d, m.to_holder) : ""}</td>
              <td className="muted small">{[m.reason, m.order_ref, m.unit_price != null ? `@ $${m.unit_price}` : "", m.amount ? `$${m.amount}` : "", m.note].filter(Boolean).join(" · ")}</td>
              <td><button className="btn ghost sm" onClick={() => del(m)}>{pick("删除", "Delete")}</button></td></tr>); })}</tbody>
        </table></div>}
    </>
  );
}

function ItemsView({ d, reload }) {
  const { pick } = useLang();
  const toast = useToast();
  const [f, setF] = useState({ name: "", category: "bottle", unit: "个", cost: "" });
  const add = async (e) => { e.preventDefault(); if (!f.name.trim()) return; try { await db.insert("inv_items", { ...f, name: f.name.trim(), cost: num(f.cost) }); setF({ name: "", category: f.category, unit: f.unit, cost: "" }); reload(); } catch (x) { toast(x.message || "error"); } };
  const upd = async (it, patch) => { try { await db.update("inv_items", it.id, patch); reload(); } catch (x) { toast(x.message || "error"); } };
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>{pick("精油会在记账时从目录里直接选，自动建成品项；瓶子、宣传册这些在这里先加好。成本用来估算库存和欠货金额。", "Oils are picked from the catalog when you record an entry. Add bottles, brochures and other items here. Cost is used to value stock and loans.")}</p>
      <form onSubmit={add} className="inv-add">
        <input type="text" placeholder={pick("名称，例如 10ml 滚珠瓶", "Name, e.g. 10ml roller bottle")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label={pick("名称", "Name")} />
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label={pick("类别", "Category")}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select>
        <input type="text" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label={pick("单位", "Unit")} style={{ maxWidth: 90 }} />
        <input type="number" step="0.01" min="0" placeholder={pick("成本", "Cost")} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} aria-label={pick("成本", "Cost")} style={{ maxWidth: 120 }} />
        <button className="btn primary" disabled={!f.name.trim()}>{pick("加入", "Add")}</button>
      </form>
      {!d.items.length ? <div className="empty">{pick("还没有品项。", "No items yet.")}</div> :
        <div className="inv-tbl-wrap"><table className="inv-tbl">
          <thead><tr><th>{pick("名称", "Name")}</th><th>{pick("类别", "Category")}</th><th>{pick("单位", "Unit")}</th><th className="n">{pick("成本 CA $", "Cost CA $")}</th><th /></tr></thead>
          <tbody>{d.items.map((it) => (
            <tr key={it.id} className={it.active === false ? "off" : ""}><td>{it.name}</td>
              <td><select value={it.category || "other"} onChange={(e) => upd(it, { category: e.target.value })} aria-label={pick("类别", "Category")}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></td>
              <td>{it.unit}</td>
              <td className="n"><input type="number" step="0.01" min="0" defaultValue={it.cost ?? ""} onBlur={(e) => num(e.target.value) !== num(it.cost) && upd(it, { cost: num(e.target.value) })} aria-label={pick("成本", "Cost")} style={{ maxWidth: 110, textAlign: "right" }} /></td>
              <td><button className="btn ghost sm" onClick={() => upd(it, { active: it.active === false })}>{it.active === false ? pick("启用", "Enable") : pick("停用", "Disable")}</button></td></tr>))}</tbody>
        </table></div>}
    </>
  );
}

function HoldersView({ d, reload }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const [f, setF] = useState({ name: "", kind: "member", member_id: "" });
  const linked = new Set(d.holders.map((h) => h.member_id).filter(Boolean));
  const add = async (e) => {
    e.preventDefault();
    const m = d.members.find((x) => x.id === f.member_id);
    const name = f.name.trim() || m?.name || "";
    if (!name) return;
    try { await db.insert("inv_holders", { name, kind: f.kind, member_id: f.kind === "member" ? f.member_id || null : null }); setF({ name: "", kind: f.kind, member_id: "" }); reload(); } catch (x) { toast(x.message || "error"); }
  };
  const upd = async (h, patch) => { try { await db.update("inv_holders", h.id, patch); reload(); } catch (x) { toast(x.message || "error"); } };
  const KIND = { self: ["自己", "Me"], member: ["会员 / 下属", "Member / downline"], place: ["地点 / 仓库", "Place / store"] };
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>{pick("持有人就是「货在谁那里、算谁的」。下属的帐户、借货往来的会员、工作室仓库都可以是一个持有人。连上会员后，对方在会员页能看到自己的库存和欠货。", "A holder is whoever has the stock. Downline accounts, members you lend to and the studio store can all be holders. Linked to a member, they see their own stock and loans on their member page.")}</p>
      <form onSubmit={add} className="inv-add">
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label={pick("类型", "Type")}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select>
        {f.kind === "member" && <select value={f.member_id} onChange={(e) => setF({ ...f, member_id: e.target.value })} aria-label={pick("会员", "Member")}><option value="">{pick("连到哪位会员…", "Link a member…")}</option>{d.members.filter((m) => !linked.has(m.id)).map((m) => <option key={m.id} value={m.id}>{cv(m.name)}{m.doterra_id ? ` #${m.doterra_id}` : ""}</option>)}</select>}
        <input type="text" placeholder={f.kind === "member" ? pick("显示名称（可留空用会员名）", "Display name (optional)") : pick("名称", "Name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label={pick("名称", "Name")} />
        <button className="btn primary" disabled={!f.name.trim() && !f.member_id}>{pick("加入", "Add")}</button>
      </form>
      <div className="inv-tbl-wrap"><table className="inv-tbl">
        <thead><tr><th>{pick("名称", "Name")}</th><th>{pick("类型", "Type")}</th><th>{pick("连接的会员", "Linked member")}</th><th /></tr></thead>
        <tbody>{d.holders.map((h) => (
          <tr key={h.id} className={h.active === false ? "off" : ""}><td>{h.name}</td><td>{pick(...(KIND[h.kind] || KIND.member))}</td><td>{h.member_id ? cv(d.members.find((m) => m.id === h.member_id)?.name || "") : "—"}</td>
            <td><button className="btn ghost sm" onClick={() => upd(h, { active: h.active === false })}>{h.active === false ? pick("启用", "Enable") : pick("停用", "Disable")}</button></td></tr>))}</tbody>
      </table></div>
    </>
  );
}

/* ---------- 会员页：我的库存与借货 ---------- */
export function MyStock({ memberId }) {
  const { pick } = useLang();
  const [d, setD] = useState(null);
  useEffect(() => {
    (async () => {
      const holders = await db.select("inv_holders").catch(() => []);
      const mine = holders.filter((h) => h.member_id === memberId);
      if (!mine.length) { setD({ none: true }); return; }
      const [items, moves] = await Promise.all([db.select("inv_items").catch(() => []), db.select("inv_moves", { order: ["date", false] }).catch(() => [])]);
      setD({ holders, mine: mine.map((h) => h.id), items, moves });
    })();
  }, [memberId]);
  if (!d) return <Loading />;
  if (d.none) return <div className="empty">{pick("还没有库存记录。", "No stock records yet.")}</div>;
  const stock = computeStock(d.moves);
  const debts = computeDebts(d.moves).filter((x) => d.mine.includes(x.debtor) || d.mine.includes(x.creditor));
  const rows = d.items.map((it) => ({ it, q: d.mine.reduce((a, h) => a + (stock[h]?.[it.id] || 0), 0) })).filter((r) => Math.abs(r.q) > 0.0001);
  const dd = { holders: d.holders, items: d.items };
  return (
    <div className="inv">
      <h3 className="svc-h2">{pick("手上的库存", "Stock you hold")}</h3>
      {!rows.length ? <p className="muted">{pick("目前没有。", "None at the moment.")}</p> : <div className="inv-tbl-wrap"><table className="inv-tbl"><tbody>{rows.map(({ it, q }) => <tr key={it.id}><td>{it.name}</td><td className="n">{fmtQ(q)} {it.unit}</td></tr>)}</tbody></table></div>}
      <h3 className="svc-h2" style={{ marginTop: 28 }}>{pick("借货往来", "Loans")}</h3>
      {!debts.length ? <p className="muted">{pick("没有欠货。", "Nothing owed either way.")}</p> : <div className="inv-debts">{debts.map((x) => (
        <div key={x.debtor + x.creditor} className="inv-debt"><div className="who">{d.mine.includes(x.debtor) ? <><b>{pick("你", "You")}</b><span>{pick("欠", "owe")}</span><b>{hName(dd, x.creditor)}</b></> : <><b>{hName(dd, x.debtor)}</b><span>{pick("欠你", "owes you")}</span></>}</div>
          <ul>{x.items.map((i) => { const it = iOf(dd, i.item_id); return <li key={i.item_id}>{it?.name || "?"} × {fmtQ(i.qty)} {it?.unit || ""}</li>; })}</ul></div>))}</div>}
    </div>
  );
}
