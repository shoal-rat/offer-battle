import type { OfferDefinition, OfferProfile, Loadout } from "./types";
import {
  templateById,
  benefitById,
  examples,
  presets,
  education,
  cardById,
} from "./catalog";
export function stableHash(value: unknown): string {
  const sorted = (x: any): any =>
    Array.isArray(x)
      ? x.map(sorted)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, sorted(x[k])]),
          )
        : x;
  const str = JSON.stringify(sorted(value));
  let h = 2166136261;
  for (let i = 0; i < str.length; i++)
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}
export function rankBand(rank: number | null): string | null {
  if (rank === null) return null;
  if (!Number.isInteger(rank) || rank < 1) throw Error("学校名次必须为正整数");
  return rank <= 50 ? "H07" : rank <= 100 ? "H08" : "H09";
}
export function sanitizeCardDisplayName(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(
    value
      .replace(
        /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g,
        "",
      )
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, 16)
    .join("");
}
export function offerDisplayName(profile: OfferProfile): string {
  const explicit = sanitizeCardDisplayName(profile.card_display_name);
  if (explicit) return explicit;
  const role = sanitizeCardDisplayName(profile.role_title) || "综合业务岗";
  const industry: Record<string, string> = {
    internet: "互联网",
    gaming: "游戏",
    game: "游戏",
    manufacturing: "制造业",
    finance: "金融",
    consulting: "咨询",
  };
  const prefix = ["central_state_owned", "central_owned"].includes(
    profile.ownership,
  )
    ? "央企"
    : profile.ownership === "state_owned"
      ? "国企"
      : profile.ownership === "foreign_owned"
        ? "外企"
        : profile.company_stage === "startup"
          ? "初创"
          : industry[profile.industry] || "";
  return sanitizeCardDisplayName(
    prefix && !role.startsWith(prefix) ? prefix + role : role,
  );
}
export function matchTemplate(p: OfferProfile): string {
  const r = p.role_family;
  if (["hr", "human_resources", "recruitment"].includes(r)) return "T08";
  if (["testing", "test", "qa"].includes(r)) return "T07";
  if (r === "sales") return "T06";
  if (["management", "manager"].includes(r)) return "T05";
  if (p.industry === "consulting") return "T09";
  if (
    p.industry === "manufacturing" &&
    ["hardware_rd", "general_rd", "research", "engineering"].includes(r)
  )
    return "T04";
  if (
    ["state_owned", "central_state_owned", "central_owned"].includes(
      p.ownership,
    ) &&
    ["administration", "finance", "general", "operations", "function"].includes(
      r,
    )
  )
    return "T02";
  if (p.ownership === "foreign_owned" && ["product", "project"].includes(r))
    return "T03";
  if (p.company_stage === "startup" && p.annual_equity_cny > 0) return "T10";
  if (
    ["internet", "gaming", "game"].includes(p.industry) &&
    [
      "algorithm",
      "development",
      "software",
      "general_rd",
      "frontend",
      "backend",
    ].includes(r)
  )
    return "T01";
  return "T00";
}
export function compileOffer(
  profile: OfferProfile,
  benefitId: string | null = null,
  id?: string,
): OfferDefinition {
  for (const key of [
    "monthly_fixed_cny",
    "guaranteed_months",
    "annual_fixed_allowance_cny",
    "annual_target_bonus_cny",
    "annual_equity_cny",
    "one_time_signing_cny",
  ] as const) {
    if (
      typeof profile[key] !== "number" ||
      !Number.isFinite(profile[key]) ||
      profile[key] < 0
    )
      throw Error("请确认完整薪酬字段：" + key);
  }
  if (profile.guaranteed_months <= 0 || profile.monthly_fixed_cny <= 0)
    throw Error("月薪与保证月数必须大于0");
  if (
    benefitId &&
    (!Object.hasOwn(benefitById, benefitId) ||
      !profile.confirmed_benefits.includes(benefitId))
  )
    throw Error("所选条款尚未确认");
  const annualFixed =
    profile.monthly_fixed_cny * profile.guaranteed_months +
    profile.annual_fixed_allowance_cny;
  const annualPackage =
    annualFixed + profile.annual_target_bonus_cny + profile.annual_equity_cny;
  if (!Number.isFinite(annualPackage)) throw Error("计价年包超出有效范围");
  const originalTime =
    annualPackage < 150000
      ? 2
      : annualPackage < 250000
        ? 3
        : annualPackage < 400000
          ? 4
          : annualPackage < 600000
            ? 5
            : annualPackage < 900000
              ? 6
              : 7;
  const selectedTemplate = profile.selected_template_id;
  if (
    selectedTemplate !== undefined &&
    (typeof selectedTemplate !== "string" ||
      !Object.hasOwn(templateById, selectedTemplate))
  )
    throw Error("请选择已定义的玩法类型，或使用自动匹配");
  const templateId = selectedTemplate ?? matchTemplate(profile);
  const t = templateById[templateId];
  let baseAttack = Math.max(1, originalTime + t.attack_delta),
    baseHealth = Math.max(1, originalTime + t.health_delta);
  if (benefitId) {
    if (baseHealth > 1) baseHealth--;
    else baseAttack = Math.max(1, baseAttack - 1);
  }
  const def = {
    templateId,
    benefitId,
    originalTime,
    baseAttack,
    baseHealth,
    annualPackage,
    annualFixed,
    signingBonus: profile.one_time_signing_cny,
    tags: [...t.career_tags],
    rulesVersion: "2.0.0",
  };
  const definitionHash = stableHash(def);
  return {
    ...def,
    id: id || "offer-" + definitionHash,
    name: offerDisplayName(profile),
    company: profile.company_display_name,
    role: profile.role_title,
    definitionHash,
    profile: {
      ...structuredClone(profile),
      ...(profile.card_display_name !== undefined
        ? {
            card_display_name: sanitizeCardDisplayName(
              profile.card_display_name,
            ),
          }
        : {}),
    },
    artId: templateId,
  };
}
export const exampleOffers: OfferDefinition[] = examples.map((e) =>
  compileOffer(e.profile, e.selected_benefit_id, e.id),
);
export function defaultLoadout(
  playerId: string,
  name: string,
  presetIndex = 0,
): Loadout {
  const p =
    presets[((presetIndex % presets.length) + presets.length) % presets.length];
  return {
    playerId,
    name,
    primaryId: p.primary_id,
    secondaryId: p.secondary_id,
    offers: p.offer_ids.map((id) =>
      structuredClone(exampleOffers.find((o) => o.id === id)!),
    ),
    baseDeck: [...p.base_deck],
    flexDeck: [...p.default_flex],
  };
}
export function validateLoadout(l: Loadout): void {
  if (
    !education.primary.some((x) => x.id === l.primaryId) ||
    !education.secondary.some((x) => x.id === l.secondaryId)
  )
    throw Error("学历流派无效");
  if (l.offers.length !== 3 || new Set(l.offers.map((o) => o.id)).size !== 3)
    throw Error("请选择三张不同Offer");
  if (
    l.baseDeck.length !== 12 ||
    l.baseDeck.some((id) => !cardById[id] || !id.startsWith("N")) ||
    l.baseDeck.some((id) => l.baseDeck.filter((x) => x === id).length > 2)
  )
    throw Error("基础牌需要12张，同名至多2张");
  if (
    l.flexDeck.length !== 3 ||
    new Set(l.flexDeck).size !== 3 ||
    l.flexDeck.some((id) => !cardById[id] || !id.startsWith("F"))
  )
    throw Error("请选择3张不同应对牌");
  for (const o of l.offers) {
    if (
      !Object.hasOwn(templateById, o.templateId) ||
      !Number.isFinite(o.originalTime) ||
      o.originalTime < 2 ||
      o.originalTime > 7 ||
      !Number.isInteger(o.originalTime) ||
      o.baseAttack < 1 ||
      o.baseHealth < 1
    )
      throw Error("Offer定义无效");
  }
}
