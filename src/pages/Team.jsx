// 团队地图 + PV / 积分
// 本月 PV：本月所有订单的 PV 加起来（每月重新算）。
// 积分（LRP 产品积分）：开户结余 + 订单获得 − 订单兑换 + 手动调整，一直累积。
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n";
import { useAuth, useToast } from "../ctx";
import { db } from "../api";
import { Loading, Modal } from "../components";
import { buildTree, money, today } from "../util";
import { RANKS, computeMonth, fmtUsd } from "../comp";

const GAPN = { pv: ["个人 PV", "PV"], lrp_pv: ["LRP PV", "LRP PV"], ov: ["团队 OV", "OV"], legs: ["达标直属线", "Legs"], lrp_months: ["连续 LRP 月数", "LRP months"], points: ["积分", "Points"] };
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r1 = (v) => Math.round(n(v) * 10) / 10;
export const thisMonth = () => today().slice(0, 7);
/** doTERRA LRP 积分比例：连续月数越多比例越高 */
export const lrpRate = (months) => (months >= 13 ? 0.3 : months >= 10 ? 0.25 : months >= 7 ? 0.2 : months >= 4 ? 0.15 : 0.1);

/** 订单属于哪个帐户：先看 account_id，旧订单按帐户名字对 */
export function acctOf(o, accts) {
  if (o.account_id) return o.account_id;
  const a = accts.find((x) => x.member_id === o.member_id && o.account && (x.label === String(o.account).trim() || (x.member_no && x.member_no === String(o.account).trim())));
  return a ? a.id : `none:${o.member_id}`;
}
/** 某人的帐户列表；有没对上帐户的订单时多一个「未指定帐户」 */
export function accountsFor(memberId, accts, orders) {
  const list = accts.filter((a) => a.member_id === memberId).sort((x, y) => (y.is_main ? 1 : 0) - (x.is_main ? 1 : 0) || String(x.created_at).localeCompare(String(y.created_at)));
  if (orders.some((o) => o.member_id === memberId && acctOf(o, accts) === `none:${memberId}`)) list.push({ id: `none:${memberId}`, member_id: memberId, label: "", none: true });
  return list;
}
/** 一个帐户某月的订单、PV、LRP PV（PV 每月清零） */
export function monthOfAcct(orders, accts, acctId, ym) {
  const os = orders.filter((o) => acctOf(o, accts) === acctId && String(o.date).slice(0, 7) === ym);
  return { orders: os, pv: os.reduce((a, o) => a + n(o.total_pv), 0), lrpPv: os.filter((o) => o.lrp).reduce((a, o) => a + n(o.total_pv), 0) };
}
/** 一个帐户的积分结余（一直累积）。没指定帐户的旧积分记录算到主号 */
export function pointsOfAcct(acct, list, orders, accts, moves) {
  const main = list.find((x) => x.is_main) || list[0];
  const mv = moves.filter((x) => x.member_id === acct.member_id && (x.account_id ? x.account_id === acct.id : main && main.id === acct.id));
  const os = orders.filter((o) => acctOf(o, accts) === acct.id);
  return mv.reduce((a, x) => a + n(x.points), 0) + os.reduce((a, o) => a + n(o.points_earned) - n(o.points_used), 0);
}
/** 一个人名下所有帐户的明细 + 合计 */
export function personMonth(memberId, d, ym) {
  const list = accountsFor(memberId, d.accts, d.orders);
  const rows = list.map((a) => { const mo = monthOfAcct(d.orders, d.accts, a.id, ym); return { a, ...mo, pts: pointsOfAcct(a, list, d.orders, d.accts, d.moves) }; });
  const s = d.st[memberId] || {};
  const anyData = rows.some((r) => r.orders.length) ;
  const pv = anyData ? rows.reduce((x, r) => x + r.pv, 0) : (s.period === ym ? n(s.pv) : 0);
  const lrpPv = anyData ? rows.reduce((x, r) => x + r.lrpPv, 0) : (s.period === ym ? n(s.lrp_pv) : 0);
  const hasPts = d.moves.some((x) => x.member_id === memberId) || d.orders.some((o) => o.member_id === memberId && (o.points_earned != null || o.points_used != null));
  const pts = hasPts ? rows.reduce((x, r) => x + r.pts, 0) : n(s.points);
  return { rows, pv, lrpPv, pts, ptsFromReport: !hasPts && s.points != null, orders: rows.flatMap((r) => r.orders) };
}

