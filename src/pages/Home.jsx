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
  say: ["温哥华芳疗师 Grace。先了解你的状况，再用 doTERRA 精油为你调配适合你的那一瓶。", "Grace, aromatherapist in Vancouver. She gets to know how you feel, then blends doTERRA oils into the bottle that suits you."],
  go: ["请 Grace 为我调配", "Ask Grace to blend for me"],
  where: ["温哥华 · 芳疗工作室", "Vancouver · aromatherapy studio"],
  oils: ["精油百科", "Oil library"], recipes: ["全部配方", "All blends"],
  ph1: ["认识", "Meet the"], ph2: ["主要精油", "key oils"],
  sh: ["为不同需要调配", "Blends for different needs"],
  scap: ["这些是 Grace 常用的配方，她会按你的情况再调整。", "These are blends Grace uses often; she adjusts each one to the person."],
  mix: ["为我调配", "Blend this for me"],
  hh1: ["从了解你", "From knowing you"], hh2: ["到一瓶油", "to one bottle"],
  hp: ["你不需要懂精油。告诉 Grace 你的状况，选油和调配交给她。", "You don't need to know oils. Tell Grace how you feel and leave the choosing and blending to her."],
  ch1: ["说说你的状况", "Tell Grace"], ch2: ["为你调配", "how you feel"],
  cs: ["调好会通知你来取，每次调配和使用进展都记在你的会员页。", "You'll hear when it's ready, and every blend and how it's going is kept on your member page."],
};

const OILS = [
  { id: "frankincense-essential-oil", zh: "取自乳香树脂，香气沉稳温和。护肤和放松类调配里最常用的一款，和大多数精油都很搭。", en: "From frankincense resin, with a calm, warm aroma. The oil Grace uses most in skin and relaxing blends; it pairs with almost everything." },
  { id: "roman-chamomile-oil-nhp", zh: "花香柔和带点苹果香，适合睡前和舒缓情绪的调配，也适合敏感的人。", en: "Soft, apple-like floral scent. Suited to evening and calming blends, and gentle enough for sensitive people." },
  { id: "ginger-essential-oil", zh: "取自姜根，带温热感。常用在肩颈、腰腹按摩油里，怕冷的人特别喜欢。", en: "From ginger root, with a warming feel. Often in shoulder and belly massage blends; people who feel the cold love it." },
  { id: "bergamot-essential-oil", zh: "柑橘里带花香，清新明亮。压力大、心情闷的时候，Grace 会用它让配方香气轻快起来。", en: "Citrus with a floral edge, bright and fresh. When life feels heavy, Grace adds it to lift the whole blend." },
];

const SIG = [
  { id: "r005", grow: 5 }, { id: "r134", grow: 2 }, { id: "r051", grow: 3 }, { id: "r112", grow: 2 },
];

const STEPS = [
  { h: ["了解", "Getting to know you"], rows: [[["告诉 Grace 你的状况和需要", "Tell Grace how you feel and what you need"], ["线上 / 到店", "online / in person"]], [["过敏、香味喜好一起说", "Mention allergies and scents you like"], ["几分钟", "a few min"]]] },
  { h: ["调配", "Blending"], rows: [[["挑选适合你的精油和浓度", "She picks the oils and strength for you"], ["当天", "same day"]], [["通知你来取，教你怎么用", "You collect it and learn how to use it"], ["到店", "in store"]]] },
  { h: ["跟进", "Follow-up"], rows: [[["调配记录存进会员页", "The blend is saved to your member page"], ["一直在", "kept"]], [["用后感受告诉 Grace，再调整", "Tell Grace how it went; she fine-tunes it"], ["随时", "any time"]]] },
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
  const scrollFeel = (e) => { e.preventDefault(); window.dispatchEvent(new Event("open-consult")); };

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
                <span className="soft">{items.map((i) => name(i)).join(" · ")}</span>
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
          <div className="end"><span>{pick("一瓶为你调配的精油", "A blend made for you")}</span><span>{pick("约 1 天", "about a day")}</span></div>
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
