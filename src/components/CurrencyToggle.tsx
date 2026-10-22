import { setDisplayCurrency } from "@/app/actions";
import { currencies, type Currency } from "@/db/schema";

export function CurrencyToggle({ current }: { current: Currency }) {
  return (
    <form action={setDisplayCurrency} className="segmented small" aria-label="Show prices in">
      {currencies.map((c) => (
        <button key={c} type="submit" name="currency" value={c} aria-pressed={c === current}>
          {c}
        </button>
      ))}
    </form>
  );
}
