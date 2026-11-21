// 分销（Dropshipping）：门店和销售员用专属链接下单，订单汇总到这里，由我们处理发货；
// 按门店设定的比例拆出店家和员工的提成，出业绩和结算。跟 doTERRA 团队架构是两回事。
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLang } from "../i18n";
import { useCatalog, useToast } from "../ctx";
import { db } from "../api";
import { Loading, Modal, cleanName } from "../components";
import { today } from "../util";
import { ensureItem, productItem } from "./Inventory";
import { useCompData } from "./Business";
import { RANKS, allocate } from "../comp";

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const cad = (v) => `${n(v) < 0 ? "−" : ""}$${Math.abs(n(v)).toFixed(2)}`;
const price = (p) => parseFloat(String(p?.wholesale || "").replace(/[^0-9.]/g, "")) || 0;
export const PAY = { store_collected: ["店家已收款", "Store collected"], direct_doterra: ["客人在 doTERRA 官网自己下单", "Ordered on doTERRA"], pending: ["还没收款", "Not paid yet"], paid: ["已付款给我们", "Paid to us"] };
export const STATUS = { new: ["新订单", "New"], processing: ["处理中", "Processing"], shipped: ["已发货", "Shipped"], done: ["已完成", "Done"], cancelled: ["已取消", "Cancelled"] };
/** 一张单的提成：店家 %、员工 %（没有销售员时员工那份也给店家） */
export function commission(o) {
  const st = n(o.subtotal) * n(o.store_pct) / 100, sf = n(o.subtotal) * n(o.staff_pct) / 100;
  return o.rep_id ? { store: st, staff: sf } : { store: st + sf, staff: 0 };
}

/* ---------- 购物车（专属链接和后台共用） ---------- */
function Cart({ lines, setLines, showPv }) {
  const { pick, cv } = useLang();
  const cat = useCatalog();
  const [q, setQ] = useState("");
  if (!cat.ready) return <Loading />;
  const ql = q.trim().toLowerCase();
  const found = ql ? cat.products.filter((p) => (p.name_zh + " " + p.name_en + " " + (p.sku || "")).toLowerCase().includes(ql)).slice(0, 12) : [];
  const add = (p) => { setLines((ls) => { const ex = ls.find((l) => l.product === p.id); return ex ? ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { product: p.id, name: cleanName(p.name_zh), name_en: p.name_en, size: p.size, qty: 1, price: price(p) }]; }); setQ(""); };
  const total = lines.reduce((s, l) => s + n(l.qty) * n(l.price), 0);
  return (
    <div className="ds-cart">
      <div className="ds-search"><input type="search" placeholder={pick("搜产品：名字或编号，例如 薰衣草 / Lavender", "Search products")} value={q} onChange={(e) => setQ(e.target.value)} />
        {found.length > 0 && <div className="ipick-list">{found.map((p) => <button type="button" key={p.id} onMouseDown={() => add(p)}>{cv(cleanName(p.name_zh))} {p.size && <span>{p.size}</span>}<span>{cad(price(p))}</span></button>)}</div>}</div>
      {!lines.length ? <p className="muted small">{pick("还没有加产品。", "No products yet.")}</p> :
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("产品", "Product")}</th><th className="n">{pick("会员价", "Price")}</th><th className="n">{pick("数量", "Qty")}</th>{showPv && <th className="n">{pick("每件 PV", "PV each")}</th>}<th className="n">{pick("小计", "Total")}</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => <tr key={l.product}><td>{cv(l.name)} <span className="muted small">{l.size}</span></td><td className="n">{cad(l.price)}</td><td className="n"><input type="number" min="1" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Math.max(1, n(e.target.value)) } : x)))} style={{ width: 70, textAlign: "right" }} aria-label={pick("数量", "Qty")} /></td>{showPv && <td className="n"><input type="number" step="0.5" value={l.pv ?? ""} placeholder={String(linePv(l))} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, pv: e.target.value === "" ? null : n(e.target.value) } : x)))} style={{ width: 80, textAlign: "right" }} aria-label="PV" /></td>}<td className="n">{cad(l.qty * l.price)}</td><td><button type="button" className="btn ghost sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>{pick("删除", "Remove")}</button></td></tr>)}
            <tr><td colSpan={showPv ? 4 : 3} className="n"><b>{pick("合计（会员价）", "Total (member price)")}</b></td><td className="n"><b>{cad(total)}</b></td><td /></tr></tbody></table></div>}
    </div>
  );
}

