// doTERRA 后台（镜像）：数据全部来自 doTERRA 后台同步，系统里只看不改。
// 比 doTERRA 后台多做的：中文、跟进名单（快到 LRP 日、本月还没下单、久没下单、接近升级）、每人一张卡片、奖金按项目拆开看。
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { db } from "../api";
import { Loading, Modal } from "../components";
import { today } from "../util";
import { RANKS as COMP_RANKS } from "../comp";

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r0 = (v) => Math.round(n(v)).toLocaleString();
const r1 = (v) => (Math.round(n(v) * 10) / 10).toLocaleString();
const usd = (v) => `$${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const addDays = (d, k) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const ymOf = (d) => String(d || "").slice(0, 7);
const prevYm = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };

export const DT_RANK = {
  Consultant: "顾问", Manager: "经理", Director: "总监", Executive: "执行", Elite: "精英", Premier: "Premier",
  Silver: "银钻", Gold: "金钻", Platinum: "白金", Diamond: "钻石", "Blue Diamond": "蓝钻", "Presidential Diamond": "总统钻",
  "Wholesale Customer": "批发会员", Customer: "零售客户",
};
const RANK_OV = [["Manager", 500], ["Director", 1000], ["Executive", 2000], ["Elite", 3000], ["Premier", 5000]];
const TYPE = { D: ["经营者", "Advocate"], W: ["批发会员", "Wholesale"], S: ["零售客户", "Retail"] };
const BONUS_ZH = {
  "Power of 3 Bonus": "Power of 3", "Power of 3 Boost": "Power of 3 Boost", "Unilevel Commission": "Unilevel", "Empowerment Pool": "Empowerment Pool",
  "Leadership Pool": "Leadership Pool", "Performance Pool": "Performance Pool", "Diamond Pool": "Diamond Pool", "Rising Leader": "Rising Leader",
  "Earnings Adjustment": "调整", "Fast Start Double Up": "Fast Start 加倍",
};
const REPORT_ZH = {
  wa_info: "我的资料", upline: "上线名单", striking: "接近升级（Striking Distance）", qualifier: "团队资格", pgv_report: "PGV 报表", tgv_report: "TGV 报表",
  enrolled_3m: "近 3 个月入会", pv100_no_pom: "100 PV Rewards 但没有本月产品", not_on_rewards: "没有参加 Rewards", order100_no_rewards: "下单满 $100 但没有 Rewards",
  no_order_3m: "3 个月没下单", no_order_4m: "4 个月没下单", my_enrollees: "我亲自推荐的人", new_members: "新会员", sponsor_changes: "上线变更",
  placements: "安置", account_inquiry: "帐户往来", summary_genealogy: "族谱汇总", sales_dashboard: "销售看板", commission_payout: "奖金发放", rank_tracker: "级别追踪", dashboard: "首页",
};
const rankL = (r, pick) => (r ? pick(DT_RANK[r] ? `${DT_RANK[r]}${DT_RANK[r] === r ? "" : " " + r}` : r, r) : "—");

function useDt() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [k, setK] = useState(0);
  useEffect(() => {
    (async () => {
      try {
        const [members, monthly, orders, comm, sync, accts] = await Promise.all([
          db.select("dt_members", { all: true, order: ["dt_id", true] }),
          db.select("dt_monthly", { all: true, order: ["dt_id", true] }),
          db.select("dt_orders", { order: ["odate", false] }).catch(() => []),
          db.select("dt_commissions", { all: true, order: ["period", false] }).catch(() => []),
          db.select("dt_sync", { order: ["at", false], limit: 5 }).catch(() => []),
          db.select("dt_accounts", { all: true, order: ["created_at", true] }).catch(() => []),
        ]);
        const acctBy = Object.fromEntries(accts.filter((a) => a.member_no).map((a) => [a.member_no, a]));
        const by = Object.fromEntries(members.map((m) => [m.dt_id, { ...m, kids: [], mo: {} }]));
        for (const x of monthly) if (by[x.dt_id]) by[x.dt_id].mo[x.ym] = x;
        for (const m of Object.values(by)) if (m.sponsor_dt && by[m.sponsor_dt]) by[m.sponsor_dt].kids.push(m);
        const yms = [...new Set(monthly.map((x) => x.ym))].sort().reverse();
        const latestYm = yms[0] || ymOf(today());
        for (const m of Object.values(by)) m.kids.sort((a, b) => (a.mtype === "D" ? 0 : 1) - (b.mtype === "D" ? 0 : 1) || n(b.mo[latestYm]?.ov) - n(a.mo[latestYm]?.ov));
        const size = (m) => (m._size ??= m.kids.reduce((s, k) => s + 1 + size(k), 0));
        Object.values(by).forEach(size);
        for (const m of Object.values(by)) { m.acct = acctBy[m.dt_id]; m.closed = m.acct?.status === "closed"; }
        setD({ by, list: Object.values(by), yms, ym: latestYm, orders, comm, sync });
      } catch (e) { setErr(e.message); }
    })();
  }, [k]);
  return { d, err, reload: () => setK((x) => x + 1) };
}

export function DtOffice({ rootId, admin }) {
  const { pick } = useLang();
  const { d, err, reload } = useDt();
  const [tab, setTab] = useState("home");
  const [sel, setSel] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  if (err) return <div className="empty">{err}</div>;
  if (!d) return <Loading />;
  const root = d.by[rootId] || d.list.find((m) => !d.by[m.sponsor_dt]);
  if (!root) return <div className="empty">{pick("还没有从 doTERRA 同步资料。", "Nothing synced from doTERRA yet.")}</div>;
  const all = []; (function walk(m, lv) { for (const k of m.kids) { all.push({ m: k, lv }); walk(k, lv + 1); } })(root, 1);
  const closedN = all.filter((x) => x.m.closed).length;
  const team = showClosed ? all : all.filter((x) => !x.m.closed);
  const ctx = { d, root, team, open: setSel, admin, ym: d.ym, reload, showClosed, goTab: setTab, RANKS: COMP_RANKS };
  const last = d.sync[0];
  const tabs = [["home", pick("总览", "Overview")], ["grow", pick("升级目标", "Rank goals")], ["po3", pick("三次方 / Boost", "Power of 3")], ["follow", pick("跟进名单", "Follow-up")], ["team", pick("团队名单", "Team list")], ["tree", pick("树状图", "Tree")], ["earn", pick("奖金", "Earnings")], ["orders", pick("我的订单", "My orders")], ...(admin ? [["reports", pick("原始报表", "Reports")]] : [])];
  return (
    <div className="inv dt">
      <div className="fseg" style={{ marginBottom: 16 }}>{tabs.map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {admin && closedN > 0 && <p className="muted small" style={{ marginTop: -6 }}><label><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> {pick(`显示已终止的 ${closedN} 个帐户`, `Show ${closedN} terminated`)}</label></p>}
      {tab === "home" && <Home {...ctx} />}
      {tab === "grow" && <Growth {...ctx} />}
      {tab === "po3" && <Po3Panel {...ctx} />}
      {tab === "follow" && <Follow {...ctx} />}
      {tab === "team" && <TeamList {...ctx} />}
      {tab === "tree" && <Tree {...ctx} />}
      {tab === "earn" && <Earnings {...ctx} />}
      {tab === "orders" && <MyOrders {...ctx} />}
      {tab === "reports" && <Reports />}
      <p className="muted small" style={{ marginTop: 22 }}>{pick(`数据来源：doTERRA 后台${last ? `，最后同步 ${String(last.at).slice(0, 16).replace("T", " ")}` : ""}。这里只看不改，要更新请重新同步。`, `Source: doTERRA back office${last ? `, synced ${String(last.at).slice(0, 16).replace("T", " ")}` : ""}. Read-only.`)}</p>
      {sel && <Person m={d.by[sel]} ctx={ctx} onClose={() => setSel(null)} />}
    </div>
  );
}

function Stat({ l, v, s }) { return <div><span>{l}</span><b>{v}</b>{s && <small className="muted">{s}</small>}</div>; }

function Home({ d, root, team, ym, open }) {
  const { pick } = useLang();
  const cur = root.mo[ym] || {}; const prev = root.mo[prevYm(ym)] || {};
  const D = team.filter((x) => x.m.mtype === "D"), W = team.filter((x) => x.m.mtype !== "D");
  const active = team.filter((x) => n(x.m.mo[ym]?.pv) > 0).length;
  const lrp = team.filter((x) => x.m.lrp_date).length;
  const fresh = team.filter((x) => x.m.enroll_date && days(x.m.enroll_date, today()) <= 90).length;
  const prim = d.comm.filter((c) => c.kind === "primary" && c.dt_id === root.dt_id);
  const sec = d.comm.filter((c) => c.kind === "secondary" && c.dt_id === root.dt_id);
  const months = [...new Set([...d.yms, ...prim.map((c) => c.period)])].sort().slice(-12);
  const fsOf = (m) => sec.filter((c) => weekMonth(c.period) === m).reduce((s, c) => s + n(c.earnings), 0);
  const rows = months.map((m) => ({ m, ov: n(root.mo[m]?.ov), earn: n(prim.find((c) => c.period === m)?.earnings) + fsOf(m) }));
  const maxOv = Math.max(1, ...rows.map((r) => r.ov)), maxE = Math.max(1, ...rows.map((r) => r.earn));
  const ytd = prim.filter((c) => c.period.startsWith(ym.slice(0, 4))).reduce((s, c) => s + n(c.earnings), 0) + sec.filter((c) => c.period.startsWith(ym.slice(0, 4))).reduce((s, c) => s + n(c.earnings), 0);
  const nextRank = RANK_OV.find(([, ov]) => n(cur.ov) < ov);
  return (
    <>
      <div className="biz-hero" style={{ marginBottom: 14 }}>
        <div><span className="muted small">{pick("现在的级别 / 最高级别", "Rank / highest")}</span><b className="biz-rank">{rankL(root.rank, pick)}</b><span className="muted small">{pick(`最高 ${rankL(root.highest_rank, pick)}`, `Highest ${root.highest_rank}`)}</span></div>
        <div><span className="muted small">{pick(`${ym} 业绩`, `${ym} volume`)}</span><b className="biz-money">{r1(cur.ov)} OV</b><span className="muted small">{pick(`上月 ${r1(prev.ov)} OV`, `Last month ${r1(prev.ov)}`)}</span></div>
        <div className="biz-nums"><span><small>PV</small><b>{r1(cur.pv)}</b></span><span><small>PGV</small><b>{r1(cur.pgv)}</b></span><span><small>TGV</small><b>{r1(cur.tgv)}</b></span><span><small>{pick("下次 LRP", "Next LRP")}</small><b>{root.lrp_date ? root.lrp_date.slice(5) : "—"}</b></span></div>
      </div>
      <div className="fin-sum">
        <Stat l={pick("整个团队", "Team")} v={team.length} s={pick(`经营者 ${D.length} · 会员/客户 ${W.length}`, `${D.length} advocates · ${W.length} customers`)} />
        <Stat l={pick("本月有下单", "Ordered this month")} v={active} s={pick(`占 ${team.length ? Math.round(active / team.length * 100) : 0}%`, "")} />
        <Stat l={pick("参加 LRP", "On LRP")} v={lrp} />
        <Stat l={pick("近 90 天新加入", "New, 90 days")} v={fresh} />
        <Stat l={pick(`${ym.slice(0, 4)} 年奖金合计`, "Earnings YTD")} v={usd(ytd)} />
      </div>
      <section className="biz-card">
        <h3>{pick("近 12 个月", "Last 12 months")} <span className="muted small">{pick("团队业绩 OV　·　每月奖金（每月奖金 + 每周 Fast Start）", "OV · earnings")}</span></h3>
        <div className="dt-bars">{rows.map((r) => <div key={r.m} className="dt-bar"><div className="dt-bar-col"><i style={{ height: `${r.ov / maxOv * 100}%` }} title={`OV ${r1(r.ov)}`} /><i className="e" style={{ height: `${r.earn / maxE * 100}%` }} title={usd(r.earn)} /></div><small>{r.m.slice(2).replace("-", "/")}</small><small className="muted">{r.earn ? `$${r0(r.earn)}` : ""}</small></div>)}</div>
        <p className="muted small" style={{ margin: "6px 0 0" }}>{pick("深色是 OV，浅色是奖金。团队每月业绩只同步到最近 7 个月，奖金有全部历史。", "Dark = OV, light = earnings.")}</p>
      </section>
      {nextRank && <section className="biz-card"><h3>{pick(`OV 离 ${DT_RANK[nextRank[0]]} 还差 ${r1(nextRank[1] - n(cur.ov))}`, `${r1(nextRank[1] - n(cur.ov))} OV to ${nextRank[0]}`)}</h3><p className="muted small" style={{ margin: 0 }}>{pick("经理到 Premier 主要看 OV；银钻以上还要看几条线达到什么级别，请看「原始报表 → 接近升级」。", "")}</p></section>}
      <section className="biz-card">
        <h3>{pick("第一层（直接在你下面的人）", "Frontline")}</h3>
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("姓名", "Name")}</th><th>{pick("类型", "Type")}</th><th>{pick("级别", "Rank")}</th><th className="n">PV</th><th className="n">OV</th><th className="n">{pick("下面人数", "Team")}</th></tr></thead>
          <tbody>{root.kids.map((k) => <tr key={k.dt_id} className="click" onClick={() => open(k.dt_id)}><td><b>{k.name}</b></td><td className="small">{pick(...(TYPE[k.mtype] || [k.mtype, k.mtype]))}</td><td className="small">{k.mtype === "D" ? rankL(k.rank, pick) : ""}</td><td className="n">{r1(k.mo[ym]?.pv)}</td><td className="n">{r1(k.mo[ym]?.ov)}</td><td className="n">{k._size}</td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}
// 2026-W46 → 那一周大约落在哪个月
function weekMonth(p) { const [y, w] = p.split("-W").map(Number); return addDays(`${y}-01-01`, (w - 1) * 7 + 3).slice(0, 7); }

function Who({ m, open }) { const { pick } = useLang(); return <button className="linkbtn" onClick={() => open(m.dt_id)}><b>{m.name}</b></button>; }
function Phone({ m }) { const p = m.cell || m.phone; return p && !/^\(111\)/.test(p) ? <a href={`tel:${p.replace(/[^0-9+]/g, "")}`}>{p}</a> : <span className="muted">—</span>; }

function Follow({ d, team, ym, open }) {
  const { pick } = useLang();
  const t = today(); const pm = prevYm(ym);
  const groups = [
    { k: "lrp", t: pick("7 天内到 LRP 下单日", "LRP order within 7 days"), s: pick("提醒确认产品和地址；满 125 PV 有赠品，满 100 PV 才有积分和资格。", ""),
      rows: team.filter((x) => x.m.lrp_date && x.m.lrp_date >= t && x.m.lrp_date <= addDays(t, 7)).sort((a, b) => a.m.lrp_date.localeCompare(b.m.lrp_date)),
      col: (m) => pick(`${m.lrp_date.slice(5)} · ${r1(m.lrp_pv)} PV`, `${m.lrp_date} · ${m.lrp_pv} PV`) },
    { k: "miss", t: pick("上个月有下单，这个月还没有", "Ordered last month, not yet this month"),
      rows: team.filter((x) => n(x.m.mo[pm]?.pv) > 0 && !n(x.m.mo[ym]?.pv)).sort((a, b) => n(b.m.mo[pm]?.pv) - n(a.m.mo[pm]?.pv)),
      col: (m) => pick(`上月 ${r1(m.mo[pm]?.pv)} PV`, `${m.mo[pm]?.pv} PV last month`) },
    { k: "new", t: pick("近 60 天新加入（Fast Start 期间）", "Joined in last 60 days"), s: pick("新人头 60 天的订单有 Fast Start 奖金，先帮他们把第一张 LRP 订好。", ""),
      rows: team.filter((x) => x.m.enroll_date && days(x.m.enroll_date, t) <= 60).sort((a, b) => b.m.enroll_date.localeCompare(a.m.enroll_date)),
      col: (m) => pick(`${m.enroll_date} 入会${m.lrp_date ? "" : " · 还没 LRP"}`, m.enroll_date) },
    { k: "nolrp", t: pick("最近半年有下单，但没参加 LRP", "Ordering but not on LRP"),
      rows: team.filter((x) => !x.m.lrp_date && x.m.last_order && days(x.m.last_order, t) <= 180).sort((a, b) => b.m.last_order.localeCompare(a.m.last_order)),
      col: (m) => pick(`最后下单 ${m.last_order}`, m.last_order) },
    { k: "up", t: pick("经营者接近下一级（差 30% 以内）", "Advocates close to next rank"),
      rows: team.filter((x) => x.m.mtype === "D" && (() => { const ov = n(x.m.mo[ym]?.ov); const nx = RANK_OV.find(([, v]) => ov < v); return nx && ov >= nx[1] * 0.7; })()).sort((a, b) => n(b.m.mo[ym]?.ov) - n(a.m.mo[ym]?.ov)),
      col: (m) => { const ov = n(m.mo[ym]?.ov); const nx = RANK_OV.find(([, v]) => ov < v); return pick(`${r1(ov)} OV，差 ${r1(nx[1] - ov)} 到${DT_RANK[nx[0]]}`, `${r1(nx[1] - ov)} OV to ${nx[0]}`); } },
    { k: "sleep", t: pick("超过 3 个月没下单", "No order in 3+ months"),
      rows: team.filter((x) => x.m.last_order && days(x.m.last_order, t) > 90 && days(x.m.last_order, t) <= 365).sort((a, b) => b.m.last_order.localeCompare(a.m.last_order)),
      col: (m) => pick(`${days(m.last_order, t)} 天前`, `${days(m.last_order, t)} days ago`) },
  ];
  const [k, setK] = useState(groups[0].k);
  const g = groups.find((x) => x.k === k);
  return (
    <>
      <div className="dt-chips">{groups.map((x) => <button key={x.k} aria-pressed={x.k === k} onClick={() => setK(x.k)}>{x.t}<b>{x.rows.length}</b></button>)}</div>
      {g.s && <p className="muted small">{g.s}</p>}
      {!g.rows.length ? <div className="empty">{pick("没有人。", "Nobody.")}</div> :
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("姓名", "Name")}</th><th>{pick("类型", "Type")}</th><th>{pick("情况", "Status")}</th><th>{pick("电话", "Phone")}</th><th>{pick("上线", "Sponsor")}</th></tr></thead>
          <tbody>{g.rows.map(({ m }) => <tr key={m.dt_id}><td><Who m={m} open={open} /></td><td className="small">{pick(...(TYPE[m.mtype] || [m.mtype, m.mtype]))}</td><td className="small">{g.col(m)}</td><td className="small nw"><Phone m={m} /></td><td className="small">{d.by[m.sponsor_dt]?.name || "—"}</td></tr>)}</tbody></table></div>}
    </>
  );
}

function TeamList({ d, team, ym, open }) {
  const { pick } = useLang();
  const [q, setQ] = useState(""); const [ty, setTy] = useState(""); const [rk, setRk] = useState(""); const [mo, setMo] = useState(ym);
  const [sort, setSort] = useState(["lv", 1]);
  const ranks = [...new Set(team.map((x) => x.m.rank).filter(Boolean))];
  const val = (x, k) => ({ lv: x.lv, name: x.m.name, pv: n(x.m.mo[mo]?.pv), ov: n(x.m.mo[mo]?.ov), lrp: x.m.lrp_date || "9", last: x.m.last_order || "", enroll: x.m.enroll_date || "", size: x.m._size }[k]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return team.filter((x) => (!ty || x.m.mtype === ty) && (!rk || x.m.rank === rk) && (!s || `${x.m.name} ${x.m.dt_id} ${x.m.email || ""} ${x.m.cell || ""}`.toLowerCase().includes(s)))
      .sort((a, b) => { const A = val(a, sort[0]), B = val(b, sort[0]); return (typeof A === "number" ? A - B : String(A).localeCompare(String(B))) * sort[1]; });
  }, [team, q, ty, rk, sort, mo]);
  const H = ({ k, children, num }) => <th className={num ? "n" : ""} style={{ cursor: "pointer" }} onClick={() => setSort([k, sort[0] === k ? -sort[1] : (num ? -1 : 1)])}>{children}{sort[0] === k ? (sort[1] > 0 ? " ↑" : " ↓") : ""}</th>;
  const exportCsv = () => {
    const head = ["编号", "姓名", "类型", "层", "级别", "最高级别", `${mo} PV`, `${mo} OV`, "LRP 日期", "LRP PV", "最后下单", "入会", "上线编号", "上线", "推荐人编号", "电话", "邮箱", "地址", "城市"];
    const lines = rows.map(({ m, lv }) => [m.dt_id, m.name, TYPE[m.mtype]?.[0] || m.mtype, lv, m.rank, m.highest_rank, m.mo[mo]?.pv ?? "", m.mo[mo]?.ov ?? "", m.lrp_date || "", m.lrp_pv ?? "", m.last_order || "", m.enroll_date || "", m.sponsor_dt, d.by[m.sponsor_dt]?.name || "", m.enroller_dt, m.cell || m.phone || "", m.email || "", m.address || "", m.city || ""]);
    const csv = "﻿" + [head, ...lines].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `doterra-team-${mo}.csv`; a.click();
  };
  return (
    <>
      <div className="inv-bar">
        <input type="search" placeholder={pick("搜姓名、编号、电话、邮箱", "Search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={pick("搜索", "Search")} />
        <select value={ty} onChange={(e) => setTy(e.target.value)} aria-label={pick("类型", "Type")}><option value="">{pick("全部类型", "All types")}</option>{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select>
        <select value={rk} onChange={(e) => setRk(e.target.value)} aria-label={pick("级别", "Rank")}><option value="">{pick("全部级别", "All ranks")}</option>{ranks.map((r) => <option key={r} value={r}>{rankL(r, pick)}</option>)}</select>
        <select value={mo} onChange={(e) => setMo(e.target.value)} aria-label={pick("月份", "Month")}>{d.yms.map((m) => <option key={m}>{m}</option>)}</select>
        <button className="btn sm" onClick={exportCsv}>{pick("导出 Excel (CSV)", "Export CSV")}</button>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>{pick(`共 ${rows.length} 人。点名字看详细。`, `${rows.length} people.`)}</p>
      <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><H k="name">{pick("姓名", "Name")}</H><th>{pick("编号", "ID")}</th><th>{pick("类型", "Type")}</th><H k="lv" num>{pick("层", "Lv")}</H><th>{pick("级别", "Rank")}</th><H k="pv" num>PV</H><H k="ov" num>OV</H><H k="lrp">{pick("LRP 日 / PV", "LRP")}</H><H k="last">{pick("最后下单", "Last order")}</H><H k="enroll">{pick("入会", "Joined")}</H><th>{pick("上线", "Sponsor")}</th><H k="size" num>{pick("下面", "Team")}</H></tr></thead>
        <tbody>{rows.map(({ m, lv }) => <tr key={m.dt_id}><td><Who m={m} open={open} /></td><td className="small">{m.dt_id}</td><td className="small">{pick(...(TYPE[m.mtype] || [m.mtype, m.mtype]))}</td><td className="n">{lv}</td><td className="small">{m.mtype === "D" ? rankL(m.rank, pick) : ""}</td><td className="n">{m.mo[mo]?.pv != null ? r1(m.mo[mo].pv) : <span className="zero">—</span>}</td><td className="n">{m.mo[mo]?.ov ? r1(m.mo[mo].ov) : ""}</td><td className="small nw">{m.lrp_date ? `${m.lrp_date.slice(5)} · ${r1(m.lrp_pv)}` : <span className="zero">—</span>}</td><td className="small nw">{m.last_order || "—"}</td><td className="small nw">{m.enroll_date}</td><td className="small">{d.by[m.sponsor_dt]?.name}</td><td className="n">{m._size || ""}</td></tr>)}</tbody></table></div>
    </>
  );
}

function Tree({ root, ym, open, showClosed }) {
  const { pick } = useLang();
  const [openSet, setOpenSet] = useState(() => new Set([root.dt_id, ...root.kids.map((k) => k.dt_id)]));
  const [onlyD, setOnlyD] = useState(false);
  const tog = (id) => setOpenSet((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const dot = (m) => { const pv = n(m.mo[ym]?.pv); return pv >= 100 ? "ok" : pv > 0 ? "lo" : m.lrp_date ? "wait" : "off"; };
  const Node = ({ m, depth }) => {
    const kids0 = showClosed ? m.kids : m.kids.filter((k) => !k.closed || k._size);
    const kids = onlyD ? kids0.filter((k) => k.mtype === "D" || k._size) : kids0;
    const isOpen = openSet.has(m.dt_id);
    return (
      <li>
        <div className="dt-node">
          {kids.length ? <button className="dt-tog" onClick={() => tog(m.dt_id)} aria-label={isOpen ? pick("收起", "Collapse") : pick("展开", "Expand")}>{isOpen ? "−" : "+"}</button> : <span className="dt-tog" />}
          <i className={`dt-dot ${dot(m)}`} />
          <button className="linkbtn" onClick={() => open(m.dt_id)}><b style={m.closed ? { textDecoration: "line-through", opacity: .5 } : null}>{m.name}</b></button>{m.acct && !m.acct.is_main && <span className="tag">{pick("小号", "Sub")}</span>}
          <span className="muted small">{m.mtype === "D" ? rankL(m.rank, pick) : pick(...(TYPE[m.mtype] || ["", ""]))}</span>
          <span className="small">{r1(m.mo[ym]?.pv)} PV{m.mtype === "D" && n(m.mo[ym]?.ov) ? ` · ${r1(m.mo[ym].ov)} OV` : ""}</span>
          {m._size > 0 && <span className="muted small">{pick(`下面 ${m._size} 人`, `${m._size} below`)}</span>}
        </div>
        {isOpen && kids.length > 0 && <ul>{kids.map((k) => <Node key={k.dt_id} m={k} depth={depth + 1} />)}</ul>}
      </li>
    );
  };
  const all = () => { const s = new Set(); (function w(m) { s.add(m.dt_id); m.kids.forEach(w); })(root); setOpenSet(s); };
  return (
    <>
      <div className="inv-bar">
        <button className="btn sm ghost" onClick={all}>{pick("全部展开", "Expand all")}</button>
        <button className="btn sm ghost" onClick={() => setOpenSet(new Set([root.dt_id]))}>{pick("全部收起", "Collapse all")}</button>
        <label className="small"><input type="checkbox" checked={onlyD} onChange={(e) => setOnlyD(e.target.checked)} /> {pick("只看经营者和有下线的人", "Advocates & branches only")}</label>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}><i className="dt-dot ok" /> {pick("本月 ≥ 100 PV", "≥100 PV")}　<i className="dt-dot lo" /> {pick("本月有下单但不到 100", "<100 PV")}　<i className="dt-dot wait" /> {pick("有 LRP，本月还没下单", "LRP pending")}　<i className="dt-dot off" /> {pick("本月没有订单", "No order")}　{pick(`（${ym}，按上线 Sponsor 排）`, `(${ym}, by sponsor)`)}</p>
      <ul className="dt-tree"><Node m={root} depth={0} /></ul>
    </>
  );
}

function Person({ m, ctx, onClose }) {
  const { pick } = useLang();
  const { d, admin } = ctx;
  if (!m) return null;
  const sp = d.by[m.sponsor_dt], en = d.by[m.enroller_dt];
  const yms = [...d.yms].reverse();
  const up = []; for (let x = sp; x && up.length < 8; x = d.by[x.sponsor_dt]) up.push(x);
  return (
    <Modal title={`${m.name} · ${m.dt_id}`} onClose={onClose}>
      <div className="fin-sum" style={{ marginTop: 0 }}>
        <Stat l={pick("类型", "Type")} v={pick(...(TYPE[m.mtype] || [m.mtype, m.mtype]))} s={m.mtype === "D" ? pick(`现在 ${rankL(m.rank, pick)} · 最高 ${rankL(m.highest_rank, pick)}`, "") : ""} />
        <Stat l={pick("入会", "Joined")} v={m.enroll_date || "—"} s={pick(`最后下单 ${m.last_order || "—"}`, "")} />
        <Stat l="LRP" v={m.lrp_date || pick("没有", "None")} s={m.lrp_date ? `${r1(m.lrp_pv)} PV` : ""} />
        <Stat l={pick("下面人数", "Team")} v={m._size} />
      </div>
      <dl className="dt-dl">
        <dt>{pick("上线（Sponsor）", "Sponsor")}</dt><dd>{sp ? <button className="linkbtn" onClick={() => ctx.open(sp.dt_id)}>{sp.name}</button> : m.sponsor_dt}</dd>
        <dt>{pick("推荐人（Enroller）", "Enroller")}</dt><dd>{en ? <button className="linkbtn" onClick={() => ctx.open(en.dt_id)}>{en.name}</button> : m.enroller_dt}</dd>
        {up.length > 1 && <><dt>{pick("往上", "Upline")}</dt><dd className="small">{up.map((x) => x.name).join(" ← ")}</dd></>}
        <dt>{pick("电话", "Phone")}</dt><dd><Phone m={m} /></dd>
        {m.email && <><dt>{pick("邮箱", "Email")}</dt><dd><a href={`mailto:${m.email}`}>{m.email}</a></dd></>}
        {(m.address || m.city) && <><dt>{pick("地址", "Address")}</dt><dd>{[m.address, m.city, m.state, m.postal].filter(Boolean).join(", ")}</dd></>}
      </dl>
      <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("月份", "Month")}</th><th className="n">PV</th><th className="n">LRP PV</th><th className="n">OV</th><th className="n">PGV</th><th className="n">TGV</th></tr></thead>
        <tbody>{yms.map((y) => { const x = m.mo[y]; return <tr key={y} className={x ? "" : "off"}><td>{y}</td><td className="n">{x ? r1(x.pv) : "—"}</td><td className="n">{x ? r1(x.lrp_pv) : ""}</td><td className="n">{x?.ov ? r1(x.ov) : ""}</td><td className="n">{x?.pgv ? r1(x.pgv) : ""}</td><td className="n">{x?.tgv ? r1(x.tgv) : ""}</td></tr>; })}</tbody></table></div>
      {admin && m.acct?.member_id && <AccountAdmin ownerId={m.acct.member_id} focusDt={m.dt_id} onChanged={ctx.reload} />}
      {m.kids.length > 0 && <><h4 style={{ margin: "14px 0 6px" }}>{pick(`直接下线 ${m.kids.length} 人`, `${m.kids.length} frontline`)}</h4>
        <div className="dt-kids">{m.kids.map((k) => <button key={k.dt_id} className="linkbtn" onClick={() => ctx.open(k.dt_id)}>{k.name}<small className="muted"> {r1(k.mo[ctx.ym]?.pv)} PV</small></button>)}</div></>}
    </Modal>
  );
}

function Earnings({ d, root }) {
  const { pick } = useLang();
  const prim = d.comm.filter((c) => c.kind === "primary" && c.dt_id === root.dt_id);
  const sec = d.comm.filter((c) => c.kind === "secondary" && c.dt_id === root.dt_id);
  const years = [...new Set([...prim, ...sec].map((c) => c.period.slice(0, 4)))].sort().reverse();
  const [y, setY] = useState(years[0]);
  if (!years.length) return <div className="empty">{pick("还没有同步奖金资料。", "No earnings synced.")}</div>;
  const ps = prim.filter((c) => c.period.startsWith(y)).sort((a, b) => a.period.localeCompare(b.period));
  const cols = Object.keys(BONUS_ZH).filter((k) => ps.some((c) => n(c.breakdown?.[k])));
  const fs = (m) => sec.filter((c) => weekMonth(c.period) === m).reduce((s, c) => s + n(c.earnings), 0);
  const months = [...new Set([...ps.map((c) => c.period), ...sec.filter((c) => c.period.startsWith(y)).map((c) => weekMonth(c.period))])].filter((m) => m.startsWith(y)).sort();
  const tot = { m: ps.reduce((s, c) => s + n(c.earnings), 0), fs: sec.filter((c) => c.period.startsWith(y)).reduce((s, c) => s + n(c.earnings), 0) };
  return (
    <>
      <div className="inv-bar"><select value={y} onChange={(e) => setY(e.target.value)} aria-label={pick("年份", "Year")}>{years.map((x) => <option key={x}>{x}</option>)}</select></div>
      <div className="fin-sum"><Stat l={pick("每月奖金合计", "Monthly bonuses")} v={usd(tot.m)} /><Stat l={pick("每周 Fast Start 合计", "Weekly Fast Start")} v={usd(tot.fs)} /><Stat l={pick(`${y} 年总奖金`, `${y} total`)} v={usd(tot.m + tot.fs)} /><Stat l={pick("平均每月", "Avg / month")} v={usd((tot.m + tot.fs) / Math.max(1, months.length))} /></div>
      <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("月份", "Month")}</th>{cols.map((k) => <th key={k} className="n">{BONUS_ZH[k]}</th>)}<th className="n">{pick("每月奖金", "Monthly")}</th><th className="n">{pick("Fast Start（每周）", "Fast Start")}</th><th className="n">{pick("合计", "Total")}</th></tr></thead>
        <tbody>{months.map((m) => { const c = ps.find((x) => x.period === m); const f = fs(m); return <tr key={m}><td>{m}</td>{cols.map((k) => <td key={k} className="n">{n(c?.breakdown?.[k]) ? usd(c.breakdown[k]) : <span className="zero">—</span>}</td>)}<td className="n">{c ? usd(c.earnings) : "—"}</td><td className="n">{f ? usd(f) : "—"}</td><td className="n"><b>{usd(n(c?.earnings) + f)}</b></td></tr>; })}</tbody></table></div>
      <p className="muted small">{pick("金额是 doTERRA 后台显示的数字（扣手续费前）。Fast Start 每周发，这里按那一周所在的月份加总。", "Amounts as shown by doTERRA, before fees.")}</p>
    </>
  );
}

function MyOrders({ d, root }) {
  const { pick } = useLang();
  const [open, setOpen] = useState(null);
  const os = d.orders.filter((o) => o.dt_id === root.dt_id);
  if (!os.length) return <div className="empty">{pick("还没有同步订单。", "No orders synced.")}</div>;
  const SRC = { AS: pick("LRP 订单", "LRP"), SO: pick("一般订单", "Standard"), IO: pick("网上订单", "Online"), IN: "App", VO: pick("电话订单", "Phone") };
  return (
    <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("日期", "Date")}</th><th>{pick("订单号", "Order")}</th><th>{pick("类型", "Type")}</th><th>{pick("PV 月份", "PV month")}</th><th className="n">PV</th><th className="n">{pick("金额", "Total")}</th><th>{pick("付款", "Paid by")}</th></tr></thead>
      <tbody>{os.map((o) => [
        <tr key={o.order_no} className="click" onClick={() => setOpen(open === o.order_no ? null : o.order_no)}><td className="nw">{o.odate}</td><td className="small">{o.order_no}</td><td className="small">{SRC[o.source] || o.source}</td><td className="small">{o.pv_month}</td><td className="n">{r1(o.volume)}</td><td className="n">{o.total != null ? `${o.currency && o.currency !== "$" ? o.currency + " " : "$"}${n(o.total).toFixed(2)}` : "—"}</td><td className="small">{o.pay_method || ""}</td></tr>,
        open === o.order_no && <tr key={o.order_no + "i"}><td colSpan={7} style={{ background: "var(--surface)" }}>{(o.items || []).length ? <table className="inv-tbl"><tbody>{o.items.map((it, i) => <tr key={i}><td className="small">{it.code}</td><td>{it.name}</td><td className="n">× {it.qty}</td><td className="n">{r1(it.total_pv)} PV</td><td className="n">{n(it.total).toFixed(2)}</td></tr>)}</tbody></table> : <span className="muted small">{pick("这张单没有明细（第三方订单）。", "No line items.")}</span>}</td></tr>,
      ])}</tbody></table></div>
  );
}

function Reports() {
  const { pick } = useLang();
  const [list, setList] = useState(null);
  const [k, setK] = useState("");
  useEffect(() => { db.select("dt_reports", { order: ["kind", true] }).then(setList).catch(() => setList([])); }, []);
  if (!list) return <Loading />;
  const useful = list.filter((r) => (r.tables || []).some((t) => t.length > 1));
  const r = useful.find((x) => x.kind === k) || useful[0];
  if (!r) return <div className="empty">{pick("没有报表。", "No reports.")}</div>;
  return (
    <>
      <div className="inv-bar"><select value={r.kind} onChange={(e) => setK(e.target.value)} aria-label={pick("报表", "Report")}>{useful.map((x) => <option key={x.kind} value={x.kind}>{REPORT_ZH[x.kind] || x.kind}</option>)}</select><span className="muted small">{pick(`同步于 ${String(r.synced_at).slice(0, 10)}`, "")}</span></div>
      {(r.tables || []).filter((t) => t.length > 1).map((t, i) => <div key={i} className="inv-tbl-wrap" style={{ marginBottom: 14 }}><table className="inv-tbl"><thead><tr>{t[0].map((c, j) => <th key={j}>{c}</th>)}</tr></thead><tbody>{t.slice(1).map((row, j) => <tr key={j}>{row.map((c, l) => <td key={l} className="small">{String(c).replace(/­/g, "")}</td>)}</tr>)}</tbody></table></div>)}
    </>
  );
}

/* ================= 帐户归属：小号绑定、备注、关联、终止 ================= */
// 一个 doTERRA 帐户（dt_accounts.member_no）归某位会员所有；把别人的帐户「加为小号」= 改归属到这位会员名下。
// 原来那位只剩空壳的会员会被标为「已终止」（隐藏，资料保留）。
export function AccountAdmin({ ownerId, focusDt, onChanged }) {
  const { pick } = useLang();
  const [s, setS] = useState(null);
  const [q, setQ] = useState(""); const [lq, setLq] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [members, accts, dtm] = await Promise.all([db.select("members", { all: true, order: ["name", true] }), db.select("dt_accounts", { all: true, order: ["created_at", true] }), db.select("dt_members", { all: true, order: ["dt_id", true] }).catch(() => [])]);
    setS({ members, accts, dtm });
  };
  useEffect(() => { load(); }, [ownerId]);
  if (!s) return <Loading />;
  const owner = s.members.find((m) => m.id === ownerId);
  if (!owner) return null;
  const mine = s.accts.filter((a) => a.member_id === ownerId).sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0));
  const mName = (id) => s.members.find((m) => m.id === id)?.name || "—";
  const dtName = (no) => s.dtm.find((x) => x.dt_id === no)?.name;
  const link = s.members.find((m) => m.id === owner.link_member_id);
  const run = async (f) => { setBusy(true); try { await f(); await load(); onChanged && onChanged(); } catch (e) { alert(e.message); } setBusy(false); };

  const bind = (acct) => run(async () => {
    const old = acct.member_id;
    await db.update("dt_accounts", acct.id, { member_id: ownerId, is_main: false });
    if (old && old !== ownerId && !s.accts.some((a) => a.member_id === old && a.id !== acct.id)) {
      const om = s.members.find((m) => m.id === old);
      await db.update("members", old, { archived: true, archived_at: new Date().toISOString(), admin_notes: `${om?.admin_notes ? om.admin_notes + "\n" : ""}已并入 ${owner.name} 名下（小号）` });
      for (const k of s.members.filter((m) => m.sponsor_id === old)) await db.update("members", k.id, { sponsor_id: ownerId });
    }
  });
  const unbind = (acct) => run(async () => {
    // 拆回去：找原来那位（编号对得上）的会员，恢复她
    const back = s.members.find((m) => String(m.doterra_id || "").trim() === acct.member_no && m.id !== ownerId);
    if (!back) throw new Error(pick("找不到原来的会员，无法拆回", "Original member not found"));
    await db.update("dt_accounts", acct.id, { member_id: back.id, is_main: true });
    if (back.archived) await db.update("members", back.id, { archived: false, archived_at: null });
  });
  const setMain = (acct) => run(async () => { for (const a of mine) if (a.is_main !== (a.id === acct.id)) await db.update("dt_accounts", a.id, { is_main: a.id === acct.id }); });
  const terminate = (acct) => run(async () => {
    if (!confirm(pick(`把 ${acct.label || acct.member_no} 标为已终止？之后不再显示，以前的资料会保留，可以随时恢复。`, "Mark as terminated?"))) return;
    await db.update("dt_accounts", acct.id, { status: "closed" });
    if (!mine.some((a) => a.id !== acct.id && a.status !== "closed")) await db.update("members", ownerId, { archived: true, archived_at: new Date().toISOString() });
  });
  const restore = (acct) => run(async () => { await db.update("dt_accounts", acct.id, { status: "active" }); if (owner.archived) await db.update("members", ownerId, { archived: false, archived_at: null }); });
  const archiveMember = () => run(async () => {
    if (!confirm(pick(`把 ${owner.name} 整个会员标为已终止？她名下所有帐户都不再显示，资料保留。`, "Terminate this member?"))) return;
    for (const a of mine) if (a.status !== "closed") await db.update("dt_accounts", a.id, { status: "closed" });
    await db.update("members", ownerId, { archived: true, archived_at: new Date().toISOString() });
  });
  const restoreMember = () => run(async () => { await db.update("members", ownerId, { archived: false, archived_at: null }); for (const a of mine) if (a.status === "closed") await db.update("dt_accounts", a.id, { status: "active" }); });

  const cands = q.trim().length < 1 ? [] : s.accts.filter((a) => a.member_id !== ownerId && `${a.label} ${a.member_no} ${dtName(a.member_no) || ""} ${mName(a.member_id)}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  const lcands = lq.trim().length < 1 ? [] : s.members.filter((m) => m.id !== ownerId && !m.archived && `${m.name} ${m.doterra_id || ""} ${m.phone || ""}`.toLowerCase().includes(lq.trim().toLowerCase())).slice(0, 8);
  return (
    <section className="biz-card dt-admin" aria-busy={busy}>
      <h3>{pick(`${owner.name} 名下的 doTERRA 帐户`, "Accounts")}{owner.archived && <span className="tag k-out" style={{ marginLeft: 8 }}>{pick("已终止", "Terminated")}</span>}</h3>
      <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("帐户", "Account")}</th><th>{pick("编号", "ID")}</th><th>{pick("主号 / 小号", "Main")}</th><th>{pick("状态", "Status")}</th><th /></tr></thead>
        <tbody>{mine.map((a) => <tr key={a.id} className={a.status === "closed" ? "off" : ""}>
          <td><b>{a.label || dtName(a.member_no) || "—"}</b>{a.member_no === focusDt && <span className="muted small">　{pick("（正在看）", "(this)")}</span>}</td><td className="small">{a.member_no || "—"}</td>
          <td className="small">{a.is_main ? pick("主号", "Main") : <button className="linkbtn" onClick={() => setMain(a)}>{pick("小号 · 设为主号", "Sub · make main")}</button>}</td>
          <td className="small">{a.status === "closed" ? pick("已终止", "Terminated") : pick("正常", "Active")}</td>
          <td className="nw">{a.status === "closed" ? <button className="btn sm ghost" onClick={() => restore(a)}>{pick("恢复", "Restore")}</button> : <button className="btn sm ghost" onClick={() => terminate(a)}>{pick("删除（终止）", "Terminate")}</button>}
            {!a.is_main && s.members.some((m) => String(m.doterra_id || "").trim() === a.member_no && m.id !== ownerId) && <button className="btn sm ghost" onClick={() => unbind(a)}>{pick("拆回去", "Unbind")}</button>}</td></tr>)}</tbody></table></div>

      <div className="field" style={{ marginTop: 12 }}><label htmlFor="aa_q">{pick("加小号：搜别的帐户的名字或编号，点一下就并到这位名下", "Add a sub-account")}</label>
        <input id="aa_q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick("例如 Teng 或 18375197", "Name or ID")} />
        {cands.length > 0 && <div className="dt-pick">{cands.map((a) => <button key={a.id} onClick={() => { bind(a); setQ(""); }}><b>{a.label || dtName(a.member_no)}</b> <span className="muted small">{a.member_no} · {pick("现在属于", "now")} {mName(a.member_id)}</span></button>)}</div>}
      </div>

      <div className="field"><label htmlFor="aa_note">{pick("备注（只有管理员看得到）", "Admin notes")}</label>
        <textarea id="aa_note" rows={2} defaultValue={owner.admin_notes || ""} onBlur={(e) => e.target.value !== (owner.admin_notes || "") && run(() => db.update("members", ownerId, { admin_notes: e.target.value }))} /></div>

      <div className="field"><label htmlFor="aa_l">{pick("关联到某位会员 / 经营者（例如：是谁的家人、谁介绍的、实际由谁在用）", "Link to member")}</label>
        {link ? <div className="small">{pick("已关联", "Linked")}：<b>{link.name}</b>{owner.link_note ? ` · ${owner.link_note}` : ""}　<button className="linkbtn" onClick={() => run(() => db.update("members", ownerId, { link_member_id: null, link_note: null }))}>{pick("取消关联", "Remove")}</button></div> :
          <><input id="aa_l" type="search" value={lq} onChange={(e) => setLq(e.target.value)} placeholder={pick("搜会员名字、编号、电话", "Search")} />
            {lcands.length > 0 && <div className="dt-pick">{lcands.map((m) => <button key={m.id} onClick={() => { const note = prompt(pick(`和 ${m.name} 是什么关系？（可以不填）`, "Relation (optional)")) || ""; run(() => db.update("members", ownerId, { link_member_id: m.id, link_note: note })); setLq(""); }}><b>{m.name}</b> <span className="muted small">{m.doterra_id || m.phone || ""}</span></button>)}</div>}</>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{owner.archived ? <button className="btn sm" onClick={restoreMember}>{pick("恢复这位会员", "Restore member")}</button> : <button className="btn sm ghost" onClick={archiveMember}>{pick("整个会员删除（终止，资料保留）", "Terminate member")}</button>}</div>
    </section>
  );
}

