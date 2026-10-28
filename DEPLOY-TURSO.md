# TravelGuide API (SQLite edition) — Run Locally, Then Deploy with Turso

This version of the TravelGuide API stores its data in **SQLite**, exactly like the Week 9–11 Notes API. The queries are written in the `better-sqlite3` style (`db.prepare(sql).all() / .get() / .run()`), so no Postgres syntax is involved.

Where the data lives is decided in **one file**, `db.js`:

| `.env` contains… | Database used |
|---|---|
| no `TURSO_DATABASE_URL` | a local file, `travelguide.db` |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | your hosted Turso database |

```
Browser / phone ──▶ Render (Express API) ──▶ Turso (hosted SQLite)
```

---

## Part A — The app runs locally against a file

```bash
cd travelguide-api-sqlite
cp .env.example .env        # leave the two TURSO_ lines empty for now
npm install
npm run seed                # creates travelguide.db with the demo data
npm start
```

Check in the browser:

- `http://localhost:3001/api/tours` → 7 tours
- `http://localhost:3001/api/tours?category=food` → 1 tour (Wuyi Mountain Tea Journey)
- `http://localhost:3001/api/tours?search=harbin` → 3 tours

Stop the server with `Ctrl + C` and start it again: the data is still there, because it lives in the file.

---

## Part B — A free Turso database replaces the local file

### B1. Install the Turso CLI and sign in (macOS)

```bash
brew install tursodatabase/tap/turso
turso auth signup          # first time — opens the browser (GitHub login works)
# or, if you already have an account:
turso auth login
```

### B2. Create a libSQL database

```bash
turso db create travelguide
```

> ⚠️ Do **not** add the `--tursodb` flag. That flag creates Turso's newer database engine, which the `libsql` package used here does not connect to. Without the flag you get a libSQL database, which is what we want.

### B3. Get the URL and a token

```bash
turso db show travelguide --url      # prints libsql://travelguide-<your-name>.turso.io
turso db tokens create travelguide   # prints a long token
```

Put both into `.env`:

```
TURSO_DATABASE_URL=libsql://travelguide-<your-name>.turso.io
TURSO_AUTH_TOKEN=<the long token>
```

> The token is a password for your database. It goes in `.env` only — never in Git, never in a screenshot.

### B4. Seed the hosted database from your laptop

```bash
npm run seed
```

The first output line should now say `Seeded TravelGuide database in Turso (hosted)`. Then:

```bash
npm start      # should print "database: Turso (hosted)"
```

Open `http://localhost:3001/api/tours` again. It is your laptop's server, but the data now comes from Turso. You can confirm with `turso db shell travelguide "SELECT COUNT(*) FROM tours;"` → `8`.

---

## Part C — The API goes online with Render

### C1. Push the code to its own repository

```bash
cd travelguide-api-sqlite
git init
git add .
git status        # .env and travelguide.db must NOT appear in the list
git commit -m "TravelGuide API — SQLite edition (Turso-ready)"
```

Create an empty GitHub repository named `travelguide-api-sqlite` (no README, no .gitignore), then:

```bash
git remote add origin https://github.com/<YOUR_USERNAME>/travelguide-api-sqlite.git
git branch -M main
git push -u origin main
```

### C2. Create a second Render web service

The existing Postgres service keeps running; this is a new one.

| Setting | Value |
|---|---|
| Name | `travelguide-api-sqlite` |
| Region | Singapore |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | Free |

Environment variables:

| Key | Value |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://travelguide-<your-name>.turso.io` |
| `TURSO_AUTH_TOKEN` | the token from B3 |
| `JWT_SECRET` | any random string |
| `OPENROUTER_API_KEY` | your OpenRouter key |

`PORT` is not needed: Render sets it, and `server.js` reads `process.env.PORT`.

### C3. Verify

- The Render log ends with `database: Turso (hosted)`.
- `https://travelguide-api-sqlite-xxxx.onrender.com/api/tours` returns 7 tours.
- Point the web client at it: in `travelguide-client/.env` set `VITE_API_URL=https://travelguide-api-sqlite-xxxx.onrender.com`, run `npm run dev`, and log in as `tourist1` / `password123`. Book a tour, then trigger a redeploy on Render (Manual Deploy → Deploy latest commit) and check that the booking is still there. **That last check is the whole point:** Render wipes its own disk on every redeploy, but the data lives in Turso.

---

## Why this recipe meets the course rule

The syllabus requires that the deployed API has (a) storage that survives a restart and (b) outbound access to the LLM API.

- **(a)** Render's free disk is wiped on restart, redeploy, and idle spin-down, so a plain `travelguide.db` file there would be lost. With `TURSO_DATABASE_URL` set, the file is not used at all; every query goes to Turso.
- **(b)** Render web services can make outbound HTTPS requests, so `/api/tours/recommend` reaches OpenRouter as before.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `npm run seed` still says `local file` | `.env` is not in the folder you ran the command from, or the variable name is misspelled (`TURSO_DATABASE_URL`) |
| `401` / `Unauthorized` / `token` error at startup | Token missing or copied incompletely. Create a new one with `turso db tokens create travelguide` |
| Connection or protocol error right after B2 | The database was created with `--tursodb`. Create a new one without the flag and update the URL |
| Render build fails while installing `libsql` | Check the Node version in the log. Add an environment variable `NODE_VERSION=22` and redeploy |
| First request takes 30–60 seconds | The free Render service was asleep. This is normal; open the URL once before class |
| Each request feels slower than on the laptop | Expected: every query now travels from Render (Singapore) to Turso. Choose a Turso location close to Singapore if offered |

---

## What changed compared with the Postgres edition

For reference when students ask "why is this code different from the Neon version":

| Postgres (`pg`) | SQLite (`libsql` / `better-sqlite3`) |
|---|---|
| `await pool.query(sql, [a, b])` → `result.rows` | `db.prepare(sql).all(a, b)` (or `.get` for one row) |
| `$1, $2` placeholders | `?` placeholders |
| `SERIAL PRIMARY KEY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `TIMESTAMP DEFAULT NOW()` | `TEXT DEFAULT CURRENT_TIMESTAMP` |
| `INSERT … RETURNING id` → `rows[0].id` | `.run(…)` → `info.lastInsertRowid` |
| `UPDATE … RETURNING id`, check `rows.length` | `.run(…)`, check `info.changes` |
| `ILIKE` | `LIKE` (already case-insensitive for English letters) |
| `COUNT(*)` comes back as a string → `parseInt` | `COUNT(*) AS count` comes back as a number |
| error code `23505` (duplicate username) | error code contains `CONSTRAINT` and the message mentions `UNIQUE` |
| `async` route handlers everywhere | plain functions; only the AI route stays `async` |

The API's JSON responses have the same fields as before, so the web client did not change. One small difference: `created_at` looks like `2026-10-27 01:23:45` instead of an ISO timestamp.
