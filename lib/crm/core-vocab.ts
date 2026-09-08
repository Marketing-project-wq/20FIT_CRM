/**
 * THE closed vocabularies for the two coded columns the profile EDIT path can set: `segment` and
 * `first_unit`. One place that answers "which values are legal?", so the dropdown the operator sees
 * and the CHECK inside crm_update_master_fields cannot drift apart — the same failure class that hit
 * the tag namespaces and the consent basis, guarded the same way (core-vocab.parity.test.ts compares
 * these lists against the migration's own IN(...) lists, character for character).
 *
 * Values MEASURED from production 8 Sep 2026 (master_customer): segment ∈ {loyal, new, potential}
 * (plus NULL, which the edit path cannot set); first_unit ∈ {20fit_data, arena, clinic, event,
 * my20fit, gym, shop}.
 */

/** Every `segment` value the RPC accepts. The dropdown offers exactly these. */
export const SEGMENT_VALUES = ["loyal", "new", "potential"] as const;
export type SegmentValue = (typeof SEGMENT_VALUES)[number];

/** Every `first_unit` value the RPC accepts. */
export const FIRST_UNIT_VALUES = ["20fit_data", "arena", "clinic", "event", "my20fit", "gym", "shop"] as const;
export type FirstUnitValue = (typeof FIRST_UNIT_VALUES)[number];

/**
 * `20fit_data` is ACCEPTED by the RPC (81,178 rows carry it — rejecting it would block editing every
 * OTHER field on those rows) but is DELIBERATELY NOT OFFERED in the dropdown: it is the load-origin
 * marker for the 20 April import, not a business unit. Owner trade-off (recorded): once a 20fit_data
 * row's first_unit is changed via the dropdown, that value cannot be restored from the UI.
 */
export const FIRST_UNIT_DROPDOWN_VALUES = FIRST_UNIT_VALUES.filter((v) => v !== "20fit_data");

export function isSegmentValue(v: string): v is SegmentValue {
  return (SEGMENT_VALUES as readonly string[]).includes(v);
}
export function isFirstUnitValue(v: string): v is FirstUnitValue {
  return (FIRST_UNIT_VALUES as readonly string[]).includes(v);
}