/* ---------- 专属下单链接 /order/:code ---------- */
export function OrderLink() {
  const { code } = useParams();
  const { pick } = useLang();
  const [ch, setCh] = useState(undefined);
  const [lines, setLines] = useState([]);
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", ship: "ship", payment: "store_collected", note: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { db.rpc("ds_channel", { c: code }).then((x) => setCh(x || null)).catch(() => setCh(null)); }, [code]);
  if (ch === undefined) return <Loading />;
  if (!ch) return <div className="empty">{pick("这个下单链接无效，请向门店或销售员确认。", "This order link isn't valid.")}</div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    if (!lines.length) { setErr(pick("请先加产品。", "Add products first.")); return; }
    if (!f.name.trim() || !f.phone.trim()) { setErr(pick("请填客人名字和电话。", "Name and phone, please.")); return; }
    setBusy(true);
    try { const no = await db.rpc("ds_place_order", { c: code, o: { ...f, items: lines } }); setDone(no); setLines([]); } catch (x) { setErr(x.message || "error"); }
    setBusy(false);
  };
  if (done) return (
    <div className="panel pad" style={{ maxWidth: 560, margin: "24px auto" }}>
      <h1 style={{ fontSize: 26 }}>{pick("订单已收到", "Order received")}</h1>
      <p>{pick(`订单号 ${done}。我们会尽快处理发货，有问题会联系客人。`, `Order ${done}. We'll process it shortly.`)}</p>
      <button className="btn primary" onClick={() => setDone(null)}>{pick("再下一张", "Place another")}</button>
    </div>
  );
  return (
    <form onSubmit={submit} className="ds-page">
      <h1 style={{ fontSize: "clamp(24px,4vw,32px)" }}>{pick("下单", "Order")}</h1>
      <p className="muted">{ch.store}{ch.rep ? ` · ${ch.rep}` : ""}</p>
      <section className="biz-card"><h3>{pick("1. 产品", "1. Products")}</h3><Cart lines={lines} setLines={setLines} /></section>
      <section className="biz-card"><h3>{pick("2. 客人", "2. Customer")}</h3>
        <div className="grid3">
          <div className="field"><label htmlFor="ol_n">{pick("名字", "Name")}</label><input id="ol_n" type="text" value={f.name} onChange={set("name")} required /></div>
          <div className="field"><label htmlFor="ol_p">{pick("电话", "Phone")}</label><input id="ol_p" type="tel" value={f.phone} onChange={set("phone")} required /></div>
          <div className="field"><label htmlFor="ol_e">{pick("邮箱（选填）", "Email (optional)")}</label><input id="ol_e" type="email" value={f.email} onChange={set("email")} /></div>
        </div>
        <div className="field"><label>{pick("取货方式", "Delivery")}</label><div className="fseg">{[["ship", pick("寄给客人", "Ship")], ["pickup", pick("到店取", "Pick up in store")]].map(([k, l]) => <button type="button" key={k} aria-pressed={f.ship === k} onClick={() => setF({ ...f, ship: k })}>{l}</button>)}</div></div>
        {f.ship === "ship" && <div className="field"><label htmlFor="ol_a">{pick("寄送地址", "Address")}</label><input id="ol_a" type="text" value={f.address} onChange={set("address")} /></div>}
      </section>
      <section className="biz-card"><h3>{pick("3. 付款", "3. Payment")}</h3>
        <div className="ds-pay">{["store_collected", "direct_doterra", "pending"].map((k) => <label key={k} className="chk"><input type="radio" name="pay" checked={f.payment === k} onChange={() => setF({ ...f, payment: k })} /> {pick(...PAY[k])}</label>)}</div>
        <div className="field"><label htmlFor="ol_x">{pick("备注", "Note")}</label><input id="ol_x" type="text" value={f.note} onChange={set("note")} /></div>
      </section>
      {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
      <button className="btn primary" disabled={busy}>{busy ? pick("提交中…", "Sending…") : pick("提交订单", "Place order")}</button>
    </form>
  );
}

