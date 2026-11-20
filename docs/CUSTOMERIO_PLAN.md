# Customer.io integration plan

Nov 20, 2026 · for "The Struggle 101" (demo due Dec 15, 2026)

People sign up with their email, build a list of cars to follow, and watch
listings and market trends for them. Customer.io sends them two kinds of email:
a note when a new car is listed for one they follow, and once a month a market
report for every car on their list.

## How that covers the exercise

| Requirement | In car_tracker |
| --- | --- |
| JavaScript integration | Browser SDK identifies the signed-in person and tracks pages and clicks |
| Profiles & Segments | Each account is a profile, with its followed cars as attributes; segments on email preferences and activity |
| Transactional message | The sign-in link email |
| Behavioral campaign | `new_listing` event → "New listing for your Ferrari 458" email |
| Broadcast | The monthly market report |
| Bonus: Design Studio | The monthly market report's design |
| Bonus: in-app | "Set a target price" on a car page |
| Bonus: churn | Account deleted, or no sign-in for 30 days → "What could we have done better?" |

## Steps

### 1. Accounts — done (Nov 20)

- Email sign-up and sign-in by one-time link (`src/lib/users.ts`,
  `src/app/login`). Until step 3 the link only shows on a development server.
- Personal watchlists: `follows` links a person to a shared car search with
  their own target price and notes. Same car, same search: fetched once.
- Per-person alerts, up to `MAX_CARS_PER_USER` cars (default 5).
- Email preferences in Settings: new-listing emails and the monthly report,
  both on by default. Delete account in Settings.
- The owner (`OWNER_EMAIL`) keeps API usage, backups, sold-price pulls and
  listing fixes, and takes over the pre-accounts data on first sign-in.

### 2. Refresh on a schedule

New-listing emails only make sense if the app looks for new listings without
anyone pressing Refresh. Add `npm run refresh` as a daily cron job (cPanel
"Cron Jobs" on GoDaddy). Check the budget first: with N followed searches,
Auto.dev's 1,000 calls/month allows about 33 a day, so roughly 5 pages per
search for 6 searches, fewer per search as people add cars. The refresh already
spreads each source's remaining calls across cars (`src/jobs/budget.ts`).

### 3. Customer.io: data in

Done the way a customer would: create the workspace, find the keys, read the docs.

- **Browser (JavaScript):** `identify(user.id, { email, ... })` on every signed-in
  page; `page` on each route; `track` for browser events.
- **Server (Node):** account and refresh events, since no browser is open when a
  refresh finds a new car.
- **Transactional API:** the sign-in link, replacing the stub in `src/lib/email.ts`.

Profile attributes (sent on sign-in and after each refresh):

| Attribute | Example |
| --- | --- |
| `email`, `name`, `created_at` | |
| `listing_emails`, `monthly_report` | `true` |
| `cars_followed` | `2` |
| `cars` | `[{ "title": "Ferrari 458 Italia", "years": "2011–2015", "url": "…/watch/1", "for_sale": 20, "lowest": "US$171,000", "trend": "cooling", "trend_change": -0.04, "typical_sale": "US$198,000", "new_this_month": 3 }]` |

Events:

| Event | From | Properties |
| --- | --- | --- |
| `signed_up`, `signed_in` | server | — |
| `car_followed`, `car_unfollowed` | server | car title, years, target |
| `new_listing` | server (refresh) | car title, listing year/trim, price, mileage, location, listing URL, car page URL |
| `price_dropped`, `under_target` | server (refresh) | as above, plus old price / target |
| `listing_viewed`, `market_trend_viewed` | browser | car, listing |
| `account_deleted` | server | — |

### 4. Customer.io: messages

1. **Transactional — sign-in link.**
2. **Campaign — new listing:** triggered by `new_listing`, filtered to
   `listing_emails = true`. Several new cars from one refresh: send one
   email that lists them, using a short delay and batching, or have the app
   send one `new_listings` event per car per refresh with the cars in an array.
3. **Broadcast — monthly market report:** on the 1st, to the segment
   `monthly_report = true` and `cars_followed > 0`, designed in Design Studio,
   looping over `customer.cars` in Liquid.
4. Bonus: in-app "Set a target price"; churn feedback email.

### 5. Hosting and demo

- `APP_URL` set to the public address (sign-in links need it in production).
- Keep a friction log as you go: it becomes "where I got stuck" in the demo.

## Local setup on this Mac

- MySQL runs in the Docker container `car-tracker-mysql` on `127.0.0.1:3316`
  (`docker start car-tracker-mysql`); credentials are in `.env`.
- Dev server on port 3100 (3000 is taken here): the `car-tracker` entry in
  `~/code/.claude/launch.json`, or
  `mise exec node@22.23.4 -- npx next dev -p 3100`.
- `OWNER_EMAIL` in `.env` is `owner@example.test` for testing; change it to
  your address.
