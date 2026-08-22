/**
 * A centimetre figure, with a decimal only when there is one to show.
 *
 * A GOB cabinet is 64 × 48 and a COB is 60 × 33.75, so a fixed decimal count is
 * wrong either way: one screen printed "128.0 × 192.0" while another printed
 * "128 × 192" for the same face. Trailing zeros carry no information about a
 * whole number and only make the column wider.
 */
export function cm(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** The same figure with its unit, for prose rather than a table column. */
export function cmWithUnit(value: number): string {
  return `${cm(value)} cm`;
}
