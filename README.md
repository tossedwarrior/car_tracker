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

## Daily check

`npm run check:daily` searches every active watched car on each source that's
due today, saves new and changed listings (with a price snapshot on each
change), and marks cars missing for 3 checks in a row as gone. Each source's
pages per car come from its calls left this month, spread over the runs left.
Runs and API call counts are on the Settings page.

```bash
npm run schedule:install     # run it daily at 7:00 via launchd (log: data/logs/daily.log)
npm run schedule:uninstall
```

## Database

SQLite via Drizzle ORM. Schema lives in `src/db/schema.ts`. After changing it:

```bash
npm run db:generate -- --name <change>
npm run db:migrate
```
