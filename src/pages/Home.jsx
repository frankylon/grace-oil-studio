import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLang } from "../i18n";
import { useCatalog } from "../ctx";
import { Loading, useProductName } from "../components";
import SplitText from "../rb/SplitText";
import AnimatedContent from "../rb/AnimatedContent";
import { allPhotos, generalPhotos, hasLocal, productImg, productPhotos } from "../img";
import { totalDrops } from "../util";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// 首页文案 [简体, English]
const C = {
  h1a: ["说出你的感受", "Tell us how you feel"],
  h1b: ["我们调好这一瓶", "we'll mix the bottle"],
  hzL: ["doTERRA 精油配方馆，150 款精油", "A doTERRA oil studio, 150 oils"],
  hzR: ["188 条按滴写好的配方，一键配油", "188 blends in drops, mixed on request"],
  go: ["按感受配油", "Find my blend"],
  i1: ["这里的配方，是按摩师每天手上在用的那几瓶。", "These are the blends our massage therapists reach for every day."],
  i2: ["每一条都按滴写清楚：几滴乳香、几滴薰衣草，配多少基底油，涂在哪里，一天几次。", "Each one is written out in drops: how much frankincense, how much lavender, how much carrier oil, where to apply it and how often."],
  i3: ["看中哪一条，按一下「配这瓶」，我们调好再通知你。", "Pick one, tap “Mix this for me”, and we'll let you know when it's ready."],
  i4: ["成为会员之后，每次配过什么、买过什么、身体有什么变化，都记在你自己的会员页里。", "As a member, every blend, every order and every change you notice is kept on your own page."],
  f1: ["款精油", "oils"], f2: ["条配方", "blends"], f3: ["种语言", "languages"],
  showH: ["今天哪里不舒服", "How do you feel today"],
  mix: ["配这瓶", "Mix this one"], see: ["看配方", "See the blend"],
  listH: ["配方", "Blends"], all: ["全部", "All"],
  v1: ["选", "Pick"], v1t: ["按感受选一条配方，或者把你的情况留言给我们。", "Pick a blend by how you feel, or tell us what's going on."],
  v2: ["调", "Mix"], v2t: ["按配方逐滴调好，瓶身写上你的名字和用法。", "We mix it drop by drop and label it with your name and how to use it."],
  v3: ["取", "Collect"], v3t: ["调好后通知你来取，或者寄到你家。", "We tell you when it's ready to collect, or send it to you."],
  v4: ["记", "Track"], v4t: ["每一瓶都记在你的会员页，用得怎样，下次再调整。", "Every bottle is saved on your member page, so the next one can be adjusted."],
  galH: ["每款精油都有一页", "Every oil, one page"],
  galT: ["香气、萃取部位、主要成分、官方用法和注意事项，还有用到它的配方。", "Aroma, plant part, constituents, official directions, cautions, and the blends that use it."],
  galGo: ["打开精油百科", "Open the oil library"],
  aboutH: ["按摩师每天用的配方", "Blends our therapists use daily"],
  a1h: ["为什么按滴来写", "Why we count in drops"], a1: ["同一款油，三滴和十滴是两回事。写清楚滴数和基底油，你自己在家也调得出同一瓶。", "Three drops and ten drops of the same oil are different blends. With drops and carrier written down, you can mix the same bottle at home."],
  a2h: ["你的记录，只有你看得到", "Your records are yours"], a2: ["会员页里有你的配油、购买和近况。要不要让推荐你的人看到，由你自己决定。", "Your member page holds your blends, purchases and notes. Whether the person who referred you can see them is up to you."],
  login: ["会员登入", "Member sign in"],
  ctaH: ["今天想配哪一瓶？", "Which bottle today?"], ctaT: ["选一种感受，看配方，按一下就提交。", "Pick a feeling, read the blend, tap once to send."], ctaF: ["10ml 滚珠瓶起配", "From a 10 ml roller"],
};

