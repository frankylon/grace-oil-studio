import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLang } from "../i18n";
import { useAuth, useCatalog } from "../ctx";
import { BlendRequest, DropList, Flags, Loading, ProductCard, ProductImage, RecipeCard, cleanName, useProductName } from "../components";
import recipeContent from "../data/recipe_content.json";
import photoLib from "../data/photo_lib.json";
import OC from "../data/oil_content.json";
import OT from "../data/oil_text.json";
import { carrierMl, dilutionPct, owns, totalDrops } from "../util";
import { productImg, productPhotos, hasLocal } from "../img";

const KINDS = ["single", "blend", "touch", "spa", "carrier"];

function useSearchText() {
  const { cv } = useLang();
  return (s) => String(s || "").toLowerCase();
}
function matchProduct(p, q, cat) {
  if (!q) return true;
  const hay = [p.name_zh, p.name_en, p.latin, p.aroma, p.claims_zh, p.claims_en, ...(p.pains || []).map((x) => (cat.painById[x]?.zh || "") + (cat.painById[x]?.en || "")), ...(p.scenes || [])].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}
function matchRecipe(r, q, cat) {
  if (!q) return true;
  const c = cat.catById[r.cat];
  const hay = [r.title_zh, r.title_en, r.usage_zh, r.usage_en, c?.zh, c?.en, ...(r.tags || []), ...(r.items || []).map((i) => i.oil + " " + (cat.byId[i.product]?.name_en || "") + " " + (cat.oils?.[i.oil] || ""))].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export function Search() {
  const { t } = useLang();
  const cat = useCatalog();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "";
  if (!cat.ready) return <Loading />;
  const ps = cat.products.filter((p) => matchProduct(p, q, cat));
  const rs = cat.recipes.filter((r) => matchRecipe(r, q, cat));
  return (
    <>
      <form className="searchbar" style={{ maxWidth: 720 }} onSubmit={(e) => e.preventDefault()}>
        <input id="sq" type="search" value={q} placeholder={t("search_ph")} onChange={(e) => setSp({ q: e.target.value }, { replace: true })} />
      </form>
      <section className="section">
        <div className="section-head"><h2>{t("nav_recipes")}</h2><span className="muted">{rs.length} {t("results")}</span></div>
        {rs.length ? <div className="rcards">{rs.slice(0, 24).map((r) => <RecipeCard key={r.id} r={r} />)}</div> : <p className="muted">{t("no_results")}</p>}
      </section>
      <section className="section">
        <div className="section-head"><h2>{t("nav_oils")}</h2><span className="muted">{ps.length} {t("results")}</span></div>
        {ps.length ? <div className="cards">{ps.slice(0, 40).map((p) => <ProductCard key={p.id} p={p} />)}</div> : <p className="muted">{t("no_results")}</p>}
      </section>
    </>
  );
}

function FilterRow({ label, hint, items, value, onPick }) {
  return (
    <div className="frow">
      <div className="frow-l"><b>{label}</b>{hint && <span>{hint}</span>}</div>
      <div className="seg2 wrap">{items.map(([k, l, n]) => <button key={k || "all"} type="button" aria-pressed={value === k} onClick={() => onPick(value === k ? "" : k)}>{l}{n != null && <i>{n}</i>}</button>)}</div>
    </div>
  );
}

export function Oils() {
  const { t, pick } = useLang();
  const cat = useCatalog();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "", kind = sp.get("kind") || "", pain = sp.get("pain") || "";
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  if (!cat.ready) return <Loading />;
  const base = cat.products.slice().sort((a, b) => (hasLocal(b.id) ? 1 : 0) - (hasLocal(a.id) ? 1 : 0)).filter((p) => matchProduct(p, q, cat));
  const list = base.filter((p) => (!kind || p.kind === kind) && (!pain || p.pains?.includes(pain)));
  const kCount = (k) => base.filter((p) => p.kind === k && (!pain || p.pains?.includes(pain))).length;
  const pCount = (id) => base.filter((p) => p.pains?.includes(id) && (!kind || p.kind === kind)).length;
  const active = [kind && t("kind_" + kind), pain && pick(cat.painById[pain]?.zh, cat.painById[pain]?.en)].filter(Boolean);
  return (
    <>
      <div className="fhead">
        <div><h1 className="page-title">{t("all_oils")}</h1><p className="muted">{pick("先选类型，再选你想改善的感受。不确定适合哪一款，直接问 Grace。", "Pick a type, then how you'd like to feel. Not sure which suits you? Ask Grace.")}</p></div>
        <input id="oq" type="search" placeholder={pick("搜索精油名字、香气", "Search oils, scents")} value={q} onChange={(e) => set("q", e.target.value)} />
      </div>
      <div className="fbar">
        <FilterRow label={pick("我想找", "I'm looking for")} items={[["", t("kind_all")], ...KINDS.map((k) => [k, t("kind_" + k), kCount(k)])]} value={kind} onPick={(v) => set("kind", v)} />
        <FilterRow label={pick("想改善的感受", "How I'd like to feel")} hint={pick("可以和上面一起选", "combine with the row above")} items={cat.pains.map((p) => [p.id, pick(p.zh, p.en), pCount(p.id)]).filter((x) => x[2] > 0)} value={pain} onPick={(v) => set("pain", v)} />
      </div>
      <div className="fsum"><span>{active.length ? <>{pick("正在看", "Showing")}：<b>{active.join(" · ")}</b> · </> : null}{list.length} {pick("款", "oils")}</span>
        {(kind || pain || q) && <button type="button" className="btn ghost sm" onClick={() => setSp({}, { replace: true })}>{pick("清除筛选", "Clear filters")}</button>}</div>
      {list.length ? <div className="cards">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <div className="empty">{t("no_results")}</div>}
      <AskGrace />
    </>
  );
}

export function AskGrace({ title, body }) {
  const { pick } = useLang();
  return (
    <div className="block ask-box"><div><h2>{title || pick("不知道选哪一款？", "Not sure which to choose?")}</h2><p className="muted">{body || pick("Grace 是你的私人芳疗师。告诉她你的情况，她会帮你找到合适的精油和用法，大多数日常困扰都可以一步步调理。", "Grace is your personal aromatherapist. Tell her how you are and she'll find the right oils and way to use them; most everyday concerns can be eased step by step.")}</p></div>
      <button className="btn primary" onClick={() => window.dispatchEvent(new Event("open-consult"))}>{pick("请 Grace 为我调配", "Ask Grace to blend for me")}</button></div>
  );
}

function Paras({ text }) {
  const parts = String(text || "").split(/\n+|(?<=。)\s+/).map((s) => s.trim()).filter(Boolean);
  return <div className="prose">{parts.map((p, i) => <p key={i}>{p}</p>)}</div>;
}
function Tips({ text }) {
  const parts = String(text || "").split(/(?<=[。.!！])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return <Paras text={text} />;
  return <ul className="tiplist prose">{parts.map((p, i) => <li key={i}>{p}</li>)}</ul>;
}

export function OilDetail() {
  const { id } = useParams();
  const { t, pick, lang, cv } = useLang();
  const cat = useCatalog();
  if (!cat.ready) return <Loading />;
  const p = cat.byId[id];
  if (!p) return <div className="empty">{t("no_results")}</div>;
  const O = OC[p.id] || {};
  const T = (OT[p.id] || {})[lang === "en" ? "en" : "zh"] || {};
  const S = (k) => pick(O[k + "_zh"], O[k + "_en"]);
  const recipes = [...(cat.recipesByProduct[p.id] || [])].map((rid) => cat.recipes.find((r) => r.id === rid)).filter(Boolean);
  const nm = cleanName(pick(p.name_zh, p.name_en));
  const short = lang === "en" ? nm.replace(/\s*(Essential Oil Blend|Oil Blend|Essential Oil|Oil)$/i, "") : nm.replace(/(复方)?精油$/, "");
  const F = (k) => pick(p[k], p[k + "_en"]);
  const facts = [["latin", p.latin], ["aroma", F("aroma")], ["part", F("part")], ["extraction", F("extraction")], ["constituents", F("constituents")], ["size", p.size], ["retail", p.retail], ["wholesale", p.wholesale]].filter(([, v]) => v && !/不适用|n\/a/i.test(v));
  const im = oilImgs(p, cat);
  const url = lang === "en" ? p.url_en : p.url_zh || p.url_en;
  const secs = [
    ["scent", pick("闻起来", "The scent"), [S("scent"), F("aroma") && pick(`香调：${F("aroma")}`, `Notes: ${F("aroma")}`), F("part") && pick(`取自${F("part")}${F("extraction") ? "，" + F("extraction") : ""}。`, `From the ${F("part")}${F("extraction") ? ", " + F("extraction") : ""}.`)].filter(Boolean)],
    ["benefit", pick("它能为你做什么", "What it does for you"), [S("benefit")].filter(Boolean)],
    ["use", pick("日常可以这样用", "Everyday ways to use it"), [S("use")].filter(Boolean)],
  ].filter((x) => x[2].length);
  return (
    <>
      <div className="crumbs"><Link to="/oils">{t("nav_oils")}</Link><span>/</span><span>{nm}</span></div>
      <div className="od-hero">
        <div className={`od-img ${hasLocal(p.id) ? "" : "flat"}`}><ProductImage p={p} big /></div>
        <div className="od-txt">
          <h1>{nm}</h1>
          <p className="muted od-sub">{lang === "en" ? cleanName(cv(p.name_zh)) : cleanName(p.name_en)}{p.latin ? ` · ${p.latin}` : ""}</p>
          <p className="muted small">{[t("kind_" + p.kind), p.nhp ? t("nhp") : "", p.size, p.wholesale ? `${t("wholesale")} ${p.wholesale}` : ""].filter(Boolean).join(" · ")}</p>
          {!!p.pains?.length && <div className="chips" style={{ marginTop: 14 }}>{p.pains.slice(0, 6).map((x) => <Link key={x} className="chip" to={`/oils?pain=${x}`}>{pick(cat.painById[x]?.zh, cat.painById[x]?.en)}</Link>)}</div>}
          <div className="acts" style={{ marginTop: 22 }}>
            <button className="btn primary" onClick={() => window.dispatchEvent(new Event("open-consult"))}>{pick(`请 Grace 用${short}为我调配`, `Ask Grace to blend with ${short}`)}</button>
            {recipes.length > 0 && <a className="btn" href="#od-recipes">{pick(`${recipes.length} 条相关配方`, `${recipes.length} related blends`)}</a>}
          </div>
        </div>
      </div>

      <div className={`rd-secs ${secs.length === 3 ? "three" : ""}`}>
        {secs.map(([k, h, paras], n) => (
          <section key={k} className={`rd-sec ${n % 2 ? "flip" : ""}`}>
            <Pic im={im[k]} ratio="32" />
            <div className="tx"><h2>{h}</h2><div className="prose">{paras.map((x, i) => <p key={i}>{cv(x)}</p>)}</div></div>
          </section>))}
      </div>

      <AskGrace title={pick("Grace 的建议", "A note from Grace")} body={[S("grace"), pick(`每个人的体质不同，${short}适不适合你、怎么搭配、用多少，Grace 会按你的情况帮你判断。她是你的随身私人芳疗师，大多数日常困扰都可以用精油一步步找到方案。`, `Everyone is different. Grace will tell you whether ${short} suits you, what to pair it with and how much to use. She's your personal aromatherapist; most everyday concerns can be eased step by step.`)].filter(Boolean).map(cv).join(" ")} />

      {T.caution && <div className="block od-caut"><h2>{pick("使用前请留意", "Before you use it")}</h2><p className="muted">{cv(T.caution)}</p></div>}
      {facts.length > 0 && <div className="block"><h2>{pick("基本资料", "At a glance")}</h2><dl className="facts">{facts.map(([k, v]) => <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>)}</dl></div>}
      {recipes.length > 0 && <div className="block" id="od-recipes"><h2>{pick(`用到${short}的配方`, `Blends with ${short}`)}</h2><div className="rcards">{recipes.slice(0, 12).map((r) => <RecipeCard key={r.id} r={r} />)}</div>{recipes.length > 12 && <p style={{ marginTop: 14 }}><Link className="link" to={`/recipes?q=${encodeURIComponent(pick(p.name_zh.replace(/精油.*$/, ""), short))}`}>{pick("看全部", "See all")} →</Link></p>}</div>}
      {url && <p className="block small"><a href={url} target="_blank" rel="noreferrer">{t("official_page")} ↗</a></p>}
    </>
  );
}

export function Recipes() {
  const { t, pick } = useLang();
  const cat = useCatalog();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "", c = sp.get("cat") || "", tag = sp.get("tag") || "";
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const tags = useMemo(() => {
    if (!cat.ready) return [];
    const m = new Map(); cat.recipes.forEach((r) => (r.tags || []).forEach((x) => m.set(x, (m.get(x) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([x]) => x);
  }, [cat]);
  if (!cat.ready) return <Loading />;
  const list = cat.recipes.filter((r) => (!c || r.cat === c) && (!tag || r.tags?.includes(tag)) && matchRecipe(r, q, cat));
  const tagEn = (x) => cat.tagsEn?.[x] || x;
  const cCount = (id) => cat.recipes.filter((r) => r.cat === id && (!tag || r.tags?.includes(tag)) && matchRecipe(r, q, cat)).length;
  const tCount = (x) => cat.recipes.filter((r) => r.tags?.includes(x) && (!c || r.cat === c) && matchRecipe(r, q, cat)).length;
  const active = [c && pick(cat.catById[c]?.zh, cat.catById[c]?.en), tag && pick(tag, tagEn(tag))].filter(Boolean);
  return (
    <>
      <div className="fhead">
        <div><h1 className="page-title">{t("all_recipes")}</h1><p className="muted">{pick("先选一个方向，再挑你在意的部位或场景。每条配方 Grace 都会按你的情况再调整。", "Pick a direction, then the area or moment you care about. Grace adjusts every blend to you.")}</p></div>
        <input id="rq" type="search" placeholder={pick("搜索配方、精油", "Search blends, oils")} value={q} onChange={(e) => set("q", e.target.value)} />
      </div>
      <div className="fbar">
        <FilterRow label={pick("调理方向", "Direction")} items={[["", t("kind_all")], ...cat.cats.map((x) => [x.id, pick(x.zh, x.en), cCount(x.id)]).filter((x) => x[2] > 0)]} value={c} onPick={(v) => set("cat", v)} />
        <FilterRow label={pick("部位与场景", "Area & moment")} hint={pick("可以和上面一起选", "combine with the row above")} items={tags.map((x) => [x, pick(x, tagEn(x)), tCount(x)]).filter((x) => x[2] > 0)} value={tag} onPick={(v) => set("tag", v)} />
      </div>
      <div className="fsum"><span>{active.length ? <>{pick("正在看", "Showing")}：<b>{active.join(" · ")}</b> · </> : null}{list.length} {pick("条配方", "blends")}</span>
        {(c || tag || q) && <button type="button" className="btn ghost sm" onClick={() => setSp({}, { replace: true })}>{pick("清除筛选", "Clear filters")}</button>}</div>
      {list.length ? <div className="rcards">{list.map((r) => <RecipeCard key={r.id} r={r} />)}</div> : <div className="empty">{t("no_results")}</div>}
      <AskGrace />
    </>
  );
}

const money$ = (v) => { const n = parseFloat(String(v || "").replace(/[^0-9.]/g, "")); return isNaN(n) ? 0 : n; };
const RC = recipeContent;
const LIB = photoLib;
// 配图：从 Unsplash 图库按主题挑，同一页四段各不相同
const hash = (x) => [...String(x)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function poolFor(keys) { const out = []; for (const k of keys) for (const x of LIB.pools?.[k] || []) if (!out.includes(x)) out.push(x); return out; }
function plantFor(ids, h) { for (const id of ids) { const ks = LIB.byOil?.[id]; if (ks?.length) return LIB.items[ks[h % ks.length]]; } return null; }
function recipeImgs(r, ids) {
  const themes = [...(r.tags || []).map((t) => LIB.byTag?.[t]), LIB.byCat?.[r.cat]].filter(Boolean);
  const pool = poolFor(themes.length ? themes : ["mood"]);
  const h = hash(r.id), at = (i) => LIB.items[pool[(h + i) % pool.length]];
  const work = LIB.pools?.work || [];
  return { benefit: at(0), scene: at(1), action: LIB.items[work[h % work.length]], scent: plantFor(ids, h) || at(2) };
}
const PAIN_THEME = [[/睡/, "sleep"], [/情绪|压力|焦虑|低落|开心/, "mood"], [/呼吸|鼻|喉|咳/, "breath"], [/肌肤|皮肤|痘|干燥/, "skin"], [/肩|颈|肌肉|关节|腰|背|腿|足|疲劳/, "massage"], [/消化|腹|胃|肠/, "belly"], [/头|专注|精神|提神/, "focus"], [/冷|温热|换季/, "season"]];
export function oilImgs(p, cat) {
  const th = [];
  for (const id of p.pains || []) { const z = cat.painById?.[id]?.zh || ""; for (const [re, k] of PAIN_THEME) if (re.test(z) && !th.includes(k)) th.push(k); }
  if (["spa", "touch"].includes(p.kind)) th.push("skin");
  const pool = poolFor(th.length ? th : ["mood", "massage"]);
  const h = hash(p.id), at = (i) => LIB.items[pool[(h + i) % pool.length]];
  const work = LIB.pools?.work || [];
  return { scent: plantFor([p.id], h) || at(2), benefit: at(0), use: LIB.items[work[h % work.length]] };
}
function Pic({ im, ratio = "45" }) {
  if (!im) return null;
  return <figure className={`pic r${ratio}`}><img src={im.src} alt={im.alt || ""} loading="lazy" />{im.credit && <figcaption>{im.credit}</figcaption>}</figure>;
}

export function RecipeDetail() {
  const { id } = useParams();
  const { t, pick, cv } = useLang();
  const cat = useCatalog();
  const { owned } = useAuth();
  const [sp] = useSearchParams();
  const [ask, setAsk] = useState(sp.get("mix") === "1" ? { kind: "blend" } : null);
  const [opt, setOpt] = useState("blend");
  const [hot, setHot] = useState(-1);
  const name = useProductName();
  if (!cat.ready) return <Loading />;
  const r = cat.recipes.find((x) => x.id === id);
  if (!r) return <div className="empty">{t("no_results")}</div>;
  const C = RC[r.id] || {};
  const title = pick(C.title_zh || r.title_zh, C.title_en || r.title_en);
  const c = cat.catById[r.cat];
  const ml = r.carrier_ml || carrierMl(r.carrier);
  const pct = dilutionPct(r.items, ml);
  const ids = [...new Set([...(r.items || []), ...((r.alt_items || []).flat())].map((i) => i.product).filter(Boolean))];
  const oils = ids.map((x) => cat.byId[x]).filter(Boolean);
  const main = (r.items || []).filter((i) => i.product && cat.byId[i.product]);
  const maxD = Math.max(1, ...main.map((i) => +i.drops || 0));
  const kit = main.map((i) => ({ product: i.product, oil: cleanName(cat.byId[i.product].name_zh), price: money$(cat.byId[i.product].wholesale) }));
  const kitTotal = kit.reduce((a, x) => a + x.price, 0);
  const missing = owned ? kit.filter((k) => !owns(owned, { product: k.product, oil: k.oil }, cat.byId[k.product])) : null;
  // 同样这几支油还能怎么配：共用 2 支以上的配方，以及两两配对
  const share = cat.recipes.filter((x) => x.id !== r.id).map((x) => ({ x, n: (x.items || []).filter((i) => ids.includes(i.product)).length })).filter((o) => o.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6);
  const pairs = [];
  for (let i = 0; i < main.length; i++) for (let j = i + 1; j < main.length; j++) {
    const a = main[i].product, b = main[j].product;
    const hits = cat.recipes.filter((x) => x.id !== r.id && (x.items || []).some((k) => k.product === a) && (x.items || []).some((k) => k.product === b)).slice(0, 3);
    pairs.push({ a, b, hits });
  }
  const scentLine = main.map((i) => { const p = cat.byId[i.product]; const ar = pick(p.aroma, p.aroma_en); return ar ? `${name(i)}：${ar}` : null; }).filter(Boolean);
  const S = (k) => pick(C[k + "_zh"], C[k + "_en"]);
  const secs = [
    ["benefit", pick("它能为你做什么", "What it does for you"), S("benefit")],
    ["scene", pick("什么时候用、怎么用", "When and how to use it"), [S("scene"), pick(r.usage_zh, r.usage_en)].filter(Boolean).join("\n")],
    ["action", pick("为什么这样配", "Why these oils together"), S("action")],
    ["scent", pick("闻起来是什么感觉", "How it smells"), S("scent") || scentLine.join("；")],
  ].filter((x) => x[2]);
  const rt = (txt) => cv(txt).split(/\n+/).map((p, i) => <p key={i}>{p}</p>);
  const imgs = recipeImgs(r, main.map((i) => i.product));
  return (
    <>
      <div className="crumbs"><Link to="/recipes">{t("nav_recipes")}</Link><span>/</span>{c && <><Link to={`/recipes?cat=${encodeURIComponent(c.id)}`}>{pick(c.zh, c.en)}</Link><span>/</span></>}<span>{title}</span></div>
      <div className="rd-hero">
        <div className="rd-l">
          <h1>{title}</h1>
          {S("tagline") && <p className="rd-tag">{S("tagline")}</p>}
          <div className="rd-bots" onMouseLeave={() => setHot(-1)}>
            {main.map((i, k) => { const p = cat.byId[i.product]; const src = productImg(p); return (
              <Link key={i.product} to={`/oils/${i.product}`} className={`rb ${hot === k ? "on" : hot >= 0 ? "off" : ""}`} style={{ "--h": 0.62 + 0.38 * ((+i.drops || maxD * 0.6) / maxD) }} onMouseEnter={() => setHot(k)} onFocus={() => setHot(k)}>
                <span className={`rb-i ${hasLocal(i.product) ? "" : "flat"}`}>{src ? <img src={src} alt={cleanName(pick(p.name_zh, p.name_en))} referrerPolicy="no-referrer" /> : null}</span>
                <span className="rb-n">{name(i)}</span>
              </Link>); })}
          </div>
          <div className="chips">{(r.tags || []).map((x) => <Link key={x} className="chip" to={`/recipes?tag=${encodeURIComponent(x)}`}>{pick(x, cat.tagsEn?.[x])}</Link>)}</div>
        </div>
        <aside className="rd-buy">
          <h2>{pick("想要这一瓶？", "Want this one?")}</h2>
          <div className="opt" role="radiogroup" aria-label={pick("购买方式", "How to buy")}>
            <button type="button" role="radio" aria-checked={opt === "blend"} onClick={() => setOpt("blend")}><b>{pick("调好的配方油", "The finished blend")}</b><span>{pick("Grace 按你的情况调整后调好，装成滚珠或喷雾", "Grace adjusts it to you and blends it into a roller or spray")}</span><em>{pick("价格由 Grace 确认", "Price confirmed by Grace")}</em></button>
            {kit.length > 1 && <button type="button" role="radio" aria-checked={opt === "kit"} onClick={() => setOpt("kit")}><b>{pick(`单方套组 · ${kit.length} 支`, `Oil set · ${kit.length} oils`)}</b><span>{kit.map((k) => k.oil).join("、")}</span><em>{pick("会员价合计", "Member total")} CA ${kitTotal.toFixed(2)}</em>{missing && missing.length < kit.length && <span className="small">{pick(`你已有 ${kit.length - missing.length} 支`, `You already own ${kit.length - missing.length}`)}</span>}</button>}
          </div>
          <button className="btn primary" onClick={() => setAsk(opt === "kit" ? { kind: "kit", items: kit, total: `CA $${kitTotal.toFixed(2)}` } : { kind: "blend" })}>{opt === "kit" ? pick("订购套组", "Order the set") : pick("订购配方油", "Order the blend")}</button>
          <p className="small muted">{pick("下单后 Grace 会联系你确认用量、付款和取货。想先聊聊再决定，也可以直接问她。", "Grace will contact you to confirm, take payment and arrange pickup. Want to talk first? Just ask her.")}</p>
          <button className="btn ghost sm" onClick={() => window.dispatchEvent(new Event("open-consult"))}>{pick("先问问 Grace", "Ask Grace first")}</button>
        </aside>
      </div>

      <div className="rd-secs">
        {secs.map(([k, h, txt], n) => (
          <section key={k} className={`rd-sec ${n % 2 ? "flip" : ""}`}>
            <Pic im={imgs[k]} ratio="32" />
            <div className="tx"><h2>{h}</h2><div className="prose">{rt(txt)}</div></div>
          </section>))}
      </div>

      <section className="block rd-formula">
        <h2>{pick("参考配方", "Reference formula")}</h2>
        <p className="muted small">{pick("这是 Grace 常用的比例，实际调配时会按你的情况调整。", "The ratio Grace often uses; she adjusts it to you when blending.")}</p>
        {r.choose && <p className="muted small">{t("choose_one")} · {r.choose.drops} {t("drops")}</p>}
        <DropList items={r.items} owned={owned} />
        {(r.alt_items || []).map((a, i) => <div key={i} style={{ marginTop: 14 }}><p className="muted small" style={{ margin: "0 0 6px" }}>{t("or_alt")}</p><DropList items={a} owned={owned} /></div>)}
        <div className="small muted" style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {r.carrier && <span>{t("carrier")}: {cv(r.carrier)}</span>}
          {pct != null && <span>{t("dilution")} {pct}%</span>}
        </div>
        {!!r.flags?.length && <div style={{ marginTop: 14 }}><Flags flags={r.flags} /></div>}
      </section>

      {(share.length > 0 || pairs.some((p) => p.hits.length)) && <section className="block">
        <h2>{pick("同样这几支油，还可以这样配", "The same oils, other ways")}</h2>
        {pairs.some((p) => p.hits.length) && <div className="pairs">{pairs.filter((p) => p.hits.length).map((p) => (
          <div key={p.a + p.b} className="pair">
            <div className="pair-b">{[p.a, p.b].map((x) => <span key={x} className={`rb-i ${hasLocal(x) ? "" : "flat"}`}>{productImg(cat.byId[x]) && <img src={productImg(cat.byId[x])} alt="" referrerPolicy="no-referrer" />}</span>)}</div>
            <b>{name({ product: p.a })} + {name({ product: p.b })}</b>
            {p.hits.map((x) => <Link key={x.id} className="link small" to={`/recipes/${x.id}`}>{pick(RC[x.id]?.title_zh || x.title_zh, RC[x.id]?.title_en || x.title_en)}</Link>)}
          </div>))}</div>}
        {share.length > 0 && <><h3 className="rd-h3">{pick("用到其中几支的配方", "Blends using several of these")}</h3><div className="rcards">{share.map(({ x }) => <RecipeCard key={x.id} r={x} />)}</div></>}
      </section>}

      <AskGrace title={pick("这条配方适合你吗？", "Is this blend right for you?")} body={pick("每个人的体质和状况不同。Grace 是你的随身私人芳疗师，告诉她你的情况，她会帮你调整用油和用法；大多数日常困扰，都可以通过精油一步步找到方案。", "Everyone is different. Grace is your personal aromatherapist: tell her how you are and she'll adjust the oils and how to use them. Most everyday concerns can be eased step by step.")} />
      <p className="notice block">{t("disclaimer")}</p>
      {oils.length > 0 && <div className="block"><h2>{pick("用到的精油", "Oils in this blend")}</h2><div className="cards">{oils.map((p) => <ProductCard key={p.id} p={p} />)}</div></div>}
      {ask && <BlendRequest recipe={{ ...r, title_zh: C.title_zh || r.title_zh, title_en: C.title_en || r.title_en }} order={ask} onClose={() => setAsk(null)} />}
    </>
  );
}