function useTeamData() {
  const [d, setD] = useState(null);
  useEffect(() => {
    (async () => {
      const [members, orders, status, moves, levels, accts] = await Promise.all([
        db.select("members", { order: ["name", true] }).catch(() => []),
        db.select("orders", { order: ["date", false] }).catch(() => []),
        db.select("member_status").catch(() => []),
        db.select("pts_moves", { order: ["date", true] }).catch(() => []),
        db.select("levels", { order: ["sort", true] }).catch(() => []),
        db.select("dt_accounts", { order: ["created_at", true] }).catch(() => []),
      ]);
      setD({ members, orders, st: Object.fromEntries(status.map((s) => [s.member_id, s])), moves, levels, accts });
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
    const CR = computeMonth(d, ym);
    const walk = (node) => {
      const pm = personMonth(node.m.id, d, ym);
      const s = d.st[node.m.id] || {};
      let team = pm.pv; let size = 0;
      for (const c of node.children) { const ci = walk(c); team += ci.team; size += 1 + ci.size; }
      // 每个帐户的级别（按 doTERRA 新制度估算）；这个人显示最高的那个帐户
      const ranks = pm.rows.filter((x) => !x.a.none).map((x) => ({ a: x.a, r: CR.get(x.a.id) })).filter((x) => x.r);
      const best = ranks.sort((x, y) => y.r.rank - x.r.rank || (y.a.is_main ? 1 : 0) - (x.a.is_main ? 1 : 0))[0];
      const bonus = ranks.reduce((t, x) => t + x.r.total, 0);
      info[node.m.id] = { ...pm, team, size, s, best: best?.r || null, bestAcct: best?.a || null, bonus, CR };
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
    const gap = i.best?.next && i.best.next.items.find((g) => g.left > 0);
    return (
      <li>
        <div className={`tm-card ${i.pv ? "" : "zero"} ${hit(node.m) ? "hit" : ""} ${sel === node.m.id ? "on" : ""}`}>
          <button className="tm-main" onClick={() => setSel(node.m.id)}>
            <span className="tm-name">{cv(node.m.name)}</span>
            <span className="tm-sub">{[i.best && i.best.rank > 0 && pick(RANKS[i.best.rank].zh, RANKS[i.best.rank].en), node.m.doterra_id && `#${node.m.doterra_id}`].filter(Boolean).join(" · ") || " "}</span>
            <span className="tm-pv"><b>{r1(i.pv)}</b> PV{i.rows.length > 1 ? <small>{pick(`${i.rows.length} 个帐户合计`, `${i.rows.length} accounts`)}</small> : i.lrpPv >= 50 && <em>LRP</em>}</span>
            {i.rows.length > 1 ? <span className="tm-accts">{i.rows.map((r) => <span key={r.a.id} className={r.pv ? "" : "z"}><i>{r.a.none ? pick("未指定帐户", "Unassigned") : cv(r.a.label || r.a.member_no || "")}</i><b>{r1(r.pv)}</b>{r.lrpPv >= 50 && <em>L</em>}<u>{r1(r.pts)}</u></span>)}</span>
              : <span className="tm-row"><span>{pick("订单", "Orders")} {i.orders.length}</span><span>{pick("积分", "Pts")} {r1(i.pts)}</span></span>}
            {node.children.length > 0 && <span className="tm-row"><span>{pick("团队", "Team")} {i.size}{pick(" 人", "")}</span><span>OV {r1(i.team)}</span></span>}
            {gap && <span className="tm-gap">{pick(`距 ${i.best.next.rank.zh} 差 ${r1(gap.left)} ${gap.unit === "legs" ? "条线" : gap.key === "ov" ? "OV" : "PV"}`, `${r1(gap.left)} ${gap.unit === "legs" ? "legs" : gap.key === "ov" ? "OV" : "PV"} to ${i.best.next.rank.en}`)}</span>}
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

const TIERL = { customer: ["普通会员", "Member"], doterra: ["doTERRA 会员", "doTERRA member"], builder: ["经营者", "Builder"], super: ["超级经营者", "Lead builder"] };
function TierSwitch({ m }) {
  const { pick } = useLang();
  const toast = useToast();
  const { isAdmin, profile } = useAuth();
  const [tier, setTier] = useState(m.tier || "customer");
  const opts = isAdmin ? ["customer", "doterra", "builder"] : ["customer", "doterra"];
  const can = isAdmin || (m.id !== profile?.member_id && ["customer", "doterra"].includes(tier));
  const go = async (t) => { try { await db.rpc("set_member_tier", { target: m.id, t }); setTier(t); m.tier = t; toast(pick("身份已更新", "Updated")); } catch (e) { toast(pick("没有权限修改", "Not allowed")); } };
  return (
    <div className="tier-sw"><span className="muted small">{pick("身份", "Tier")}</span>
      {can && tier !== "super" ? <div className="fseg">{opts.map((t) => <button key={t} aria-pressed={tier === t} onClick={() => tier !== t && go(t)}>{pick(...TIERL[t])}</button>)}</div> : <b>{pick(...(TIERL[tier] || TIERL.customer))}</b>}
    </div>
  );
}

function NodeDetail({ d, info, m, ym, admin, onClose }) {
  const { pick, cv } = useLang();
  const nx = info.best?.next;
  return (
    <Modal title={`${cv(m.name)} · ${ym}`} onClose={onClose} footer={<><Link className="btn" to={admin ? `/admin?m=${m.id}` : `/me/m/${m.id}`}>{pick("打开会员页", "Open member page")}</Link><button className="btn primary" onClick={onClose}>{pick("关闭", "Close")}</button></>}>
      <TierSwitch m={m} />
      <div className="fin-sum">
        <div><span>{pick("本月 PV", "PV this month")}</span><b>{r1(info.pv)}</b></div>
        <div><span>{pick("本月 LRP PV", "LRP PV")}</span><b>{r1(info.lrpPv)}</b></div>
        <div><span>{pick("积分结余", "Points balance")}</span><b>{r1(info.pts)}</b></div>
      </div>
      {info.size > 0 && <p className="muted small" style={{ margin: 0 }}>{pick(`团队 ${info.size} 人，团队 PV（OV）${r1(info.team)}`, `Team of ${info.size}, team PV (OV) ${r1(info.team)}`)}</p>}
      {info.ptsFromReport && <p className="muted small" style={{ margin: 0 }}>{pick("积分来自导入的月报表。", "Points from the imported monthly report.")}</p>}
      {nx && <div className="tm-next"><b>{pick(`下一级：${nx.rank.zh}`, `Next: ${nx.rank.en}`)}{info.bestAcct && info.rows.length > 1 ? <span className="muted small">{pick(`（${cv(info.bestAcct.label || "")}）`, ` (${info.bestAcct.label || ""})`)}</span> : null}</b>{nx.items.map((g) => <span key={g.key}>{pick(g.zh, g.en)} {r1(g.have)} / {r1(g.need)}{g.left > 0 ? pick(`，还差 ${r1(g.left)}`, `, ${r1(g.left)} to go`) : " ✓"}</span>)}</div>}
      {info.bonus > 0 && <p className="small" style={{ margin: 0 }}>{pick(`本月预计奖金（估算）${fmtUsd(info.bonus)}，明细看会员页的「事业进度」。`, `Estimated bonus this month ${fmtUsd(info.bonus)}; see Business on the member page.`)}</p>}
      {info.rows.length > 0 && <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("帐户", "Account")}</th><th className="n">{pick("本月 PV", "PV")}</th><th className="n">LRP PV</th><th className="n">{pick("订单", "Orders")}</th><th className="n">{pick("积分", "Points")}</th><th>{pick("级别", "Rank")}</th></tr></thead>
        <tbody>{info.rows.map((r) => <tr key={r.a.id}><td>{r.a.none ? <span className="muted">{pick("未指定帐户", "Unassigned")}</span> : <><b>{cv(r.a.label || "doTERRA")}</b>{r.a.is_main && <span className="tag k-in" style={{ marginLeft: 6 }}>{pick("主号", "Main")}</span>}{r.a.member_no && <span className="muted small mono"> #{r.a.member_no}</span>}</>}</td><td className="n"><b>{r1(r.pv)}</b></td><td className="n">{r1(r.lrpPv)}</td><td className="n">{r.orders.length}</td><td className="n">{r1(r.pts)}</td><td className="small">{(() => { const c = info.CR.get(r.a.id); return c ? pick(RANKS[c.rank].zh, RANKS[c.rank].en) : "—"; })()}</td></tr>)}</tbody></table></div>}
      <h4 style={{ margin: "8px 0 0" }}>{pick("这个月的订单", "Orders this month")}</h4>
      {!info.orders.length ? <p className="muted">{pick("这个月还没有订单。", "No orders this month.")}</p> :
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("日期", "Date")}</th><th>{pick("单号", "Order")}</th><th className="n">PV</th><th className="n">{pick("金额", "Total")}</th><th>{pick("积分", "Points")}</th></tr></thead>
          <tbody>{info.orders.map((o) => <tr key={o.id}><td className="nw">{o.date}</td><td>{o.order_no || "—"}{o.lrp && <span className="tag k-in" style={{ marginLeft: 6 }}>LRP</span>}{(() => { const a = d.accts.find((x) => x.id === acctOf(o, d.accts)); const l = a ? a.label || a.member_no : o.account; return l ? <span className="muted small"> · {cv(l)}</span> : ""; })()}</td><td className="n">{r1(o.total_pv)}</td><td className="n">{o.total != null ? money(o.total, o.currency || "CAD") : "—"}</td><td className="small">{[o.points_earned ? `+${r1(o.points_earned)}` : "", o.points_used ? `−${r1(o.points_used)}` : ""].filter(Boolean).join(" ") || "—"}</td></tr>)}</tbody></table></div>}
    </Modal>
  );
}

/* ---------- 积分明细（会员页） ---------- */
const PK = { opening: ["开户结余", "Opening balance"], earn: ["获得", "Earned"], redeem: ["兑换", "Redeemed"], expire: ["过期", "Expired"], adjust: ["调整", "Adjustment"] };
export function PointsPanel({ memberId, admin }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const { isBuilder, isAdmin: viewerAdmin } = useAuth();
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const load = async () => {
    const [orders, moves, st, accts] = await Promise.all([
      db.select("orders", { eq: { member_id: memberId }, order: ["date", true] }).catch(() => []),
      db.select("pts_moves", { eq: { member_id: memberId }, order: ["date", true] }).catch(() => []),
      db.select("member_status", { eq: { member_id: memberId } }).catch(() => []),
      db.select("dt_accounts", { eq: { member_id: memberId }, order: ["created_at", true] }).catch(() => []),
    ]);
    setD({ orders, moves, accts, st: st[0] ? { [memberId]: st[0] } : {} });
  };
  useEffect(() => { load(); }, [memberId]); // eslint-disable-line
  if (!d) return <Loading />;
  const pm = personMonth(memberId, d, thisMonth());
  const main = pm.rows.find((r) => r.a.is_main) || pm.rows[0];
  const aName = (id) => { const r = pm.rows.find((x) => x.a.id === id); return r ? (r.a.none ? pick("未指定帐户", "Unassigned") : r.a.label || r.a.member_no) : ""; };
  const hist = [...d.moves.map((x) => ({ date: x.date, k: pick(...(PK[x.kind] || PK.adjust)), v: n(x.points), note: x.note, acct: x.account_id || main?.a.id, id: x.id })),
    ...d.orders.filter((o) => n(o.points_earned)).map((o) => ({ date: o.date, k: pick("订单获得", "Earned on order"), v: n(o.points_earned), note: `#${o.order_no || ""}`, acct: acctOf(o, d.accts) })),
    ...d.orders.filter((o) => n(o.points_used)).map((o) => ({ date: o.date, k: pick("订单兑换", "Redeemed on order"), v: -n(o.points_used), note: `#${o.order_no || ""}`, acct: acctOf(o, d.accts) }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const save = async () => {
    const sign = f.kind === "redeem" || f.kind === "expire" ? -1 : 1;
    try { await db.insert("pts_moves", { member_id: memberId, account_id: f.account_id && !String(f.account_id).startsWith("none") ? f.account_id : null, date: f.date, kind: f.kind, points: f.kind === "adjust" ? n(f.points) : sign * Math.abs(n(f.points)), note: f.note }); setF(null); load(); } catch (e) { toast(e.message || "error"); }
  };
  const real = pm.rows.filter((r) => !r.a.none);
  if (!(admin || isBuilder || viewerAdmin)) {
    // 消费者：只看每个帐户里有多少免费积分
    const cards = real.length ? real : pm.rows;
    return (
      <div className="block">
        <h2>{pick("我的免费积分", "My free product credit")}</h2>
        <p className="muted small" style={{ marginTop: -6 }}>{pick("每月 Rewards 订单累积的积分，可以在 doTERRA 换免费产品。", "Points from your monthly Rewards orders, redeemable for free products at doTERRA.")}</p>
        {cards.length > 1 ? <div className="acct-grid">{cards.map((r) => <div key={r.a.id} className="acct-card"><div className="ah"><b>{r.a.none ? pick("其他订单", "Other orders") : cv(r.a.label || "doTERRA")}</b>{r.a.member_no && <span className="muted small mono">#{r.a.member_no}</span>}</div><div className="credit"><b>{r1(r.pts)}</b><span>{pick("积分", "points")}</span></div></div>)}</div>
          : <div className="acct-card" style={{ maxWidth: 320 }}><div className="credit"><b>{r1(pm.pts)}</b><span>{pick("积分", "points")}</span></div></div>}
        <p className="muted small" style={{ marginBottom: 28 }}>{pick("想知道怎样多拿积分、下个月几号下单最划算，可以问 Grace。", "Ask Grace how to earn more points.")}</p>
      </div>
    );
  }
  return (
    <div className="block">
      <h2>{pick("PV 与积分", "PV & points")}</h2>
      <p className="muted small" style={{ marginTop: -6 }}>{pick("PV 和积分跟着每个 doTERRA 帐户算。本月 PV 每月清零，积分一直累积。", "PV and points are tracked per doTERRA account. PV resets monthly; points carry over.")}</p>
      {pm.rows.length > 1 && <div className="fin-sum">
        <div><span>{pick("本月 PV 合计", "PV this month, all accounts")}</span><b>{r1(pm.pv)}</b></div>
        <div><span>{pick("本月 LRP PV 合计", "LRP PV, all accounts")}</span><b>{r1(pm.lrpPv)}</b></div>
        <div><span>{pick("积分合计", "Points, all accounts")}</span><b>{r1(pm.pts)}</b></div>
      </div>}
      {pm.rows.length ? <div className="acct-grid">{pm.rows.map((r) => (
        <div key={r.a.id} className="acct-card">
          <div className="ah">{r.a.none ? <span className="muted">{pick("未指定帐户的订单", "Orders with no account")}</span> : <b>{cv(r.a.label || "doTERRA")}</b>}{r.a.is_main && <span className="tag k-in">{pick("主号", "Main")}</span>}{r.a.member_no && <span className="muted small mono">#{r.a.member_no}</span>}</div>
          <div className="an"><span><small>{pick("本月 PV", "PV")}</small><b>{r1(r.pv)}</b></span><span><small>LRP PV</small><b>{r1(r.lrpPv)}</b></span><span><small>{pick("积分", "Points")}</small><b>{r1(r.pts)}</b></span></div>
          <div className="muted small">{pick(`本月 ${r.orders.length} 张订单`, `${r.orders.length} order(s) this month`)}</div>
        </div>))}</div>
        : <div className="fin-sum"><div><span>{pick("本月 PV（每月清零）", "PV this month")}</span><b>{r1(pm.pv)}</b></div><div><span>{pick("本月 LRP PV", "LRP PV")}</span><b>{r1(pm.lrpPv)}</b></div><div><span>{pick("积分结余（一直累积）", "Points balance")}</span><b>{r1(pm.pts)}</b></div></div>}
      {admin && <p><button className="btn sm" onClick={() => setF({ date: today(), kind: hist.length ? "adjust" : "opening", points: "", note: "", account_id: main?.a.id || "" })}>{pick("记一笔积分", "Add points entry")}</button></p>}
      {hist.length > 0 && <div className="inv-tbl-wrap" style={{ marginBottom: 28 }}><table className="inv-tbl"><tbody>{hist.slice(0, 30).map((x, i) => <tr key={x.id || i}><td className="nw">{x.date}</td>{pm.rows.length > 1 && <td className="nw">{cv(aName(x.acct) || "")}</td>}<td>{x.k}</td><td className="muted small">{cv(x.note || "")}</td><td className={`n ${x.v < 0 ? "neg" : ""}`}>{x.v > 0 ? "+" : ""}{r1(x.v)}</td></tr>)}</tbody></table></div>}
      {pm.ptsFromReport && <p className="muted small">{pick("还没有积分明细，现在显示的是导入月报表里的积分。", "No points entries yet; showing the imported report figure.")}</p>}
      {f && <Modal title={pick("记一笔积分", "Points entry")} onClose={() => setF(null)} footer={<><button className="btn" onClick={() => setF(null)}>{pick("取消", "Cancel")}</button><button className="btn primary" disabled={!n(f.points)} onClick={save}>{pick("保存", "Save")}</button></>}>
        <div className="grid3">
          {real.length > 0 && <div className="field"><label htmlFor="pt_a">{pick("哪个帐户", "Account")}</label><select id="pt_a" value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>{real.map((r) => <option key={r.a.id} value={r.a.id}>{cv(r.a.label || r.a.member_no || "doTERRA")}</option>)}</select></div>}
          <div className="field"><label htmlFor="pt_d">{pick("日期", "Date")}</label><input id="pt_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="field"><label htmlFor="pt_k">{pick("类型", "Type")}</label><select id="pt_k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(PK).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></div>
          <div className="field"><label htmlFor="pt_p">{pick("积分", "Points")}</label><input id="pt_p" type="number" step="0.01" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="pt_n">{pick("备注", "Note")}</label><input id="pt_n" type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        <p className="muted small">{pick("订单里获得和兑换的积分，在订单上填就会自动算进那个帐户，不用在这里重复记。这里用来记开户结余、过期或手动调整。", "Points earned or redeemed on orders count automatically for that account. Use this for opening balances, expiries or adjustments.")}</p>
      </Modal>}
    </div>
  );
}
