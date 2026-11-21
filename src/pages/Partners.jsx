// 商家分成：每卖出一笔零售额，能分出去多少、我们留下多少。只有管理员 / Grace 看得到。
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { useToast } from "../ctx";
import { db } from "../api";
import { Loading, Modal } from "../components";
import { DEFAULTS, DEPTHS, LADDER, fastStart, split, uniCapture } from "../partner";

const pct = (v) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
const usd = (v) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };

export function PartnersAdmin() {
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