/* ---------- 推荐：在团队架构里怎样下单最划算 ---------- */
export const PV_RATE = 0.75; // 产品目录没有 PV：先按会员价（加币）× 0.75 估算，可以逐行改
const isKit = (l) => /套组|kit|collection|系列组合/i.test(`${l.name} ${l.name_en || ""}`);
export const linePv = (l) => (l.pv != null && l.pv !== "" ? n(l.pv) : Math.round(n(l.price) * PV_RATE * 10) / 10);
export function AllocPanel({ orders, onApplied }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const cd = useCompData();
  const [lrp, setLrp] = useState(true);
  const [def, setDef] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!cd) return <Loading />;
  const label = (id) => { const a = cd.accts.find((x) => x.id === id); const m = cd.members.find((x) => x.id === a?.member_id); return a ? `${cv(m?.name || "")} · ${cv(a.label || a.member_no || "")}` : "—"; };
  const units = orders.flatMap((o) => (o.items || []).flatMap((l, li) => isKit(l) || n(l.qty) <= 1 ? [{ id: `${o.id}-${li}`, label: cv(l.name), pv: linePv(l) * (isKit(l) ? n(l.qty) : 1), order: o.order_no, line: l, qty: isKit(l) ? n(l.qty) : 1 }] : Array.from({ length: n(l.qty) }, (_, k) => ({ id: `${o.id}-${li}-${k}`, label: cv(l.name), pv: linePv(l), order: o.order_no, line: l, qty: 1 }))));
  const run = () => { setBusy(true); setTimeout(() => { setRes(allocate(cd, today().slice(0, 7), units, { lrp, defaultAcct: def || undefined })); setBusy(false); }, 30); };
  // 按推荐把订单记进系统（每个帐户一张），PV 会算进团队
  const apply = async () => {
    if (!window.confirm(pick("按推荐把这些订单记进团队订单？（以后实际在 doTERRA 下单后，可以在会员页补上订单号）", "Record these orders to the team?"))) return;
    setBusy(true);
    try {
      for (const g of res.orders) {
        const a = cd.accts.find((x) => x.id === g.acct);
        const items = []; for (const u of g.units) { const ex = items.find((x) => x.product === u.line.product); if (ex) ex.qty += u.qty; else items.push({ product: u.line.product, zh: u.line.name, en: u.line.name_en || "", qty: u.qty, price: u.line.price, pv: linePv(u.line) }); }
        await db.insert("orders", { member_id: a.member_id, account_id: a.id, account: a.label || a.member_no || "", date: today(), order_no: "", currency: "CAD", total: items.reduce((s, x) => s + x.qty * n(x.price), 0), total_pv: g.pv, lrp, payment: "", reason: `分销 ${[...new Set(g.units.map((u) => u.order))].join(" ")}`, items });
      }
      for (const o of orders) await db.update("ds_orders", o.id, { alloc: res.orders.map((g) => ({ acct: g.acct, label: label(g.acct), pv: g.pv, items: g.units.filter((u) => u.order === o.order_no).map((u) => u.label) })).filter((x) => x.items.length), fulfill: "company", status: o.status === "new" ? "processing" : o.status });
      toast(pick("已记进团队订单", "Recorded")); onApplied && onApplied();
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  return (
    <section className="ds-alloc">
      <b>{pick("推荐：在团队架构里怎样下单最划算", "Best way to place this in the team")}</b>
      <p className="muted small" style={{ margin: 0 }}>{pick(`把订单拆成一件件单品（套组整件不拆），逐件试放到团队每个帐户，按 doTERRA 规则重算全团队奖金，放到多拿最多的地方；多开一张单按 $5 运费扣分。PV 现在按会员价 × ${PV_RATE} 估算，可以在上面逐行改。最终由下单的人决定。`, "Splits the order into single items (kits stay whole), tries each item on every team account and keeps the placement that earns the team the most.")}</p>
      <div className="ds-ful-row">
        <label className="chk"><input type="checkbox" checked={lrp} onChange={(e) => setLrp(e.target.checked)} /> {pick("按 Rewards 订单下", "As Rewards orders")}</label>
        <select value={def} onChange={(e) => setDef(e.target.value)} aria-label={pick("平时默认下单的帐户", "Default account")}><option value="">{pick("对照：平时默认下在哪个帐户（选填）", "Default account (optional)")}</option>{cd.accts.map((a) => <option key={a.id} value={a.id}>{label(a.id)}</option>)}</select>
        <button type="button" className="btn primary sm" disabled={busy || !units.length} onClick={run}>{busy ? pick("计算中…", "Working…") : pick(`计算推荐（${units.length} 件，${Math.round(units.reduce((s, u) => s + u.pv, 0))} PV）`, `Recommend (${units.length} items)`)}</button>
      </div>
      {res && <>
        <div className="pt-break">
          <div className="hi"><span>{pick("按推荐拆单，团队多拿", "Split as recommended")}</span><b>${Math.round(res.gain)}</b></div>
          {res.baseline != null && <div><span>{pick("全部下在默认帐户", "All on default account")}</span><b>${Math.round(res.baseline)}</b></div>}
          {res.newMember && <div className={res.newMember.gain > res.gain ? "hi" : ""}><span>{pick("让客人开新会员帐户下", "Customer enrols as new member")}</span><b>${Math.round(res.newMember.gain)}</b></div>}
        </div>
        {res.newMember && res.newMember.gain > res.gain && <p className="small">{pick(`👉 这张单最划算的是让客人开新会员（挂在 ${label(res.newMember.hub)} 下面），推荐人拿 Fast Start。`, `Best: enrol the customer under ${label(res.newMember.hub)}.`)}</p>}
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("在这个帐户下一张单", "Place on account")}</th><th>{pick("产品", "Items")}</th><th className="n">PV</th><th>{pick("为什么", "Why")}</th><th className="n">{pick("团队多拿", "Team +")}</th></tr></thead>
          <tbody>{res.orders.map((g) => <tr key={g.acct}><td><b>{label(g.acct)}</b></td><td className="small">{g.units.map((u) => u.label + (orders.length > 1 ? `（${u.order}）` : "")).join("、")}</td><td className="n">{Math.round(g.pv)}</td><td className="small">{g.why || "—"}</td><td className="n"><b>${Math.round(g.gain)}</b></td></tr>)}</tbody></table></div>
        <button type="button" className="btn sm" disabled={busy} onClick={apply}>{pick("按推荐记进团队订单", "Record as recommended")}</button>
      </>}
    </section>
  );
}

/* ---------- 后台 ---------- */
function useDs() {
  const [d, setD] = useState(null);
  const load = async () => {
    const [stores, reps, orders, holders, items] = await Promise.all([
      db.select("ds_stores", { order: ["created_at", true] }).catch(() => []),
      db.select("ds_reps", { order: ["created_at", true] }).catch(() => []),
      db.select("ds_orders", { order: ["created_at", false] }).catch(() => []),
      db.select("inv_holders", { order: ["created_at", true] }).catch(() => []),
      db.select("inv_items").catch(() => []),
    ]);
    setD({ stores, reps, orders, holders, items });
  };
  useEffect(() => { load(); }, []);
  return [d, load];
}
const ym = (s) => String(s || "").slice(0, 7);

export function DropshipAdmin() {
  const { pick } = useLang();
  const [d, load] = useDs();
  const [sub, setSub] = useState("orders");
  if (!d) return <Loading />;
  return (
    <div>
      <div className="fseg" style={{ marginBottom: 18 }}>{[["orders", pick("订单", "Orders")], ["perf", pick("业绩", "Performance")], ["settle", pick("结算", "Settlement")], ["channels", pick("门店与销售员", "Stores & reps")]].map(([k, l]) => <button key={k} aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>)}</div>
      {sub === "orders" && <Orders d={d} load={load} />}
      {sub === "perf" && <Perf d={d} />}
      {sub === "settle" && <Settle d={d} load={load} />}
      {sub === "channels" && <Channels d={d} load={load} />}
    </div>
  );
}

