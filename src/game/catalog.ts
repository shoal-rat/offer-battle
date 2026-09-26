import rules from "./content/rules_catalog.json" with { type: "json" };
import education from "./content/education_catalog.json" with { type: "json" };
import examples from "./content/example_offers.json" with { type: "json" };
import presets from "./content/loadout_presets.json" with { type: "json" };
export { rules, education, examples, presets };
export const CARDS = [...rules.base_cards, ...rules.flex_cards];
export const cardById = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
) as Record<
  string,
  {
    id: string;
    name: string;
    time_cost: number;
    type: string;
    rules_text: string;
    attack?: number;
    max_health?: number;
  }
>;
export const templateById = Object.fromEntries(
  rules.offer_templates.map((c) => [c.id, c]),
);
export const benefitById = Object.fromEntries(
  rules.benefits.map((c) => [c.id, c]),
);
