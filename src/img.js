// 图片：优先用 Frank 提供的 doTERRA 图片库（public/img），没有就用官网图片网址
import manifest from "./data/images.json";

const BASE = import.meta.env.BASE_URL || "/";
export const asset = (p) => (p ? (p.startsWith("http") ? p : BASE + p.replace(/^\//, "")) : null);
export const productImg = (p) => (p ? asset(manifest[p.id]?.product) || p.img || null : null);
export const productPhotos = (p) => (p ? (manifest[p.id]?.photos || []).map(asset) : []);
export const hasLocal = (id) => !!manifest[id]?.product;
export const generalPhotos = () => (manifest._general || []).map(asset);
export const allPhotos = () => Object.entries(manifest).filter(([k]) => k !== "_general").flatMap(([, v]) => (v.photos || []).map(asset));
export default manifest;
