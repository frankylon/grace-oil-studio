import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLang } from "../i18n";
import { useCatalog } from "../ctx";
import { Bottle, Loading, useProductName } from "../components";
import AnimatedContent from "../rb/AnimatedContent";
import { asset, hasLocal, productImg } from "../img";
import { totalDrops } from "../util";
import "../home.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// 首页文案 [简体, English]
const C = {
  l1: ["说出感受", "Tell us"], l2: ["调好这一瓶", "we mix it"],
  say: ["doTERRA 精油配方馆。150 款精油，188 条按滴写好的配方，选一种感受，我们帮你调好这一瓶。", "A doTERRA oil studio: 150 oils and 188 blends written out in drops. Pick how you feel and we'll mix the bottle for you."],
  go: ["按感受配油", "Find my blend"],
  ih1: ["每一条配方", "Every blend"], ih2: ["都按滴写清楚", "counted in drops"],
  ip: ["几滴乳香、几滴薰衣草，配多少基底油，涂在哪里，一天几次，都写在配方上。", "How many drops of each oil, how much carrier, where to apply it and how often: it's all on the card."],
  inote: ["这些是按摩师每天手上在用的配方。", "These are the blends our therapists use every day."],
  sh: ["今天哪里不舒服", "How do you feel today"], all: ["看全部配方", "All blends"],
  mix: ["配这瓶", "Mix this one"], see: ["看配方", "See the blend"], drops: ["滴", "drops"],
  lh1: ["按身体部位", "Blends sorted"], lh2: ["排好的常用配方", "by where you feel it"], lword: ["配方", "Blends"], lmore: ["打开全部 188 条配方", "Open all 188 blends"],
  gh: ["每款精油都有一页", "Every oil has a page"], gp: ["香气、萃取部位、主要成分、官方用法和注意事项，还有用到它的配方。", "Aroma, plant part, constituents, official directions and cautions, plus the blends that use it."], gl: ["打开精油百科", "Open the oil library"],
  ah1: ["你的配油和购买", "Your blends and orders"], ah2: ["都记在会员页", "kept on your page"],
  a1h: ["每次配了什么", "What we mixed"], a1: ["配方、滴数、基底油和用法都存在你的会员页，用完了可以照着再配一瓶。", "Formula, drops, carrier and directions stay on your page, so the next bottle can be the same."],
  a2h: ["只有你自己看得到", "Yours to see"], a2: ["要不要让推荐你的人看到你的配油和近况，由你自己决定。", "Whether the person who referred you can see your blends and notes is up to you."],
  login: ["会员登入", "Member sign in"],
  cs: ["告诉我们你哪里不舒服，我们按配方帮你调好，再通知你来取。", "Tell us how you feel, we'll mix the blend and let you know when it's ready."],
};
const FEELINGS = [
  { tag: "肩颈", zh: "肩颈紧", en: "Tight shoulders" }, { tag: "睡眠", zh: "睡不好", en: "Restless nights" },
  { tag: "情绪", zh: "压力大", en: "Under pressure" }, { tag: "呼吸", zh: "呼吸不顺", en: "Stuffy breathing" },
  { tag: "消化", zh: "肠胃不适", en: "Unsettled tummy" }, { tag: "肌肤", zh: "肌肤干燥", en: "Dry skin" },
];
const P = (f) => asset(`/img/photo/${f}.webp`);
const GAL = [
  ["coriander-oil-1", "6%", "14%"], ["jasmine-oil-1", "24%", "4%"], ["roman-chamomile-oil-nhp-2", "70%", "8%"], ["blue-tansy-oil-1", "86%", "26%"],
  ["zengest-1", "10%", "64%"], ["purify-oil-blend-1", "30%", "78%"], ["peace-2", "66%", "72%"], ["forgive-2", "84%", "60%"],
];

function Ph({ src, ratio, alt = "", eager, className = "" }) {
  return <div className={`ph ${ratio} ${className}`}><img src={src} alt={alt} loading={eager ? "eager" : "lazy"} /></div>;
}