/* ================= Power of 3 / Boost ================= */
const PO3_LV = [{ lv: 1, amt: 63 }, { lv: 2, amt: 313 }, { lv: 3, amt: 1563 }];
const BOOST_LV = [{ lv: 1, pgv: 400, amt: 63 }, { lv: 2, pgv: 800, amt: 313 }, { lv: 3, pgv: 1200, amt: 635 }];
const cad = (v) => `CA$${r0(v)}`;

function Bar({ have, need, extra = 0, label, sub, unit = "" }) {
  const pct = Math.min(100, (n(have) / need) * 100), pct2 = Math.min(100 - pct, (n(extra) / need) * 100);
  const ok = n(have) >= need;
  return (
    <div className="po3-req">
      <i className={`po3-ck ${ok ? "ok" : ""}`}>{ok ? "✓" : ""}</i>
      <div><b>{label}</b>{sub && <small className="muted">{sub}</small>}</div>
      <div className="po3-bar"><span style={{ width: `${pct}%` }} /><span className="x" style={{ width: `${pct2}%` }} /></div>
      <div className="nw small"><b>{r1(have)}</b>{extra ? <span className="muted"> +{r1(extra)}</span> : ""} / {need}{unit}{!ok && <div className="po3-gap">{`差 ${r1(need - n(have))}`}</div>}</div>
    </div>
  );
}

