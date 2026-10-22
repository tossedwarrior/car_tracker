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

## Database

SQLite via Drizzle ORM. Schema lives in `src/db/schema.ts`. After changing it:

```bash
npm run db:generate -- --name <change>
npm run db:migrate
```
