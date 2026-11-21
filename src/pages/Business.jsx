// 事业进度：只给经营者看。按帐户显示本月级别、离下一级还差什么、Power of 3、Unilevel、Fast Start 的预计奖金，
// 以及完整的级别目标和制度说明。数字是估算，以 doTERRA 后台为准。
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { db } from "../api";
import { Loading } from "../components";
import { today } from "../util";
import { BOOST, FAST_START, PO3, POOLS, RANKS, REWARDS, UNI_PCT, computeMonth, fmtUsd } from "../comp";

const r1 = (v) => Math.round(Number(v || 0) * 10) / 10;
const thisMonth = () => today().slice(0, 7);

export function useCompData() {
  const [d, setD] = useState(null);
  useEffect(() => {
    (async () => {
      const [members, accts, orders] = await Promise.all([
        db.select("members", { order: ["name", true] }).catch(() => []),
        db.select("dt_accounts", { order: ["created_at", true] }).catch(() => []),
        db.select("orders", { order: ["date", true] }).catch(() => []),
      ]);
      setD({ members, accts, orders });
    })();
  }, []);
  return d;
}

export function BusinessCenter({ memberId }) {
  const { pick } = useLang();
  const [sub, setSub] = useState("progress");
  return (
    <div className="biz">
      <div className="fseg" style={{ marginBottom: 18 }}>
        {[["progress", pick("本月进度", "This month")], ["ladder", pick("级别与目标", "Ranks & goals")], ["guide", pick("奖金制度说明", "How you're paid")]].map(([k, l]) => <button key={k} aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>)}
      </div>
      {sub === "progress" && <Progress memberId={memberId} />}
      {sub === "ladder" && <Ladder memberId={memberId} />}
      {sub === "guide" && <Guide />}
      <p className="muted small" style={{ marginTop: 24 }}>{pick("以上是按系统里录入的订单估算：佣金按 1 PV ≈ 1 美元佣金额（CV）计算，Unilevel 未计动态压缩，Pools 金额取决于全公司业绩所以只列份数。实际以 doTERRA 后台为准。收入范围是 doTERRA 公布的美国 2025.6–2026.6 数据（中位数到前 20%），不代表保证收入。", "Estimates from orders recorded here: commissions use 1 PV ≈ $1 CV, Unilevel ignores dynamic compression, and Pools show shares only. doTERRA's back office is the authority. Income ranges are doTERRA's published US figures (median to 80th percentile, Jun 2025–Jun 2026), not a guarantee.")}</p>
    </div>
  );
}

function useAccountPicker(d, memberId) {
  const mine = useMemo(() => (d ? d.accts.filter((a) => a.member_id === memberId).sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0)) : []), [d, memberId]);
  const [acct, setAcct] = useState("");
  const cur = mine.find((a) => a.id === acct) || mine[0];
  return { mine, cur, setAcct };
}

