# Car Price Tracker

Personal app that tracks asking and sold prices for watched exotics. See [SPEC.md](SPEC.md).

## Setup

Requires Node 22+.

```bash
npm install
cp .env.example .env   # then add API keys
npm run db:migrate     # creates data/tracker.db
npm run db:seed        # optional: example Ferrari 458 watch + saved listings, no API calls
npm run dev            # http://localhost:3000
```

## Data sources

Each source is an adapter in `src/sources/` that returns listings in one shared
shape (`NormalizedListing`). Every real call is counted in `api_usage` and
refused once the source's free monthly limit is reached.

```bash
npm test               # uses saved responses in src/sources/__fixtures__, no API calls
npm run check-source -- autodev --make Ferrari --model "458 Italia" --years 2011-2015 --max-km 40000
```

`check-source` makes real calls (one per page, `--pages 1` by default). Add
`--save` to keep the raw response as a fixture.

| Source | What | Free limit | Per car |
| --- | --- | --- | --- |
| `autodev` | U.S. dealer listings, USD | 1,000 calls/month | up to 5 pages of 20 per refresh |
| `marketcheck` | Canadian dealer listings, CAD, 100 miles around Toronto, Montreal, Vancouver and Calgary | 500 calls/month | 4 calls per refresh (one per city), up to 6 |
| `oldcarsdata` | Sold auction results, any currency | 10 queries/month, latest 20 results each | 1 query per **Update sold prices** |

## Refreshing listings

Listings only refresh when you ask: the **Refresh all** button on the
watchlist, **Refresh** on a car's page, or from the terminal:

```bash
npm run refresh          # every active watched car
npm run refresh -- 1     # just watched car #1
```

A refresh saves new and changed listings (with a price snapshot on each
change). A car missing from refreshes on 3 different days is marked gone.
Each car fetches up to 5 pages of 20; each source stops before its free
monthly limit. Refreshes and API call counts are on the Settings page.

## Market, alerts and currency

- **Market trend** (a tab on each car), filterable by variant (Standard, Spider,
  Speciale… read from titles and trims): summary of momentum (typical sale, last
  3 months vs the 3 before), asking vs sold gap and recent price cuts; every auction sale as a dot (hover for
  the car, click to open the sale) with a monthly median sale trend line, the
  weekly typical asking price, cars listed and days listed, over up to 2 years,
  with a shaded middle half (25th–75th percentile) of each month's sales; tables
  by variant, by model year and month by month; Refresh listings and Update sold
  prices buttons. Each
  refresh saves this week's snapshot (a later refresh that week replaces it).
  Rising/flat/cooling = typical price up more than 3% / within 3% / down more
  than 3% over 3 months, from asking prices once there are 3 months of them,
  auction sales until then.
- **Alerts** (in the app, with an unread count in the header): new listings
  (not on a source's first search for a car), price drops, and cars at or under
  the target price. Checked on refresh.
- **Fixing a listing**: sources can get a currency or location wrong (MarketCheck
  reports every Canadian dealer's price as CAD, even from a U.S. branch). The
  **Fix** link on a listing corrects them; refreshes keep the correction, and
  its price history, alerts and this week's market snapshot follow.
- **CAD/USD**: the switch in the header. Rates come from the Bank of Canada
  (free, no key), updated on refresh; auction sales convert at the rate on the
  day they sold, asking prices at the latest rate.

## Database

SQLite via Drizzle ORM. Schema lives in `src/db/schema.ts`. After changing it:

```bash
npm run db:generate -- --name <change>
npm run db:migrate
```

## Hosting (GoDaddy, or cPanel "Setup Node.js App")

The app serves from the root of its address, so leave any "root path" or
base path setting blank or `/`.

1. **Start command:** `npm start` (it runs `app.cjs`), or `app.cjs` as the
   application startup file. Either way it creates or updates the database
   tables on start, then serves the built app. Plain `next start` skips that.
2. **Environment variables** (set in cPanel, never committed):
   - `AUTO_DEV_API_KEY`, `MARKETCHECK_API_KEY`, `OLD_CARS_DATA_API_KEY`
   - `DATABASE_PATH`: an absolute path outside `public_html`, e.g.
     `/home/<cpanel-user>/car_tracker_data/tracker.db`
   - `APP_PASSWORD`: shows a sign-in page until it's entered; a cookie keeps
     that browser signed in for 30 days. Signed-out visitors get the sign-in
     page with status 200, so host health checks pass. Leave it unset only if
     the site isn't reachable from the internet.
   - Don't set `NODE_ENV`: `npm install` would then skip the build tools.
3. After each deploy: **Run NPM Install**, then **Run JS script → build**,
   then **Restart**.
4. To keep existing data, upload `data/tracker.db` from this Mac to
   `DATABASE_PATH` while the app is stopped.
