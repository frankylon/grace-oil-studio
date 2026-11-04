import { useLayoutEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLang } from "../i18n";
import { useCatalog } from "../ctx";
import { Loading, useProductName } from "../components";
import { asset } from "../img";
import "../home.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* Direction: "The name as a monument" (taste-skill seed 655606138).
   On this page, the aromatherapist's name, Grace, opens in the middle to let one bottle stand through it. */

const C = {
  say: ["温哥华芳疗师手调的 doTERRA 精油。说出你的感受，我按滴为你调好这一瓶。", "Hand-mixed doTERRA blends by a Vancouver aromatherapist. Tell me how you feel and I'll mix the bottle, drop by drop."],
  go: ["按感受配油", "Find my blend"],
  where: ["温哥华 · 芳疗工作室", "Vancouver · aromatherapy studio"],
  oils: ["精油百科", "Oil library"], recipes: ["全部配方", "All blends"],
  ph1: ["每天", "Oils I"], ph2: ["手上的油", "reach for"],
  sh: ["四款招牌配方", "Four signature blends"],
  scap: ["每瓶都按滴数写好，点开就能看用法，按一下就帮你配。", "Every bottle is written out in drops: open one for directions, or tap to have it mixed."],
  mix: ["帮我配这瓶", "Mix this for me"], drops: ["滴", "drops"],
  hh1: ["从一句话", "From one line"], hh2: ["到一瓶油", "to one bottle"],
  hp: ["不用懂精油。告诉我哪里不舒服，剩下的交给我。", "You don't need to know oils. Tell me what's bothering you and leave the rest to me."],
  ch1: ["告诉我感受", "Tell me how"], ch2: ["我来调", "you feel"],
  cs: ["配好会通知你来取，配方和滴数都存在你的会员页。", "I'll let you know when it's ready, and the formula stays on your member page."],
};

const OILS = [
  { id: "frankincense-essential-oil", zh: "几乎每瓶护肤和舒缓配方的底子，香气沉稳，和什么都合得来。", en: "The base of nearly every skin and calming blend I make: steady, and it gets along with everything." },
  { id: "roman-chamomile-oil-nhp", zh: "睡前和情绪配方用得最多，一两滴就让整瓶变得柔和。", en: "My go-to for evening and mood blends; a drop or two softens the whole bottle." },
  { id: "ginger-essential-oil", zh: "肩颈、腰腹按摩的暖意来自它，和丝柏一起用效果最稳。", en: "The warmth in shoulder and belly massage blends, steadiest alongside cypress." },
  { id: "bergamot-essential-oil", zh: "压力大的日子，我会在配方里加它，让香气明亮起来。", en: "On heavy days I add it to lift the aroma and brighten the blend." },
];

const SIG = [
  { id: "r005", grow: 5 }, { id: "r134", grow: 2 }, { id: "r051", grow: 3 }, { id: "r112", grow: 2 },
];

const STEPS = [
  { h: ["今天", "Today"], rows: [[["选一种感受或一条配方", "Pick a feeling or a blend"], ["1 分钟", "1 min"]], [["按「帮我配」留下联系方式", "Tap “Mix this for me”, leave a contact"], ["1 分钟", "1 min"]]] },
  { h: ["当天", "Same day"], rows: [[["按滴调好，确认基底油和浓度", "Mixed by the drop, carrier and strength checked"], ["当天", "same day"]], [["通知你来取", "You get a message to collect"], ["—", "—"]]] },
  { h: ["之后", "After"], rows: [[["配方与滴数存进会员页", "Formula and drops saved to your page"], ["一直在", "kept"]], [["用完照着再配一瓶", "Run out, mix the same again"], ["随时", "any time"]]] },
];

const cut = (id) => asset(`/img/p/${id}.webp`);