function Progress({ memberId }) {
  const { pick, cv } = useLang();
  const d = useCompData();
  const [ym, setYm] = useState(thisMonth());
  const { mine, cur, setAcct } = useAccountPicker(d, memberId);
  const R = useMemo(() => (d ? computeMonth(d, ym) : null), [d, ym]);
  if (!d) return <Loading />;
  if (!mine.length) return <div className="empty">{pick("这位会员还没有 doTERRA 帐户。先在「账本 → doTERRA 帐户」加上帐户。", "No doTERRA account yet. Add one under Books → doTERRA accounts.")}</div>;
  const r = R.get(cur.id);
  const rk = RANKS[r.rank]; const nx = r.next;
  const aName = (id) => { const a = d.accts.find((x) => x.id === id); return a ? cv(a.label || a.member_no || "") : "—"; };
  const months = [...new Set([thisMonth(), ...d.orders.map((o) => String(o.date).slice(0, 7))])].filter(Boolean).sort().reverse().slice(0, 18);
  const po = r.po3;
  return (
    <>
      <div className="inv-bar">
        {mine.length > 1 && <select value={cur.id} onChange={(e) => setAcct(e.target.value)} aria-label={pick("帐户", "Account")}>{mine.map((a) => <option key={a.id} value={a.id}>{cv(a.label || a.member_no)}{a.is_main ? pick("（主号）", " (main)") : ""}</option>)}</select>}
        <select value={ym} onChange={(e) => setYm(e.target.value)} aria-label={pick("月份", "Month")}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      </div>

      <div className="biz-hero">
        <div><span className="muted small">{pick("本月达到（估算）", "This month (estimate)")}</span><b className="biz-rank">{pick(rk.zh, rk.en)}</b>{rk.range && <span className="muted small">{pick(`这个级别一般每月 ${fmtUsd(rk.range[0])}–${fmtUsd(rk.range[1])}`, `Typical ${fmtUsd(rk.range[0])}–${fmtUsd(rk.range[1])}/mo`)}</span>}</div>
        <div><span className="muted small">{pick("本月预计奖金", "Estimated bonus")}</span><b className="biz-money">{fmtUsd(r.total)}</b><span className="muted small">{pick(`Power of 3 ${fmtUsd(r.po3Total)} · Unilevel ${fmtUsd(r.uniTotal)} · Fast Start ${fmtUsd(r.fsTotal)}`, `Po3 ${fmtUsd(r.po3Total)} · Unilevel ${fmtUsd(r.uniTotal)} · Fast Start ${fmtUsd(r.fsTotal)}`)}</span></div>
        <div className="biz-nums"><span><small>{pick("个人 PV", "PV")}</small><b>{r1(r.pv)}</b></span><span><small>{pick("其中 Rewards", "Rewards")}</small><b>{r1(r.rpv)}</b></span><span><small>{pick("组织 OV", "OV")}</small><b>{r1(r.ov)}</b></span><span><small>PGV</small><b>{r1(po.pgv)}</b></span></div>
      </div>

      {nx && <section className="biz-card">
        <h3>{pick(`下一级：${nx.rank.zh}`, `Next: ${nx.rank.en}`)}{nx.rank.range && <span className="muted small">{pick(`　达到后一般每月 ${fmtUsd(nx.rank.range[0])}–${fmtUsd(nx.rank.range[1])}`, `  typical ${fmtUsd(nx.rank.range[0])}–${fmtUsd(nx.rank.range[1])}/mo`)}</span>}</h3>
        <div className="biz-goals">{nx.items.map((g) => <Goal key={g.key} label={pick(g.zh, g.en)} have={g.have} need={g.need} unit={g.unit === "legs" ? pick("条", "") : g.key === "pv" || g.key === "ov" ? "PV" : ""} />)}</div>
        {nx.items.find((g) => g.key === "legs") && <p className="muted small">{pick("「线」是指你第一层下面各自独立的一支，每支里至少有一位达到该级别。", "A leg is one frontline branch with at least one person at that rank.")}</p>}
      </section>}

      <section className="biz-card">
        <h3>Power of 3 <span className="muted small">{pick("每月发，看团队结构", "paid monthly, based on structure")}</span></h3>
        <div className="biz-goals">
          <Goal label={pick("自己的 Rewards 订单", "Your Rewards order")} have={r.rpv} need={PO3.personal} unit="PV" />
          <Goal label={pick("第一层 Pod 业绩（含最多 200 非 Rewards）", "Frontline pod (up to 200 non-Rewards)")} have={po.podVol} need={PO3.pod} unit="PV" />
          <Goal label={pick("其中 Rewards 业绩", "of which Rewards")} have={po.podR} need={PO3.podRewards} unit="PV" />
          <Goal label={pick("其中亲自推荐的人", "of which personally enrolled")} have={po.podPE} need={PO3.podPE} unit="PV" />
        </div>
        <div className="po3-steps">
          {[1, 2, 3].map((lv) => { const got = po.level >= lv; const req = lv === 1 ? pick("满足上面四项", "Meet the four above") : lv === 2 ? pick(`第一层 3 人拿到 $50（现在 ${po.fl1} 人）`, `3 frontline earn $50 (now ${po.fl1})`) : pick(`第一层 3 人拿到 $250（现在 ${po.fl2} 人）`, `3 frontline earn $250 (now ${po.fl2})`);
            return <div key={lv} className={got ? "ok" : ""}><b>{pick(`第 ${lv} 级 $${PO3.base[lv - 1]}`, `Level ${lv} $${PO3.base[lv - 1]}`)}</b><span>{req}</span><em>{got ? pick("已达成", "Reached") : pick("未达成", "Not yet")}</em></div>; })}
        </div>
        <p className="small">{pick(`加码（Boost）看 PGV：400+ 加 $50，800+ 加 $250（要第 2 级），1,200+ 加 $500（要第 3 级）。你本月 PGV ${r1(po.pgv)}，加码 ${fmtUsd(po.boost)}。`, `Boost by PGV: 400+ adds $50, 800+ adds $250 (level 2), 1,200+ adds $500 (level 3). Your PGV ${r1(po.pgv)}, boost ${fmtUsd(po.boost)}.`)}</p>
      </section>

      <section className="biz-card">
        <h3>Unilevel <span className="muted small">{pick("每月发，第 2–7 层 3%–7%", "monthly, levels 2–7 at 3–7%")}</span></h3>
        {r.tgv.need > 0 && <p className="small" style={{ marginTop: 0 }}>{pick(`团队成长业绩 TGV：${r1(r.tgv.value)} / ${r.tgv.need}（看 ${r.tgv.levels} 层内、12 个月内新入会的人）${r.tgv.ok ? " ✓" : "，未达标的话较深的层不发"}`, `TGV: ${r1(r.tgv.value)} / ${r.tgv.need} ${r.tgv.ok ? "✓" : "— deeper levels stay locked"}`)}</p>}
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("层", "Level")}</th><th className="n">{pick("人数", "People")}</th><th className="n">{pick("业绩（过了前 60 天）", "Volume (after 60 days)")}</th><th className="n">%</th><th className="n">{pick("预计", "Est.")}</th></tr></thead>
          <tbody>{r.uni.map((u) => <tr key={u.level} className={u.open ? "" : "off"}><td>{u.level}</td><td className="n">{u.people}</td><td className="n">{r1(u.vol)}</td><td className="n">{u.level === 1 ? pick("由 Po3 代替", "via Po3") : `${Math.round(UNI_PCT[u.level] * 100)}%`}</td><td className="n">{u.open ? fmtUsd(u.amt) : u.level === 1 ? "—" : pick("未解锁", "locked")}</td></tr>)}</tbody></table></div>
      </section>

      <section className="biz-card">
        <h3>Fast Start <span className="muted small">{pick("每周发，新会员前 60 天的订单", "weekly, new members' first 60 days")}</span></h3>
        {!r.fs.length ? <p className="muted">{pick("这个月没有新会员前 60 天内的订单。", "No first-60-day orders this month.")}</p> :
          <ul className="biz-list">{r.fs.map((x, i) => <li key={i}><span>{aName(x.acct)}<span className="muted small"> · {pick(["你推荐的", "你推荐的人推荐的", "再下一层"][x.depth - 1], ["your enrollee", "their enrollee", "one more level"][x.depth - 1])} · {r1(x.vol)} PV × {Math.round(FAST_START[x.depth - 1] * 100)}%</span></span><b>{fmtUsd(x.amt)}</b></li>)}</ul>}
        {r.pv < 100 && r.fs.length > 0 && <p className="small" style={{ color: "var(--warn)" }}>{pick("要自己本月有 100 PV 才能拿 Fast Start。", "You need 100 PV yourself to qualify.")}</p>}
      </section>

      {r.rank >= RANKS.findIndex((x) => x.code === "premier") && <section className="biz-card"><h3>{pick("奖金池 Pools", "Pools")}</h3><p className="muted small">{pick("Pools 按全公司业绩分配，金额每月不同，这里只列你可以分到的份数。", "Pools depend on company volume; shares only.")}</p><ul className="biz-list">{POOLS.map((p) => <li key={p.zh}><span><b>{p.zh}</b>（{p.pct}）<span className="muted small"> {p.who}</span></span></li>)}</ul></section>}
    </>
  );
}

