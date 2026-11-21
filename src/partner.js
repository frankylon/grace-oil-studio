// 商家合作分成模型（内部测算）
// 做法：货由我们的项目帐户按批发价进货，商家按零售价卖出；
// 商家和业务员按「卖出的零售额」拿分成，他们不用管 doTERRA 的帐户和团队架构。
//
// 一笔零售额 R 带来的「可分配池」：
//   1) 零售差价：零售价 − 批发价 ≈ 零售额的 25%（零售价 ≈ 批发价 × 1.33）——不看任何架构，最稳。
//   2) Unilevel：项目帐户放在我们团队第 d 层，中间每个上线（都是我们的人、级别够）按距离拿 3%/5%/5%/6%/6%/7%。
//   3) Power of 3：项目帐户每月 Rewards 订单 ≥ 500 PV，它的推荐人拿 $50（第一年 PGV ≥ 400 再加 $50）。
//   4) Fast Start：项目帐户刚开的前 60 天，推荐链拿 20% / 10% / 5%（一次性）。
//   5) Rewards 积分：进货用 Rewards 订单，每月返 PV 的 10%（新）到 30%（连续 13 个月以上）产品积分——归项目，另计。
// 换算：批发价 ≈ 零售价 × 0.75；1 美元批发价 ≈ 1 PV ≈ 1 CV（估算）。
import { UNI_PCT } from "./comp";

export const DEFAULTS = { ws: 0.75, pvPerUsd: 1, cost: 0.04, depth: 2, po3: 50, store: 0.1, sales: 0.1, project: 0.05, keep: 0.03, pts: 0.1 };
export const LADDER = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
export const DEPTHS = [
  { d: 1, zh: "直接放在 Grace 第一层", note: "Grace 拿 Power of 3，第 1 层没有 Unilevel" },
  { d: 2, zh: "放在 Grace 第二层（保底做法）", note: "中间隔一个我们的帐户，Grace 拿 3%" },
  { d: 3, zh: "第三层", note: "两个上线各拿 3%、5%，合计 8%" },
  { d: 4, zh: "第四层", note: "合计 13%" },
  { d: 5, zh: "第五层", note: "合计 19%" },
  { d: 6, zh: "第六层", note: "合计 25%" },
  { d: 7, zh: "第七层（全部在我们团队里）", note: "合计 32%，上线都要有足够级别" },
];

/** 团队在第 d 层能拿到的 Unilevel 合计（按 CV 的百分比） */
export const uniCapture = (d) => { let t = 0; for (let L = 2; L <= Math.min(7, d); L++) t += UNI_PCT[L]; return t; };

/** 计算某个月零售额 R 的分配。o 里是比例（0–1）。 */
export function split(R, o = {}) {
  const x = { ...DEFAULTS, ...o };
  const wholesale = R * x.ws;
  const pv = wholesale * x.pvPerUsd;
  const margin = R - wholesale;
  const uni = pv * uniCapture(x.depth);
  const po3 = pv >= 500 ? x.po3 : 0;
  const cost = R * x.cost;
  const pool = margin + uni + po3 - cost;
  const store = R * x.store, sales = R * x.sales, project = R * x.project;
  const org = pool - store - sales - project; // 剩给 Grace 团队（含库存、风险）
  const maxOffer = R ? Math.max(0, pool / R - x.project - x.keep) : 0; // 给商家 + 业务员最多能到多少
  // Rewards 积分（产品积分，按 PV 的 10%–30%）：归项目，另外计算，不放进分配池。换成产品按零售卖，价值 ≈ 积分 ÷ 0.75
  const points = pv * x.pts, pointsRetail = points / x.ws;
  return { R, wholesale, pv, margin, points, pointsRetail, uni, po3, cost, pool, poolPct: R ? pool / R : 0, store, sales, project, org, orgPct: R ? org / R : 0, maxOffer };
}

/** 开店头 60 天的 Fast Start 加成（一次性）：推荐链都是我们的人时 35%，只有直接推荐人时 20% */
export const fastStart = (R, o = {}) => { const x = { ...DEFAULTS, ...o }; const pv = R * x.ws * x.pvPerUsd; return { min: pv * 0.2, max: pv * 0.35 }; };
