// Sorting cars into variants from their listing title and trim, so prices
// compare like with like: a 458 Speciale isn't a pricier 458 coupé.
// First match wins, so special editions beat body style ("Speciale Aperta"
// is a Speciale; "Scuderia Spider 16M" is a 16M).

const RULES: Array<[RegExp, string]> = [
  [/\bchallenge\b/i, "Challenge (track car)"],
  [/\b16\s?m\b/i, "16M"],
  [/\bspeciale\b/i, "Speciale"],
  [/\bscuderia\b/i, "Scuderia"],
  [/\bpista\b/i, "Pista"],
  [/\bsuperleggera\b/i, "Superleggera"],
  [/\bcompetizione\b/i, "Competizione"],
  [/\b(spider|spyder|aperta)\b/i, "Spider"],
  [/\bvolante\b/i, "Volante"],
  [/\broadster\b/i, "Roadster"],
  [/\b(convertible|cabrio(let)?)\b/i, "Convertible"],
];

export const STANDARD = "Standard";

/** "2014 Ferrari 458 Italia Spider" → "Spider"; nothing special → "Standard". */
export function variantOf(...text: Array<string | null | undefined>): string {
  const s = text.filter(Boolean).join(" ");
  return RULES.find(([re]) => re.test(s))?.[1] ?? STANDARD;
}
