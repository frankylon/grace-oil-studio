// 账本：每个帐户（Grace 自己、每位会员 / 下属帐户）各有自己的收入和支出。
// 收据可以拍照上传，自动读出日期、商家、金额帮你填表；一张发票可以分摊到几个帐户。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { useAuth, useCatalog, useToast } from "../ctx";
import { db, files, aiReceipt, DEMO } from "../api";
import { Loading, Modal } from "../components";
import { today } from "../util";
import { ItemPicker, matchProduct, productItem, ensureItem } from "./Inventory";

export const EXP_CATS = ["精油进货", "瓶子配件", "宣传物料", "广告推广", "餐饮招待", "汽车油费", "停车交通", "快递运费", "活动场地", "日常消耗", "课程学习", "手机网络软件", "其他支出"];
export const INC_CATS = ["卖精油", "芳疗服务", "doTERRA 奖金", "其他收入"];
const PAY = { credit: ["信用卡", "Credit card"], debit: ["借记卡", "Debit"], cash: ["现金", "Cash"], etransfer: ["e-Transfer", "e-Transfer"], wechat: ["微信", "WeChat"], alipay: ["支付宝", "Alipay"], other: ["其他", "Other"] };
const DT_STATUS = { active: ["正常", "Active"], lrp: ["有 LRP 每月订单", "On LRP"], inactive: ["暂停 / 不活跃", "Inactive"], closed: ["已关闭", "Closed"] };
const AI_ERR = {
  no_api_key: ["自动识别暂时用不了，请先手动填写", "Automatic reading isn't available right now. Please fill in by hand."],
  no_permission: ["这个帐号还没连上会员资料，请联系 Grace", "This login isn't linked to a member yet."],
  file_too_large: ["文件太大，请换小一点的图片", "File too large."],
  unsupported_type: ["只支持图片（JPG / PNG / WebP）或 PDF", "Images or PDF only."],
  unreadable: ["没读出内容，请手动填写", "Couldn't read it; please fill in by hand."],
  too_many_files: ["一笔最多 8 张", "Up to 8 files per entry."],
  claude_error: ["暂时识别不了，请稍后再试或手动填写", "Couldn't read it right now; try again or fill in by hand."],
};
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const fmt = (v, c = "CAD") => `${n(v) < 0 ? "−" : ""}${c === "CAD" ? "$" : c + " "}${Math.abs(n(v)).toFixed(2)}`;
const GOODS = ["精油进货", "瓶子配件", "宣传物料"];
const ym = (d) => String(d || "").slice(0, 7);

