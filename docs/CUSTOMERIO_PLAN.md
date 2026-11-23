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

### 2. Refresh on a schedule (to do)

New-listing emails only make sense if the app looks for new listings without
anyone pressing Refresh. Add `npm run refresh` as a daily cron job (cPanel
"Cron Jobs" on GoDaddy). Check the budget first: with N followed searches,
Auto.dev's 1,000 calls/month allows about 33 a day, so roughly 5 pages per
search for 6 searches, fewer per search as people add cars. The refresh already
spreads each source's remaining calls across cars (`src/jobs/budget.ts`).

### 3. Customer.io: data in — code done (Nov 23), needs your keys

Each part switches on when its key is in `.env` (see `.env.example`):

| Key | Turns on |
| --- | --- |
| `NEXT_PUBLIC_CUSTOMERIO_WRITE_KEY` | Browser: `identify` when signed in, `page` on every route, `listing_clicked` on listing links |
| `CUSTOMERIO_PIPELINES_KEY` | Server: profiles and events below |
| `CUSTOMERIO_APP_API_KEY` + `CUSTOMERIO_SIGNIN_MESSAGE` | The sign-in link email (otherwise the page shows the link on a dev server) |

Profile attributes (on sign-up, sign-in, any change, and after each refresh):

| Attribute | Example |
| --- | --- |
| `email`, `name` | |
| `created_at`, `last_sign_in_at` | Unix seconds |
| `listing_emails`, `monthly_report` | `true` |
| `currency` | `CAD` |
| `cars_followed` | `2` |
| `cars` | `[{ "id": 1, "title": "Ferrari 458 Italia", "years": "2011 - 2015", "url": "…/watch/1", "for_sale": 20, "new_this_week": 3, "lowest": "CA$238,000", "trend": "cooling", "trend_percent": -4.2 }]` |
| `deleted_at` | Unix seconds, once they delete their account |

Events:

| Event | From | Properties |
| --- | --- | --- |
| `signed_up`, `signed_in` | server | — |
| `car_followed` | server | `car_id`, `car`, `years`, `target_price`, `target_currency` |
| `car_unfollowed` | server | `car_id`, `car` |
| `new_listings` | server, after a refresh | `count`, `cars`, `listings` (below). Only for people with `listing_emails` on. |
| `account_deleted` | server | — |
| `listing_clicked` | browser | `car`, `car_id`, `listing_id`, `year`, `price`, `source` |

Each of `new_listings.listings`: `car`, `car_url`, `title` ("2013 Ferrari 458
Italia Spider"), `year`, `price` (in their currency), `original_price` (the
seller's, when it's another currency), `mileage`, `location`, `seller`, `url`,
`under_target`.

`car_url` and `cars[].url` are full links only when `APP_URL` is set.

### 4. Customer.io: messages (you)

1. **Transactional — sign-in link.** Trigger name `sign_in_link`. Turn on
   "Protect sensitive data". The app sends `tracked: false`.

   ```liquid
   <p>Here's your link to sign in to Poster Wall:</p>
   <p><a href="{{trigger.signin_url}}">Sign in</a></p>
   <p>It works once, for the next {{trigger.expires_minutes}} minutes. If you didn't ask for it, ignore this email.</p>
   ```

2. **Campaign — new listings.** Trigger: event `new_listings`.

   Subject:
   ```liquid
   {{event.count}} new {% if event.count == 1 %}listing{% else %}listings{% endif %} for your {{event.cars | join: ", "}}
   ```

   Body:
   ```liquid
   {% for l in event.listings %}
   <h3><a href="{{l.url}}">{{l.title}}</a></h3>
   <p>{{l.price}}{% if l.original_price %} ({{l.original_price}}){% endif %} · {{l.mileage}} · {{l.location}}
   {% if l.under_target %}<strong>Under your target</strong>{% endif %}</p>
   <p><a href="{{l.car_url}}">See every {{l.car}} for sale</a></p>
   {% endfor %}
   ```

3. **Broadcast — monthly market report** (Design Studio). Audience: segment
   `monthly_report` is `true` and `cars_followed` is greater than 0. Schedule
   for the 1st of each month.

   ```liquid
   {% for car in customer.cars %}
   <h2>{{car.title}} <small>{{car.years}}</small></h2>
   <p>{{car.for_sale}} for sale{% if car.lowest %}, from {{car.lowest}}{% endif %}.
   {% if car.trend %}The market is {{car.trend}}{% if car.trend_percent %} ({{car.trend_percent}}% over 3 months){% endif %}.{% endif %}</p>
   <p><a href="{{car.url}}">See listings and the market trend</a></p>
   {% endfor %}
   ```

4. Bonus: in-app "Set a target price"; churn email triggered by
   `account_deleted` (the profile stays, emptied, so it can still go out).

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
