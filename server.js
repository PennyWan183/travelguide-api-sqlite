require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db, initSchema } = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "travelguide-dev-secret-change-in-production";

// ── Middleware ───────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token provided" });

  const token = header.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// A UNIQUE constraint failed (e.g. the username is already taken)
function isUniqueViolation(err) {
  return String(err.code || "").includes("CONSTRAINT") && /UNIQUE/i.test(err.message);
}

// ── Home page ───────────────────────────────────────────────────────
// GET / — a small welcome page, so opening the bare URL shows the API is alive
// (instead of Express's default "Cannot GET /"). It also reads the database,
// so a working page proves the database connection works too.
app.get("/", (req, res) => {
  let toursLine;
  try {
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM tours WHERE status = 'approved'").get();
    toursLine = `${count} local tours are open for booking`;
  } catch (err) {
    toursLine = `The database is not reachable right now: ${err.message}`;
  }
  const where = process.env.TURSO_DATABASE_URL ? "Turso (hosted SQLite)" : "local SQLite file";

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TravelGuide API</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
           font-family: system-ui, -apple-system, sans-serif; color: #fff; text-align: center;
           background: linear-gradient(135deg, #0f766e, #1e3a8a); padding: 24px; box-sizing: border-box; }
    main { max-width: 560px; }
    h1 { font-size: 2.6rem; margin: 0 0 8px; }
    .slogan { font-size: 1.3rem; opacity: 0.95; margin: 0 0 28px; }
    .status { display: inline-block; background: rgba(255,255,255,0.15); border-radius: 999px;
              padding: 8px 18px; margin-bottom: 20px; }
    p { line-height: 1.6; }
    a { color: #fde68a; }
    code { background: rgba(0,0,0,0.25); padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <h1>🧭 TravelGuide</h1>
    <p class="slogan">Explore China with the people who call it home.</p>
    <div class="status">🟢 API is running</div>
    <p>${toursLine}.<br>Database: ${where}</p>
    <p>Try the data: <a href="/api/tours"><code>/api/tours</code></a></p>
  </main>
</body>
</html>`);
});

// ── Auth Routes ─────────────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", (req, res) => {
  try {
    const { username, password, role, display_name, bio } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const allowedRole = ["tourist", "guide"].includes(role) ? role : "tourist";
    const password_hash = bcrypt.hashSync(password, 10);

    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, display_name, bio)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(username, password_hash, allowedRole, display_name || username, bio || null);

    const user = {
      id: Number(info.lastInsertRowid),
      username,
      role: allowedRole,
      display_name: display_name || username,
    };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "24h" });

    res.status(201).json({ user, token });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const payload = { id: user.id, username: user.username, role: user.role, display_name: user.display_name };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });

    res.json({ user: payload, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tour Routes ─────────────────────────────────────────────────────

// GET /api/tours — public, only approved tours
// Optional query params: ?category=food  ?search=tea  (both can be combined)
app.get("/api/tours", (req, res) => {
  try {
    const { category, search } = req.query;
    const conditions = ["t.status = 'approved'"];
    const params = [];

    if (category) {
      conditions.push("t.category = ?");
      params.push(category);
    }

    if (search) {
      // LIKE is case-insensitive for English letters in SQLite
      conditions.push("(t.title LIKE ? OR t.description LIKE ? OR t.location LIKE ?)");
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    const tours = db
      .prepare(
        `SELECT t.*, u.display_name AS guide_name
         FROM tours t JOIN users u ON t.guide_id = u.id
         WHERE ${conditions.join(" AND ")}
         ORDER BY t.created_at DESC, t.id DESC`
      )
      .all(...params);

    res.json(tours);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tours/:id — public, single tour detail
app.get("/api/tours/:id", (req, res) => {
  try {
    const tour = db
      .prepare(
        `SELECT t.*, u.display_name AS guide_name, u.bio AS guide_bio
         FROM tours t JOIN users u ON t.guide_id = u.id
         WHERE t.id = ?`
      )
      .get(req.params.id);

    if (!tour) return res.status(404).json({ error: "Tour not found" });
    res.json(tour);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tours — guide creates a tour
app.post("/api/tours", requireAuth, requireRole("guide"), (req, res) => {
  try {
    const { title, description, location, category, price, duration, max_guests, image_url } = req.body;

    if (!title || !description || !location || price == null) {
      return res.status(400).json({ error: "Title, description, location, and price are required" });
    }

    const info = db
      .prepare(
        `INSERT INTO tours (guide_id, title, description, location, category, price, duration, max_guests, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id, title, description, location, category || "culture",
        price, duration || "3 hours", max_guests || 6, image_url || null
      );

    res.status(201).json({ id: Number(info.lastInsertRowid), message: "Tour created, pending admin approval" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tours/:id — guide deletes own tour
app.delete("/api/tours/:id", requireAuth, requireRole("guide"), (req, res) => {
  try {
    const info = db
      .prepare("DELETE FROM tours WHERE id = ? AND guide_id = ?")
      .run(req.params.id, req.user.id);

    if (info.changes === 0) {
      return res.status(404).json({ error: "Tour not found or not yours" });
    }

    res.json({ message: "Tour deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/guide/tours — guide's own tours
app.get("/api/guide/tours", requireAuth, requireRole("guide"), (req, res) => {
  try {
    const tours = db
      .prepare("SELECT * FROM tours WHERE guide_id = ? ORDER BY created_at DESC, id DESC")
      .all(req.user.id);
    res.json(tours);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/guide/bookings — bookings on guide's tours
app.get("/api/guide/bookings", requireAuth, requireRole("guide"), (req, res) => {
  try {
    const bookings = db
      .prepare(
        `SELECT b.*, t.title AS tour_title, u.display_name AS tourist_name
         FROM bookings b
         JOIN tours t ON b.tour_id = t.id
         JOIN users u ON b.tourist_id = u.id
         WHERE t.guide_id = ?
         ORDER BY b.created_at DESC, b.id DESC`
      )
      .all(req.user.id);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Booking Routes ──────────────────────────────────────────────────

// POST /api/bookings — tourist books a tour
app.post("/api/bookings", requireAuth, requireRole("tourist"), (req, res) => {
  try {
    const { tour_id, booking_date, guests } = req.body;

    if (!tour_id || !booking_date) {
      return res.status(400).json({ error: "tour_id and booking_date required" });
    }

    // Check tour exists and is approved
    const tour = db.prepare("SELECT * FROM tours WHERE id = ? AND status = 'approved'").get(tour_id);
    if (!tour) {
      return res.status(404).json({ error: "Tour not found or not available" });
    }

    const info = db
      .prepare("INSERT INTO bookings (tour_id, tourist_id, booking_date, guests) VALUES (?, ?, ?, ?)")
      .run(tour_id, req.user.id, booking_date, guests || 1);

    res.status(201).json({ id: Number(info.lastInsertRowid), message: "Booking confirmed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings — tourist's own bookings
app.get("/api/bookings", requireAuth, requireRole("tourist"), (req, res) => {
  try {
    const bookings = db
      .prepare(
        `SELECT b.*, t.title AS tour_title, t.location, t.price,
                u.display_name AS guide_name
         FROM bookings b
         JOIN tours t ON b.tour_id = t.id
         JOIN users u ON t.guide_id = u.id
         WHERE b.tourist_id = ?
         ORDER BY b.created_at DESC, b.id DESC`
      )
      .all(req.user.id);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bookings/:id — tourist cancels booking
app.delete("/api/bookings/:id", requireAuth, requireRole("tourist"), (req, res) => {
  try {
    const info = db
      .prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND tourist_id = ?")
      .run(req.params.id, req.user.id);

    if (info.changes === 0) {
      return res.status(404).json({ error: "Booking not found or not yours" });
    }

    res.json({ message: "Booking cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Routes ────────────────────────────────────────────────────

// GET /api/admin/stats
app.get("/api/admin/stats", requireAuth, requireRole("admin"), (req, res) => {
  try {
    const count = (sql) => db.prepare(sql).get().count;

    res.json({
      totalUsers:        count("SELECT COUNT(*) AS count FROM users"),
      totalGuides:       count("SELECT COUNT(*) AS count FROM users WHERE role = 'guide'"),
      totalTourists:     count("SELECT COUNT(*) AS count FROM users WHERE role = 'tourist'"),
      totalTours:        count("SELECT COUNT(*) AS count FROM tours"),
      approvedTours:     count("SELECT COUNT(*) AS count FROM tours WHERE status = 'approved'"),
      pendingTours:      count("SELECT COUNT(*) AS count FROM tours WHERE status = 'pending'"),
      totalBookings:     count("SELECT COUNT(*) AS count FROM bookings"),
      confirmedBookings: count("SELECT COUNT(*) AS count FROM bookings WHERE status = 'confirmed'"),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/tours — all tours including pending
app.get("/api/admin/tours", requireAuth, requireRole("admin"), (req, res) => {
  try {
    const tours = db
      .prepare(
        `SELECT t.*, u.display_name AS guide_name
         FROM tours t JOIN users u ON t.guide_id = u.id
         ORDER BY t.created_at DESC, t.id DESC`
      )
      .all();
    res.json(tours);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/tours/:id — approve or reject
app.patch("/api/admin/tours/:id", requireAuth, requireRole("admin"), (req, res) => {
  try {
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    }

    const info = db.prepare("UPDATE tours SET status = ? WHERE id = ?").run(status, req.params.id);

    if (info.changes === 0) {
      return res.status(404).json({ error: "Tour not found" });
    }

    res.json({ message: `Tour ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/bookings — all bookings
app.get("/api/admin/bookings", requireAuth, requireRole("admin"), (req, res) => {
  try {
    const bookings = db
      .prepare(
        `SELECT b.*, t.title AS tour_title, u.display_name AS tourist_name
         FROM bookings b
         JOIN tours t ON b.tour_id = t.id
         JOIN users u ON b.tourist_id = u.id
         ORDER BY b.created_at DESC, b.id DESC`
      )
      .all();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI Recommend ────────────────────────────────────────────────────

let aiClient = null;

function getAIClient() {
  if (!aiClient) {
    const OpenAI = require("openai");
    aiClient = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY || "missing-key",
    });
  }
  return aiClient;
}

// POST /api/tours/recommend
app.post("/api/tours/recommend", requireAuth, async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({ error: "Please describe what kind of tour you are looking for" });
    }

    // Get all approved tours
    const tours = db
      .prepare(
        `SELECT t.title, t.description, t.location, t.category, t.price, t.duration, t.max_guests,
                u.display_name AS guide_name
         FROM tours t JOIN users u ON t.guide_id = u.id
         WHERE t.status = 'approved'`
      )
      .all();

    if (tours.length === 0) {
      return res.json({ recommendation: "No tours are currently available. Please check back later!" });
    }

    const tourList = tours
      .map((t, i) => `${i + 1}. "${t.title}" in ${t.location} — ${t.category}, $${t.price}, ${t.duration}, max ${t.max_guests} guests, guide: ${t.guide_name}. ${t.description.substring(0, 150)}...`)
      .join("\n");

    const client = getAIClient();
    const completion = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "recursive/flint-v1.0:free",
      messages: [
        {
          role: "system",
          content: "You are a helpful travel advisor for TravelGuide, a platform connecting tourists with local guides in China. Given the tourist's preferences and the available tours, recommend the best matching tours. Explain WHY each tour matches their interests. Be specific and enthusiastic. Keep your response under 300 words.",
        },
        {
          role: "user",
          content: `Tourist's preferences: "${preferences}"\n\nAvailable tours:\n${tourList}\n\nRecommend the best tours for this tourist and explain why.`,
        },
      ],
      max_tokens: 2000,
    });

    const recommendation = completion.choices[0]?.message?.content || "Sorry, I could not generate a recommendation right now. Please try again.";

    res.json({ recommendation });
  } catch (err) {
    console.error("AI recommend error:", err.message);
    res.status(500).json({ error: "AI recommendation failed. Please try again later." });
  }
});

// ── Start server ────────────────────────────────────────────────────

try {
  initSchema();
  app.listen(PORT, () => {
    const where = process.env.TURSO_DATABASE_URL ? "Turso (hosted)" : "travelguide.db (local file)";
    console.log(`✅ TravelGuide API running on http://localhost:${PORT}  ·  database: ${where}`);
  });
} catch (err) {
  console.error("❌ Failed to initialize database:", err.message);
  process.exit(1);
}
