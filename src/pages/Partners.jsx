// 商家分成：每卖出一笔零售额，能分出去多少、我们留下多少。只有管理员 / Grace 看得到。
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { useToast } from "../ctx";
import { db } from "../api";
import { Loading, Modal } from "../components";
import { DEFAULTS, DEPTHS, LADDER, PV_LADDER, SCEN, fastStart, salesSplit, split, uniCapture } from "../partner";

const pct = (v) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
const usd = (v) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };

export function PartnersAdmin() {
  const { pick } = useLang();
  const [mode, setMode] = useState("team");
  return (
    <>
      <div className="fseg" style={{ marginBottom: 18 }}>{[["team", pick("销售团队（按批发价）", "Sales team (member price)")], ["retail", pick("商家寄售（按零售价）", "Consignment (retail)")]].map(([k, l]) => <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
      {mode === "team" ? <SalesTeam /> : <RetailModel />}
    </>
  );
}

function SalesTeam() {
  const { pick } = useLang();
  const [o, setO] = useState({ scen: "std", newPct: 65, fs: 30, depth: 4, po3: 15, cost: 2, repNew: 15, repRep: 5, project: 5, keep: 3 });
  const set = (k) => (e) => setO({ ...o, [k]: e.target.value });
  const pickScen = (k) => setO({ ...o, scen: k, fs: SCEN[k].fs * 100, depth: SCEN[k].depth, po3: SCEN[k].po3 * 100 });
  const opts = { newPct: n(o.newPct) / 100, fs: n(o.fs) / 100, depth: n(o.depth), po3: n(o.po3) / 100, cost: n(o.cost) / 100, repNew: n(o.repNew) / 100, repRep: n(o.repRep) / 100, project: n(o.project) / 100, keep: n(o.keep) / 100 };
  const [V, setV] = useState(1000);
  const one = salesSplit(n(V), opts);
  const mix = [70, 60, 40, 20];
  return (
    <div className="pt">
      <section className="biz-card">
        <h3>{pick("算法（全部按批发价 / PV，1 PV ≈ 1 美元）", "How it works (member price, 1 PV ≈ $1)")}</h3>
        <ol className="guide-ol">
          <li>{pick("新会员头 60 天的订单 → Fast Start：推荐帐户拿 20%；推荐人的推荐人也是我们的 +10%；再上一层也是 +5%。", "New members' first 60 days → Fast Start 20% (+10% +5% if the enroller chain is ours).")}</li>
          <li>{pick("老会员复购（过了 60 天）→ Unilevel：看下单帐户放在我们团队第几层，第 2–7 层上线合计 3%–32%。", "Repeat orders → Unilevel 3–32% by depth.")}</li>
          <li>{pick("复购还有 Power of 3：每个帐户第一层满 500 PV 拿 $50，结构做好到 $250 / $1,250，再加 PGV 加码。摊到复购 PV 上，大约 8%（只有第 1 级）到 25%（做到第 3 级）。", "Power of 3 on repeat volume: roughly 8–25% depending on structure.")}</li>
          <li>{pick("减成本：主要是每个收佣金的帐户每月自己要下 100 PV。", "Costs: each earning account needs its own 100 PV a month.")}</li>
        </ol>
        <p className="pt-formula">{pick("可分配池 ＝ 新会员 PV × Fast Start% ＋ 复购 PV ×（Unilevel% ＋ Po3%）− 成本", "Pool = new PV × FS% + repeat PV × (Unilevel% + Po3%) − costs")}<br />{pick("销售员提成 ＝ 新会员 PV × 新客% ＋ 复购 PV × 复购%　　团队留下 ＝ 可分配池 − 销售员 − 项目", "Rep pay = new PV × new% + repeat PV × repeat%; team keeps = pool − rep − project")}</p>
      </section>
      <section className="biz-card">
        <h3>{pick("情况", "Scenario")}</h3>
        <div className="fseg" style={{ marginBottom: 10 }}>{Object.entries(SCEN).map(([k, v]) => <button key={k} aria-pressed={o.scen === k} onClick={() => pickScen(k)}>{v.zh}</button>)}</div>
        <p className="muted small" style={{ marginTop: 0 }}>{SCEN[o.scen]?.note}</p>
        <div className="grid3">
          <div className="field"><label htmlFor="st_new">{pick("新会员订单占比 %", "New-member share %")}</label><input id="st_new" type="number" step="5" value={o.newPct} onChange={set("newPct")} /></div>
          <div className="field"><label htmlFor="st_fs">{pick("Fast Start 拿到 %", "Fast Start %")}</label><select id="st_fs" value={o.fs} onChange={set("fs")}><option value={20}>20%</option><option value={30}>30%</option><option value={35}>35%</option></select></div>
          <div className="field"><label htmlFor="st_d">{pick("复购放在第几层", "Repeat depth")}</label><select id="st_d" value={o.depth} onChange={set("depth")}>{DEPTHS.map((x) => <option key={x.d} value={x.d}>{x.d} · Unilevel {pct(uniCapture(x.d))}</option>)}</select></div>
          <div className="field"><label htmlFor="st_p3">{pick("Power of 3 占复购 %", "Po3 % of repeat")}</label><input id="st_p3" type="number" step="1" value={o.po3} onChange={set("po3")} /></div>
          <div className="field"><label htmlFor="st_rn">{pick("销售员：新客单 %", "Rep: new %")}</label><input id="st_rn" type="number" step="0.5" value={o.repNew} onChange={set("repNew")} /></div>
          <div className="field"><label htmlFor="st_rr">{pick("销售员：复购单 %", "Rep: repeat %")}</label><input id="st_rr" type="number" step="0.5" value={o.repRep} onChange={set("repRep")} /></div>
          <div className="field"><label htmlFor="st_pj">{pick("项目（Frank）%", "Project %")}</label><input id="st_pj" type="number" step="0.5" value={o.project} onChange={set("project")} /></div>
          <div className="field"><label htmlFor="st_k">{pick("团队至少留 %", "Team min %")}</label><input id="st_k" type="number" step="0.5" value={o.keep} onChange={set("keep")} /></div>
          <div className="field"><label htmlFor="st_c">{pick("成本 %", "Costs %")}</label><input id="st_c" type="number" step="0.5" value={o.cost} onChange={set("cost")} /></div>
        </div>
        <div className="pt-break">
          <div className="hi"><span>{pick("新客单每 1 PV 最多可给销售员", "Max rep % on new")}</span><b>{pct(one.maxNew)}</b></div>
          <div className="hi"><span>{pick("复购单每 1 PV 最多可给", "Max rep % on repeat")}</span><b>{pct(one.maxRep)}</b></div>
          <div className="hi"><span>{pick("不分新旧、统一比例最多可给", "Max flat rate")}</span><b>{pct(one.maxFlat)}</b></div>
        </div>
      </section>
      <section className="biz-card">
        <h3>{pick("新客越来越少、复购越来越多时会怎样", "As the mix shifts to repeat orders")}</h3>
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("新会员占比", "New share")}</th><th className="n">{pick("可分配池", "Pool")}</th><th className="n">{pick("销售员（按上面比例）", "Rep")}</th><th className="n">{pick("团队留下", "Team")}</th><th className="n">{pick("统一 10% 时团队留下", "Team at flat 10%")}</th><th className="n">{pick("统一 15% 时团队留下", "Team at flat 15%")}</th></tr></thead>
          <tbody>{mix.map((m) => { const a = salesSplit(1000, { ...opts, newPct: m / 100 }), b = salesSplit(1000, { ...opts, newPct: m / 100, repNew: 0.1, repRep: 0.1 }), c = salesSplit(1000, { ...opts, newPct: m / 100, repNew: 0.15, repRep: 0.15 });
            return <tr key={m}><td>{m}%</td><td className="n"><b>{pct(a.poolPct)}</b></td><td className="n">{pct(a.repPct)}</td><td className={`n ${a.org < 0 ? "neg" : ""}`}><b>{pct(a.orgPct)}</b></td><td className={`n ${b.org < 0 ? "neg" : ""}`}>{pct(b.orgPct)}</td><td className={`n ${c.org < 0 ? "neg" : ""}`}>{pct(c.orgPct)}</td></tr>; })}</tbody></table></div>
      </section>
      <section className="biz-card">
        <h3>{pick("每月 100 到 500,000 PV", "From 100 to 500,000 PV a month")}</h3>
        <div className="inv-tbl-wrap"><table className="inv-tbl pt-tbl">
          <thead><tr><th className="n">{pick("每月 PV", "PV / mo")}</th><th className="n">{pick("新会员", "New")}</th><th className="n">{pick("复购", "Repeat")}</th><th className="n">Fast Start</th><th className="n">Unilevel</th><th className="n">Po3</th><th className="n">{pick("成本", "Costs")}</th><th className="n">{pick("可分配池", "Pool")}</th><th className="n">{pick("销售员", "Reps")}</th><th className="n">{pick("项目", "Project")}</th><th className="n">{pick("团队留下", "Team")}</th></tr></thead>
          <tbody>{PV_LADDER.map((v) => { const x = salesSplit(v, opts); return (
            <tr key={v}><td className="n"><b>{v.toLocaleString()}</b></td><td className="n">{Math.round(x.newV).toLocaleString()}</td><td className="n">{Math.round(x.repV).toLocaleString()}</td><td className="n">{usd(x.fs)}</td><td className="n">{usd(x.uni)}</td><td className="n">{usd(x.po3)}</td><td className="n">−{usd(x.cost)}</td><td className="n"><b>{usd(x.pool)}</b><small> {pct(x.poolPct)}</small></td><td className="n">{usd(x.rep)}</td><td className="n">{usd(x.project)}</td><td className={`n ${x.org < 0 ? "neg" : ""}`}><b>{usd(x.org)}</b><small> {pct(x.orgPct)}</small></td></tr>); })}</tbody></table></div>
        <p className="muted small">{pick("比例不随销量变：每多卖一倍，每一方的金额都多一倍。实际上销量大了团队级别会升，可以拿到更深的层和奖金池，只会比这里多。", "Percentages don't change with volume; amounts scale. Higher ranks at volume only add more.")}</p>
      </section>
      <section className="biz-card">
        <h3>{pick("试算一个月", "Try one month")}</h3>
        <div className="field" style={{ maxWidth: 260 }}><label htmlFor="st_v">{pick("这个月总 PV", "Total PV this month")}</label><input id="st_v" type="number" min="0" step="100" value={V} onChange={(e) => setV(e.target.value)} /></div>
        <div className="pt-break">
          <div><span>{pick("新会员 PV", "New PV")}</span><b>{Math.round(one.newV).toLocaleString()}</b></div>
          <div><span>{pick("复购 PV", "Repeat PV")}</span><b>{Math.round(one.repV).toLocaleString()}</b></div>
          <div><span>Fast Start</span><b>{usd(one.fs)}</b></div>
          <div><span>Unilevel</span><b>{usd(one.uni)}</b></div>
          <div><span>Power of 3</span><b>{usd(one.po3)}</b></div>
          <div><span>{pick("成本", "Costs")}</span><b>−{usd(one.cost)}</b></div>
          <div className="hi"><span>{pick("可分配池", "Pool")}</span><b>{usd(one.pool)}（{pct(one.poolPct)}）</b></div>
          <div><span>{pick("销售员", "Reps")}</span><b>{usd(one.rep)}（{pct(one.repPct)}）</b></div>
          <div><span>{pick("项目", "Project")}</span><b>{usd(one.project)}</b></div>
          <div className="hi"><span>{pick("团队留下", "Team keeps")}</span><b className={one.org < 0 ? "neg" : ""}>{usd(one.org)}（{pct(one.orgPct)}）</b></div>
        </div>
      </section>
    </div>
  );
}

function RetailModel() {
  const { pick } = useLang();
  const [o, setO] = useState({ depth: DEFAULTS.depth, store: 10, sales: 10, project: 5, keep: 3, cost: 4, po3: 50, pts: 10 });
  const opts = { depth: n(o.depth), store: n(o.store) / 100, sales: n(o.sales) / 100, project: n(o.project) / 100, keep: n(o.keep) / 100, cost: n(o.cost) / 100, po3: n(o.po3), pts: n(o.pts) / 100 };
  const [R, setR] = useState(1000);
  const one = split(n(R), opts);
  const set = (k) => (e) => setO({ ...o, [k]: e.target.value });
  return (
    <div className="pt">
      <section className="biz-card">
        <h3>{pick("算法：每卖出一笔，钱从哪里来", "How the pool is built")}</h3>
        <ol className="guide-ol">
          <li>{pick("零售差价：零售价 − 批发价 ＝ 零售额 × 25%。不看任何团队架构，卖出就有，是最稳的部分。", "Retail margin: retail − wholesale = 25% of retail. No structure needed.")}</li>
          <li>{pick(`Unilevel：进货帐户放在 Grace 团队第 d 层，中间每个上线按距离拿 第2层3%、第3层5%、第4层5%、第5层6%、第6层6%、第7层7%（按批发额 ≈ PV 计算）。现在选第 ${o.depth} 层 → 团队合计 ${pct(uniCapture(n(o.depth)))} × 批发额。`, `Unilevel by placement depth; now ${pct(uniCapture(n(o.depth)))} of wholesale.`)}</li>
          <li>{pick("Power of 3：进货帐户每月 Rewards 订单满 500 PV，它的推荐人拿 $50（第一年再加 $50 加码）。固定金额，不随销量涨。", "Power of 3: $50 (+$50 boost in year one) once the account orders 500 PV.")}</li>
          <li>{pick("Fast Start：进货帐户刚开的头 60 天，推荐链拿 20%（+10% +5%），一次性，不算进每月的池。", "Fast Start: 20% (+10% +5%) in the account's first 60 days, one-off.")}</li>
          <li>{pick("减去成本（刷卡手续费、运费、破损等）。", "Minus costs (card fees, shipping, breakage).")}</li>
          <li>{pick("另外：进货用 Rewards 订单，每月返批发额（PV）10%–30% 的产品积分，归项目，不放进分配池。", "Separately: Rewards orders return 10–30% of PV as product points, kept by the project.")}</li>
        </ol>
        <p className="pt-formula">{pick("可分配池 ＝ 零售额 × 25% ＋ 批发额 × Unilevel% ＋ Power of 3 − 零售额 × 成本%", "Pool = 25% × retail + Unilevel% × wholesale + Po3 − cost% × retail")}<br />{pick("团队留下 ＝ 可分配池 − 商家% − 业务员% − 项目%（都按零售额算）", "Team keeps = pool − store% − sales% − project% (of retail)")}</p>
      </section>

      <section className="biz-card">
        <h3>{pick("调整比例", "Settings")}</h3>
        <div className="grid3">
          <div className="field"><label htmlFor="pt_d">{pick("进货帐户放在 Grace 团队第几层", "Placement depth")}</label><select id="pt_d" value={o.depth} onChange={set("depth")}>{DEPTHS.map((x) => <option key={x.d} value={x.d}>{x.zh} · {x.note}</option>)}</select></div>
          <div className="field"><label htmlFor="pt_s">{pick("给商家 %", "Store %")}</label><input id="pt_s" type="number" step="0.5" value={o.store} onChange={set("store")} /></div>
          <div className="field"><label htmlFor="pt_p">{pick("给业务员 %", "Salesperson %")}</label><input id="pt_p" type="number" step="0.5" value={o.sales} onChange={set("sales")} /></div>
          <div className="field"><label htmlFor="pt_f">{pick("项目（Frank）%", "Project %")}</label><input id="pt_f" type="number" step="0.5" value={o.project} onChange={set("project")} /></div>
          <div className="field"><label htmlFor="pt_k">{pick("Grace 团队至少留 %", "Team keeps at least %")}</label><input id="pt_k" type="number" step="0.5" value={o.keep} onChange={set("keep")} /></div>
          <div className="field"><label htmlFor="pt_c">{pick("成本 %（手续费、运费等）", "Costs %")}</label><input id="pt_c" type="number" step="0.5" value={o.cost} onChange={set("cost")} /></div>
          <div className="field"><label htmlFor="pt_pts">{pick("Rewards 积分返还 %（归项目）", "Rewards points % (project)")}</label><select id="pt_pts" value={o.pts} onChange={set("pts")}>{[10, 15, 20, 25, 30].map((v) => <option key={v} value={v}>{v}%{v === 10 ? pick("（刚开始）", " (new)") : v === 30 ? pick("（连续 13 个月以上）", " (13+ months)") : ""}</option>)}</select></div>
          <div className="field"><label htmlFor="pt_3">{pick("Power of 3 每月（满 500 PV）", "Po3 per month")}</label><select id="pt_3" value={o.po3} onChange={set("po3")}><option value={0}>$0</option><option value={50}>$50</option><option value={100}>{pick("$100（第一年含加码）", "$100 (year one)")}</option></select></div>
        </div>
      </section>

      <section className="biz-card">
        <h3>{pick("从每月 $100 到 $500,000", "From $100 to $500,000 a month")}</h3>
        <div className="inv-tbl-wrap"><table className="inv-tbl pt-tbl">
          <thead><tr><th className="n">{pick("每月零售额", "Retail / mo")}</th><th className="n">{pick("零售差价 25%", "Margin")}</th><th className="n">Unilevel</th><th className="n">Po3</th><th className="n">{pick("成本", "Costs")}</th><th className="n">{pick("可分配池", "Pool")}</th><th className="n">{pick("商家", "Store")}</th><th className="n">{pick("业务员", "Sales")}</th><th className="n">{pick("项目", "Project")}</th><th className="n">{pick("团队留下", "Team")}</th><th className="n">{pick("商家+业务员最多可给", "Max offer")}</th><th className="n">{pick("积分（项目另得）", "Points (project)")}</th></tr></thead>
          <tbody>{LADDER.map((r) => { const x = split(r, opts); return (
            <tr key={r}><td className="n"><b>{usd(r)}</b></td><td className="n">{usd(x.margin)}</td><td className="n">{usd(x.uni)}</td><td className="n">{usd(x.po3)}</td><td className="n">−{usd(x.cost)}</td><td className="n"><b>{usd(x.pool)}</b><small> {pct(x.poolPct)}</small></td><td className="n">{usd(x.store)}</td><td className="n">{usd(x.sales)}</td><td className="n">{usd(x.project)}</td><td className={`n ${x.org < 0 ? "neg" : ""}`}><b>{usd(x.org)}</b><small> {pct(x.orgPct)}</small></td><td className="n"><b>{pct(x.maxOffer)}</b></td><td className="n">{usd(x.points)}</td></tr>); })}</tbody>
        </table></div>
        <p className="muted small">{pick("「商家+业务员最多可给」＝ 可分配池% − 项目% − 团队至少留%。红色表示这个比例下团队是亏的。", "Max offer = pool% − project% − team minimum. Red means the team loses money.")}</p>
      </section>

      <section className="biz-card">
        <h3>{pick("试算一个月", "Try one month")}</h3>
        <div className="field" style={{ maxWidth: 260 }}><label htmlFor="pt_r">{pick("这个月零售额（美元）", "Retail this month (USD)")}</label><input id="pt_r" type="number" min="0" step="100" value={R} onChange={(e) => setR(e.target.value)} /></div>
        <div className="pt-break">
          <div><span>{pick("批发进货（≈ PV）", "Wholesale (≈ PV)")}</span><b>{usd(one.wholesale)}</b></div>
          <div><span>{pick("零售差价", "Margin")}</span><b>{usd(one.margin)}</b></div>
          <div><span>{pick("Unilevel（团队合计）", "Unilevel")}</span><b>{usd(one.uni)}</b></div>
          <div><span>Power of 3</span><b>{usd(one.po3)}</b></div>
          <div><span>{pick("成本", "Costs")}</span><b>−{usd(one.cost)}</b></div>
          <div className="hi"><span>{pick("可分配池", "Pool")}</span><b>{usd(one.pool)}（{pct(one.poolPct)}）</b></div>
          <div><span>{pick("商家", "Store")}</span><b>{usd(one.store)}</b></div>
          <div><span>{pick("业务员", "Salesperson")}</span><b>{usd(one.sales)}</b></div>
          <div><span>{pick("项目（Frank）", "Project")}</span><b>{usd(one.project)}</b></div>
          <div><span>{pick("项目另得积分（产品）", "Project points")}</span><b>{usd(one.points)}{pick(`，按零售卖约 ${usd(one.pointsRetail)}`, ` (~${usd(one.pointsRetail)} retail)`)}</b></div>
          <div className="hi"><span>{pick("Grace 团队留下", "Team keeps")}</span><b className={one.org < 0 ? "neg" : ""}>{usd(one.org)}（{pct(one.orgPct)}）</b></div>
        </div>
        <p className="muted small">{pick(`进货帐户刚开的头 60 天另有一次性 Fast Start：${usd(fastStart(n(R)).min)}–${usd(fastStart(n(R)).max)}。`, `One-off Fast Start in the first 60 days: ${usd(fastStart(n(R)).min)}–${usd(fastStart(n(R)).max)}.`)}</p>
      </section>

      <PartnerList opts={opts} />
      <p className="muted small">{pick("换算假设：批发价 ≈ 零售价 × 0.75；1 美元批发 ≈ 1 PV ≈ 1 CV。Unilevel 要中间每个上线本月有足够级别（例如拿第 7 层要 Silver 以上）。Pools 和级别晋升的奖金不按单笔销售算，没有放进池里。", "Assumes wholesale ≈ 75% of retail and $1 wholesale ≈ 1 PV ≈ 1 CV. Unilevel needs each upline qualified for that level. Pools are not included.")}</p>
    </div>
  );
}

function PartnerList({ opts }) {
  const { pick, cv } = useLang();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [ed, setEd] = useState(null);
  const load = () => db.select("partners", { order: ["created_at", true] }).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (!rows) return <Loading />;
  const save = async (f) => {
    const row = { name: f.name, contact: f.contact || "", kind: f.kind || "service", monthly: n(f.monthly), store_pct: n(f.store_pct), sales_pct: n(f.sales_pct), project_pct: n(f.project_pct), depth: n(f.depth) || 2, note: f.note || "" };
    try { if (f.id) await db.update("partners", f.id, row); else await db.insert("partners", row); setEd(null); load(); } catch (e) { toast(e.message); }
  };
  const del = async (f) => { if (!window.confirm(pick("删除这个商家？", "Delete?"))) return; await db.remove("partners", f.id); setEd(null); load(); };
  return (
    <section className="biz-card">
      <h3>{pick("合作商家", "Partners")}<button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={() => setEd({ store_pct: opts.store * 100, sales_pct: opts.sales * 100, project_pct: opts.project * 100, depth: opts.depth, kind: "service", monthly: 1000 })}>{pick("+ 添加商家", "+ Add partner")}</button></h3>
      {!rows.length ? <p className="muted">{pick("还没有商家。添加后会按它的预计月销量和分成比例算出每一方拿多少。", "No partners yet.")}</p> :
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("商家", "Partner")}</th><th className="n">{pick("预计月销", "Monthly")}</th><th className="n">{pick("商家 / 业务员 / 项目", "Store / sales / project")}</th><th className="n">{pick("可分配池", "Pool")}</th><th className="n">{pick("商家拿", "Store")}</th><th className="n">{pick("业务员拿", "Sales")}</th><th className="n">{pick("项目拿", "Project")}</th><th className="n">{pick("团队留下", "Team")}</th></tr></thead>
          <tbody>{rows.map((p) => { const x = split(n(p.monthly), { ...opts, depth: n(p.depth) || opts.depth, store: n(p.store_pct) / 100, sales: n(p.sales_pct) / 100, project: n(p.project_pct) / 100 }); return (
            <tr key={p.id} className="click" onClick={() => setEd(p)}><td><b>{cv(p.name)}</b>{p.contact && <span className="muted small"> · {cv(p.contact)}</span>}</td><td className="n">{usd(p.monthly)}</td><td className="n">{p.store_pct}% / {p.sales_pct}% / {p.project_pct}%</td><td className="n">{usd(x.pool)}</td><td className="n">{usd(x.store)}</td><td className="n">{usd(x.sales)}</td><td className="n">{usd(x.project)}</td><td className={`n ${x.org < 0 ? "neg" : ""}`}><b>{usd(x.org)}</b></td></tr>); })}</tbody></table></div>}
      {ed && <Modal title={ed.id ? pick("商家", "Partner") : pick("添加商家", "Add partner")} onClose={() => setEd(null)} footer={<>{ed.id && <button className="btn danger" onClick={() => del(ed)}>{pick("删除", "Delete")}</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={() => setEd(null)}>{pick("取消", "Cancel")}</button><button className="btn primary" disabled={!ed.name} onClick={() => save(ed)}>{pick("保存", "Save")}</button></>}>
        <div className="grid3">
          <div className="field"><label htmlFor="pr_n">{pick("商家名字", "Name")}</label><input id="pr_n" type="text" value={ed.name || ""} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="pr_c">{pick("联系人 / 电话", "Contact")}</label><input id="pr_c" type="text" value={ed.contact || ""} onChange={(e) => setEd({ ...ed, contact: e.target.value })} /></div>
          <div className="field"><label htmlFor="pr_m">{pick("预计每月零售额（美元）", "Expected monthly retail")}</label><input id="pr_m" type="number" value={ed.monthly ?? ""} onChange={(e) => setEd({ ...ed, monthly: e.target.value })} /></div>
          <div className="field"><label htmlFor="pr_s">{pick("给商家 %", "Store %")}</label><input id="pr_s" type="number" step="0.5" value={ed.store_pct ?? ""} onChange={(e) => setEd({ ...ed, store_pct: e.target.value })} /></div>
          <div className="field"><label htmlFor="pr_p">{pick("给业务员 %", "Sales %")}</label><input id="pr_p" type="number" step="0.5" value={ed.sales_pct ?? ""} onChange={(e) => setEd({ ...ed, sales_pct: e.target.value })} /></div>
          <div className="field"><label htmlFor="pr_f">{pick("项目 %", "Project %")}</label><input id="pr_f" type="number" step="0.5" value={ed.project_pct ?? ""} onChange={(e) => setEd({ ...ed, project_pct: e.target.value })} /></div>
          <div className="field"><label htmlFor="pr_d">{pick("进货帐户放第几层", "Depth")}</label><select id="pr_d" value={ed.depth || 2} onChange={(e) => setEd({ ...ed, depth: e.target.value })}>{DEPTHS.map((x) => <option key={x.d} value={x.d}>{x.zh}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="pr_o">{pick("备注", "Note")}</label><input id="pr_o" type="text" value={ed.note || ""} onChange={(e) => setEd({ ...ed, note: e.target.value })} /></div>
      </Modal>}
    </section>
  );
}