export function Po3Panel({ d, root, open }) {
  const { pick } = useLang();
  const [rows, setRows] = useState(null); const [pgv, setPgv] = useState([]);
  const [who, setWho] = useState(root.dt_id);
  useEffect(() => { (async () => {
    const [p, g] = await Promise.all([db.select("dt_po3", { all: true, order: ["dt_id", true] }).catch(() => []), db.select("dt_pgv", { all: true, order: ["dt_id", true] }).catch(() => [])]);
    setRows(p); setPgv(g);
  })(); }, []);
  if (!rows) return <Loading />;
  if (!rows.length) return <div className="empty">{pick("还没有同步 Power of 3 资料。", "No Power of 3 data yet.")}</div>;
  const ym = rows.map((r) => r.ym).sort().pop();
  const by = Object.fromEntries(rows.filter((r) => r.ym === ym).map((r) => [r.dt_id, { ...r, kids: [] }]));
  for (const r of Object.values(by)) if (r.parent_dt && by[r.parent_dt]) by[r.parent_dt].kids.push(r);
  const monthEnd = `${ym}-31`, t = today();
  const sched = (r) => (r.lrp_date && r.lrp_date >= t && r.lrp_date <= monthEnd ? n(r.lrp_tpl) : 0);
  // 估算某帐户是否达到 Level 1（含/不含本月排好的 LRP）
  const l1 = (r, withSched) => !!r && n(r.rv) + (withSched ? sched(r) : 0) >= 100 && n(r.pe_pod) >= 100 && n(r.pod) >= 500;
  const lvOf = (r, withSched, depth = 0) => { if (!l1(r, withSched)) return 0; if (depth > 3) return 1; const k = r.kids.map((c) => lvOf(c, withSched, depth + 1)); return k.filter((x) => x >= 2).length >= 3 ? 3 : k.filter((x) => x >= 1).length >= 3 ? 2 : 1; };
  const me = by[who] || by[root.dt_id];
  if (!me) return <div className="empty">{pick("这个帐户没有 Power of 3 资料。", "No data for this account.")}</div>;
  const mem = d.by[me.dt_id];
  const fl = [...me.kids].sort((a, b) => n(b.rv) + sched(b) - (n(a.rv) + sched(a)));
  const lvNow = lvOf(me, false), lvSch = lvOf(me, true);
  const fl1 = fl.filter((k) => lvOf(k, true) >= 1).length, fl2 = fl.filter((k) => lvOf(k, true) >= 2).length;
  const myPgv = pgv.filter((x) => x.root_dt === me.dt_id).sort((a, b) => n(b.rv) - n(a.rv) || n(b.next_pv) - n(a.next_pv));
  const pgvSched = myPgv.reduce((s, x) => s + (x.next_date && x.next_date >= t && x.next_date <= monthEnd ? n(x.next_pv) : 0), 0);
  const boostNow = BOOST_LV.filter((b) => n(me.pgv) >= b.pgv && lvNow >= b.lv).pop();
  const nextBoost = BOOST_LV.find((b) => !(n(me.pgv) >= b.pgv && lvSch >= b.lv));
  const lvMsg = (L) => {
    if (L.lv === 1) { const g = [n(me.rv) + sched(me) < 100 && pick(`自己 Rewards 还差 ${r1(100 - n(me.rv) - sched(me))} PV`, "RV"), n(me.pe_pod) < 100 && pick(`亲推 Pod 差 ${r1(100 - n(me.pe_pod))}`, "PE"), n(me.pod) < 500 && pick(`Pod 差 ${r1(500 - n(me.pod))}`, "Pod")].filter(Boolean); return g.length ? g.join("，") : pick("达标", "Met"); }
    if (L.lv === 2) return fl1 >= 3 ? pick("3 位第一层已达 Level 1", "Met") : pick(`第一层达到 Level 1 的有 ${fl1} 位，还差 ${3 - fl1} 位`, `${3 - fl1} more`);
    return fl2 >= 3 ? pick("3 位第一层已达 Level 2", "Met") : pick(`第一层达到 Level 2 的有 ${fl2} 位，还差 ${3 - fl2} 位`, `${3 - fl2} more`);
  };
  const ds = Object.values(by).filter((r) => d.by[r.dt_id]?.mtype === "D" || r.dt_id === root.dt_id).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return (
    <>
      <div className="inv-bar">
        <select value={me.dt_id} onChange={(e) => setWho(e.target.value)} aria-label={pick("帐户", "Account")}>{ds.map((r) => <option key={r.dt_id} value={r.dt_id}>{r.name} · {r.dt_id}</option>)}</select>
        {me.dt_id !== root.dt_id && <button className="btn sm ghost" onClick={() => setWho(root.dt_id)}>{pick("回到自己", "Back to me")}</button>}
        <span className="muted small">{pick(`${ym}　按 doTERRA 同步时的数字；「+」是本月还没下、但已排好的 LRP`, `${ym}`)}</span>
      </div>

      <section className="biz-card">
        <h3>Power of 3 <span className="muted small">{pick(`${me.name}　现在：${lvNow ? `Level ${lvNow}` : "未达标"}　·　排好的 LRP 都下了：${lvSch ? `Level ${lvSch}` : "未达标"}`, "")}</span></h3>
        <div className="po3-pills">{PO3_LV.map((L) => <div key={L.lv} className={`po3-pill ${lvNow >= L.lv ? "ok" : lvSch >= L.lv ? "soon" : ""}`}><b>Level {L.lv} · {cad(L.amt)}</b><small>{lvMsg(L)}</small></div>)}</div>
        <Bar label={pick("自己的 Rewards 订单（RV）", "Rewards Volume")} have={me.rv} extra={sched(me)} need={100} sub={me.lrp_date ? pick(`下次 LRP ${me.lrp_date} · ${r1(me.lrp_tpl)} PV`, "") : pick("没有 LRP", "No LRP")} />
        <Bar label={pick("亲自推荐的 Pod 业绩（PE-Pod）", "PE Pod Volume")} have={me.pe_pod} need={100} />
        <Bar label={pick("Pod 业绩", "Pod Volume")} have={me.pod} need={500} sub={pick("第一层的业绩，其中非 Rewards 最多算 200", "max 200 non-Rewards")} />
        {lvNow === 0 && n(me.rv) < 100 && n(me.pe_pod) >= 100 && n(me.pod) >= 500 && <p className="notice" style={{ marginBottom: 0 }}>{pick(`自己这个月还没有 100 PV 的 Rewards 订单。Pod 已经够了，只要在月底前下一张满 ${r1(100 - n(me.rv))} PV 的 LRP 单，就能拿 Level 1 以上。`, "")}</p>}
      </section>

      <section className="biz-card">
        <h3>Power of 3 Boost <span className="muted small">{pick("看 PGV：亲自推荐、入会 12 个月内的会员本月的 Rewards 业绩", "PGV-based")}</span></h3>
        <div className="po3-pills">{BOOST_LV.map((b) => { const okP = n(me.pgv) >= b.pgv, okL = lvNow >= b.lv; return <div key={b.lv} className={`po3-pill ${okP && okL ? "ok" : okP && lvSch >= b.lv ? "soon" : ""}`}><b>Boost {b.lv} · {cad(b.amt)}</b><small>{okP ? (okL ? pick("达标", "Met") : pick(`PGV 够了，还要 Power of 3 Level ${b.lv}`, "")) : pick(`PGV 差 ${r1(b.pgv - n(me.pgv))}${!okL ? `，也要 Level ${b.lv}` : ""}`, "")}</small></div>; })}</div>
        {(() => { const nb = BOOST_LV.find((b) => n(me.pgv) < b.pgv); return <Bar label="PGV" have={me.pgv} extra={pgvSched} need={nb ? nb.pgv : 1200} sub={nb ? pick(`下一档 Boost ${nb.lv} 要 ${nb.pgv} PGV（同时要 Power of 3 Level ${nb.lv}）`, "") : pick("已超过最高档 1200", "")} />; })()}
        {boostNow && <p className="muted small" style={{ margin: 0 }}>{pick(`按现在的数字可拿 Boost ${boostNow.lv}（${cad(boostNow.amt)}）。`, "")}</p>}
      </section>

      <section className="biz-card">
        <h3>{pick(`第一层（Pod）${fl.length} 位`, "Frontline pod")} <span className="muted small">{pick(`排好的 LRP 都下了的话，有 ${fl1} 位达到 Level 1、${fl2} 位达到 Level 2`, "")}</span></h3>
        <div className="po3-cards">{fl.map((k) => { const m = d.by[k.dt_id]; const pe = m?.enroller_dt === me.dt_id; const isNew = m?.enroll_date?.slice(0, 7) === ym; const kl = lvOf(k, true);
          return <div key={k.dt_id} className="po3-card">
            <div className="po3-tags">{isNew && <span>NEW</span>}{pe && <span>PE</span>}</div>
            <button className="linkbtn" onClick={() => (m?.mtype === "D" ? setWho(k.dt_id) : open(k.dt_id))}><b>{k.name}</b></button>
            <small className="muted">{k.dt_id}　{m?.enroll_date ? pick(`${m.enroll_date.slice(0, 7)} 入会`, m.enroll_date) : ""}</small>
            <small className="muted">{m ? pick(...(TYPE[m.mtype] || [m.mtype, m.mtype])) : ""}{m?.mtype === "D" ? ` · ${rankL(m.rank, pick)}` : ""}</small>
            <div className="po3-nums"><span><b className={n(k.rv) >= 100 ? "g" : ""}>{r1(k.rv || k.pv)}</b><small>{n(k.rv) ? "Reward PV" : "Total PV"}</small></span><span><b>{r1(sched(k))}</b><small>{pick("排好的", "Scheduled")}</small></span></div>
            {m?.mtype === "D" && <small>{kl ? pick(`自己可达 Level ${kl}`, `Level ${kl}`) : pick(`自己 Pod ${r1(k.pod)}/500`, "")}</small>}
          </div>; })}</div>
      </section>

      {myPgv.length > 0 && <section className="biz-card">
        <h3>{pick(`PGV 来源（${myPgv.filter((x) => n(x.rv)).length} 位本月有贡献，共 ${myPgv.length} 位在 12 个月内）`, "PGV contributors")}</h3>
        <div className="po3-cards">{myPgv.map((x) => { const sc = x.next_date && x.next_date >= t && x.next_date <= monthEnd ? n(x.next_pv) : 0;
          return <div key={x.dt_id} className={`po3-card ${!n(x.rv) && !sc ? "dim" : ""}`}>
            <div className="po3-tags"><span>PE</span></div>
            <button className="linkbtn" onClick={() => open(x.dt_id)}><b>{x.name}</b></button>
            <small className="muted">{x.dt_id}　{x.enroll_date ? pick(`${x.enroll_date.slice(0, 7)} 入会`, "") : ""}</small>
            <small className="muted">{pick(...(TYPE[x.mtype] || [x.mtype || "", x.mtype || ""]))}</small>
            <div className="po3-nums"><span><b className="b">{r1(x.rv)}</b><small>PGV</small></span><span><b>{r1(sc)}</b><small>{pick("排好的", "Scheduled")}</small></span></div>
            <small className={x.months_left <= 2 ? "po3-gap" : ""}>{pick(`还算 ${x.months_left} 个月${x.final_month ? "（本月最后一次）" : ""}`, `${x.months_left} months remaining`)}</small>
          </div>; })}</div>
        <p className="muted small" style={{ margin: "8px 0 0" }}>{pick("亲自推荐的会员入会后 12 个月内，他们的 Rewards 业绩算进你的 PGV。快到期的人越多，下个月 PGV 越难维持，要继续推荐新人。", "")}</p>
      </section>}
    </>
  );
}