/* ---------- 文件处理 ---------- */
async function compress(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 900_000) return f;
  const img = await createImageBitmap(f);
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  return new File([b], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
async function b64(f) { const u = new Uint8Array(await f.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function sha(f) { const h = await crypto.subtle.digest("SHA-256", await f.arrayBuffer()); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
const extOf = (f) => (f.type === "application/pdf" ? "pdf" : (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg"));

/* ---------- 数据 ---------- */
function useBooks() {
  const { isAdmin, profile } = useAuth();
  const [d, setD] = useState(null);
  const load = useCallback(async () => {
    const [holders, entries, members, dts, items] = await Promise.all([
      db.select("inv_holders", { order: ["created_at", true] }).catch(() => []),
      db.select("fin_entries", { order: ["date", false] }).catch(() => []),
      db.select("members", { order: ["name", true] }).catch(() => []),
      db.select("dt_accounts", { order: ["created_at", true] }).catch(() => []),
      db.select("inv_items", { order: ["name", true] }).catch(() => []),
    ]);
    const mset = new Set(members.map((m) => m.id));
    // 排序：Grace（源头）→ 各会员按名字 → 仓库等地点
    const rank = (h) => (members.find((m) => m.id === h.member_id)?.tier === "super" ? 0 : h.kind === "place" ? 2 : 1);
    const editable = holders.filter((h) => h.active !== false && (isAdmin || (h.member_id && mset.has(h.member_id))))
      .sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), "zh"));
    setD({ holders, entries, members, dts, items, editable });
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);
  return { d, reload: load, isAdmin, myMember: profile?.member_id || null };
}

/* ---------- 入口 ---------- */
export function Books({ admin }) {
  const { pick } = useLang();
  const { d, reload, isAdmin, myMember } = useBooks();
  const [sub, setSub] = useState("ledger");
  if (!d) return <Loading />;
  return (
    <div className="fin">
      <div className="fseg" style={{ marginBottom: 20 }}>
        {[["ledger", pick("账本", "Ledger")], ["accounts", pick("doTERRA 帐户", "doTERRA accounts")]].map(([k, l]) => <button key={k} aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>)}
      </div>
      {sub === "ledger" && <Ledger d={d} reload={reload} admin={admin && isAdmin} myMember={myMember} />}
      {sub === "accounts" && <DtAccounts d={d} reload={reload} admin={admin && isAdmin} myMember={myMember} />}
    </div>
  );
}

function Ledger({ d, reload, admin, myMember }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const [acct, setAcct] = useState(() => (admin ? "" : d.editable.find((h) => h.member_id === myMember)?.id || ""));
  const [month, setMonth] = useState(today().slice(0, 7));
  const [kind, setKind] = useState("");
  const [edit, setEdit] = useState(null);
  const mine = d.editable.find((h) => h.member_id === myMember);
  const ensureMine = async () => {
    if (mine || admin) return mine;
    const m = d.members.find((x) => x.id === myMember);
    if (!m) { toast(pick("这个帐号还没连上会员资料，请联系 Grace", "This login isn't linked to a member yet.")); return null; }
    const h = await db.insert("inv_holders", { name: m.name, kind: "member", member_id: m.id });
    await reload(); return h;
  };
  const accts = d.editable;
  const list = d.entries.filter((e) => (!acct || e.holder_id === acct) && (!month || (month.length === 4 ? String(e.date).startsWith(month) : ym(e.date) === month)) && (!kind || e.kind === kind));
  const inc = list.filter((e) => e.kind === "income").reduce((a, e) => a + n(e.amount), 0);
  const exp = list.filter((e) => e.kind === "expense").reduce((a, e) => a + n(e.amount), 0);
  const byCat = useMemo(() => { const g = {}; list.filter((e) => e.kind === "expense").forEach((e) => { g[e.category || "其他支出"] = (g[e.category || "其他支出"] || 0) + n(e.amount); }); return Object.entries(g).sort((a, b) => b[1] - a[1]); }, [list]);
  const hName = (id) => { const h = d.holders.find((x) => x.id === id); return h ? cv(h.name) : "—"; };
  const months = useMemo(() => { const s = new Set([today().slice(0, 7), ...d.entries.map((e) => ym(e.date))]); return [...s].filter(Boolean).sort().reverse(); }, [d.entries]);
  const years = [...new Set(months.map((x) => x.slice(0, 4)))];
  const csv = () => {
    const rows = [["日期", "帐户", "类型", "类别", "商家 / 对方", "内容", "金额", "币种", "其中税", "付款方式", "单号", "备注", "分摊"], ...list.map((e) => [e.date, hName(e.holder_id), e.kind === "income" ? "收入" : "支出", e.category, e.merchant, e.item, e.amount, e.currency, e.tax ?? "", PAY[e.pay_method]?.[0] || "", e.txn_id, e.note, e.alloc_group ? `总额 ${e.alloc_total}` : ""])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `账本-${acct ? hName(acct) : "全部"}-${month || "全部"}.csv`; a.click();
  };
  const startNew = async (k) => { const h = await ensureMine(); setEdit({ kind: k, holder_id: acct || h?.id || accts[0]?.id || "" }); };
  return (
    <>
      {!admin && !mine && <p className="muted" style={{ marginTop: 0 }}>{pick("这是你自己的账本：精油进货、瓶子、宣传、广告、餐饮、油费这些开支，以及卖精油、doTERRA 奖金这些收入，都可以记在这里。上传收据或订单，系统会自动识别、帮你填好。", "Your own books: log oil orders, bottles, ads, meals, gas and other costs, plus oil sales and doTERRA bonuses. Upload a receipt or order and it's filled in for you.")}</p>}
      <div className="inv-bar">
        {(admin || accts.length > 1) && <select value={acct} onChange={(e) => setAcct(e.target.value)} aria-label={pick("帐户", "Account")}><option value="">{pick("全部帐户", "All accounts")}</option><AcctOptions d={d} /></select>}
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={pick("月份", "Month")}>
          <option value="">{pick("全部时间", "All time")}</option>
          {years.map((y) => <option key={y} value={y}>{y} {pick("全年", "full year")}</option>)}
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={pick("类型", "Type")}><option value="">{pick("收入和支出", "Income & costs")}</option><option value="expense">{pick("只看支出", "Costs only")}</option><option value="income">{pick("只看收入", "Income only")}</option></select>
        <div className="acts"><button className="btn primary sm" onClick={() => startNew("expense")}>{pick("记一笔支出", "Add a cost")}</button><button className="btn sm" onClick={() => startNew("income")}>{pick("记一笔收入", "Add income")}</button>{list.length > 0 && <button className="btn ghost sm" onClick={csv}>{pick("导出 Excel", "Export CSV")}</button>}</div>
      </div>
      <div className="fin-sum">
        <div><span>{pick("收入", "Income")}</span><b>{fmt(inc)}</b></div>
        <div><span>{pick("支出", "Costs")}</span><b>{fmt(exp)}</b></div>
        <div><span>{pick("结余", "Net")}</span><b className={inc - exp < 0 ? "neg" : ""}>{fmt(inc - exp)}</b></div>
      </div>
      {byCat.length > 0 && <div className="fin-cats">{byCat.map(([c, v]) => <div key={c} className="fin-cat"><span>{c}</span><i style={{ "--w": `${Math.max(4, (v / byCat[0][1]) * 100)}%` }} /><b>{fmt(v)}</b></div>)}</div>}
      {!list.length ? <div className="empty">{pick("这段时间还没有记录。", "Nothing recorded for this period.")}</div> :
        <div className="inv-tbl-wrap"><table className="inv-tbl fin-tbl">
          <thead><tr><th>{pick("日期", "Date")}</th>{!acct && <th>{pick("帐户", "Account")}</th>}<th>{pick("类别", "Category")}</th><th>{pick("内容", "What")}</th><th className="n">{pick("金额", "Amount")}</th><th>{pick("收据", "Receipt")}</th></tr></thead>
          <tbody>{list.map((e) => (
            <tr key={e.id} className="click" onClick={() => setEdit(e)}>
              <td className="nw">{e.date}</td>{!acct && <td className="nw">{hName(e.holder_id)}</td>}
              <td className="nw"><span className={`tag ${e.kind === "income" ? "k-in" : "k-out"}`}>{e.category || (e.kind === "income" ? pick("收入", "Income") : pick("支出", "Cost"))}</span></td>
              <td><b>{e.merchant}</b>{e.item ? <span className="muted"> · {e.item}</span> : ""}{e.inv_batch && <span className="tag k-in" style={{ marginLeft: 6 }}>{pick("已入库", "Stocked")}</span>}{e.alloc_group && <span className="muted small"> · {pick(`分摊（总额 ${fmt(e.alloc_total, e.currency)}）`, `split of ${fmt(e.alloc_total, e.currency)}`)}</span>}</td>
              <td className={`n ${e.kind === "income" ? "" : "out"}`}>{e.kind === "income" ? "+" : "−"}{fmt(e.amount, e.currency)}</td>
              <td className="muted small nw">{e.receipts?.length ? `${e.receipts.length} ${pick("张", "file(s)")}` : "—"}</td>
            </tr>))}</tbody>
        </table></div>}
      {edit && <EntryForm d={d} entry={edit} admin={admin} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

/* 帐户下拉：会员帐户和其他（仓库等）分开 */
function AcctOptions({ d }) {
  const { pick, cv } = useLang();
  const mem = d.editable.filter((h) => h.kind !== "place"), other = d.editable.filter((h) => h.kind === "place");
  const label = (h) => { const m = d.members.find((x) => x.id === h.member_id); return cv(h.name) + (m?.tier === "super" ? pick("（源头）", " (top)") : ""); };
  return <>
    <optgroup label={pick(`会员帐户（${mem.length}）`, `Member accounts (${mem.length})`)}>{mem.map((h) => <option key={h.id} value={h.id}>{label(h)}</option>)}</optgroup>
    {other.length > 0 && <optgroup label={pick("其他", "Other")}>{other.map((h) => <option key={h.id} value={h.id}>{cv(h.name)}</option>)}</optgroup>}
  </>;
}

/* ---------- 记一笔 ---------- */
function EntryForm({ d, entry, admin, onClose, onSaved }) {
  const { pick, cv, lang } = useLang();
  const toast = useToast();
  const isNew = !entry.id;
  const [f, setF] = useState({ date: today(), kind: "expense", category: "", merchant: "", item: "", amount: "", currency: "CAD", tax: "", pay_method: "", txn_id: "", note: "", ...entry });
  const [fl, setFl] = useState([]); // [{file, sha, url}]
  const [ai, setAi] = useState({ busy: false, msg: "", bad: false });
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState({}); // holder_id -> amount
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState([]);
  const cat = useCatalog();
  const [stock, setStock] = useState({ on: false, to: entry.holder_id || "", lines: [] });
  const [stocked, setStocked] = useState([]);
  useEffect(() => { if (entry.inv_batch) db.select("inv_moves", { eq: { batch: entry.inv_batch } }).then(setStocked).catch(() => {}); }, [entry.inv_batch]);
  const toLine = (l) => { const p = cat.ready ? matchProduct(l.name, cat.products) : null; const base = p ? productItem(p) : { name: l.name || "", category: /bottle|瓶|roller|spray|喷/i.test(l.name || "") ? "bottle" : /brochure|flyer|card|册|卡|印/i.test(l.name || "") ? "print" : "other", unit: "个", cost: 0 };
    const ex = d.items.find((x) => (base.product_id && x.product_id === base.product_id) || x.name === base.name);
    return { ...(ex ? { item_id: ex.id } : base), raw: l.name || "", qty: l.qty != null ? String(l.qty) : "1", price: l.unit_price != null ? String(l.unit_price) : "" }; };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cats = f.kind === "income" ? INC_CATS : EXP_CATS;
  const holder = d.holders.find((h) => h.id === f.holder_id);
  useEffect(() => { if (!isNew && entry.receipts?.length) Promise.all(entry.receipts.map((p) => files.url(p).catch(() => null))).then(setLinks); }, [isNew, entry.receipts]);

  const pickFiles = async (ev) => {
    const raw = [...ev.target.files]; ev.target.value = ""; if (!raw.length) return;
    if (raw.length + fl.length > 8) { setAi({ msg: pick(...AI_ERR.too_many_files), bad: true }); return; }
    const prepared = [];
    for (const r of raw) { const c = await compress(r); prepared.push({ file: c, sha: await sha(c), url: URL.createObjectURL(c) }); }
    const all = [...fl, ...prepared]; setFl(all);
    const dup = d.entries.find((e) => e.id !== entry.id && (e.receipt_sha || []).some((s) => prepared.some((p) => p.sha === s)));
    if (dup) { setAi({ msg: pick(`这张收据已经记过了（${dup.date} ${dup.merchant} ${fmt(dup.amount, dup.currency)}）。`, `This receipt was already recorded (${dup.date} ${dup.merchant}).`), bad: true }); return; }
    setAi({ busy: true, msg: pick(`正在识别 ${all.length} 张…（大约 5–30 秒）`, `Reading ${all.length} file(s)… (5–30 s)`) });
    try {
      const payload = []; for (const p of all) payload.push({ mime: p.file.type, name: p.file.name, data: await b64(p.file) });
      const r = await aiReceipt(f.kind, payload, { lang: lang === "en" ? "en" : "zh", categories: cats, account: holder?.name || "" });
      const x = r.fields || {};
      setF((o) => ({ ...o,
        date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : o.date,
        merchant: x.merchant || o.merchant, item: x.item || o.item, txn_id: x.txn_id || o.txn_id,
        amount: x.amount != null && x.amount !== "" ? String(x.amount) : o.amount, tax: x.tax != null ? String(x.tax) : o.tax,
        currency: ["CAD", "USD", "CNY"].includes(x.currency) ? x.currency : o.currency,
        category: cats.includes(x.category) ? x.category : o.category, pay_method: PAY[x.pay_method] ? x.pay_method : o.pay_method,
        note: o.note || [x.card_last4 && `${pick("卡尾号", "Card")} ${x.card_last4}`, x.doterra_member_no && `doTERRA #${x.doterra_member_no}`, x.bill_to && `${pick("抬头", "Bill to")} ${x.bill_to}`].filter(Boolean).join(" · "),
      }));
      if (f.kind === "expense" && Array.isArray(x.lines) && x.lines.length && !entry.inv_batch) setStock((st) => ({ ...st, on: true, lines: x.lines.map(toLine) }));
      setAi({ msg: pick(`已识别：${x.summary || ""}${f.kind === "expense" && x.lines?.length ? `，订单里有 ${x.lines.length} 样货，下面可以一起入库` : ""}。请核对金额和日期再保存。`, `Read: ${x.summary || ""}. Check the amount and date before saving.`) });
    } catch (e) { setAi({ msg: pick(...(AI_ERR[e.code] || [e.message, e.message])) + pick("（收据仍会在保存时上传）", " (the file will still be attached)"), bad: true }); }
  };

  useEffect(() => { if (split && !(stock.to in parts)) { const k = Object.keys(parts)[0]; if (k) setStock((st) => ({ ...st, to: k })); } }, [split, parts, stock.to]);
  const targets = split ? Object.entries(parts).filter(([, v]) => v !== "" && n(v) > 0) : [[f.holder_id, f.amount]];
  const splitSum = targets.reduce((a, [, v]) => a + n(v), 0);
  const splitOk = !split || (targets.length >= 2 && Math.abs(splitSum - n(f.amount)) < 0.011);
  const valid = f.holder_id && n(f.amount) > 0 && f.date && splitOk;
  const even = () => { const ids = Object.keys(parts).length ? Object.keys(parts) : [f.holder_id]; const each = Math.floor((n(f.amount) / ids.length) * 100) / 100; const o = {}; ids.forEach((id, i) => { o[id] = (i === ids.length - 1 ? Math.round((n(f.amount) - each * (ids.length - 1)) * 100) / 100 : each).toFixed(2); }); setParts(o); };

  const save = async () => {
    if (!valid) return;
    const dupTx = f.txn_id && d.entries.find((e) => e.id !== entry.id && e.txn_id && e.txn_id === f.txn_id && (e.merchant || "") === (f.merchant || "") && (!entry.alloc_group || e.alloc_group !== entry.alloc_group));
    if (dupTx && !window.confirm(pick(`同一个商家、同一个单号已经记过（${dupTx.date} ${fmt(dupTx.amount, dupTx.currency)}）。还是要保存吗？`, `Same merchant and number already recorded (${dupTx.date}). Save anyway?`))) return;
    setBusy(true);
    try {
      let inv_batch = entry.inv_batch || null;
      const goodLines = stock.on && !entry.inv_batch ? stock.lines.filter((l) => (l.item_id || l.name) && n(l.qty) > 0) : [];
      if (goodLines.length) {
        inv_batch = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        const to = (split ? stock.to : f.holder_id) || f.holder_id;
        for (const l of goodLines) {
          const item_id = await ensureItem(d.items, l);
          await db.insert("inv_moves", { batch: inv_batch, date: f.date, kind: "in", item_id, qty: n(l.qty), from_holder: null, to_holder: to, unit_price: l.price === "" ? null : n(l.price), amount: null, reason: "", order_ref: [f.merchant, f.txn_id].filter(Boolean).join(" ").trim(), note: pick("从账本入库", "From books") + (f.item ? `：${f.item}` : "") });
        }
      }
      const base = { date: f.date, kind: f.kind, category: f.category, merchant: f.merchant.trim(), item: f.item.trim(), currency: f.currency, tax: f.tax === "" ? null : n(f.tax), pay_method: f.pay_method, txn_id: f.txn_id.trim(), note: f.note.trim() };
      if (!isNew) {
        let receipts = entry.receipts || [], shas = entry.receipt_sha || [];
        for (const p of fl) { const path = `${entry.holder_id}/${p.sha}.${extOf(p.file)}`; await files.upload(path, p.file); receipts = [...receipts, path]; shas = [...shas, p.sha]; }
        await db.update("fin_entries", entry.id, { ...base, amount: n(f.amount), receipts, receipt_sha: shas, inv_batch });
      } else {
        const group = split ? (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) : null;
        for (const [hid, amt] of targets) {
          const receipts = [];
          for (const p of fl) { const path = `${hid}/${p.sha}.${extOf(p.file)}`; await files.upload(path, p.file); receipts.push(path); }
          await db.insert("fin_entries", { ...base, holder_id: hid, amount: n(amt), receipts, receipt_sha: fl.map((p) => p.sha), inv_batch, alloc_group: group, alloc_total: split ? n(f.amount) : null, tax: split && base.tax != null ? Math.round((base.tax * n(amt)) / n(f.amount) * 100) / 100 : base.tax });
        }
      }
      toast(goodLines.length ? pick(`已保存，${goodLines.length} 样货已入库`, `Saved; ${goodLines.length} item(s) stocked in`) : pick("已保存", "Saved")); onSaved();
    } catch (e) { toast(pick("保存失败：", "Save failed: ") + (e.message || "")); }
    setBusy(false);
  };
  const del = async () => {
    if (!window.confirm(pick("删除这一笔？", "Delete this entry?"))) return;
    try {
      if (entry.inv_batch && stocked.length && window.confirm(pick(`这一笔入库了 ${stocked.length} 样货，要一起从库存撤销吗？`, `This entry stocked in ${stocked.length} item(s). Remove them from stock too?`))) for (const m of stocked) await db.remove("inv_moves", m.id);
      await db.remove("fin_entries", entry.id); onSaved(); } catch (e) { toast(e.message || "error"); }
  };

  return (
    <Modal title={isNew ? (f.kind === "income" ? pick("记一笔收入", "Add income") : pick("记一笔支出", "Add a cost")) : pick("这一笔", "Entry")} onClose={onClose}
      footer={<>{!isNew && <button className="btn danger" onClick={del}>{pick("删除", "Delete")}</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>{pick("取消", "Cancel")}</button><button className="btn primary" disabled={!valid || busy || ai.busy} onClick={save}>{busy ? pick("保存中…", "Saving…") : pick("保存", "Save")}</button></>}>
      <div className="fin-form">
        {isNew && <div className="inv-kinds" role="radiogroup">{[["expense", pick("支出", "Cost")], ["income", pick("收入", "Income")]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF((x) => ({ ...x, kind: k, category: "" }))}>{l}</button>)}</div>}
        <div className="fin-ai">
          <div><b>{pick("上传收据或订单，自动识别", "Upload a receipt or order")}</b><p className="muted small">{pick("收据、发票、doTERRA 订单截图都可以（图片或 PDF）。一张很长拍了几张，可以一次选多张，会合成一笔。", "Receipts, invoices, doTERRA order screenshots (image or PDF). Several photos of one long receipt become one entry.")}</p>{ai.msg && <p className="small" style={{ color: ai.bad ? "var(--warn)" : "var(--accent)" }}>{ai.msg}</p>}</div>
          <label className="btn primary sm" style={{ cursor: "pointer", flex: "none" }}>{ai.busy ? pick("识别中…", "Reading…") : pick("选择收据", "Choose files")}<input type="file" multiple accept="image/*,application/pdf" hidden disabled={ai.busy} onChange={pickFiles} /></label>
        </div>
        {(fl.length > 0 || links.length > 0) && <div className="fin-thumbs">
          {links.map((u, i) => u && <a key={"o" + i} href={u} target="_blank" rel="noreferrer">{/pdf/i.test(entry.receipts[i]) ? <span>PDF</span> : <img src={u} alt={pick("收据", "Receipt")} />}</a>)}
          {fl.map((p, i) => <span key={p.sha} className="new">{p.file.type === "application/pdf" ? <span>PDF</span> : <img src={p.url} alt={pick("收据", "Receipt")} />}<button type="button" aria-label={pick("移除", "Remove")} onClick={() => setFl(fl.filter((_, j) => j !== i))}>×</button></span>)}
        </div>}
        <div className="grid3">
          <div className="field"><label htmlFor="fe_d">{pick("日期", "Date")}</label><input id="fe_d" type="date" value={f.date} onChange={set("date")} /></div>
          {!split && <div className="field"><label htmlFor="fe_h">{pick("记在哪个帐户", "Account")}</label><select id="fe_h" value={f.holder_id} onChange={set("holder_id")} disabled={!isNew && !admin}><AcctOptions d={d} /></select></div>}
          <div className="field"><label htmlFor="fe_c">{pick("类别", "Category")}</label><select id="fe_c" value={f.category} onChange={set("category")}><option value="">{pick("请选择…", "Choose…")}</option>{[...cats, ...(f.category && !cats.includes(f.category) ? [f.category] : [])].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="fe_m">{f.kind === "income" ? pick("付款人 / 客人", "From") : pick("商家", "Merchant")}</label><input id="fe_m" type="text" value={f.merchant} onChange={set("merchant")} /></div>
          <div className="field"><label htmlFor="fe_i">{pick("内容", "What for")}</label><input id="fe_i" type="text" value={f.item} onChange={set("item")} placeholder={f.kind === "income" ? pick("例如：卖给客人两支薰衣草", "e.g. two lavender to a client") : pick("例如：10ml 滚珠瓶 100 个", "e.g. 100 roller bottles")} /></div>
          <div className="field"><label htmlFor="fe_a">{pick("总金额（含税）", "Total (incl. tax)")}</label><div className="fin-amt"><input id="fe_a" type="number" min="0" step="0.01" value={f.amount} onChange={set("amount")} /><select value={f.currency} onChange={set("currency")} aria-label={pick("币种", "Currency")}><option>CAD</option><option>USD</option><option>CNY</option></select></div></div>
          <div className="field"><label htmlFor="fe_t">{pick("其中税（GST/PST）", "Tax included")}</label><input id="fe_t" type="number" min="0" step="0.01" value={f.tax ?? ""} onChange={set("tax")} /></div>
          <div className="field"><label htmlFor="fe_p">{pick("付款方式", "Paid by")}</label><select id="fe_p" value={f.pay_method} onChange={set("pay_method")}><option value="">—</option>{Object.entries(PAY).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></div>
          <div className="field"><label htmlFor="fe_x">{pick("单号 / 发票号", "Invoice / order no.")}</label><input id="fe_x" type="text" value={f.txn_id} onChange={set("txn_id")} /></div>
        </div>
        <div className="field"><label htmlFor="fe_n">{pick("备注", "Note")}</label><input id="fe_n" type="text" value={f.note} onChange={set("note")} /></div>
        {f.kind === "expense" && (entry.inv_batch ? <div className="fin-stock">
          <b>{pick("这一笔已经入库", "Stocked in from this entry")}</b>
          <ul>{stocked.map((m) => { const it = d.items.find((x) => x.id === m.item_id); return <li key={m.id}>{it?.name || "?"} × {m.qty} {it?.unit || ""}{m.unit_price != null ? ` @ $${m.unit_price}` : ""} → {cv(d.holders.find((h) => h.id === m.to_holder)?.name || "")}</li>; })}</ul>
        </div> : (GOODS.includes(f.category) || stock.lines.length > 0) && <div className="fin-stock">
          <label className="chk"><input type="checkbox" checked={stock.on} onChange={(e) => setStock((st) => ({ ...st, on: e.target.checked, lines: st.lines.length ? st.lines : [{ qty: "1", price: "" }] }))} /> <b>{pick("同时入库", "Also stock in")}</b><span className="muted small">{pick("　把这张单买到的货记进库存", "  add what was bought to stock")}</span></label>
          {stock.on && <>
            {split ? <div className="field"><label>{pick("货入库到哪个帐户", "Stock goes to")}</label><select value={stock.to} onChange={(e) => setStock((st) => ({ ...st, to: e.target.value }))}>{Object.keys(parts).map((id) => <option key={id} value={id}>{cv(d.holders.find((h) => h.id === id)?.name || "")}</option>)}</select></div>
              : <p className="muted small" style={{ margin: 0 }}>{pick(`入库到「${cv(holder?.name || "")}」。用谁的帐户下的单，就记在谁的帐户。`, `Goes into ${holder?.name || ""}'s stock.`)}</p>}
            <div className="inv-lines">
              <div className="inv-line head"><span>{pick("品项", "Item")}</span><span>{pick("数量", "Qty")}</span><span>{pick("单价", "Unit price")}</span><span /></div>
              {stock.lines.map((l, i) => (
                <div key={i} className="inv-line">
                  <div>{<ItemPicker d={d} value={l} onChange={(v) => setStock((st) => ({ ...st, lines: st.lines.map((x, j) => (j === i ? { qty: x.qty, price: x.price, raw: x.raw, ...v } : x)) }))} />}{l.raw && <span className="muted small fin-raw">{pick("收据上：", "On receipt: ")}{l.raw}</span>}</div>
                  <input type="number" min="0" step="any" value={l.qty} onChange={(e) => setStock((st) => ({ ...st, lines: st.lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) }))} aria-label={pick("数量", "Qty")} placeholder={pick("数量", "Qty")} />
                  <input type="number" min="0" step="0.01" value={l.price} onChange={(e) => setStock((st) => ({ ...st, lines: st.lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) }))} aria-label={pick("单价", "Unit price")} placeholder={pick("单价", "Price")} />
                  <button type="button" className="btn ghost sm" onClick={() => setStock((st) => ({ ...st, lines: st.lines.filter((_, j) => j !== i) }))}>{pick("删除", "Remove")}</button>
                </div>))}
              <button type="button" className="btn sm" onClick={() => setStock((st) => ({ ...st, lines: [...st.lines, { qty: "1", price: "" }] }))}>{pick("再加一项", "Add a line")}</button>
            </div>
          </>}
        </div>)}
        {isNew && f.kind === "expense" && d.editable.length > 1 && <div className="fin-split">
          <label className="chk"><input type="checkbox" checked={split} onChange={(e) => { setSplit(e.target.checked); if (e.target.checked && !Object.keys(parts).length) setParts({ [f.holder_id]: "" }); }} /> {pick("这张单分摊到几个帐户（例如一次广告、一顿饭大家分）", "Split this across several accounts (e.g. a shared ad or meal)")}</label>
          {split && <>
            <div className="fin-split-list">{d.editable.map((h) => { const on = h.id in parts; return (
              <div key={h.id} className={on ? "on" : ""}><label className="chk"><input type="checkbox" checked={on} onChange={(e) => { const o = { ...parts }; if (e.target.checked) o[h.id] = ""; else delete o[h.id]; setParts(o); }} /> {cv(h.name)}</label>
                {on && <input type="number" min="0" step="0.01" value={parts[h.id]} onChange={(e) => setParts({ ...parts, [h.id]: e.target.value })} aria-label={pick("分到的金额", "Share")} />}</div>); })}</div>
            <div className="fin-split-foot"><button type="button" className="btn sm" onClick={even} disabled={!n(f.amount)}>{pick("平均分", "Split evenly")}</button>
              <span className={`small ${splitOk ? "muted" : ""}`} style={splitOk ? {} : { color: "var(--warn)" }}>{pick(`已分 ${fmt(splitSum, f.currency)} / 总额 ${fmt(f.amount, f.currency)}`, `${fmt(splitSum, f.currency)} of ${fmt(f.amount, f.currency)} allocated`)}{targets.length < 2 ? pick("（至少选两个帐户）", " (pick at least two)") : ""}</span></div>
          </>}
        </div>}
        {!isNew && entry.alloc_group && <p className="muted small">{pick(`这是一张分摊单的其中一份，整张单总额 ${fmt(entry.alloc_total, entry.currency)}。`, `One share of a split bill totalling ${fmt(entry.alloc_total, entry.currency)}.`)}</p>}
        {DEMO && <p className="muted small">{pick("演示模式：识别结果是示例，收据只在这次打开的页面里。", "Demo mode: the reading is a sample and files stay in this page only.")}</p>}
      </div>
    </Modal>
  );
}

/* ---------- doTERRA 帐户 ---------- */
function DtAccounts({ d, reload, admin, myMember }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const members = admin ? d.members : d.members;
  const byMember = {}; d.dts.forEach((a) => (byMember[a.member_id] = byMember[a.member_id] || []).push(a));
  const shown = members.filter((m) => byMember[m.id] || m.id === myMember || m.doterra_id);
  const save = async (a) => {
    try {
      const row = { is_main: !!a.is_main, label: a.label || "", member_no: a.member_no || "", login: a.login || "", status: a.status || "active", lrp_day: a.lrp_day === "" || a.lrp_day == null ? null : n(a.lrp_day), lrp_pv: a.lrp_pv === "" || a.lrp_pv == null ? null : n(a.lrp_pv), last_login: a.last_login || null, note: a.note || "" };
      if (a.id) await db.update("dt_accounts", a.id, row); else await db.insert("dt_accounts", { ...row, member_id: a.member_id });
      setEdit(null); reload();
    } catch (e) { toast(e.message || "error"); }
  };
  const del = async (a) => { if (!window.confirm(pick("删除这个帐户记录？", "Delete this account record?"))) return; try { await db.remove("dt_accounts", a.id); setEdit(null); reload(); } catch (e) { toast(e.message || "error"); } };
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>{pick("PV 和积分按帐户算。记下每个人在 doTERRA 官网的帐户（子帐户可以用别的名字，但都归这个人）：会员号、登入用的电邮或用户名、有没有 LRP 每月订单、几号出单。一个人可以有好几个帐户。为了安全，这里不保存密码。", "PV and points are tracked per account. Each person's doTERRA accounts (sub-accounts can carry other names but belong to this person): member number, login email or username, LRP status and order day. One person can have several. Passwords are never stored here.")}</p>
      {!shown.length ? <div className="empty">{pick("还没有帐户记录。", "No accounts yet.")}</div> :
        <div className="dt-list">{shown.map((m) => (
          <div key={m.id} className="dt-m">
            <div className="dt-h"><b>{cv(m.name)}</b>{m.doterra_id && <span className="muted mono small">#{m.doterra_id}</span>}<button className="btn sm" onClick={() => setEdit({ member_id: m.id, member_no: byMember[m.id] ? "" : m.doterra_id || "", status: "active" })}>{pick("加一个帐户", "Add account")}</button></div>
            {(byMember[m.id] || []).map((a) => (
              <button key={a.id} className="dt-a" onClick={() => setEdit(a)}>
                <span><b>{a.label || pick("doTERRA 帐户", "doTERRA account")}</b>{a.is_main && <span className="tag k-in" style={{ marginLeft: 6 }}>{pick("主号", "Main")}</span>}{a.member_no && <span className="mono"> #{a.member_no}</span>}</span>
                <span className="muted small">{[a.login, pick(...(DT_STATUS[a.status] || DT_STATUS.active)), a.lrp_day && pick(`每月 ${a.lrp_day} 号出单`, `orders on day ${a.lrp_day}`), a.lrp_pv && `LRP ${a.lrp_pv} PV`, a.last_login && pick(`上次登入 ${a.last_login}`, `last login ${a.last_login}`)].filter(Boolean).join(" · ")}</span>
                {a.note && <span className="small">{a.note}</span>}
              </button>))}
          </div>))}</div>}
      {edit && <DtForm a={edit} name={cv(d.members.find((m) => m.id === edit.member_id)?.name || "")} onClose={() => setEdit(null)} onSave={save} onDelete={edit.id ? () => del(edit) : null} />}
    </>
  );
}
function DtForm({ a, name, onClose, onSave, onDelete }) {
  const { pick } = useLang();
  const [f, setF] = useState({ label: "", member_no: "", login: "", status: "active", lrp_day: "", lrp_pv: "", last_login: "", note: "", ...a });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal title={`${name} · doTERRA`} onClose={onClose} footer={<>{onDelete && <button className="btn danger" onClick={onDelete}>{pick("删除", "Delete")}</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>{pick("取消", "Cancel")}</button><button className="btn primary" onClick={() => onSave(f)}>{pick("保存", "Save")}</button></>}>
      <div className="grid3">
        <div className="field"><label htmlFor="dt_l">{pick("帐户名称", "Label")}</label><input id="dt_l" type="text" value={f.label} onChange={set("label")} placeholder={pick("例如：主帐户、太太的帐户", "e.g. Main, spouse")} /></div>
        <div className="field"><label htmlFor="dt_n">{pick("会员号", "Member no.")}</label><input id="dt_n" type="text" value={f.member_no} onChange={set("member_no")} /></div>
        <div className="field"><label htmlFor="dt_g">{pick("登入电邮 / 用户名", "Login email / username")}</label><input id="dt_g" type="text" value={f.login} onChange={set("login")} autoComplete="off" /></div>
        <div className="field"><label htmlFor="dt_s">{pick("状态", "Status")}</label><select id="dt_s" value={f.status} onChange={set("status")}>{Object.entries(DT_STATUS).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></div>
        <div className="field"><label htmlFor="dt_d">{pick("LRP 每月几号出单", "LRP order day")}</label><input id="dt_d" type="number" min="1" max="28" value={f.lrp_day ?? ""} onChange={set("lrp_day")} /></div>
        <div className="field"><label htmlFor="dt_p">{pick("LRP 每月 PV", "LRP PV")}</label><input id="dt_p" type="number" min="0" value={f.lrp_pv ?? ""} onChange={set("lrp_pv")} /></div>
        <div className="field"><label htmlFor="dt_x">{pick("上次登入 / 核对日期", "Last login / checked")}</label><input id="dt_x" type="date" value={f.last_login ?? ""} onChange={set("last_login")} /></div>
      </div>
      <label className="chk"><input type="checkbox" checked={!!f.is_main} onChange={(e) => setF({ ...f, is_main: e.target.checked })} /> {pick("这是这个人的主号", "This is the main account")}</label>
      <div className="field"><label htmlFor="dt_o">{pick("备注", "Note")}</label><input id="dt_o" type="text" value={f.note} onChange={set("note")} placeholder={pick("例如：由 Grace 代为下单；绑定的付款卡尾号", "e.g. Grace orders for them; card on file ends in…")} /></div>
      <p className="muted small">{pick("不要在这里填密码。", "Don't put passwords here.")}</p>
    </Modal>
  );
}