// Fit the wordmark to its box so it always spans margin to margin on one line
function useFit(ref, deps) {
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => {
      const box = el.parentElement.clientWidth; el.style.fontSize = "100px";
      const w = el.offsetWidth; if (w) el.style.fontSize = `${(100 * box) / w}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    document.fonts?.addEventListener?.("loadingdone", fit);
    window.addEventListener("load", fit);
    const ro = new ResizeObserver(fit); ro.observe(el.parentElement);
    return () => { ro.disconnect(); document.fonts?.removeEventListener?.("loadingdone", fit); window.removeEventListener("load", fit); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Wordmark({ className = "", bottle, as: Tag = "div", label }) {
  const ref = useRef(null);
  useFit(ref, [bottle]);
  return (
    <div className={`wmk ${className}`}>
      <Tag ref={ref} className="wmk-t" aria-label={label}>
        <span className="wl" aria-hidden="true">Gra</span>
        {bottle && <span className="wgap" aria-hidden="true"><img src={cut(bottle)} alt="" width="400" height="900" /></span>}
        <span className="wl" aria-hidden="true">ce</span>
        {label && <span className="sr">{label}</span>}
      </Tag>
    </div>
  );
}

export default function Home() {
  const { pick } = useLang();
  const cat = useCatalog();
  const name = useProductName();
  const L = (k) => pick(C[k][0], C[k][1]);
  const root = useRef(null);
  const sig = useMemo(() => (cat.ready ? SIG.map((s) => ({ ...s, r: cat.recipes.find((r) => r.id === s.id) })).filter((s) => s.r) : []), [cat]);
  const scrollFeel = (e) => { e.preventDefault(); document.getElementById("feel")?.scrollIntoView({ behavior: "smooth" }); };

  useGSAP(() => {
    if (!cat.ready || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // signature move: the monument grows heavier as it leaves
    gsap.fromTo(".hx .wmk-t", { scale: 1 }, { scale: 0.93, ease: "none", transformOrigin: "50% 100%", scrollTrigger: { trigger: ".hx", start: "top top", end: "bottom top", scrub: true } });
    gsap.from(".hx .wgap img", { yPercent: 18, opacity: 0, duration: 1.1, ease: "power3.out", delay: 0.35 });
    gsap.utils.toArray(".px .oil").forEach((el) => {
      gsap.from(el.querySelector("img"), { y: 60, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } });
      gsap.from(el.querySelector(".cap"), { y: 16, opacity: 0, duration: 0.7, delay: 0.15, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 80%", once: true } });
    });
    gsap.from(".sx .pn", { y: 40, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.08, scrollTrigger: { trigger: ".sx .band", start: "top 85%", once: true } });
    gsap.from(".hw .slip .grp", { y: 18, opacity: 0, duration: 0.6, ease: "power3.out", stagger: 0.1, scrollTrigger: { trigger: ".hw .slip", start: "top 80%", once: true } });
    gsap.from(".cx h2 > span", { yPercent: 60, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.1, scrollTrigger: { trigger: ".cx", start: "top 70%", once: true } });
  }, { scope: root, dependencies: [cat.ready] });

  if (!cat.ready) return <Loading />;
  return (
    <div ref={root} className="home">
      {/* hero: the name across the middle, one bottle standing through it */}
      <section className="hx">
        <div className="hc">
          <p>{L("say")}</p>
          <a className="btn primary" href="#feel" onClick={scrollFeel}>{L("go")}</a>
        </div>
        <Wordmark as="h1" bottle="frankincense-essential-oil" label={pick("Grace 芳疗工作室 · 温哥华芳疗师手调精油", "Grace Aromatherapy · hand-mixed blends by a Vancouver aromatherapist")} />
        <div className="bl">{L("where")}</div>
        <nav className="br" aria-label={L("recipes")}><Link to="/oils">{L("oils")}</Link><Link to="/recipes">{L("recipes")}</Link></nav>
      </section>

      {/* about: pinned title, bottles pass behind it */}
      <section className="px" aria-labelledby="px-h">
        <div className="pin"><h2 id="px-h"><span>{L("ph1")}</span><span>{L("ph2")}</span></h2></div>
        <div className="flow">
          {OILS.map((o, k) => { const p = cat.byId[o.id]; return (
            <Link key={o.id} to={`/oils/${o.id}`} className={`oil ${k % 2 ? "r" : "l"}`}>
              <img src={cut(o.id)} alt={p ? pick(p.name_zh, p.name_en) : ""} width="400" height="900" loading="lazy" />
              <div className="cap"><b>{p ? name({ product: o.id }) : ""}</b><span className="soft">{p?.latin || (p && pick(p.name_en, p.name_zh))}</span><p>{pick(o.zh, o.en)}</p></div>
            </Link>); })}
        </div>
      </section>

      {/* showcase: band of unequal panels */}
      <section className="sx" id="feel" aria-labelledby="sx-h">
        <h2 id="sx-h">{L("sh")}</h2>
        <div className="band">
          {sig.map(({ r, grow }, k) => { const items = r.items.filter((i) => i.product).slice(0, 3); const max = Math.max(...items.map((i) => +i.drops || 0)); return (
            <div key={r.id} className={`pn ${k === 0 ? "first" : ""}`} style={{ "--g": grow }}>
              <Link to={`/recipes/${r.id}`} className="ttl">{pick(r.title_zh, r.title_en)}</Link>
              <div className="bots">{items.map((i) => <img key={i.product} src={cut(i.product)} alt={name(i)} width="400" height="900" loading="lazy" className={+i.drops === max ? "big" : ""} />)}</div>
              <div className="meta">
                <span className="soft">{items.map((i) => `${name(i)} ${i.drops}`).join(" · ")} {L("drops")}</span>
                <Link className="btn primary sm" to={`/recipes/${r.id}?mix=1`}>{L("mix")}</Link>
              </div>
            </div>); })}
        </div>
        <p className="scap soft">{L("scap")} <Link className="link" to="/recipes">{L("recipes")} →</Link></p>
      </section>

      {/* how it works: itinerary on a slip */}
      <section className="hw" aria-labelledby="hw-h">
        <div className="txt"><h2 id="hw-h"><span>{L("hh1")}</span><span>{L("hh2")}</span></h2><p className="soft">{L("hp")}</p></div>
        <div className="slip">
          {STEPS.map((g) => (
            <div key={g.h[1]} className="grp"><b>{pick(g.h[0], g.h[1])}</b>
              {g.rows.map(([a, b]) => <div key={a[1]} className="row"><span>{pick(a[0], a[1])}</span><i aria-hidden="true" /><span>{pick(b[0], b[1])}</span></div>)}
            </div>))}
          <div className="end"><span>{pick("手里一瓶为你调的油", "A bottle mixed for you")}</span><span>{pick("约 1 天", "about a day")}</span></div>
        </div>
      </section>

      {/* cta: the idea again, inverted */}
      <section className="cx" aria-labelledby="cx-h">
        <h2 id="cx-h"><span>{L("ch1")}</span><span>{L("ch2")}</span></h2>
        <div className="base"><p>{L("cs")}</p><a className="btn accent big" href="#feel" onClick={scrollFeel}>{L("go")}</a></div>
      </section>
    </div>
  );
}