function Goal({ label, have, need, unit }) {
  const { pick } = useLang();
  const pct = need ? Math.min(100, (have / need) * 100) : 100; const ok = have >= need;
  return <div className={`goal ${ok ? "ok" : ""}`}><div className="gl"><span>{label}</span><b>{r1(have)} / {need} {unit}</b></div><i style={{ "--p": `${pct}%` }} /><span className="small">{ok ? "✓" : pick(`还差 ${r1(need - have)}`, `${r1(need - have)} to go`)}</span></div>;
}

function Ladder({ memberId }) {
  const { pick } = useLang();
  const d = useCompData();
  const { cur } = useAccountPicker(d, memberId);
  const R = useMemo(() => (d ? computeMonth(d, thisMonth()) : null), [d]);
  if (!d) return <Loading />;
  const mine = cur ? R.get(cur.id)?.rank ?? 0 : -1;
  return (
    <div className="ladder-list">
      {RANKS.slice(1).map((r, i0) => { const i = i0 + 1; const st = i <= mine ? "done" : i === mine + 1 ? "next" : "";
        return (
          <div key={r.code} className={`ld ${st}`}>
            <div className="ld-h"><b>{pick(r.zh, r.en)}</b>{st === "done" && <em>{pick("已达到", "Reached")}</em>}{st === "next" && <em>{pick("下一个目标", "Next goal")}</em>}{r.range && <span className="ld-money">{fmtUsd(r.range[0])}–{fmtUsd(r.range[1])}<small>{pick(" / 月", "/mo")}</small></span>}</div>
            <div className="ld-b">
              <span>{pick("个人 100 PV", "100 PV")}</span>
              {r.ov && <span>{pick(`组织 ${r.ov.toLocaleString()} OV`, `${r.ov.toLocaleString()} OV`)}</span>}
              {r.legs && <span>{pick(`${r.legs.n} 条${r.legs.pe ? "亲自推荐的" : ""} ${RANKS.find((x) => x.code === r.legs.rank).zh} 线`, `${r.legs.n} ${r.legs.pe ? "personally enrolled " : ""}${RANKS.find((x) => x.code === r.legs.rank).en} legs`)}</span>}
              <span>{pick(`Unilevel 拿到第 ${r.uni} 层`, `Unilevel to level ${r.uni}`)}</span>
              {r.tgv && <span>{r.tgv.pool ? pick(`TGV ${r.tgv.need.toLocaleString()} 解锁奖金池份数`, `TGV ${r.tgv.need.toLocaleString()} for pool shares`) : pick(`TGV ${r.tgv.need}（${r.tgv.levels} 层内）解锁第 ${r.tgv.unlock.join("、")} 层`, `TGV ${r.tgv.need} unlocks levels ${r.tgv.unlock.join(", ")}`)}</span>}
            </div>
          </div>);
      })}
      <p className="muted small">{pick("Blue Diamond 和 Presidential Diamond 没有公布收入范围。Pools 从 Premier 开始（赋能池），Silver 起有领导池。", "No published ranges for Blue and Presidential Diamond. Pools start at Premier.")}</p>
    </div>
  );
}

