// 团队地图 + PV / 积分
// 本月 PV：本月所有订单的 PV 加起来（每月重新算）。
// 积分（LRP 产品积分）：开户结余 + 订单获得 − 订单兑换 + 手动调整，一直累积。
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n";
import { useToast } from "../ctx";
import { db } from "../api";
import { Loading, Modal } from "../components";
import { buildTree, ladder, money, today } from "../util";

const GAPN = { pv: ["个人 PV", "PV"], lrp_pv: ["LRP PV", "LRP PV"], ov: ["团队 OV", "OV"], legs: ["达标直属线", "Legs"], lrp_months: ["连续 LRP 月数", "LRP months"], points: ["积分", "Points"] };
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r1 = (v) => Math.round(n(v) * 10) / 10;
export const thisMonth = () => today().slice(0, 7);
/** doTERRA LRP 积分比例：连续月数越多比例越高 */
export const lrpRate = (months) => (months >= 13 ? 0.3 : months >= 10 ? 0.25 : months >= 7 ? 0.2 : months >= 4 ? 0.15 : 0.1);

/** 某人某月的订单、PV、LRP PV */
export function monthOf(orders, memberId, ym) {
  const os = orders.filter((o) => o.member_id === memberId && String(o.date).slice(0, 7) === ym);
  return { orders: os, pv: os.reduce((a, o) => a + n(o.total_pv), 0), lrpPv: os.filter((o) => o.lrp).reduce((a, o) => a + n(o.total_pv), 0) };
}
/** 积分结余；完全没有记录时用导入报表里的数 */
export function pointsOf(memberId, orders, moves, status) {
  const mv = moves.filter((x) => x.member_id === memberId);
  const os = orders.filter((o) => o.member_id === memberId && (o.points_earned != null || o.points_used != null));
  if (!mv.length && !os.length) return { balance: n(status?.points), fromReport: true };
  return { balance: mv.reduce((a, x) => a + n(x.points), 0) + os.reduce((a, o) => a + n(o.points_earned) - n(o.points_used), 0), fromReport: false };
}

function useTeamData() {
  const [d, setD] = useState(null);
  useEffect(() => {
    (async () => {
      const [members, orders, status, moves, levels] = await Promise.all([
        db.select("members", { order: ["name", true] }).catch(() => []),
        db.select("orders", { order: ["date", false] }).catch(() => []),
        db.select("member_status").catch(() => []),
        db.select("pts_moves", { order: ["date", true] }).catch(() => []),
        db.select("levels", { order: ["sort", true] }).catch(() => []),
      ]);
      setD({ members, orders, st: Object.fromEntries(status.map((s) => [s.member_id, s])), moves, levels });
    })();
  }, []);
  return d;
}