const FEELINGS = [
  { tag: "肩颈", zh: "肩颈紧", en: "Tight shoulders", disc: "#2b3427" },
  { tag: "睡眠", zh: "睡不好", en: "Restless nights", disc: "#262b36" },
  { tag: "情绪", zh: "压力大", en: "Under pressure", disc: "#352b27" },
  { tag: "呼吸", zh: "呼吸不顺", en: "Stuffy breathing", disc: "#24332f" },
  { tag: "消化", zh: "肠胃不适", en: "Unsettled tummy", disc: "#33301f" },
  { tag: "肌肤", zh: "肌肤干燥", en: "Dry skin", disc: "#332529" },
];

const mainProduct = (r, byId) => {
  for (const i of r.items || []) { const p = i.product && byId[i.product]; if (p && hasLocal(p.id)) return p; }
  for (const i of r.items || []) { const p = i.product && byId[i.product]; if (p) return p; }
  return null;
};

function Shutter({ src, alt = "", className = "", eager }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("is-in"); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`shutter ${className}`}><img src={src} alt={alt} loading={eager ? "eager" : "lazy"} /></div>;
}

export default function Home() {
  const { pick, lang } = useLang();
  const cat = useCatalog();
  const L = (k) => pick(C[k][0], C[k][1]);
  const root = useRef(null);

  const data = useMemo(() => {
    if (!cat.ready) return null;
    const feel = FEELINGS.map((f) => {
      const rs = cat.recipes.filter((r) => r.tags?.includes(f.tag));
      const r = rs.find((x) => x.source === "grace") || rs.find((x) => mainProduct(x, cat.byId) && hasLocal(mainProduct(x, cat.byId).id)) || rs[0];
      return r ? { ...f, r, p: mainProduct(r, cat.byId) } : null;
    }).filter(Boolean);
    const hero = cat.byId["frankincense-essential-oil"] && hasLocal("frankincense-essential-oil") ? cat.byId["frankincense-essential-oil"] : cat.products.find((p) => hasLocal(p.id) && p.kind === "single") || cat.products[0];
    const back = ["lavender-oil", "deep-blue", "on-guard-blend", "peppermint-essential-oil"].map((id) => cat.byId[id]).find((p) => p && hasLocal(p.id)) || hero;
    const singles = cat.products.filter((p) => p.kind === "single" && hasLocal(p.id));
    const gal = singles.slice(0, 7);
    const cats = ["肌肉骨骼", "神经系统", "日常养护", "皮肤"].map((id) => cat.catById[id]).filter(Boolean).map((c) => ({ c, rs: cat.recipes.filter((r) => r.cat === c.id).slice(0, 6), n: cat.recipes.filter((r) => r.cat === c.id).length }));
    const photos = allPhotos();
    const g = generalPhotos();
    return { feel, hero, back, gal, galN: singles.length, cats, photos: [...g, ...photos] };
  }, [cat]);

  useGSAP(() => {
    if (!data || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.utils.toArray(".h-list .mi").forEach((el, i) => gsap.from(el, { y: 24, opacity: 0, duration: 0.7, ease: "power3.out", delay: (i % 2) * 0.07, scrollTrigger: { trigger: el, start: "top 92%", once: true } }));
    gsap.utils.toArray(".verb img").forEach((el) => gsap.fromTo(el, { scale: 1.12 }, { scale: 1, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true } }));
    gsap.from(".h-hero .object img", { y: 80, duration: 1.4, ease: "power3.out" });
    gsap.from(".h-hero .horizon > *", { opacity: 0, y: 16, duration: 0.8, stagger: 0.09, delay: 0.5, ease: "power2.out" });
  }, { scope: root, dependencies: [!!data] });

  if (!data) return <Loading />;
  return (
    <div ref={root}>
      <Hero data={data} L={L} lang={lang} />
      <Intro L={L} cat={cat} />
      <Showcase data={data} L={L} />
      <MenuList data={data} L={L} />
      <Verbs data={data} L={L} />
      <Gallery data={data} L={L} />
      <About data={data} L={L} />
      <Cta data={data} L={L} />
    </div>
  );
}