export default function Home() {
  const { pick } = useLang();
  const cat = useCatalog();
  const L = (k) => pick(C[k][0], C[k][1]);
  const root = useRef(null);
  const data = useMemo(() => {
    if (!cat.ready) return null;
    const score = (r) => (r.items || []).filter((i) => i.product && hasLocal(i.product)).length;
    const feel = FEELINGS.map((f) => {
      const rs = cat.recipes.filter((r) => r.tags?.includes(f.tag) && r.items?.length >= 2).sort((a, b) => score(b) - score(a));
      return rs[0] ? { ...f, r: rs[0] } : null;
    }).filter(Boolean);
    const rows = ["肌肉骨骼", "神经系统", "日常养护", "皮肤"].flatMap((c) => cat.recipes.filter((r) => r.cat === c).slice(0, 3));
    return { feel, rows };
  }, [cat]);

  useGSAP(() => {
    if (!data || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.utils.toArray(".gx .p").forEach((el, i) => gsap.fromTo(el, { y: 30 + (i % 4) * 14 }, { y: -(30 + (i % 3) * 18), ease: "none", scrollTrigger: { trigger: ".gx", start: "top bottom", end: "bottom top", scrub: true } }));
    gsap.utils.toArray(".lx .row").forEach((el, i) => gsap.from(el, { y: 18, opacity: 0, duration: 0.6, ease: "power3.out", delay: (i % 4) * 0.06, scrollTrigger: { trigger: el, start: "top 92%", once: true } }));
    gsap.fromTo(".ix .big img", { scale: 1.08 }, { scale: 1, ease: "none", scrollTrigger: { trigger: ".ix", start: "top bottom", end: "bottom top", scrub: true } });
  }, { scope: root, dependencies: [!!data] });

  if (!data) return <Loading />;
  return (
    <div ref={root} className="home">
      {/* hero */}
      <section className="hx g12">
        <Ph className="land" ratio="r1610" src={P("basil-oil-1")} alt="Basil" eager />
        <h1><span className="line-mask"><span>{L("l1")}</span></span><span className="line-mask l2"><span>{L("l2")}</span></span></h1>
        <Ph className="tall" ratio="r45" src={P("clary-sage-oil-1")} alt="Clary Sage" eager />
        <div className="say fade-late"><p className="soft">{L("say")}</p><a className="btn primary" href="#feel" onClick={(e) => { e.preventDefault(); document.getElementById("feel")?.scrollIntoView({ behavior: "smooth" }); }}>{L("go")}</a></div>
      </section>

      {/* intro */}
      <section className="ix g12">
        <h2><span>{L("ih1")}</span><span>{L("ih2")}</span></h2>
        <Ph className="big" ratio="r34" src={P("roman-chamomile-oil-nhp-3")} alt="Roman Chamomile" />
        <AnimatedContent className="p" distance={24}><p>{L("ip")}</p></AnimatedContent>
        <Ph className="small" ratio="r11" src={P("cardamom-oil-1")} alt="Cardamom" />
        <p className="note soft">{L("inote")}</p>
      </section>

      <Showcase data={data} L={L} />

      {/* list */}
      <section className="lx g12">
        <h2><span>{L("lh1")}</span><span>{L("lh2")}</span></h2>
        <span className="word">{L("lword")}</span>
        <div className="tbl">{data.rows.map((r) => { const c = cat.catById[r.cat]; const n = totalDrops(r.items); return (
          <Link key={r.id} to={`/recipes/${r.id}`} className="row"><span>{pick(c?.zh, c?.en)}</span><span>{pick(r.title_zh, r.title_en)}</span><span>{n ? `${n} ${L("drops")} →` : "→"}</span></Link>); })}</div>
        <Ph className="pic" ratio="r45" src={P("frankincense-essential-oil-2")} alt="Frankincense" />
        <Link className="more link" to="/recipes">{L("lmore")}</Link>
      </section>

      {/* gallery */}
      <section className="gx" aria-labelledby="gx-h">
        <div className="field">{GAL.map(([f, x, y]) => <div key={f} className="p" style={{ left: `calc(${x} * 0.86)`, top: y }}><Ph ratio="r910" src={P(f)} alt="" /></div>)}</div>
        <div className="c"><h2 id="gx-h">{L("gh")}</h2><p className="soft">{L("gp")}</p><Link className="link" to="/oils">{L("gl")}</Link></div>
      </section>

      {/* about */}
      <section className="ax g12">
        <h2><span style={{ display: "block" }}>{L("ah1")}</span><span style={{ display: "block" }}>{L("ah2")}</span></h2>
        <Ph className="pic" ratio="r45" src={P("bergamot-essential-oil-3")} alt="Bergamot" />
        <AnimatedContent className="blk b1" distance={24}><h3>{L("a1h")}</h3><p className="soft">{L("a1")}</p></AnimatedContent>
        <AnimatedContent className="blk b2" distance={24} delay={0.1}><h3>{L("a2h")}</h3><p className="soft">{L("a2")}</p><Link className="link" to="/login">{L("login")}</Link></AnimatedContent>
      </section>

      {/* cta */}
      <section className="cx g12">
        <p className="s">{L("cs")}</p>
        <div className="a"><a className="btn primary" href="#feel" onClick={(e) => { e.preventDefault(); document.getElementById("feel")?.scrollIntoView({ behavior: "smooth" }); }}>{L("go")}</a><Link className="link" to="/recipes">{L("all")}</Link></div>
      </section>
    </div>
  );
}

function Showcase({ data, L }) {
  const { pick } = useLang();
  const cat = useCatalog();
  const name = useProductName();
  const [i, setI] = useState(0);
  const f = data.feel[i];
  if (!f) return null;
  const items = (f.r.items || []).slice(0, 6);
  const maxD = Math.max(...items.map((x) => Number(x.drops) || 0));
  const liftIdx = Math.max(0, items.findIndex((x) => (Number(x.drops) || 0) === maxD));
  const ordered = [items[liftIdx], ...items.filter((_, k) => k !== liftIdx)];
  return (
    <section className="sx g12" id="feel">
      <div className="side">
        <h2>{L("sh")}</h2>
        <div className="feel" role="group" aria-label={L("sh")}>
          {data.feel.map((x, k) => <button key={x.tag} aria-pressed={k === i} onClick={() => setI(k)}>{pick(x.zh, x.en)}</button>)}
        </div>
        <div>
          <h3 style={{ fontSize: "var(--step-lead)", fontWeight: 500 }}>{pick(f.r.title_zh, f.r.title_en)}</h3>
          <p className="use soft">{pick(f.r.usage_zh, f.r.usage_en)}</p>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Link className="btn primary" to={`/recipes/${f.r.id}?mix=1`}>{L("mix")}</Link>
          <Link className="link" to={`/recipes/${f.r.id}`}>{L("see")}</Link>
        </div>
      </div>
      <div className="run" key={f.tag}>
        {ordered.map((it, k) => { const p = it.product && cat.byId[it.product]; const src = p && productImg(p); return (
          <AnimatedContent key={k} className={`fr ${k === 0 ? "lift" : ""}`} distance={20} duration={0.6} delay={k * 0.06} trigger="mount">
            <div className="pic">{src ? <img src={src} alt={p.name_en} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Bottle kind="single" />}</div>
            <div className="cap"><span>{name(it)}</span><span>{it.drops ? `${it.drops} ${L("drops")}` : ""}</span></div>
          </AnimatedContent>); })}
      </div>
    </section>
  );
}
