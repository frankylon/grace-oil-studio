// doTERRA 后台（镜像）：数据全部来自 doTERRA 后台同步，系统里只看不改。
// 比 doTERRA 后台多做的：中文、跟进名单（快到 LRP 日、本月还没下单、久没下单、接近升级）、每人一张卡片、奖金按项目拆开看。
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { db } from "../api";
import { Loading, Modal } from "../components";
import { today } from "../util";

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
  useEffect(() => {
    (async () => {
      try {
        const [members, monthly, orders, comm, sync] = await Promise.all([
          db.select("dt_members", { all: true, order: ["dt_id", true] }),
          db.select("dt_monthly", { all: true, order: ["dt_id", true] }),
          db.select("dt_orders", { order: ["odate", false] }).catch(() => []),
          db.select("dt_commissions", { all: true, order: ["period", false] }).catch(() => []),
          db.select("dt_sync", { order: ["at", false], limit: 5 }).catch(() => []),
        ]);
        const by = Object.fromEntries(members.map((m) => [m.dt_id, { ...m, kids: [], mo: {} }]));
        for (const x of monthly) if (by[x.dt_id]) by[x.dt_id].mo[x.ym] = x;
        for (const m of Object.values(by)) if (m.sponsor_dt && by[m.sponsor_dt]) by[m.sponsor_dt].kids.push(m);
        const yms = [...new Set(monthly.map((x) => x.ym))].sort().reverse();
        const latestYm = yms[0] || ymOf(today());
        for (const m of Object.values(by)) m.kids.sort((a, b) => (a.mtype === "D" ? 0 : 1) - (b.mtype === "D" ? 0 : 1) || n(b.mo[latestYm]?.ov) - n(a.mo[latestYm]?.ov));
        const size = (m) => (m._size ??= m.kids.reduce((s, k) => s + 1 + size(k), 0));
        Object.values(by).forEach(size);
        setD({ by, list: Object.values(by), yms, ym: latestYm, orders, comm, sync });
      } catch (e) { setErr(e.message); }
    })();
  }, []);
  return { d, err };
}

export function DtOffice({ rootId, admin }) {
  const { pick } = useLang();
  const { d, err } = useDt();
  const [tab, setTab] = useState("home");
  const [sel, setSel] = useState(null);
  if (err) return <div className="empty">{err}</div>;
  if (!d) return <Loading />;
  const root = d.by[rootId] || d.list.find((m) => !d.by[m.sponsor_dt]);
  if (!root) return <div className="empty">{pick("还没有从 doTERRA 同步资料。", "Nothing synced from doTERRA yet.")}</div>;
  const team = []; (function walk(m, lv) { for (const k of m.kids) { team.push({ m: k, lv }); walk(k, lv + 1); } })(root, 1);
  const ctx = { d, root, team, open: setSel, admin, ym: d.ym };
  const last = d.sync[0];
  const tabs = [["home", pick("总览", "Overview")], ["follow", pick("跟进名单", "Follow-up")], ["team", pick("团队名单", "Team list")], ["tree", pick("树状图", "Tree")], ["earn", pick("奖金", "Earnings")], ["orders", pick("我的订单", "My orders")], ...(admin ? [["reports", pick("原始报表", "Reports")]] : [])];
  return (
    <div className="inv dt">
      <div className="fseg" style={{ marginBottom: 16 }}>{tabs.map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "home" && <Home {...ctx} />}
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

function Tree({ root, ym, open }) {
  const { pick } = useLang();
  const [openSet, setOpenSet] = useState(() => new Set([root.dt_id, ...root.kids.map((k) => k.dt_id)]));
  const [onlyD, setOnlyD] = useState(false);
  const tog = (id) => setOpenSet((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const dot = (m) => { const pv = n(m.mo[ym]?.pv); return pv >= 100 ? "ok" : pv > 0 ? "lo" : m.lrp_date ? "wait" : "off"; };
  const Node = ({ m, depth }) => {
    const kids = onlyD ? m.kids.filter((k) => k.mtype === "D" || k._size) : m.kids;
    const isOpen = openSet.has(m.dt_id);
    return (
      <li>
        <div className="dt-node">
          {kids.length ? <button className="dt-tog" onClick={() => tog(m.dt_id)} aria-label={isOpen ? pick("收起", "Collapse") : pick("展开", "Expand")}>{isOpen ? "−" : "+"}</button> : <span className="dt-tog" />}
          <i className={`dt-dot ${dot(m)}`} />
          <button className="linkbtn" onClick={() => open(m.dt_id)}><b>{m.name}</b></button>
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