/* ================= 升级规划：目标是升到更高一级 ================= */
// 用 doTERRA 同步来的每月 PV / OV 和团队结构，按奖金制度一级一级推算每个经营者的级别，
// 再算出下一级还差什么：个人 PV、OV、哪几条线要培养到什么级别、每条线里谁最接近。
const DT2CODE = { Consultant: "wa", Manager: "manager", Director: "director", Executive: "executive", Elite: "elite", Premier: "premier", Silver: "silver", Gold: "gold", Platinum: "platinum", Diamond: "diamond", "Blue Diamond": "blue", "Presidential Diamond": "presidential" };
const fmtUsd0 = (v) => `US$${r0(v)}`;

function useRankEngine(d, RANKS) {
  return useMemo(() => {
    const idx = Object.fromEntries(RANKS.map((r, i) => [r.code, i]));
    const t = today();
    const schedOf = (m, ym) => (ym === d.ym && m.lrp_date && m.lrp_date >= t && m.lrp_date.slice(0, 7) === ym ? n(m.lrp_pv) : 0);
    const make = (ym, proj) => {
      const memo = new Map(), best = new Map(), sub = new Map();
      const schedSub = (m) => { if (sub.has(m.dt_id)) return sub.get(m.dt_id); const v = schedOf(m, ym) + m.kids.reduce((s, k) => s + schedSub(k), 0); sub.set(m.dt_id, v); return v; };
      const facts = (m) => ({ pv: n(m.mo[ym]?.pv) + (proj ? schedOf(m, ym) : 0), ov: n(m.mo[ym]?.ov) + (proj ? schedSub(m) : 0) });
      const rank = (m) => {
        if (memo.has(m.dt_id)) return memo.get(m.dt_id);
        let r = 0;
        if (m.mtype === "D") {
          const f = facts(m), legs = legsOf(m);
          for (let i = 1; i < RANKS.length; i++) {
            const R = RANKS[i];
            if (f.pv < (R.pv || 0) || f.ov < (R.ov || 0)) break;
            if (R.legs && legs.filter((l) => l.best >= idx[R.legs.rank] && (!R.legs.pe || l.pe)).length < R.legs.n) break;
            r = i;
          }
        }
        memo.set(m.dt_id, r); return r;
      };
      const bestOf = (m) => { if (best.has(m.dt_id)) return best.get(m.dt_id); const v = Math.max(rank(m), ...m.kids.map(bestOf)); best.set(m.dt_id, v); return v; };
      const legsOf = (m) => m.kids.map((k) => ({ k, best: bestOf(k), pe: k.enroller_dt === m.dt_id }));
      return { rank, legsOf, facts, bestOf };
    };
    const prevMonth = prevYm(d.ym);
    return { idx, cur: make(d.ym, false), proj: make(d.ym, true), prev: make(prevMonth, false), prevMonth, schedOf };
  }, [d, RANKS]);
}