/* ---------- 地图 ---------- */
export function TeamMap({ rootId, admin }) {
  const { pick, cv } = useLang();
  const d = useTeamData();
  const [ym, setYm] = useState(thisMonth());
  const [depth, setDepth] = useState(99);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [q, setQ] = useState("");
  const wrap = useRef(null);

  const model = useMemo(() => {
    if (!d) return null;
    const roots = rootId ? [buildTree(d.members, rootId)].filter(Boolean)
      : d.members.filter((m) => !m.sponsor_id || !d.members.some((x) => x.id === m.sponsor_id)).map((m) => buildTree(d.members, m.id));
    const info = {};
    const walk = (node) => {
      const mo = monthOf(d.orders, node.m.id, ym);
      const s = d.st[node.m.id] || {};
      const usePv = mo.orders.length ? mo.pv : (s.period === ym ? n(s.pv) : 0);
      let team = usePv; let size = 0;
      for (const c of node.children) { const ci = walk(c); team += ci.team; size += 1 + ci.size; }
      const pts = pointsOf(node.m.id, d.orders, d.moves, s);
      const lrpPv = mo.orders.length ? mo.lrpPv : (s.period === ym ? n(s.lrp_pv) : 0);
      const stat = { ...s, pv: usePv, lrp_pv: lrpPv, ov: team, points: pts.balance };
      const rank = ladder(d.levels, "rank", stat, s.rank);
      const lvl = ladder(d.levels, "member", stat, s.member_level);
      info[node.m.id] = { pv: usePv, lrpPv, orders: mo.orders, team, size, pts, rank, lvl, s };
      return info[node.m.id];
    };
    roots.forEach(walk);
    const gens = {}; const count = (node) => { if (node.depth > 0) gens[node.depth] = (gens[node.depth] || 0) + 1; node.children.forEach(count); }; roots.forEach(count);
    return { roots, info, gens };
  }, [d, rootId, ym]);

  const months = useMemo(() => { if (!d) return []; const s = new Set([thisMonth(), ...d.orders.map((o) => String(o.date).slice(0, 7))]); return [...s].filter(Boolean).sort().reverse().slice(0, 24); }, [d]);
  const fit = () => { const el = wrap.current; if (!el) return; const inner = el.firstElementChild; if (!inner) return; const w = inner.scrollWidth / zoom; const z = Math.max(el.clientWidth < 600 ? 0.6 : 0.4, Math.min(1, (el.clientWidth - 16) / w)); setZoom(z); setTimeout(() => { const root = el.querySelector(".tm-tree > li > .tm-card"); if (root) { const rb = root.getBoundingClientRect(), wb = el.getBoundingClientRect(); el.scrollLeft += rb.left + rb.width / 2 - (wb.left + wb.width / 2); el.scrollTop = 0; } }, 80); };
  useEffect(() => { const t = setTimeout(fit, 50); return () => clearTimeout(t); }, [model, depth]); // eslint-disable-line

  if (!d) return <Loading />;
  if (!model.roots.length || (rootId && !model.roots[0].children.length)) return <div className="empty">{pick("还没有下线。", "No downline yet.")}</div>;
  const ql = q.trim().toLowerCase();
  const hit = (m) => ql && [m.name, m.name_en, m.doterra_id].some((x) => String(x || "").toLowerCase().includes(ql));
  const toggle = (id) => setCollapsed((c) => { const x = new Set(c); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const top = model.roots.length === 1 ? model.info[model.roots[0].m.id] : null;
  const maxGen = Math.max(0, ...Object.keys(model.gens).map(Number));

  const Node = ({ node }) => {
    const i = model.info[node.m.id];
    const open = !collapsed.has(node.m.id) && node.depth < depth;
    const gap = i.rank?.next && i.rank.gaps.find((g) => g.left > 0);
    return (
      <li>
        <div className={`tm-card ${i.pv ? "" : "zero"} ${hit(node.m) ? "hit" : ""} ${sel === node.m.id ? "on" : ""}`}>
          <button className="tm-main" onClick={() => setSel(node.m.id)}>
            <span className="tm-name">{cv(node.m.name)}</span>
            <span className="tm-sub">{[i.rank?.cur && pick(i.rank.cur.name_zh, i.rank.cur.name_en), node.m.doterra_id && `#${node.m.doterra_id}`].filter(Boolean).join(" · ") || " "}</span>
            <span className="tm-pv"><b>{r1(i.pv)}</b> PV{i.lrpPv >= 50 && <em>LRP</em>}</span>
            <span className="tm-row"><span>{pick("订单", "Orders")} {i.orders.length}</span><span>{pick("积分", "Pts")} {r1(i.pts.balance)}</span></span>
            {node.children.length > 0 && <span className="tm-row"><span>{pick("团队", "Team")} {i.size}{pick(" 人", "")}</span><span>OV {r1(i.team)}</span></span>}
            {gap && <span className="tm-gap">{pick(`距 ${i.rank.next.name_zh} 差 ${r1(gap.left)} ${gap.unit === "legs" ? "条线" : gap.unit === "months" ? "个月" : gap.unit === "pts" ? "积分" : gap.unit}`, `${r1(gap.left)} ${gap.unit} to ${i.rank.next.name_en}`)}</span>}
          </button>
          {node.children.length > 0 && <button className="tm-tog" onClick={() => toggle(node.m.id)} aria-expanded={open} aria-label={open ? pick("收起", "Collapse") : pick("展开", "Expand")}>{open ? "−" : `+${i.size}`}</button>}
        </div>
        {open && node.children.length > 0 && <ul>{node.children.map((c) => <Node key={c.m.id} node={c} />)}</ul>}
      </li>
    );
  };

  return (
    <div className="tm">
      <div className="inv-bar">
        <select value={ym} onChange={(e) => setYm(e.target.value)} aria-label={pick("月份", "Month")}>{months.map((m) => <option key={m} value={m}>{m}{m === thisMonth() ? pick("（本月）", " (this month)") : ""}</option>)}</select>
        <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label={pick("显示几代", "Generations")}><option value={99}>{pick("显示全部代数", "All generations")}</option>{[1, 2, 3, 4, 5].filter((g) => g <= maxGen).map((g) => <option key={g} value={g}>{pick(`显示到第 ${g} 代`, `Down to gen ${g}`)}</option>)}</select>
        <input type="search" placeholder={pick("找人：名字或会员号", "Find: name or member no.")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="acts"><button className="btn sm" onClick={() => setZoom((z) => Math.max(0.35, r1(z - 0.1)))} aria-label={pick("缩小", "Zoom out")}>−</button><button className="btn sm" onClick={fit}>{pick("适合屏幕", "Fit")}</button><button className="btn sm" onClick={() => setZoom((z) => Math.min(1.4, r1(z + 0.1)))} aria-label={pick("放大", "Zoom in")}>+</button></div>
      </div>
      <div className="tm-gens">
        {top && <span><b>{r1(top.team)}</b> {pick("团队 PV", "team PV")}</span>}
        {Object.entries(model.gens).map(([g, c]) => <span key={g}>{pick(`第 ${g} 代`, `Gen ${g}`)} <b>{c}</b>{pick(" 人", "")}</span>)}
      </div>
      <div className="tm-wrap" ref={wrap} onPointerDown={(e) => { if (e.pointerType !== "mouse" || e.target.closest("button")) return; const el = wrap.current; const x0 = e.clientX, y0 = e.clientY, l0 = el.scrollLeft, t0 = el.scrollTop; el.classList.add("drag"); const mv = (ev) => { el.scrollLeft = l0 - (ev.clientX - x0); el.scrollTop = t0 - (ev.clientY - y0); }; const up = () => { el.classList.remove("drag"); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); }}>
        <div className="tm-inner" style={{ zoom }}>
          <ul className="tm-tree">{model.roots.map((r) => <Node key={r.m.id} node={r} />)}</ul>
        </div>
      </div>
      <p className="muted small">{pick("本月 PV 每月重新算；积分会一直累积。灰色的是这个月还没下单的。点名字看这个月的订单。", "PV resets every month; points keep adding up. Grey = no order this month. Tap a name for this month's orders.")}</p>
      {sel && <NodeDetail d={d} info={model.info[sel]} m={d.members.find((x) => x.id === sel)} ym={ym} admin={admin} onClose={() => setSel(null)} />}
    </div>
  );
}

function NodeDetail({ d, info, m, ym, admin, onClose }) {
  const { pick, cv } = useLang();
  const rk = info.rank, lv = info.lvl;
  return (
    <Modal title={`${cv(m.name)} · ${ym}`} onClose={onClose} footer={<><Link className="btn" to={admin ? `/admin?m=${m.id}` : `/me/m/${m.id}`}>{pick("打开会员页", "Open member page")}</Link><button className="btn primary" onClick={onClose}>{pick("关闭", "Close")}</button></>}>
      <div className="fin-sum">
        <div><span>{pick("本月 PV", "PV this month")}</span><b>{r1(info.pv)}</b></div>
        <div><span>{pick("本月 LRP PV", "LRP PV")}</span><b>{r1(info.lrpPv)}</b></div>
        <div><span>{pick("积分结余", "Points balance")}</span><b>{r1(info.pts.balance)}</b></div>
      </div>
      {info.size > 0 && <p className="muted small" style={{ margin: 0 }}>{pick(`团队 ${info.size} 人，团队 PV（OV）${r1(info.team)}`, `Team of ${info.size}, team PV (OV) ${r1(info.team)}`)}</p>}
      {info.pts.fromReport && info.s.points != null && <p className="muted small" style={{ margin: 0 }}>{pick("积分来自导入的月报表。", "Points from the imported monthly report.")}</p>}
      {[rk, lv].filter((x) => x?.next).map((x, k) => <div key={k} className="tm-next"><b>{pick(`下一级：${x.next.name_zh}`, `Next: ${x.next.name_en}`)}</b>{x.gaps.map((g) => <span key={g.key}>{pick(...(GAPN[g.key] || [g.key, g.key]))} {r1(g.have)} / {r1(g.need)}{g.left > 0 ? pick(`，还差 ${r1(g.left)}`, `, ${r1(g.left)} to go`) : " ✓"}</span>)}</div>)}
      <h4 style={{ margin: "8px 0 0" }}>{pick("这个月的订单", "Orders this month")}</h4>
      {!info.orders.length ? <p className="muted">{pick("这个月还没有订单。", "No orders this month.")}</p> :
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("日期", "Date")}</th><th>{pick("单号", "Order")}</th><th className="n">PV</th><th className="n">{pick("金额", "Total")}</th><th>{pick("积分", "Points")}</th></tr></thead>
          <tbody>{info.orders.map((o) => <tr key={o.id}><td className="nw">{o.date}</td><td>{o.order_no || "—"}{o.lrp && <span className="tag k-in" style={{ marginLeft: 6 }}>LRP</span>}{o.account ? <span className="muted small"> · {cv(o.account)}</span> : ""}</td><td className="n">{r1(o.total_pv)}</td><td className="n">{o.total != null ? money(o.total, o.currency || "CAD") : "—"}</td><td className="small">{[o.points_earned ? `+${r1(o.points_earned)}` : "", o.points_used ? `−${r1(o.points_used)}` : ""].filter(Boolean).join(" ") || "—"}</td></tr>)}</tbody></table></div>}
    </Modal>
  );
}

/* ---------- 积分明细（会员页） ---------- */
const PK = { opening: ["开户结余", "Opening balance"], earn: ["获得", "Earned"], redeem: ["兑换", "Redeemed"], expire: ["过期", "Expired"], adjust: ["调整", "Adjustment"] };
export function PointsPanel({ memberId, admin }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const load = async () => {
    const [orders, moves, st] = await Promise.all([
      db.select("orders", { eq: { member_id: memberId }, order: ["date", true] }).catch(() => []),
      db.select("pts_moves", { eq: { member_id: memberId }, order: ["date", true] }).catch(() => []),
      db.select("member_status", { eq: { member_id: memberId } }).catch(() => []),
    ]);
    setD({ orders, moves, s: st[0] || {} });
  };
  useEffect(() => { load(); }, [memberId]); // eslint-disable-line
  if (!d) return <Loading />;
  const pts = pointsOf(memberId, d.orders, d.moves, d.s);
  const mo = monthOf(d.orders, memberId, thisMonth());
  const rows = [...d.moves.map((x) => ({ date: x.date, k: pick(...(PK[x.kind] || PK.adjust)), v: n(x.points), note: x.note, id: x.id })),
    ...d.orders.filter((o) => n(o.points_earned)).map((o) => ({ date: o.date, k: pick("订单获得", "Earned on order"), v: n(o.points_earned), note: `#${o.order_no || ""}` })),
    ...d.orders.filter((o) => n(o.points_used)).map((o) => ({ date: o.date, k: pick("订单兑换", "Redeemed on order"), v: -n(o.points_used), note: `#${o.order_no || ""}` }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const save = async () => {
    const sign = f.kind === "redeem" || f.kind === "expire" ? -1 : 1;
    try { await db.insert("pts_moves", { member_id: memberId, date: f.date, kind: f.kind, points: f.kind === "adjust" ? n(f.points) : sign * Math.abs(n(f.points)), note: f.note }); setF(null); load(); } catch (e) { toast(e.message || "error"); }
  };
  return (
    <div className="block">
      <h2>{pick("PV 与积分", "PV & points")}</h2>
      <div className="fin-sum">
        <div><span>{pick("本月 PV（每月清零）", "PV this month (resets monthly)")}</span><b>{r1(mo.orders.length ? mo.pv : d.s.period === thisMonth() ? d.s.pv : 0)}</b></div>
        <div><span>{pick("本月 LRP PV", "LRP PV this month")}</span><b>{r1(mo.orders.length ? mo.lrpPv : d.s.period === thisMonth() ? d.s.lrp_pv : 0)}</b></div>
        <div><span>{pick("积分结余（一直累积）", "Points balance (carries over)")}</span><b>{r1(pts.balance)}</b></div>
      </div>
      {admin && <p><button className="btn sm" onClick={() => setF({ date: today(), kind: rows.length ? "adjust" : "opening", points: "", note: "" })}>{pick("记一笔积分", "Add points entry")}</button></p>}
      {rows.length > 0 && <div className="inv-tbl-wrap" style={{ marginBottom: 28 }}><table className="inv-tbl"><tbody>{rows.slice(0, 30).map((x, i) => <tr key={x.id || i}><td className="nw">{x.date}</td><td>{x.k}</td><td className="muted small">{cv(x.note || "")}</td><td className={`n ${x.v < 0 ? "neg" : ""}`}>{x.v > 0 ? "+" : ""}{r1(x.v)}</td></tr>)}</tbody></table></div>}
      {pts.fromReport && <p className="muted small">{pick("还没有积分明细，现在显示的是导入月报表里的积分。", "No points entries yet; showing the imported report figure.")}</p>}
      {f && <Modal title={pick("记一笔积分", "Points entry")} onClose={() => setF(null)} footer={<><button className="btn" onClick={() => setF(null)}>{pick("取消", "Cancel")}</button><button className="btn primary" disabled={!n(f.points)} onClick={save}>{pick("保存", "Save")}</button></>}>
        <div className="grid3">
          <div className="field"><label htmlFor="pt_d">{pick("日期", "Date")}</label><input id="pt_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="field"><label htmlFor="pt_k">{pick("类型", "Type")}</label><select id="pt_k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(PK).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></div>
          <div className="field"><label htmlFor="pt_p">{pick("积分", "Points")}</label><input id="pt_p" type="number" step="0.01" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="pt_n">{pick("备注", "Note")}</label><input id="pt_n" type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        <p className="muted small">{pick("订单里获得和兑换的积分，在订单上填就会自动算进来，不用在这里重复记。这里用来记开户时的结余、过期、或者手动调整。", "Points earned or redeemed on orders are counted from the order itself. Use this for the opening balance, expiries or adjustments.")}</p>
      </Modal>}
    </div>
  );
}
