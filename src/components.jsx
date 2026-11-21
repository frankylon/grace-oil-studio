import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { useLang } from "./i18n";
import { useAuth, useCatalog, useToast } from "./ctx";
import { db } from "./api";
import { dilutionPct, owns, totalDrops } from "./util";
import { productImg } from "./img";
import RC from "./data/recipe_content.json";

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh"><h3>{title}</h3><button className="x" onClick={onClose} aria-label="close">×</button></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* 产品图：有官方图就用，载入失败或没有就画一个瓶子 */
export function Bottle({ kind = "single" }) {
  return (
    <svg className="bottle-ph" viewBox="0 0 60 110" aria-hidden="true">
      <rect x="19" y="2" width="22" height="22" fill="#0f0f0f" />
      <path d="M13 30 Q13 24 21 24 H39 Q47 24 47 30 V102 Q47 108 41 108 H19 Q13 108 13 102 Z" fill={kind === "touch" ? "#2a2a2a" : "#6b4a2a"} />
      <rect x="16" y="52" width="28" height="36" fill="#e8e8e5" />
    </svg>
  );
}
export function ProductImage({ p, big }) {
  const [bad, setBad] = useState(false);
  const hue = (p?.id || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0) % 50 + 15;
  const src = productImg(p);
  if (!src || bad) return <Bottle kind={p?.kind} />;
  return <img src={src} alt={p.name_en || ""} loading={big ? "eager" : "lazy"} referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

export function useProductName() {
  const { pick, cv, lang } = useLang();
  const cat = useCatalog();
  return (item) => {
    if (typeof item === "string") item = { oil: item };
    const p = item.product && cat.byId?.[item.product];
    if (lang === "en") return String((p && p.name_en) || item.oil_en || cat.oils?.[item.oil] || item.oil).replace(/\s*\(NHP\)/, "").replace(/[®™]/g, "").replace(/\s+(Essential Oil Blend|Oil Blend|Essential Oil|Oil)$/i, "");
    return cv(String(item.oil || (p && p.name_zh) || "").replace(/\s*\(天然健康产品\)/, ""));
  };
}

export const cleanName = (s) => String(s || "").replace(/\s*[（(]天然健康产品[)）]/, "").replace(/\s*\(NHP\)/, "");
export function ProductCard({ p }) {
  const { pick, t } = useLang();
  return (
    <Link to={`/oils/${p.id}`} className="pcard">
      <div className="img"><ProductImage p={p} /></div>
      <div className="body">
        <span className="zh">{cleanName(pick(p.name_zh, p.name_en))}</span>
        <span className="en">{cleanName(pick(p.name_en, p.latin))}</span>
        <div className="meta"><span>{p.size}{p.nhp ? " · NPN" : ""}</span><span>{p.wholesale}</span></div>
      </div>
    </Link>
  );
}

export function DropList({ items, owned, link = true }) {
  const name = useProductName();
  const { t } = useLang();
  const max = Math.max(1, ...(items || []).map((i) => Number(i.drops) || 0));
  return (
    <div className="droplist">
      {(items || []).map((i, k) => {
        const o = owned ? owns(owned, i, null) : null;
        const nm = name(i);
        return (
          <div className="drow" key={k}>
            <div className="n">
              {owned && <i className={`dot ${o ? "yes" : "no"}`} title={o ? t("own_status") : t("need_buy")} />}
              {link && i.product ? <Link to={`/oils/${i.product}`} onClick={(e) => e.stopPropagation()}>{nm}</Link> : <span>{nm}{!i.product && link && <span className="muted small"> · {t("not_in_catalog")}</span>}</span>}
            </div>
            <div className="bar"><i style={{ width: i.drops ? `${Math.round((i.drops / max) * 100)}%` : 0 }} /></div>
            <div className="c">{i.drops ?? "–"}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Flags({ flags }) {
  const { t } = useLang();
  if (!flags?.length) return null;
  return <div className="chips">{flags.map((f) => <span key={f} className={`pill ${f === "pregnancy_avoid" || f === "hot_oil" ? "rose" : "honey"}`}>{t("flag_" + f)}</span>)}</div>;
}

export function RecipeCard({ r }) {
  const { pick, t } = useLang();
  const cat = useCatalog();
  let p = null;
  for (const i of r.items || []) { const x = i.product && cat.byId?.[i.product]; if (x && productImg(x)) { p = x; break; } }
  const src = p && productImg(p);
  const name = useProductName();
  const oils = (r.items || []).slice(0, 4).map(name).join(" · ");
  return (
    <Link to={`/recipes/${r.id}`} className="rcard">
      <span className="ph">{src && <img src={src} alt="" loading="lazy" />}</span>
      <span>
        <span className="t"><span>{pick(RC[r.id]?.title_zh || r.title_zh, RC[r.id]?.title_en || r.title_en)}</span></span>
        <span className="d" style={{ display: "block" }}>{oils}</span>
      </span>
    </Link>
  );
}

/* 一键配油 */
const NEEDS = [["肩颈紧", "Tight shoulders"], ["睡不好", "Poor sleep"], ["压力大", "Stress"], ["呼吸不顺", "Stuffy breathing"], ["肠胃不适", "Tummy"], ["肌肤干燥", "Dry skin"], ["经期不适", "Period comfort"], ["想提神", "Need energy"]];

// recipe 可以不传：不传就是「按我的情况调配」（个人咨询）
export function BlendRequest({ recipe, onClose, order }) {
  const { t, pick, cv } = useLang();
  const { member, profile, session } = useAuth();
  const toast = useToast();
  const custom = !recipe;
  const [bottle, setBottle] = useState("b_roll10");
  const [needs, setNeeds] = useState([]);
  const [name, setName] = useState(member?.name || "");
  const [contact, setContact] = useState(member?.phone || member?.email || session?.user?.email || "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const toggle = (k) => setNeeds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const ok = name.trim() && contact.trim() && (!custom || needs.length || notes.trim());
  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const need = needs.length ? `【需要】${needs.join("、")}\n` : "";
      await db.insert("blend_requests", {
        member_id: profile?.member_id || null, name: name.trim(), contact: contact.trim(),
        recipe_id: recipe?.id || null, recipe_title: (order ? (order.kind === "kit" ? "【订购套组】" : "【订购配方油】") : "") + (recipe ? recipe.title_zh : "个人调配咨询"),
        items: order?.kind === "kit" ? order.items : recipe?.items || [], bottle: order?.kind === "kit" ? `单方套组 ${order.items.length} 支 · ${order.total}` : t(bottle) + ` (${bottle})`, notes: need + notes.trim(), status: "new",
      });
      setDone(true);
    } catch (e) { toast(t("send_fail")); }
    setBusy(false);
  };
  const ml = bottle === "b_roll10" ? 10 : bottle === "b_30" ? 30 : null;
  const pct = !custom && ml ? dilutionPct(recipe.items, ml) : null;
  return (
    <Modal title={custom ? t("custom_title") : (order ? (order.kind === "kit" ? pick("订购单方套组", "Order the oil set") : pick("订购调好的配方油", "Order the blend")) : t("one_click")) + " · " + pick(recipe.title_zh, recipe.title_en)} onClose={onClose}
      footer={done ? <button className="btn primary" onClick={onClose}>OK</button> : <>
        <button className="btn" onClick={onClose}>{t("cancel")}</button>
        <button className="btn honey" disabled={busy || !ok} onClick={submit}>{t("submit")}</button></>}>
      {done ? <p style={{ margin: 0, fontSize: 17 }}>{t("sent")}</p> : <>
        <p className="muted" style={{ margin: 0 }}>{custom ? t("custom_sub") : order?.kind === "kit" ? pick(`套组包括 ${order.items.map((i) => i.oil).join("、")}，会员价合计 ${order.total}。Grace 确认库存后联系你付款和取货。`, `The set includes ${order.items.length} oils, member price total ${order.total}. Grace will confirm stock and contact you about payment and pickup.`) : order ? pick("Grace 按这条配方为你调好，价格按瓶子大小由 Grace 确认后联系你。", "Grace blends it for you; she'll confirm the price for the bottle size and contact you.") : t("one_click_sub")}</p>
        {custom && <div className="field"><span className="lab">{t("custom_needs")}</span>
          <div className="chips">{NEEDS.map(([zh, en]) => <button type="button" key={zh} className="chip" aria-pressed={needs.includes(zh)} onClick={() => toggle(zh)}>{pick(zh, en)}</button>)}</div></div>}
        {order?.kind !== "kit" && <div className="field"><span className="lab">{t("bottle")}</span>
          <div className="chips">{["b_roll10", "b_30", "b_spray", "b_cream", ...(custom ? [] : ["b_drops"])].map((b) => <button type="button" key={b} className="chip" aria-pressed={bottle === b} onClick={() => setBottle(b)}>{t(b)}</button>)}</div>
          {pct != null && <span className="small muted">{t("dilution")} {pct}%</span>}
        </div>}
        <div className="grid2">
          <div className="field"><label htmlFor="br_n">{t("your_name")}</label><input id="br_n" type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="br_c">{t("contact")}</label><input id="br_c" type="text" value={contact} onChange={(e) => setContact(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="br_x">{custom ? t("custom_notes") : t("notes")}</label><textarea id="br_x" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </>}
    </Modal>
  );
}

export function Loading() { const { t } = useLang(); return <div className="empty">{t("loading")}</div>; }
