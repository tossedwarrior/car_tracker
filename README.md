# Car Price Tracker

Personal app that tracks asking and sold prices for watched exotics. See [SPEC.md](SPEC.md).

## Setup

Requires Node 22+.

```bash
npm install
cp .env.example .env   # then add API keys
npm run db:migrate     # creates data/tracker.db
npm run dev            # http://localhost:3000
```

## Database

SQLite via Drizzle ORM. Schema lives in `src/db/schema.ts`. After changing it:

```bash
npm run db:generate -- --name <change>
npm run db:migrate
```