export function Growth({ d, root, team, ym, open, goTab, RANKS }) {
  const { pick } = useLang();
  const E = useRankEngine(d, RANKS);
  const [who, setWho] = useState(root.dt_id);
  const me = d.by[who] || root;
  const rz = (i) => pick(RANKS[i]?.zh || "—", RANKS[i]?.en || "—");
  const paidIdx = E.idx[DT2CODE[me.highest_rank]] ?? 0;
  const prevR = E.prev.rank(me), curR = E.cur.rank(me), projR = E.proj.rank(me);
  const base = Math.max(prevR, projR);
  const target = Math.min(RANKS.length - 1, base + 1);
  const T = RANKS[target];
  const f = E.proj.facts(me);
  const legs = E.proj.legsOf(me).filter((l) => l.k.mtype === "D" || l.best > 0 || l.k._size);
  // 每条线里离「需要的级别」最近的人
  const nearest = (leg, need) => {
    const cand = []; (function w(m) { if (m.mtype === "D") cand.push(m); m.kids.forEach(w); })(leg.k);
    const R = RANKS[need];
    return cand.map((m) => { const ff = E.proj.facts(m); const r = E.proj.rank(m); const ovGap = Math.max(0, (R.ov || 0) - ff.ov), pvGap = Math.max(0, 100 - ff.pv); return { m, r, ovGap, pvGap, score: r >= need ? 1e9 : r * 1e5 - ovGap }; }).sort((a, b) => b.score - a.score)[0];
  };
  const needLegIdx = T.legs ? E.idx[T.legs.rank] : null;
  const legRows = T.legs ? legs.map((l) => ({ ...l, ok: l.best >= needLegIdx && (!T.legs.pe || l.pe), near: l.best >= needLegIdx ? null : nearest(l, needLegIdx) })).sort((a, b) => (b.ok - a.ok) || (b.best - a.best) || (a.near?.ovGap ?? 1e9) - (b.near?.ovGap ?? 1e9)) : [];
  const legsOk = legRows.filter((l) => l.ok).length;
  // 快速奖金（Fast Start）：亲推、入会 60 天内的新人
  const fs = d.list.filter((m) => m.enroller_dt === me.dt_id && m.enroll_date && days(m.enroll_date, today()) < 60).map((m) => ({ m, left: 60 - days(m.enroll_date, today()), pv: n(m.mo[ym]?.pv) + E.schedOf(m, ym) })).sort((a, b) => a.left - b.left);
  // 行动清单
  const acts = [];
  if (f.pv < 100) acts.push(pick(`自己这个月先下满 100 PV 的 LRP 单（现在 ${r1(f.pv)}），不然三次方、Unilevel、级别都不算。`, "Place a 100 PV LRP order first."));
  if (T.ov && f.ov < T.ov) acts.push(pick(`团队 OV 再多 ${r1(T.ov - f.ov)}（大约 ${Math.ceil((T.ov - f.ov) / 100)} 张 100 PV 的单）就到 ${rz(target)} 的 OV 门槛。`, ""));
  if (T.legs && legsOk < T.legs.n) {
    const todo = legRows.filter((l) => !l.ok).slice(0, T.legs.n - legsOk);
    todo.forEach((l) => acts.push(l.near ? pick(`培养「${l.k.name}」这条线：线里最接近的是 ${l.near.m.name}（现在${rz(l.near.r)}），要到 ${rz(needLegIdx)}${l.near.ovGap ? `，OV 还差 ${r1(l.near.ovGap)}` : ""}${l.near.pvGap ? `，自己 PV 还差 ${r1(l.near.pvGap)}` : ""}${T.legs.pe && !l.pe ? "（注意：这条线不是你亲自推荐的，不算数）" : ""}。`, "") : pick(`「${l.k.name}」这条线还没有经营者，要先在下面推荐一位经营者。`, "")));
    if (legRows.length < T.legs.n) acts.push(pick(`第一层有经营者的线只有 ${legRows.length} 条，至少要 ${T.legs.n} 条，需要再亲自推荐新的经营者开新线。`, ""));
  }
  if (fs.length) acts.push(pick(`有 ${fs.length} 位亲推新人还在 60 天快速奖金期内，帮他们这个月下满 100 PV：你可拿他们订单的 20%。`, ""));
  else acts.push(pick("最近 60 天没有亲自推荐的新人。快速奖金只来自新人头 60 天的订单，也是开新线、补 PGV 的来源。", ""));
  // 团队冲级名单
  const board = useMemo(() => team.filter((x) => x.m.mtype === "D").map(({ m }) => {
    const r = Math.max(E.prev.rank(m), E.proj.rank(m)); const nx = RANKS[Math.min(RANKS.length - 1, r + 1)]; const ff = E.proj.facts(m);
    const ovPct = nx.ov ? Math.min(1, ff.ov / nx.ov) : null;
    const legN = nx.legs ? E.proj.legsOf(m).filter((l) => l.best >= E.idx[nx.legs.rank] && (!nx.legs.pe || l.pe)).length : null;
    const pct = nx.legs ? (legN / nx.legs.n) * (nx.ov ? ovPct : 1) : ovPct;
    return { m, r, nx, ff, legN, pct, pvOk: ff.pv >= 100 };
  }).sort((a, b) => b.r - a.r || b.pct - a.pct), [team, E]);
  return (
    <>
      <div className="inv-bar">
        <select value={me.dt_id} onChange={(e) => setWho(e.target.value)} aria-label={pick("经营者", "Advocate")}>{[root, ...team.filter((x) => x.m.mtype === "D").map((x) => x.m)].map((m) => <option key={m.dt_id} value={m.dt_id}>{m.name} · {m.dt_id}</option>)}</select>
        {me.dt_id !== root.dt_id && <button className="btn sm ghost" onClick={() => setWho(root.dt_id)}>{pick("回到自己", "Back")}</button>}
      </div>

      <div className="rk-ladder">{RANKS.map((R, i) => i === 0 ? null : <div key={R.code} className={`rk ${i <= base ? "ok" : ""} ${i === target ? "goal" : ""} ${i === paidIdx ? "hi" : ""}`}><b>{pick(R.zh, R.en)}</b>{R.range && <small>{fmtUsd0(R.range[0])}–{fmtUsd0(R.range[1])}/月</small>}{i === paidIdx && <small>{pick("曾达到最高", "Highest")}</small>}{i === target && <small>{pick("下一个目标", "Next goal")}</small>}</div>)}</div>
      <p className="muted small" style={{ marginTop: 4 }}>{pick(`${me.name}：上个月（${E.prevMonth}）按数据推算 ${rz(prevR)}；本月到现在 ${rz(curR)}，排好的 LRP 都下了是 ${rz(projR)}；doTERRA 显示现在 ${rankL(me.rank, pick)}、最高 ${rankL(me.highest_rank, pick)}。每月收入范围是 doTERRA 公布的美国数据，不代表保证。`, "")}</p>

      <section className="biz-card">
        <h3>{pick(`目标：${rz(target)}`, `Goal: ${T.en}`)} <span className="muted small">{pick("按本月数据（含已排好的 LRP）", "this month incl. scheduled LRP")}</span></h3>
        <Bar label={pick("自己的 PV", "Personal PV")} have={f.pv} need={100} />
        {T.ov ? <Bar label={pick("团队 OV", "OV")} have={f.ov} need={T.ov} /> : null}
        {T.legs && <>
          <Bar label={pick(`${T.legs.n} 条线各有一位 ${rz(needLegIdx)}${T.legs.pe ? "（要是亲推的线）" : ""}`, "Legs")} have={legsOk} need={T.legs.n} unit={pick(" 条", "")} />
          <div className="inv-tbl-wrap" style={{ marginTop: 8 }}><table className="inv-tbl"><thead><tr><th>{pick("第一层的线", "Leg")}</th><th>{pick("线里最高", "Best in leg")}</th><th>{pick("亲推", "PE")}</th><th>{pick("离目标最近的人", "Closest")}</th><th>{pick("还差", "Gap")}</th></tr></thead>
            <tbody>{legRows.map((l) => <tr key={l.k.dt_id} className={l.ok ? "" : ""}><td><button className="linkbtn" onClick={() => setWho(l.k.mtype === "D" ? l.k.dt_id : who)}><b>{l.k.name}</b></button> <span className="muted small">{pick(`下面 ${l.k._size} 人`, "")}</span></td><td>{l.ok ? <span className="tag k-in">✓ {rz(l.best)}</span> : rz(l.best)}</td><td className="small">{l.pe ? pick("是", "Yes") : <span className="po3-gap">{pick("否", "No")}</span>}</td><td className="small">{l.near ? <button className="linkbtn" onClick={() => setWho(l.near.m.dt_id)}>{l.near.m.name}</button> : "—"}{l.near ? ` · ${rz(l.near.r)}` : ""}</td><td className="small">{l.ok ? "—" : l.near ? [l.near.ovGap && `OV ${r1(l.near.ovGap)}`, l.near.pvGap && `PV ${r1(l.near.pvGap)}`, RANKS[needLegIdx].legs && pick(`还要自己的 ${RANKS[needLegIdx].legs.n} 条线`, "legs")].filter(Boolean).join("，") || pick("看他自己的规划", "") : pick("先推荐经营者", "")}</td></tr>)}</tbody></table></div>
        </>}
      </section>

      <section className="biz-card">
        <h3>{pick("这个月该做的事（按顺序）", "Action plan")}</h3>
        <ol className="rk-acts">{acts.map((a, i) => <li key={i}>{a}</li>)}<li>{pick("把三次方做满：看「三次方 / Boost」里 Pod 和第一层还差什么，第一层每人都要有 100 PV 的 LRP。", "")} <button className="linkbtn" onClick={() => goTab("po3")}>{pick("去看三次方", "Open Power of 3")}</button></li></ol>
      </section>

      <section className="biz-card">
        <h3>{pick("快速奖金（新人头 60 天）", "Fast Start")} <span className="muted small">{pick("亲推 20%，第二代 10%，第三代 5%", "")}</span></h3>
        {!fs.length ? <p className="muted small" style={{ margin: 0 }}>{pick("现在没有 60 天内的亲推新人。", "None in the 60-day window.")}</p> :
          <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("新人", "New member")}</th><th>{pick("入会", "Joined")}</th><th className="n">{pick("剩几天", "Days left")}</th><th className="n">{pick("本月 PV（含排好）", "PV")}</th><th className="n">{pick("你约可拿 20%", "≈20%")}</th></tr></thead>
            <tbody>{fs.map(({ m, left, pv }) => <tr key={m.dt_id}><td><button className="linkbtn" onClick={() => open(m.dt_id)}>{m.name}</button> <span className="muted small">{pick(...(TYPE[m.mtype] || ["", ""]))}</span></td><td className="small">{m.enroll_date}</td><td className={`n ${left <= 14 ? "neg" : ""}`}>{left}</td><td className="n">{r1(pv)}</td><td className="n">{fmtUsd0(pv * 0.2)}</td></tr>)}</tbody></table></div>}
      </section>

      {me.dt_id === root.dt_id && <section className="biz-card">
        <h3>{pick("团队冲级名单", "Who's close to the next rank")} <span className="muted small">{pick("每位经营者的下一级和完成度，点名字看他的规划", "")}</span></h3>
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("经营者", "Advocate")}</th><th>{pick("现在（推算）", "Now")}</th><th>{pick("下一级", "Next")}</th><th className="n">{pick("自己 PV", "PV")}</th><th className="n">OV</th><th>{pick("线", "Legs")}</th><th className="n">{pick("完成度", "Progress")}</th></tr></thead>
          <tbody>{board.slice(0, 60).map((b) => <tr key={b.m.dt_id}><td><button className="linkbtn" onClick={() => { setWho(b.m.dt_id); window.scrollTo({ top: 0, behavior: "smooth" }); }}><b>{b.m.name}</b></button></td><td className="small">{rz(b.r)}</td><td className="small">{pick(b.nx.zh, b.nx.en)}</td><td className={`n ${b.pvOk ? "" : "neg"}`}>{r1(b.ff.pv)}</td><td className="n">{r1(b.ff.ov)}{b.nx.ov ? <span className="muted"> / {b.nx.ov}</span> : ""}</td><td className="small">{b.nx.legs ? `${b.legN} / ${b.nx.legs.n}` : "—"}</td><td className="n"><span className="rk-pct"><i style={{ width: `${Math.round(b.pct * 100)}%` }} /></span> {Math.round(b.pct * 100)}%</td></tr>)}</tbody></table></div>
      </section>}
      <p className="muted small">{pick("级别按 doTERRA 公布的晋升条件推算：经理到精英看个人 100 PV 和团队 OV；Premier 起还要几条线各有一位达到某个级别，Premier、银钻、金钻要求是亲自推荐的线。实际以 doTERRA 月底结算为准。", "")}</p>
    </>
  );
}
