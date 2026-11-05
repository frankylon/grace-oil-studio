import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLang } from "../i18n";
import { useAuth, useCatalog } from "../ctx";
import { BlendRequest, DropList, Flags, Loading, ProductCard, ProductImage, RecipeCard, useProductName } from "../components";
import { carrierMl, dilutionPct, totalDrops } from "../util";
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

export function Oils() {
  const { t, pick } = useLang();
  const cat = useCatalog();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "", kind = sp.get("kind") || "", pain = sp.get("pain") || "", mas = sp.get("m") || "";
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  if (!cat.ready) return <Loading />;
  const list = cat.products.slice().sort((a, b) => (hasLocal(b.id) ? 1 : 0) - (hasLocal(a.id) ? 1 : 0)).filter((p) => (!kind || p.kind === kind) && (!pain || p.pains?.includes(pain)) && (!mas || p.massage === mas) && matchProduct(p, q, cat));
  return (
    <div className="list-layout">
      <aside className="filters">
        <input id="oq" type="search" placeholder={t("search")} value={q} onChange={(e) => set("q", e.target.value)} />
        <div className="field"><span className="lab">{t("kind")}</span><div className="chips">
          <button className="chip" aria-pressed={!kind} onClick={() => set("kind", "")}>{t("kind_all")}</button>
          {KINDS.map((k) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => set("kind", kind === k ? "" : k)}>{t("kind_" + k)}</button>)}
        </div></div>
        <div className="field"><span className="lab">{t("feelings")}</span><div className="chips">
          {cat.pains.map((p) => <button key={p.id} className="chip" aria-pressed={pain === p.id} onClick={() => set("pain", pain === p.id ? "" : p.id)}>{pick(p.zh, p.en)}</button>)}
        </div></div>
        <div className="field"><span className="lab">{t("massage")}</span><div className="chips">
          {["高", "中", "低"].map((m, i) => <button key={m} className="chip" aria-pressed={mas === m} onClick={() => set("m", mas === m ? "" : m)}>{t(["high", "mid", "low"][i])}</button>)}
        </div></div>
      </aside>
      <section style={{ minWidth: 0 }}>
        <div className="section-head"><h1 className="page-title">{pain ? pick(cat.painById[pain]?.zh, cat.painById[pain]?.en) : t("all_oils")}</h1><span className="count">{list.length} {t("results")}</span></div>
        {list.length ? <div className="cards">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <div className="empty">{t("no_results")}</div>}
      </section>
    </div>
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
  const recipes = [...(cat.recipesByProduct[p.id] || [])].map((rid) => cat.recipes.find((r) => r.id === rid)).filter(Boolean);
  const F = (k) => pick(p[k === "intro" || k === "desc" || k === "tips" || k === "directions" || k === "cautions" || k === "claims" ? k + "_zh" : k], p[k + "_en"]);
  const facts = [["latin", p.latin], ["aroma", F("aroma")], ["part", F("part")], ["extraction", F("extraction")], ["constituents", F("constituents")], ["ingredients", F("ingredients")], ["skin", F("skin")], ["size", p.size], ["retail", p.retail], ["wholesale", p.wholesale]].filter(([, v]) => v && !/不适用|n\/a/i.test(v));
  const benefits = lang === "en" ? (p.benefits_en || p.claims_en) : cv(String(p.claims_zh || "").split(/\s+/).filter(Boolean).join("。\n"));
  const about = lang === "en" ? (p.intro_en || p.desc_en) : cv([p.intro_zh, p.desc_zh].filter(Boolean).join("\n"));
  const url = lang === "en" ? p.url_en : p.url_zh || p.url_en;
  return (
    <>
      <div className="crumbs"><Link to="/oils">{t("nav_oils")}</Link><span>/</span><span>{pick(p.name_zh, p.name_en)}</span></div>
      <div className="pd-head">
        <div className="pd-img"><ProductImage p={p} big /></div>
        <div>
          <h1>{pick(p.name_zh, p.name_en)}</h1>
          <p className="muted" style={{ marginTop: 14, fontSize: "1.25rem" }}>{lang === "en" ? cv(p.name_zh) : p.name_en}{p.latin ? `, ${p.latin}` : ""}</p>
          <p className="muted small" style={{ marginTop: 6 }}>{[t("kind_" + p.kind), p.nhp ? t("nhp") : "", p.size, p.wholesale ? `${t("wholesale")} ${p.wholesale}` : ""].filter(Boolean).join(" · ")}</p>
          {benefits && <div className="block" style={{ marginTop: 16 }}><h2 style={{ fontSize: 16 }}>{t("benefits")}</h2><Tips text={benefits} /></div>}
          <dl className="facts">{facts.map(([k, v]) => <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      </div>

      {!!p.pains?.length && <div className="block"><h2>{t("feelings")}</h2><div className="chips">{p.pains.map((x) => <Link key={x} className="chip" to={`/oils?pain=${x}`}>{pick(cat.painById[x]?.zh, cat.painById[x]?.en)}</Link>)}</div></div>}
      {!!p.scenes?.length && <div className="block"><h2>{t("scenes")}</h2><div className="chips">{p.scenes.map((x) => <span key={x} className="chip">{lang === "en" ? cat.vocab?.scenes?.[x] || x : cv(x)}</span>)}</div></div>}
      {about && <div className="block"><h2>{t("about")}</h2><Paras text={about} /></div>}
      {F("origin") && !String(about || "").includes(String(F("origin")).slice(0, 20)) && <div className="block"><h2>{t("origin")}</h2><Paras text={F("origin")} /></div>}
      {(F("tips") || F("directions")) && <div className="block"><h2>{t("how_use")}</h2><Tips text={[F("tips"), F("directions")].filter(Boolean).join("\n")} /></div>}
      <div className="block ask-box"><div><h2>{pick(`想用${p.name_zh.replace(/精油.*$/, "")}调配？`, `Want a blend with ${p.name_en.replace(/\s*(Essential Oil|Oil).*$/i, "")}?`)}</h2><p className="muted">{pick("告诉 Grace 你的情况，她会判断适不适合你，再搭配其他精油为你调配。", "Tell Grace how you feel; she'll check it suits you and blend it with other oils for you.")}</p></div><button className="btn primary" onClick={() => window.dispatchEvent(new Event("open-consult"))}>{pick("请 Grace 为我调配", "Ask Grace to blend for me")}</button></div>
      {F("cautions") && <div className="block"><h2>{t("cautions")}</h2><div className="notice honey prose">{F("cautions")}</div></div>}
      {recipes.length > 0 && <div className="block"><h2>{t("used_in")} · {recipes.length}</h2><div className="rcards">{recipes.slice(0, 12).map((r) => <RecipeCard key={r.id} r={r} />)}</div></div>}
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
  return (
    <div className="list-layout">
      <aside className="filters">
        <input id="rq" type="search" placeholder={t("search")} value={q} onChange={(e) => set("q", e.target.value)} />
        <div className="field"><span className="lab">{t("nav_recipes")}</span><div className="chips">
          <button className="chip" aria-pressed={!c} onClick={() => set("cat", "")}>{t("kind_all")}</button>
          {cat.cats.map((x) => <button key={x.id} className="chip" aria-pressed={c === x.id} onClick={() => set("cat", c === x.id ? "" : x.id)}>{pick(x.zh, x.en)}</button>)}
        </div></div>
        <div className="field"><span className="lab">{t("tags")}</span><div className="chips">
          {tags.map((x) => <button key={x} className="chip" aria-pressed={tag === x} onClick={() => set("tag", tag === x ? "" : x)}>{pick(x, tagEn(x))}</button>)}
        </div></div>
      </aside>
      <section style={{ minWidth: 0 }}>
        <div className="section-head"><h1 className="page-title">{c ? pick(cat.catById[c]?.zh, cat.catById[c]?.en) : t("all_recipes")}</h1><span className="count">{list.length} {t("results")}</span></div>
        {list.length ? <div className="rcards">{list.map((r) => <RecipeCard key={r.id} r={r} />)}</div> : <div className="empty">{t("no_results")}</div>}
      </section>
    </div>
  );
}

export function RecipeDetail() {
  const { id } = useParams();
  const { t, pick, cv } = useLang();
  const cat = useCatalog();
  const { owned } = useAuth();
  const [sp] = useSearchParams();
  const [ask, setAsk] = useState(sp.get("mix") === "1");
  const name = useProductName();
  if (!cat.ready) return <Loading />;
  const r = cat.recipes.find((x) => x.id === id);
  if (!r) return <div className="empty">{t("no_results")}</div>;
  const c = cat.catById[r.cat];
  const ml = r.carrier_ml || carrierMl(r.carrier);
  const pct = dilutionPct(r.items, ml);
  const oils = [...new Set([...(r.items || []), ...((r.alt_items || []).flat())].map((i) => i.product).filter(Boolean))].map((x) => cat.byId[x]).filter(Boolean);
  return (
    <>
      <div className="crumbs"><Link to="/recipes">{t("nav_recipes")}</Link><span>/</span>{c && <><Link to={`/recipes?cat=${encodeURIComponent(c.id)}`}>{pick(c.zh, c.en)}</Link><span>/</span></>}<span>{pick(r.title_zh, r.title_en)}</span></div>
      <div className="two">
        <div>
          <h1 style={{ fontSize: "clamp(2.6rem,1rem + 4.6vw,5rem)" }}>{pick(r.title_zh, r.title_en)}</h1>
          <div className="chips" style={{ marginTop: 10 }}>{(r.tags || []).map((x) => <Link key={x} className="chip" to={`/recipes?tag=${encodeURIComponent(x)}`}>{pick(x, cat.tagsEn?.[x])}</Link>)}</div>
          <div className="block">
            <h2>{pick("参考配方", "Reference formula")}</h2>
            <p className="muted small" style={{ marginTop: 0 }}>{pick("这是 Grace 常用的比例，实际调配时会按你的情况调整。", "This is the ratio Grace often uses; she adjusts it to you when blending.")}</p>
            {r.choose && <p className="muted small" style={{ marginTop: 0 }}>{t("choose_one")} · {r.choose.drops} {t("drops")}</p>}
            <DropList items={r.items} owned={owned} />
            {(r.alt_items || []).map((a, i) => <div key={i} style={{ marginTop: 14 }}><p className="muted small" style={{ margin: "0 0 6px" }}>{t("or_alt")}</p><DropList items={a} owned={owned} /></div>)}
            <div className="small muted" style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap", borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              {r.carrier && <span>{t("carrier")}: {cv(r.carrier)}</span>}
              {pct != null && <span>{t("dilution")} {pct}%</span>}
            </div>
            {owned && <div className="small muted" style={{ marginTop: 10, display: "flex", gap: 14 }}><span><i className="dot yes" style={{ display: "inline-block", marginRight: 5 }} />{t("own_status")}</span><span><i className="dot no" style={{ display: "inline-block", marginRight: 5 }} />{t("need_buy")}</span></div>}
          </div>
          {(r.usage_zh || r.usage_en) && <div className="block"><h2>{t("usage")}</h2><div className="prose"><p>{pick(r.usage_zh, r.usage_en)}</p></div></div>}
          {!!r.flags?.length && <div className="block"><Flags flags={r.flags} /></div>}
          <p className="notice block">{t("disclaimer")}</p>
          {oils.length > 0 && <div className="block"><h2>{pick("用到的精油", "Oils in this blend")}</h2><div className="cards">{oils.map((p) => <ProductCard key={p.id} p={p} />)}</div></div>}
        </div>
        <aside className="side-sticky">
          <div className="order-box">
            <div className="ob-bots">{oils.filter((x) => productImg(x)).sort((a, b) => hasLocal(b.id) - hasLocal(a.id)).slice(0, 3).map((o) => <img key={o.id} src={productImg(o)} alt={pick(o.name_zh, o.name_en)} />)}</div>
            <h2 style={{ fontSize: "1.75rem" }}>{t("one_click")}</h2>
            <p className="muted">{t("one_click_sub")}</p>
            <button className="btn primary" onClick={() => setAsk(true)}>{t("one_click")}</button>
          </div>
        </aside>
      </div>
      {ask && <BlendRequest recipe={r} onClose={() => setAsk(false)} />}
    </>
  );
}