function Hero({ data, L, lang }) {
  const go = () => document.getElementById("feel")?.scrollIntoView({ behavior: "smooth" });
  return (
    <section className="h-hero">
      <div className="sky wrap">
        <h1 aria-label={L("h1a") + " " + L("h1b")}>
          <span><SplitText key={lang + "a"} tag="span" text={L("h1a")} splitType="chars" delay={lang === "en" ? 22 : 60} duration={1} textAlign="center" /></span>
          <span><SplitText key={lang + "b"} tag="span" text={L("h1b")} splitType="chars" delay={lang === "en" ? 22 : 60} duration={1} textAlign="center" /></span>
        </h1>
      </div>
      <p className="horizon wrap"><span className="l">{L("hzL")}</span><span className="gapx" aria-hidden="true" /><span className="r">{L("hzR")}</span></p>
      <div className="object"><img src={productImg(data.hero)} alt={data.hero.name_en} width="900" height="900" /></div>
      <div className="go"><button className="btn primary" onClick={go}>{L("go")}</button></div>
    </section>
  );
}

function Intro({ L, cat }) {
  return (
    <section className="h-intro wrap" aria-label="intro">
      <AnimatedContent className="col" distance={28} duration={0.9}>
        <p>{L("i1")}</p><p>{L("i2")}</p><p>{L("i3")}</p><p>{L("i4")}</p>
      </AnimatedContent>
      <AnimatedContent className="facts" distance={28} duration={0.9} delay={0.15}>
        <span><b>{cat.products.length}</b> {L("f1")}</span>
        <span><b>{cat.recipes.length}</b> {L("f2")}</span>
        <span><b>3</b> {L("f3")}</span>
      </AnimatedContent>
    </section>
  );
}