function Orders({ d, load }) {
  const { pick, cv } = useLang();
  const [st, setSt] = useState("open");
  const [store, setStore] = useState("");
  const [month, setMonth] = useState("");
  const [ed, setEd] = useState(null);
  const [batch, setBatch] = useState(false);
  const sName = (id) => d.stores.find((s) => s.id === id)?.name || "—";
  const rName = (id) => d.reps.find((r) => r.id === id)?.name || "";
  const list = d.orders.filter((o) => (st === "all" || (st === "open" ? ["new", "processing"].includes(o.status) : o.status === st)) && (!store || o.store_id === store) && (!month || ym(o.created_at) === month));
  const months = [...new Set(d.orders.map((o) => ym(o.created_at)))].sort().reverse();
  return (
    <>
      <div className="inv-bar">
        <select value={st} onChange={(e) => setSt(e.target.value)} aria-label={pick("状态", "Status")}><option value="open">{pick("待处理", "To do")}</option><option value="all">{pick("全部", "All")}</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select>
        <select value={store} onChange={(e) => setStore(e.target.value)} aria-label={pick("门店", "Store")}><option value="">{pick("全部门店", "All stores")}</option>{d.stores.map((s) => <option key={s.id} value={s.id}>{cv(s.name)}</option>)}</select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={pick("月份", "Month")}><option value="">{pick("全部月份", "All months")}</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        <div className="acts"><button className="btn sm" disabled={!d.orders.some((o) => ["new", "processing"].includes(o.status) && !o.alloc && o.payment !== "direct_doterra")} onClick={() => setBatch(true)}>{pick("一起推荐（待处理订单）", "Recommend all open")}</button><button className="btn primary sm" onClick={() => setEd({ new: true })} disabled={!d.stores.length && !d.reps.length}>{pick("+ 代客下单", "+ New order")}</button></div>
      </div>
      {!d.stores.length && <p className="notice">{pick("先到「门店与销售员」加一个门店，就会有它的专属下单链接。", "Add a store first under Stores & reps.")}</p>}
      {!list.length ? <div className="empty">{pick("没有订单。", "No orders.")}</div> :
        <div className="inv-tbl-wrap"><table className="inv-tbl fin-tbl"><thead><tr><th>{pick("单号", "No.")}</th><th>{pick("日期", "Date")}</th><th>{pick("门店 / 销售员", "Store / rep")}</th><th>{pick("客人", "Customer")}</th><th className="n">{pick("金额", "Amount")}</th><th>{pick("付款", "Payment")}</th><th>{pick("状态", "Status")}</th></tr></thead>
          <tbody>{list.map((o) => <tr key={o.id} className="click" onClick={() => setEd(o)}><td className="mono">{o.order_no}</td><td className="nw">{String(o.created_at).slice(0, 10)}</td><td>{cv(sName(o.store_id))}{o.rep_id && <span className="muted small"> · {cv(rName(o.rep_id))}</span>}</td><td>{cv(o.customer_name)}<span className="muted small"> {o.customer_phone}</span></td><td className="n">{cad(o.subtotal)}</td><td className="small">{pick(...(PAY[o.payment] || PAY.pending))}</td><td><span className={`tag ${o.status === "done" || o.status === "shipped" ? "k-in" : o.status === "cancelled" ? "k-out" : ""}`}>{pick(...STATUS[o.status])}</span></td></tr>)}</tbody></table></div>}
      {ed && <OrderDetail d={d} o={ed} onClose={() => setEd(null)} onSaved={() => { setEd(null); load(); }} />}
      {batch && <Modal title={pick("待处理的分销订单：一起推荐下单方式", "Recommend all open orders")} onClose={() => setBatch(false)} footer={<button className="btn primary" onClick={() => setBatch(false)}>{pick("关闭", "Close")}</button>}>
        <p className="muted small" style={{ marginTop: 0 }}>{pick("把所有还没分配、不是客人自己在 doTERRA 下的待处理订单放在一起算，可以把几张单的单品凑到同一个帐户，补缺口更有效。", "All open orders are pooled so items from several orders can fill the same gaps.")}</p>
        <AllocPanel orders={d.orders.filter((o) => ["new", "processing"].includes(o.status) && !o.alloc && o.payment !== "direct_doterra")} onApplied={() => { setBatch(false); load(); }} />
      </Modal>}
    </>
  );
}

