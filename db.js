// db.js — the ONLY file that knows where the database lives.
//
// The `libsql` package has the same API as `better-sqlite3`
// (db.prepare(sql).all / .get / .run, db.exec), so every query in
// server.js and seed.js is written exactly the way we wrote them in Week 9.
//
//   • No TURSO_DATABASE_URL in .env  →  a local file, travelguide.db (like Week 9)
//   • TURSO_DATABASE_URL is set      →  the hosted Turso database (deployment)
//
// To run on plain better-sqlite3 instead, change the first line to
//   const Database = require("better-sqlite3");
// and use only the local-file branch below.
require("dotenv").config();
const Database = require("libsql");

const db = process.env.TURSO_DATABASE_URL
  ? new Database(process.env.TURSO_DATABASE_URL, {
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : new Database("travelguide.db");

// libsql's .get() adds a timing field, `_metadata`, to the row it returns.
// better-sqlite3 does not, and we don't want it in our API responses,
// so remove it once here instead of in every route.
const Statement = Object.getPrototypeOf(db.prepare("SELECT 1"));
const originalGet = Statement.get;
Statement.get = function (...args) {
  const row = originalGet.apply(this, args);
  if (row && typeof row === "object") delete row._metadata;
  return row;
};

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'tourist' CHECK(role IN ('admin','guide','tourist')),
      display_name TEXT,
      bio TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guide_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'culture',
      price REAL NOT NULL,
      duration TEXT NOT NULL DEFAULT '3 hours',
      max_guests INTEGER NOT NULL DEFAULT 6,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tour_id INTEGER NOT NULL REFERENCES tours(id),
      tourist_id INTEGER NOT NULL REFERENCES users(id),
      booking_date TEXT NOT NULL,
      guests INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { db, initSchema };
