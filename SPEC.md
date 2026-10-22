# Car Price Tracker — Build Spec

Oct 22, 2026 · @Anas Ashraf

## What it does

A personal web app that watches the used exotics I want (Ferrari, Aston Martin and a few others) and shows me when one is priced well. It tracks two things: what sellers are asking right now, and what similar cars actually sold for at auction.

It is for one person, me. No sign-up, no other users.

## Data sources

Use Auto.dev for U.S. listings and MarketCheck for Canadian listings, plus Old Cars Data for auction results, all on free keys. MarketCheck's free key only searches within 100 miles of a postal code, so Canadian searches run around four cities: Toronto, Montreal, Vancouver and Calgary.

| Source | What it gives | Coverage | Free limit | Paid |
| --- | --- | --- | --- | --- |
| [Auto.dev](https://www.auto.dev/pricing) | Cars for sale (asking prices) | U.S. dealers only | 1,000 calls a month | $0.002 per listings call after that |
| [Old Cars Data](https://oldcarsdata.com) | Sold prices from 19 auction houses (Bring a Trailer, Cars & Bids, RM Sotheby's, Collecting Cars and more) | Auctions | 10 calls a month | $49/mo for 1,000 calls |
| [MarketCheck](https://www.marketcheck.com/pricing.md) | Dealer, private-seller and auction listings | U.S. and Canada | 500 calls a month, 100-mile search radius | $299/mo plus per-call fees |
| eBay Browse API | eBay Motors listings | eBay only | Free developer key | Not needed |

Each source sits behind its own small adapter that returns listings in one shared shape. That way a source can be added, swapped or turned off without touching the rest of the app.

## Version 1 features

1. **Watchlist.** Add a car by make, model and year range, with optional max mileage, trim and a target price. Example: Ferrari 458 Italia, 2011–2015, under 40,000 km, target $250,000.
2. **Daily check.** Once a day the app pulls current listings that match each watched car.
3. **Listings page.** For each watched car: price, year, mileage, location, seller, days listed and a link to the original ad.
4. **Market trend.** A history page for each watched car that shows whether its market is rising, flat or cooling. It charts the typical asking price (weekly), the typical auction sale price (monthly), how many cars are listed, and how long they stay listed. A label sums it up: rising if the typical price is up more than 3% over 3 months, cooling if down more than 3%, otherwise flat. The chart covers the last 2 years. Sale prices fill all 2 years on day one from past auctions. Asking prices start the day the app goes live, because the free listing APIs don't keep old listings.
5. **Sold prices.** Recent auction results for the same model, so I can compare asking prices against what cars actually sell for.
6. **Alerts.** Tell me when a new matching car is listed, a price drops, or a car comes in under my target price.
7. **Currency.** Show prices in CAD and USD, converted with a free exchange-rate API.

## Data to store

Six tables cover version 1. Price history comes from saving a snapshot each time a listing's price changes.

| Table | Main fields | Why |
| --- | --- | --- |
| watchlist | make, model, year\_min, year\_max, max\_km, trim, target\_price, notes | The cars I care about |
| listings | source, source\_listing\_id, vin, watch\_id, year, trim, km, price, currency, seller\_type, location, url, first\_seen, last\_seen, status | One row per car for sale |
| price\_snapshots | listing\_id, date, price | Price history and price drops |
| sold\_results | source, title, year, model, price, currency, sold\_date, url | Auction results to compare against |
| market\_snapshots | watch\_id, week, median\_ask, median\_sold, listing\_count, median\_days\_listed, currency | Weekly market trend for each watched car |
| alerts\_sent | listing\_id, type, date | So the same alert isn't sent twice |

Two rules:

- Match the same car across sources by VIN when there is one; otherwise by source plus its listing ID.
- If a listing is missing for 3 daily checks in a row, mark it as gone (probably sold) rather than deleting it.

## How price checks run

A daily job does the work. With about 8 watched cars, U.S. checks use roughly 240 of Auto.dev's 1,000 free calls a month. Canadian checks run every 3 days (8 cars × 4 cities × 10 runs ≈ 320 of MarketCheck's 500 free calls).

1. For each watched car, call Auto.dev with its filters. Every third day, also call MarketCheck once per Canadian city.
2. Add new listings, update existing ones, and save a price snapshot when a price changes.
3. Mark listings not seen for 3 days as gone.
4. Once a month, pull auction results from Old Cars Data for each watched model. The first pull for a model grabs the last 2 years of results to fill its trend chart. On the free key that's 10 models at most.
5. Once a week, save a market snapshot for each watched car. Then check the alert rules and send any new alerts.

Keep a running count of API calls per source per month. Stop calling a source before it goes past its free limit, and show the counts on a small settings page.

## Suggested stack

A small hosted web app is enough. Claude Code can swap any of these if it has a good reason.

- **App:** Next.js with TypeScript
- **Database:** Postgres (Supabase or Neon free tier), or SQLite if it only runs on my machine
- **Daily job:** a scheduled function on the host (for example Vercel Cron)
- **Charts:** a simple React chart library
- **Secrets:** API keys in a `.env` file that is never committed

Build it so each data source can be tested on its own with saved sample responses, so testing doesn't use up free API calls.

## Not in version 1, and open questions

Left out for now: other users and logins, a mobile app, scraping sites without an API, and paid data plans.

- [ ] Full watchlist: which models besides Ferrari and Aston Martin?
- [ ] How should alerts reach me: email, phone notification, or just a badge in the app?
- [ ] Are four search cities enough for Canadian listings from day one (MarketCheck)?
- [x] Is auction data worth $49/mo once the free 10 calls feel too tight? **Not for now (Oct 22, 2026):** staying on the free plan and letting the sale history build up through "Update sold prices", rather than paying for a month to load history back to 2019.

## Prompt for Claude Code

Export this doc as Markdown, save it in the project folder as `SPEC.md`, then paste this:

```text
Read SPEC.md. It describes a personal app that tracks prices of used exotic cars.

Build version 1 in small steps and check in with me after each one:
1. Set up the project and the database tables from "Data to store".
2. Build the Auto.dev adapter. Test it with saved sample responses, then with one real call for one watched car.
3. Build the watchlist and listings pages.
4. Add the daily job, price snapshots and the API call counter.
5. Add the MarketCheck adapter for Canadian listings (Toronto, Montreal, Vancouver, Calgary), then the Old Cars Data adapter and the sold prices view.
6. Add the weekly market snapshots, the market trend page for each car, and alerts.

Keep every data source behind its own adapter so sources can be added or swapped later. Never commit API keys. Ask me before doing anything that uses more than 20 real API calls.
```

## Changes made during the build

- **Runs locally** on SQLite rather than a hosted app (step 1).
- **No daily job (Oct 22, 2026).** Listings refresh only when I ask: Refresh all on the watchlist, Refresh on a car's page, or `npm run refresh`. Each car fetches up to 5 pages of 20 listings; each source stops before its free monthly limit. A listing is marked gone after missing from refreshes on 3 different days. Weekly market snapshots and monthly auction pulls should also happen on refresh rather than on a schedule.
- **Sold prices on request (step 5).** Old Cars Data's free plan allows 10 queries a month and returns only the latest 20 sales per query, with no historical archive. Auction results are pulled with an "Update sold prices" button on each car rather than monthly, and the 2-year sale-price history builds up over time instead of filling on day one.
- **Alerts in the app (step 6).** Alerts show on an Alerts page with an unread count in the header. Email or phone notifications are still an open question.
- **Exchange rates from the Bank of Canada (step 6).** Free, no key, daily. A CAD/USD switch in the header picks the display currency.