function OrderDetail({ d, o, onClose, onSaved }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const isNew = !!o.new;
  const [f, setF] = useState(isNew ? { store_id: d.stores[0]?.id || "", rep_id: "", customer_name: "", customer_phone: "", ship_address: "", ship_method: "ship", payment: "store_collected", status: "new", note: "" } : { ...o });
  const [lines, setLines] = useState(isNew ? [] : o.items || []);
  const [holder, setHolder] = useState(d.holders.find((h) => h.kind === "place")?.id || d.holders[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const sub = lines.reduce((s, l) => s + n(l.qty) * n(l.price), 0);
  const store = d.stores.find((s) => s.id === f.store_id); const rep = d.reps.find((r) => r.id === f.rep_id);
  const pctS = isNew ? n(store?.store_pct) : n(f.store_pct), pctF = isNew ? n(rep?.staff_pct ?? store?.staff_pct) : n(f.staff_pct);
  const c = commission({ subtotal: sub, store_pct: pctS, staff_pct: pctF, rep_id: f.rep_id });
  const save = async (patch = {}) => {
    setBusy(true);
    try {
      const row = { store_id: f.store_id || null, rep_id: f.rep_id || null, customer_name: f.customer_name, customer_phone: f.customer_phone, ship_address: f.ship_address, ship_method: f.ship_method, payment: f.payment, status: f.status, doterra_ref: f.doterra_ref || "", tracking: f.tracking || "", fulfill: f.fulfill || "", note: f.note || "", pv: f.pv === "" || f.pv == null ? null : n(f.pv), items: lines, subtotal: sub, ...patch };
      if (isNew) await db.insert("ds_orders", { ...row, source: "admin", store_pct: pctS, staff_pct: pctF });
      else await db.update("ds_orders", o.id, row);
      toast(pick("已保存", "Saved")); onSaved();
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  // 用现货发货：从选定的持有人出库
  const shipFromStock = async () => {
    if (!holder) return;
    setBusy(true);
    try {
      const batch = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const cat = await import("../data/catalog.json");
      for (const l of lines) {
        const p = cat.default.products.find((x) => x.id === l.product);
        const item_id = await ensureItem(d.items, p ? productItem(p) : { name: l.name, category: "oil", unit: "瓶" });
        await db.insert("inv_moves", { batch, date: today(), kind: "out", item_id, qty: n(l.qty), from_holder: holder, to_holder: null, unit_price: n(l.price), reason: "卖出", order_ref: `分销 ${o.order_no}`, note: f.customer_name || "" });
      }
      await save({ fulfill: "stock", holder_id: holder, inv_batch: batch, status: f.status === "new" ? "processing" : f.status });
    } catch (e) { toast(e.message); setBusy(false); }
  };
  return (
    <Modal title={isNew ? pick("代客下单", "New order") : `${o.order_no} · ${cv(f.customer_name)}`} onClose={onClose} footer={<><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>{pick("取消", "Cancel")}</button><button className="btn primary" disabled={busy || !lines.length} onClick={() => save()}>{pick("保存", "Save")}</button></>}>
      <div className="grid3">
        <div className="field"><label htmlFor="do_s">{pick("门店", "Store")}</label><select id="do_s" value={f.store_id || ""} onChange={set("store_id")} disabled={!isNew}><option value="">—</option>{d.stores.map((s) => <option key={s.id} value={s.id}>{cv(s.name)}</option>)}</select></div>
        <div className="field"><label htmlFor="do_r">{pick("销售员", "Rep")}</label><select id="do_r" value={f.rep_id || ""} onChange={set("rep_id")} disabled={!isNew}><option value="">{pick("（没有）", "(none)")}</option>{d.reps.filter((r) => !f.store_id || r.store_id === f.store_id || !r.store_id).map((r) => <option key={r.id} value={r.id}>{cv(r.name)}</option>)}</select></div>
        <div className="field"><label htmlFor="do_st">{pick("状态", "Status")}</label><select id="do_st" value={f.status} onChange={set("status")}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></div>
        <div className="field"><label htmlFor="do_cn">{pick("客人", "Customer")}</label><input id="do_cn" type="text" value={f.customer_name || ""} onChange={set("customer_name")} /></div>
        <div className="field"><label htmlFor="do_cp">{pick("电话", "Phone")}</label><input id="do_cp" type="text" value={f.customer_phone || ""} onChange={set("customer_phone")} /></div>
        <div className="field"><label htmlFor="do_pay">{pick("付款", "Payment")}</label><select id="do_pay" value={f.payment} onChange={set("payment")}>{Object.entries(PAY).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="do_ad">{f.ship_method === "pickup" ? pick("到店取货", "Pickup") : pick("寄送地址", "Address")}</label><input id="do_ad" type="text" value={f.ship_address || ""} onChange={set("ship_address")} /></div>
      {f.customer_note && <p className="notice">{pick("客人备注：", "Customer note: ")}{cv(f.customer_note)}</p>}
      <Cart lines={lines} setLines={setLines} showPv />
      <div className="pt-break">
        <div><span>{pick("金额（会员价）", "Amount")}</span><b>{cad(sub)}</b></div>
        <div><span>{pick(`店家 ${pctS}%${f.rep_id ? "" : ` ＋ 员工 ${pctF}%`}`, "Store")}</span><b>{cad(c.store)}</b></div>
        {f.rep_id && <div><span>{pick(`员工 ${pctF}%`, "Staff")}</span><b>{cad(c.staff)}</b></div>}
        <div className="hi"><span>{pick("我们留下", "We keep")}</span><b>{cad(sub - c.store - c.staff)}</b></div>
      </div>
      {!isNew && o.alloc && <p className="notice small">{pick("已按推荐记入：", "Recorded as: ")}{o.alloc.map((x) => `${x.label}（${Math.round(x.pv)} PV：${x.items.join("、")}）`).join("；")}</p>}
      {!isNew && !o.alloc && o.payment !== "direct_doterra" && lines.length > 0 && <AllocPanel orders={[{ ...o, items: lines }]} onApplied={onSaved} />}
      {!isNew && <section className="ds-ful">
        <b>{pick("发货", "Fulfilment")}</b>
        {o.fulfill === "stock" ? <p className="small">{pick(`已经用现货发货（从「${cv(d.holders.find((h) => h.id === o.holder_id)?.name || "")}」出库）。`, "Shipped from stock.")}</p> :
          <div className="ds-ful-row">
            <span className="small">{pick("用现货发：", "From stock:")}</span>
            <select value={holder} onChange={(e) => setHolder(e.target.value)} aria-label={pick("从谁的库存", "From")}>{d.holders.map((h) => <option key={h.id} value={h.id}>{cv(h.name)}</option>)}</select>
            <button className="btn sm" disabled={busy || !lines.length} onClick={shipFromStock}>{pick("出库并标为处理中", "Take from stock")}</button>
          </div>}
        <div className="grid3">
          <div className="field"><label htmlFor="do_dr">{pick("或向 doTERRA 下单：订单号 / 用哪个帐户", "Or doTERRA order no.")}</label><input id="do_dr" type="text" value={f.doterra_ref || ""} onChange={(e) => setF({ ...f, doterra_ref: e.target.value, fulfill: e.target.value ? "company" : f.fulfill })} /></div>
          <div className="field"><label htmlFor="do_tr">{pick("快递单号", "Tracking")}</label><input id="do_tr" type="text" value={f.tracking || ""} onChange={set("tracking")} /></div>
          <div className="field"><label htmlFor="do_pv">{pick("PV（选填）", "PV (optional)")}</label><input id="do_pv" type="number" value={f.pv ?? ""} onChange={set("pv")} /></div>
        </div>
      </section>}
      <div className="field"><label htmlFor="do_no">{pick("内部备注", "Internal note")}</label><input id="do_no" type="text" value={f.note || ""} onChange={set("note")} /></div>
    </Modal>
  );
}

function Perf({ d }) {
  const { pick, cv } = useLang();
  const months = [...new Set([today().slice(0, 7), ...d.orders.map((o) => ym(o.created_at))])].sort().reverse();
  const [month, setMonth] = useState(months[0]);
  const [by, setBy] = useState("store");
  const os = d.orders.filter((o) => o.status !== "cancelled" && (!month || ym(o.created_at) === month));
  const rows = useMemo(() => {
    const g = {};
    for (const o of os) {
      const rep = d.reps.find((r) => r.id === o.rep_id);
      const key = by === "store" ? o.store_id || "none" : by === "rep" ? o.rep_id || "none" : rep?.team || pick("（没有团队）", "(no team)");
      const label = by === "store" ? d.stores.find((s) => s.id === o.store_id)?.name || pick("（没有门店）", "(none)") : by === "rep" ? rep?.name || pick("（门店自己下的）", "(store itself)") : key;
      const x = (g[key] = g[key] || { label, orders: 0, amt: 0, pv: 0, store: 0, staff: 0, customers: new Set() });
      const c = commission(o); x.orders++; x.amt += n(o.subtotal); x.pv += n(o.pv); x.store += c.store; x.staff += c.staff; x.customers.add(o.customer_phone || o.customer_name);
    }
    return Object.values(g).sort((a, b) => b.amt - a.amt);
  }, [os, by]); // eslint-disable-line
  const tot = rows.reduce((s, r) => ({ amt: s.amt + r.amt, orders: s.orders + r.orders, store: s.store + r.store, staff: s.staff + r.staff }), { amt: 0, orders: 0, store: 0, staff: 0 });
  return (
    <>
      <div className="inv-bar">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={pick("月份", "Month")}><option value="">{pick("全部时间", "All time")}</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        <div className="fseg">{[["store", pick("按门店", "By store")], ["rep", pick("按销售员", "By rep")], ["team", pick("按团队", "By team")]].map(([k, l]) => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{l}</button>)}</div>
      </div>
      <div className="fin-sum"><div><span>{pick("销售额（会员价）", "Sales")}</span><b>{cad(tot.amt)}</b></div><div><span>{pick("订单", "Orders")}</span><b>{tot.orders}</b></div><div><span>{pick("提成合计（店家＋员工）", "Commissions")}</span><b>{cad(tot.store + tot.staff)}</b></div></div>
      {!rows.length ? <div className="empty">{pick("这段时间没有订单。", "No orders.")}</div> :
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>#</th><th>{by === "store" ? pick("门店", "Store") : by === "rep" ? pick("销售员", "Rep") : pick("团队", "Team")}</th><th className="n">{pick("订单", "Orders")}</th><th className="n">{pick("客人", "Customers")}</th><th className="n">{pick("销售额", "Sales")}</th><th className="n">PV</th><th className="n">{pick("店家提成", "Store")}</th><th className="n">{pick("员工提成", "Staff")}</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={r.label + i}><td>{i + 1}</td><td><b>{cv(r.label)}</b></td><td className="n">{r.orders}</td><td className="n">{r.customers.size}</td><td className="n"><b>{cad(r.amt)}</b></td><td className="n">{r.pv ? Math.round(r.pv) : "—"}</td><td className="n">{cad(r.store)}</td><td className="n">{cad(r.staff)}</td></tr>)}</tbody></table></div>}
    </>
  );
}

function Settle({ d, load }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const months = [...new Set([today().slice(0, 7), ...d.orders.map((o) => ym(o.created_at))])].sort().reverse();
  const [month, setMonth] = useState(months[0]);
  const os = d.orders.filter((o) => o.status !== "cancelled" && ym(o.created_at) === month);
  const stores = d.stores.map((s) => {
    const mine = os.filter((o) => o.store_id === s.id);
    const x = { s, orders: mine, sales: 0, storeC: 0, staffC: 0, collected: 0, settled: mine.length > 0 && mine.every((o) => o.settled) };
    for (const o of mine) { const c = commission(o); x.sales += n(o.subtotal); x.storeC += c.store; x.staffC += c.staff; if (o.payment === "store_collected") x.collected += n(o.subtotal); }
    x.net = x.collected - x.storeC - (s.staff_paid_by === "store" ? x.staffC : 0);
    return x;
  }).filter((x) => x.orders.length);
  const reps = d.reps.map((r) => { const mine = os.filter((o) => o.rep_id === r.id); const st = d.stores.find((s) => s.id === r.store_id); return { r, n: mine.length, amt: mine.reduce((a, o) => a + n(o.subtotal), 0), pay: mine.reduce((a, o) => a + commission(o).staff, 0), byStore: st?.staff_paid_by === "store" }; }).filter((x) => x.n);
  const markSettled = async (x) => { try { for (const o of x.orders) if (!o.settled) await db.update("ds_orders", o.id, { settled: true }); toast(pick("已标为结清", "Marked settled")); load(); } catch (e) { toast(e.message); } };
  return (
    <>
      <div className="inv-bar"><select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={pick("月份", "Month")}>{months.map((m) => <option key={m}>{m}</option>)}</select></div>
      <p className="muted small" style={{ marginTop: 0 }}>{pick("算法：店家应交回 ＝ 店家收的款 − 店家提成（员工提成由店家发的话再减员工提成）。正数是店家要转给我们，负数是我们要付给店家。客人自己在 doTERRA 下单的，店家没收款，我们付店家提成。", "Store owes = collected − store commission (− staff commission if the store pays staff). Negative means we pay the store.")}</p>
      {!stores.length ? <div className="empty">{pick("这个月没有订单。", "No orders this month.")}</div> :
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("门店", "Store")}</th><th className="n">{pick("订单", "Orders")}</th><th className="n">{pick("销售额", "Sales")}</th><th className="n">{pick("店家提成", "Store")}</th><th className="n">{pick("员工提成", "Staff")}</th><th className="n">{pick("店家收的款", "Collected")}</th><th className="n">{pick("结算", "Balance")}</th><th /></tr></thead>
          <tbody>{stores.map((x) => <tr key={x.s.id}><td><b>{cv(x.s.name)}</b><span className="muted small"> {x.s.store_pct}% / {x.s.staff_pct}%{x.s.staff_paid_by === "store" ? pick("（员工提成由店家发）", "") : ""}</span></td><td className="n">{x.orders.length}</td><td className="n">{cad(x.sales)}</td><td className="n">{cad(x.storeC)}</td><td className="n">{cad(x.staffC)}</td><td className="n">{cad(x.collected)}</td><td className={`n ${x.net < 0 ? "neg" : ""}`}><b>{x.net >= 0 ? pick(`店家交回 ${cad(x.net)}`, `Store pays ${cad(x.net)}`) : pick(`我们付 ${cad(-x.net)}`, `We pay ${cad(-x.net)}`)}</b></td><td>{x.settled ? <span className="tag k-in">{pick("已结清", "Settled")}</span> : <button className="btn sm" onClick={() => markSettled(x)}>{pick("标为结清", "Mark settled")}</button>}</td></tr>)}</tbody></table></div>}
      {reps.length > 0 && <><h3 style={{ margin: "20px 0 8px" }}>{pick("销售员提成", "Rep commissions")}</h3>
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("销售员", "Rep")}</th><th className="n">{pick("订单", "Orders")}</th><th className="n">{pick("销售额", "Sales")}</th><th className="n">{pick("提成", "Commission")}</th><th>{pick("谁发", "Paid by")}</th></tr></thead>
          <tbody>{reps.map((x) => <tr key={x.r.id}><td>{cv(x.r.name)}{x.r.team && <span className="muted small"> · {cv(x.r.team)}</span>}</td><td className="n">{x.n}</td><td className="n">{cad(x.amt)}</td><td className="n"><b>{cad(x.pay)}</b></td><td className="small">{x.byStore ? pick("店家发", "Store") : pick("我们发", "Us")}</td></tr>)}</tbody></table></div></>}
    </>
  );
}

function Channels({ d, load }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const [es, setEs] = useState(null);
  const [er, setEr] = useState(null);
  const link = (code) => `${window.location.origin}/order/${code}`;
  const copy = async (code) => { try { await navigator.clipboard.writeText(link(code)); toast(pick("链接已复制", "Link copied")); } catch { toast(link(code)); } };
  const mk = (name) => (String(name || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "S") + Math.floor(100 + Math.random() * 900);
  const saveStore = async (s) => { try { const row = { name: s.name, code: s.code || mk(s.name), store_pct: n(s.store_pct), staff_pct: n(s.staff_pct), staff_paid_by: s.staff_paid_by || "us", contact: s.contact || "", phone: s.phone || "", address: s.address || "", note: s.note || "", active: s.active !== false }; if (s.id) await db.update("ds_stores", s.id, row); else await db.insert("ds_stores", row); setEs(null); load(); } catch (e) { toast(e.message); } };
  const saveRep = async (r) => { try { const row = { name: r.name, code: r.code || mk(r.name), store_id: r.store_id || null, team: r.team || "", phone: r.phone || "", staff_pct: r.staff_pct === "" || r.staff_pct == null ? null : n(r.staff_pct), active: r.active !== false }; if (r.id) await db.update("ds_reps", r.id, row); else await db.insert("ds_reps", row); setEr(null); load(); } catch (e) { toast(e.message); } };
  return (
    <>
      <section className="biz-card"><h3>{pick("门店", "Stores")}<button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={() => setEs({ store_pct: 15, staff_pct: 10, staff_paid_by: "us" })}>{pick("+ 加门店", "+ Store")}</button></h3>
        {!d.stores.length ? <p className="muted">{pick("还没有门店。", "No stores yet.")}</p> :
          <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("门店", "Store")}</th><th className="n">{pick("店家 %", "Store %")}</th><th className="n">{pick("员工 %", "Staff %")}</th><th>{pick("专属下单链接", "Order link")}</th><th /></tr></thead>
            <tbody>{d.stores.map((s) => <tr key={s.id} className={s.active === false ? "off" : ""}><td><b>{cv(s.name)}</b>{s.contact && <span className="muted small"> · {cv(s.contact)}</span>}</td><td className="n">{s.store_pct}%</td><td className="n">{s.staff_pct}%</td><td className="small"><Link to={`/order/${s.code}`}>/order/{s.code}</Link> <button className="btn ghost sm" onClick={() => copy(s.code)}>{pick("复制", "Copy")}</button></td><td><button className="btn ghost sm" onClick={() => setEs(s)}>{pick("编辑", "Edit")}</button></td></tr>)}</tbody></table></div>}
      </section>
      <section className="biz-card"><h3>{pick("销售员", "Reps")}<button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={() => setEr({ store_id: d.stores[0]?.id || "" })}>{pick("+ 加销售员", "+ Rep")}</button></h3>
        <p className="muted small" style={{ marginTop: 0 }}>{pick("销售员可以属于某个门店（用门店的员工比例），也可以是独立的，单独设比例。每人有自己的下单链接，下的单都算他的业绩。", "Reps can belong to a store or be independent. Each has their own order link.")}</p>
        {!d.reps.length ? <p className="muted">{pick("还没有销售员。", "No reps yet.")}</p> :
          <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("销售员", "Rep")}</th><th>{pick("门店", "Store")}</th><th>{pick("团队", "Team")}</th><th className="n">{pick("员工 %", "Staff %")}</th><th>{pick("专属下单链接", "Order link")}</th><th /></tr></thead>
            <tbody>{d.reps.map((r) => { const st = d.stores.find((s) => s.id === r.store_id); return <tr key={r.id} className={r.active === false ? "off" : ""}><td><b>{cv(r.name)}</b></td><td>{st ? cv(st.name) : pick("独立", "Independent")}</td><td>{cv(r.team || "—")}</td><td className="n">{r.staff_pct ?? st?.staff_pct ?? 0}%</td><td className="small"><Link to={`/order/${r.code}`}>/order/{r.code}</Link> <button className="btn ghost sm" onClick={() => copy(r.code)}>{pick("复制", "Copy")}</button></td><td><button className="btn ghost sm" onClick={() => setEr(r)}>{pick("编辑", "Edit")}</button></td></tr>; })}</tbody></table></div>}
      </section>
      {es && <Modal title={es.id ? pick("门店", "Store") : pick("加门店", "Add store")} onClose={() => setEs(null)} footer={<><button className="btn" onClick={() => setEs(null)}>{pick("取消", "Cancel")}</button><button className="btn primary" disabled={!es.name} onClick={() => saveStore(es)}>{pick("保存", "Save")}</button></>}>
        <div className="grid3">
          <div className="field"><label htmlFor="cs_n">{pick("门店名字", "Name")}</label><input id="cs_n" type="text" value={es.name || ""} onChange={(e) => setEs({ ...es, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="cs_c">{pick("链接代码（英文数字）", "Link code")}</label><input id="cs_c" type="text" value={es.code || ""} placeholder={pick("留空自动生成", "Auto")} onChange={(e) => setEs({ ...es, code: e.target.value.replace(/[^A-Za-z0-9-]/g, "") })} /></div>
          <div className="field"><label htmlFor="cs_ct">{pick("联系人 / 电话", "Contact")}</label><input id="cs_ct" type="text" value={es.contact || ""} onChange={(e) => setEs({ ...es, contact: e.target.value })} /></div>
          <div className="field"><label htmlFor="cs_s">{pick("店家 %", "Store %")}</label><input id="cs_s" type="number" step="0.5" value={es.store_pct ?? ""} onChange={(e) => setEs({ ...es, store_pct: e.target.value })} /></div>
          <div className="field"><label htmlFor="cs_f">{pick("员工 %", "Staff %")}</label><input id="cs_f" type="number" step="0.5" value={es.staff_pct ?? ""} onChange={(e) => setEs({ ...es, staff_pct: e.target.value })} /></div>
          <div className="field"><label htmlFor="cs_pb">{pick("员工提成由谁发", "Staff paid by")}</label><select id="cs_pb" value={es.staff_paid_by || "us"} onChange={(e) => setEs({ ...es, staff_paid_by: e.target.value })}><option value="us">{pick("我们发", "Us")}</option><option value="store">{pick("店家发（结算时一起扣）", "Store")}</option></select></div>
        </div>
        <div className="field"><label htmlFor="cs_ad">{pick("地址", "Address")}</label><input id="cs_ad" type="text" value={es.address || ""} onChange={(e) => setEs({ ...es, address: e.target.value })} /></div>
        {es.id && <label className="chk"><input type="checkbox" checked={es.active !== false} onChange={(e) => setEs({ ...es, active: e.target.checked })} /> {pick("启用（停用后链接不能下单）", "Active")}</label>}
      </Modal>}
      {er && <Modal title={er.id ? pick("销售员", "Rep") : pick("加销售员", "Add rep")} onClose={() => setEr(null)} footer={<><button className="btn" onClick={() => setEr(null)}>{pick("取消", "Cancel")}</button><button className="btn primary" disabled={!er.name} onClick={() => saveRep(er)}>{pick("保存", "Save")}</button></>}>
        <div className="grid3">
          <div className="field"><label htmlFor="cr_n">{pick("名字", "Name")}</label><input id="cr_n" type="text" value={er.name || ""} onChange={(e) => setEr({ ...er, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="cr_s">{pick("门店", "Store")}</label><select id="cr_s" value={er.store_id || ""} onChange={(e) => setEr({ ...er, store_id: e.target.value })}><option value="">{pick("独立销售员", "Independent")}</option>{d.stores.map((s) => <option key={s.id} value={s.id}>{cv(s.name)}</option>)}</select></div>
          <div className="field"><label htmlFor="cr_t">{pick("团队（选填）", "Team")}</label><input id="cr_t" type="text" value={er.team || ""} onChange={(e) => setEr({ ...er, team: e.target.value })} /></div>
          <div className="field"><label htmlFor="cr_c">{pick("链接代码", "Link code")}</label><input id="cr_c" type="text" value={er.code || ""} placeholder={pick("留空自动生成", "Auto")} onChange={(e) => setEr({ ...er, code: e.target.value.replace(/[^A-Za-z0-9-]/g, "") })} /></div>
          <div className="field"><label htmlFor="cr_p">{pick("员工 %（留空用门店的）", "Staff % (blank = store's)")}</label><input id="cr_p" type="number" step="0.5" value={er.staff_pct ?? ""} onChange={(e) => setEr({ ...er, staff_pct: e.target.value })} /></div>
          <div className="field"><label htmlFor="cr_ph">{pick("电话", "Phone")}</label><input id="cr_ph" type="text" value={er.phone || ""} onChange={(e) => setEr({ ...er, phone: e.target.value })} /></div>
        </div>
      </Modal>}
    </>
  );
}