function Guide() {
  const { pick } = useLang();
  const S = ({ t, children }) => <section className="biz-card guide"><h3>{t}</h3>{children}</section>;
  return (
    <div>
      <S t={pick("六种收入", "Six ways to earn")}>
        <div className="guide-grid">
          <div><b>Fast Start</b><span>{pick("每周发。新会员入会前 60 天的订单：推荐人 20%，推荐人的推荐人 10%，再上一层 5%。自己要有 100 PV。", "Weekly. New members' first 60 days: 20% / 10% / 5% up three enrollers. Needs 100 PV.")}</span></div>
          <div><b>Power of 3</b><span>{pick("每月发。$50 / $250 / $1,250，再按 PGV 加码，最多每月 $1,750。", "Monthly. $50 / $250 / $1,250 plus a PGV boost, up to $1,750.")}</span></div>
          <div><b>Unilevel</b><span>{pick("每月发。第 2–7 层业绩的 3%、5%、5%、6%、6%、7%，级别越高拿得越深。", "Monthly. 3%, 5%, 5%, 6%, 6%, 7% on levels 2–7, deeper with rank.")}</span></div>
          <div><b>Pools</b><span>{pick("每月发。全公司业绩的 8% 按份数分给 Premier 以上。", "Monthly. 8% of company volume shared among Premier and up.")}</span></div>
          <div><b>{pick("零售利润", "Retail profit")}</b><span>{pick("客人按零售价买，拿差价 25%，每周发。", "25% of retail sales, weekly.")}</span></div>
          <div><b>{pick("Rewards 积分", "Rewards points")}</b><span>{REWARDS.tiers}{pick("。", ". ")}{REWARDS.ship}；{REWARDS.potm}。</span></div>
        </div>
      </S>
      <S t="Power of 3">
        <ol className="guide-ol">
          <li>{pick("第 1 级 $50：自己每月 Rewards 订单 100 PV 以上，第一层合计 500 PV（Pod）。其中至少 300 PV 是 Rewards，至少 100 PV 来自亲自推荐的人；另外最多 200 PV 可以是任何订单（Closing the Gap 新规）。", "Level 1 $50: your 100 PV Rewards order plus a 500 PV frontline pod (300+ Rewards, 100+ personally enrolled; up to 200 from any order type).")}</li>
          <li>{pick("第 2 级 $250：自己拿到 $50，并且第一层有 3 个人也拿到 $50。", "Level 2 $250: earn your $50 and help 3 frontline earn theirs.")}</li>
          <li>{pick("第 3 级 $1,250：自己拿到 $50，并且第一层有 3 个人拿到 $250。", "Level 3 $1,250: earn your $50 and 3 frontline earn $250.")}</li>
        </ol>
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("级别", "Level")}</th><th className="n">PGV 400+</th><th className="n">PGV 800+</th><th className="n">PGV 1,200+</th><th className="n">{pick("最多", "Up to")}</th></tr></thead>
          <tbody><tr><td>$50</td><td className="n">+$50</td><td className="n">—</td><td className="n">—</td><td className="n"><b>$100</b></td></tr><tr><td>$250</td><td className="n">+$50</td><td className="n">+$250</td><td className="n">—</td><td className="n"><b>$500</b></td></tr><tr><td>$1,250</td><td className="n">+$50</td><td className="n">+$250</td><td className="n">+$500</td><td className="n"><b>$1,750</b></td></tr></tbody></table></div>
        <p className="small muted">{pick("PGV＝亲自推荐、在之前 12 个月内入会的会员，本月的 Rewards 业绩（入会当月不算）。每个帐户每月最多一个加码。", "PGV = this month's Rewards volume from members you enrolled in the previous 12 months (not their enrolment month). One boost per account per month.")}</p>
        <p className="small muted">{pick(`最简单的 $500 路径：找 4 个人每月下 125 PV 的 Rewards 订单（$100），再教 3 个人做同样的事，自己继续推荐，凑够 800 PGV（$250 + $250 加码）。`, "Path to $500: four people on 125 PV Rewards orders ($100), then teach three to do the same and keep enrolling to 800 PGV ($250 + $250 boost).")}</p>
      </S>
      <S t={pick("级别条件与 Unilevel", "Ranks and Unilevel")}>
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("级别", "Rank")}</th><th>{pick("条件（每月）", "Monthly requirement")}</th><th className="n">{pick("拿到第几层", "Levels")}</th><th className="n">{pick("一般月收入", "Typical")}</th></tr></thead>
          <tbody>{RANKS.slice(1).map((r) => <tr key={r.code}><td><b>{pick(r.zh, r.en)}</b></td><td>{[pick("100 PV", "100 PV"), r.ov && `${r.ov.toLocaleString()} OV`, r.legs && pick(`${r.legs.n} 条${r.legs.pe ? "亲推" : ""} ${RANKS.find((x) => x.code === r.legs.rank).zh}`, `${r.legs.n} ${RANKS.find((x) => x.code === r.legs.rank).en}${r.legs.pe ? " (PE)" : ""}`)].filter(Boolean).join(" · ")}</td><td className="n">{r.uni}</td><td className="n">{r.range ? `${fmtUsd(r.range[0])}–${fmtUsd(r.range[1])}` : "—"}</td></tr>)}</tbody></table></div>
        <p className="small muted">{pick("Unilevel：第 1 层没有百分比（由 Power of 3 最多 $100 代替），第 2 层 3%、第 3 层 5%、第 4 层 5%、第 5 层 6%、第 6 层 6%、第 7 层 7%。会员入会前 60 天的订单算 Fast Start，之后才算 Unilevel。会动态压缩：没达到级别的人会被跳过，往下多拿一层。", "Level 1 is paid through Po3; levels 2–7 pay 3/5/5/6/6/7%. First-60-day orders go to Fast Start. Dynamic compression skips unqualified members.")}</p>
      </S>
      <S t={pick("成长指标 TGV", "Team Growth Volume")}>
        <p>{pick("TGV＝本月、指定层数内、在之前 12 个月内新入会或重新激活的会员的业绩（入会当月不算）。达不到就拿不到较深的层：", "TGV = this month's volume from members who joined or reactivated in the past 12 months, within a set number of levels. Without it, deeper levels stay locked:")}</p>
        <div className="inv-tbl-wrap"><table className="inv-tbl"><thead><tr><th>{pick("级别", "Rank")}</th><th className="n">{pick("看几层", "Levels")}</th><th className="n">TGV</th><th>{pick("解锁", "Unlocks")}</th></tr></thead>
          <tbody>{RANKS.filter((r) => r.tgv).map((r) => <tr key={r.code}><td>{pick(r.zh, r.en)}</td><td className="n">{r.tgv.levels}</td><td className="n">{r.tgv.need.toLocaleString()}{r.tgv.pe ? pick("（100 亲推）", " (100 PE)") : ""}</td><td>{r.tgv.pool ? pick("业绩奖金池等加份", "extra pool shares") : pick(`第 ${r.tgv.unlock.join("、")} 层`, `levels ${r.tgv.unlock.join(", ")}`)}</td></tr>)}</tbody></table></div>
      </S>
      <S t={pick("奖金池 Pools", "Pools")}><ul className="biz-list">{POOLS.map((p) => <li key={p.zh}><span><b>{p.zh}</b>（{p.pct}）<span className="muted small"> {p.who}</span></span></li>)}</ul></S>
      <S t={pick("安置与推荐（Placements）", "Placements")}>
        <ul className="guide-ol">
          <li>{pick("推荐人（Enroller）＝带他加入的人；安置上线（Sponsor）＝他被放在谁下面。新会员先放在推荐人的第一层。", "Enroller brings them in; Sponsor is who they're placed under. New members start on the enroller's frontline.")}</li>
          <li>{pick("新会员还没有下线前，推荐人可以申请改一次安置位置；有了下线后，要在下个月 10 号前申请。", "Before they have a downline the enroller may move them once; after that, by the 10th of the next month.")}</li>
          <li>{pick("批发客户升级成 WA 后，推荐了一位 100 PV 的新会员，可以在下个月 10 号前申请移动。", "An upgraded WC who enrols a 100 PV member can be moved by the 10th of the following month.")}</li>
          <li>{pick("3 个月 Elite 移动：新 WA 在入会后 3 个月内达到 Elite（本月亲推 1,500 PV、下线至少 5 人），Platinum 以上的推荐人可以带着整个下线一起移动，首次以 Elite 计酬后两周内电邮 placements@doterra.com。", "3-Month Elite Move: a new WA reaching Elite within three months (1,500 PV enrolled, 5+ downline) can be moved with their team by a Platinum+ enroller within two weeks.")}</li>
          <li>{pick("12 个月以上没下单或拿佣金可以重新激活；推荐人只能改一次（改回原推荐人除外）；另有帐户转让、上下线互换，要填表。", "Reactivation after 12 months; one enroller change; account transfers and swaps by form.")}</li>
        </ul>
      </S>
    </div>
  );
}