function Showcase({ data, L }) {
  const { pick } = useLang();
  const name = useProductName();
  const [i, setI] = useState(0);
  const [fade, setFade] = useState(false);
  const f = data.feel[i];
  const choose = (k) => { if (k === i) return; setFade(true); setTimeout(() => { setI(k); setFade(false); }, 160); };
  const img = f?.p ? productImg(f.p) : null;
  if (!f) return null;
  return (
    <section className="h-show" id="feel">
      <div className="wrap">
        <div className="stage">
          <div className="vis">
            <div className="disc" style={{ background: f.disc }} />
            {img && <div className="bottle" style={{ opacity: fade ? 0 : 1 }}><img src={img} alt={f.p?.name_en || ""} /></div>}
          </div>
          <div className="names" role="group" aria-label={L("showH")}>
            <h2>{L("showH")}</h2>
            {data.feel.map((x, k) => <button key={x.tag} aria-pressed={k === i} onClick={() => choose(k)}>{pick(x.zh, x.en)}</button>)}
          </div>
          <div className="fact" style={{ opacity: fade ? 0 : 1, transition: "opacity .3s" }}>
            <h3>{pick(f.r.title_zh, f.r.title_en)}</h3>
            <ul>{(f.r.items || []).slice(0, 6).map((it, k) => <li key={k}><span>{name(it)}</span><span>{it.drops ?? ""}</span></li>)}</ul>
            {f.r.usage_zh && <p className="u">{pick(f.r.usage_zh, f.r.usage_en)}</p>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn primary" to={`/recipes/${f.r.id}?mix=1`}>{L("mix")}</Link>
              <Link className="btn" to={`/recipes/${f.r.id}`}>{L("see")}</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MenuList({ data, L }) {
  const { pick } = useLang();
  const cat = useCatalog();
  return (
    <section className="h-list wrap">
      <h2>{L("listH")}</h2>
      {data.cats.map(({ c, rs, n }) => (
        <div className="cat" key={c.id}>
          <div className="cat-h"><h3>{pick(c.zh, c.en)}</h3><Link className="link" to={`/recipes?cat=${encodeURIComponent(c.id)}`}>{L("all")} {n}</Link></div>
          <div className="menu">{rs.map((r) => { const p = mainProduct(r, cat.byId); const src = productImg(p); return (
            <Link key={r.id} to={`/recipes/${r.id}`} className="mi">
              <span className="ph">{src && <img src={src} alt="" loading="lazy" />}</span>
              <span><span className="t"><span>{pick(r.title_zh, r.title_en)}</span><span>{totalDrops(r.items) || ""}{totalDrops(r.items) ? (pick(" 滴", " drops")) : ""}</span></span>
                <p>{pick(r.usage_zh, r.usage_en)}</p></span>
            </Link>); })}</div>
        </div>
      ))}
    </section>
  );
}

function Verbs({ data, L }) {
  const ph = data.photos;
  const pics = [ph[0], ph[3], ph[6], ph[9]].map((x, k) => x || ph[k]);
  return (
    <section className="h-verbs" aria-label={[L("v1"), L("v2"), L("v3"), L("v4")].join(" ")}>
      {["v1", "v2", "v3", "v4"].map((v, k) => (
        <div className="verb" key={v}>
          {pics[k] && <img src={pics[k]} alt="" loading="lazy" />}
          <div className="scrim" />
          <h2 className="w">{L(v)}</h2>
          <p className="cap">{L(v + "t")}</p>
        </div>
      ))}
    </section>
  );
}

function Gallery({ data, L }) {
  const { pick } = useLang();
  const catalog = useCatalog();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => { if (!document.hidden) setN((x) => (x + 1) % data.gal.length); }, 3000);
    return () => clearInterval(t);
  }, [data.gal.length]);
  const cur = data.gal[n];
  return (
    <section className="h-gal wrap">
      <AnimatedContent className="txt" distance={24}>
        <h2 style={{ fontSize: "clamp(1.8rem,1.2rem + 1.8vw,2.8rem)" }}>{L("galH")}</h2>
        <p className="muted">{L("galT")}</p>
        <Link className="btn ink" to="/oils" style={{ alignSelf: "flex-start" }}>{L("galGo")}</Link>
      </AnimatedContent>
      <div>
        <div className="frame" onClick={() => setN((x) => (x + 1) % data.gal.length)} role="button" tabIndex={0} aria-label="next" onKeyDown={(e) => e.key === "Enter" && setN((x) => (x + 1) % data.gal.length)}>
          {data.gal.map((p, k) => <img key={p.id} src={productImg(p)} alt={p.name_en} className={k === n ? "on" : ""} loading="lazy" />)}
        </div>
        <p className="cap">{cur && <><Link to={`/oils/${cur.id}`} className="link">{pick(cur.name_zh, cur.name_en)}</Link>{` · ${cur.size} · ${cur.wholesale}`}</>}</p>
      </div>
      <div className="side"><b>{catalog.products.length}</b><span className="muted">{pick("款，可以按感受、类型和按摩用途来找", "oils, by feeling, type or massage use")}</span></div>
    </section>
  );
}

function About({ data, L }) {
  const pic = data.photos[2] || data.photos[0];
  return (
    <section className="h-about">
      <div className="l">
        <h2>{L("aboutH")}</h2>
        {pic && <div className="shape"><img src={pic} alt="" loading="lazy" /></div>}
      </div>
      <div className="r">
        <AnimatedContent className="blk" distance={24}><h3>{L("a1h")}</h3><p>{L("a1")}</p></AnimatedContent>
        <AnimatedContent className="blk" distance={24} delay={0.1}><h3>{L("a2h")}</h3><p>{L("a2")}</p></AnimatedContent>
        <Link className="btn primary" to="/login" style={{ alignSelf: "flex-start" }}>{L("login")}</Link>
        {pic && <div className="shape mshape"><img src={pic} alt="" loading="lazy" /></div>}
      </div>
    </section>
  );
}

function Cta({ data, L }) {
  const go = () => document.getElementById("feel")?.scrollIntoView({ behavior: "smooth" });
  return (
    <section className="h-cta">
      <div className="obj">{data.back && <img src={productImg(data.back)} alt="" loading="lazy" />}</div>
      <div className="txt">
        <h2>{L("ctaH")}</h2>
        <p>{L("ctaT")}</p>
        <p style={{ fontSize: "1.375rem" }}>{L("ctaF")}</p>
        <button className="btn" onClick={go}>{L("go")}</button>
      </div>
    </section>
  );
}
