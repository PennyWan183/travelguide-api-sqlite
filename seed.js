require("dotenv").config();
const bcrypt = require("bcryptjs");
const { db, initSchema } = require("./db");

function seed() {
  // Create tables (same schema as the server)
  initSchema();

  // Clean existing data (order matters — foreign keys)
  db.exec("DELETE FROM bookings");
  db.exec("DELETE FROM tours");
  db.exec("DELETE FROM users");
  // Restart the AUTOINCREMENT counters so ids begin at 1 again
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('users', 'tours', 'bookings')");

  // Seed users
  const password_hash = bcrypt.hashSync("password123", 10);

  const insertUser = (username, role, display_name, bio) => {
    const info = db
      .prepare("INSERT INTO users (username, password_hash, role, display_name, bio) VALUES (?, ?, ?, ?, ?)")
      .run(username, password_hash, role, display_name, bio);
    return Number(info.lastInsertRowid);
  };

  insertUser("admin", "admin", "Platform Admin", "TravelGuide platform administrator.");
  const liweiId = insertUser("liwei", "guide", "Li Wei", "Born and raised in Harbin. I have been showing visitors the magic of ice and snow for over 8 years. I speak Mandarin, English, and a little Russian.");
  const zhangmeiId = insertUser("zhangmei", "guide", "Zhang Mei", "A tea culture enthusiast from Fujian. I run a small tea farm and love sharing the art of Chinese tea with travelers from around the world.");
  const wangpengId = insertUser("wangpeng", "guide", "Wang Peng", "Photographer and hiking guide based in Yunnan. I know every hidden trail in the Tiger Leaping Gorge area and the best spots for sunrise shots.");
  const tourist1Id = insertUser("tourist1", "tourist", "Alex Johnson", null);
  insertUser("tourist2", "tourist", "Emma Wilson", null);

  // Seed tours
  const insertTour = (guide_id, title, description, location, category, price, duration, max_guests, image_url, status) => {
    const info = db
      .prepare(
        `INSERT INTO tours (guide_id, title, description, location, category, price, duration, max_guests, image_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(guide_id, title, description, location, category, price, duration, max_guests, image_url, status);
    return Number(info.lastInsertRowid);
  };

  // Li Wei's tours (Harbin)
  const iceWalkId = insertTour(
    liweiId,
    "Harbin Ice Festival Night Walk",
    "Experience the world-famous Harbin Ice and Snow Festival after dark, when the massive ice sculptures light up in brilliant colors. We will walk through the main exhibition area of Ice and Snow World, where buildings carved entirely from ice blocks harvested from the Songhua River tower above you. I will explain the engineering behind these structures — how workers cut 2-ton ice blocks, stack them with precision, and install LED lights inside. The festival has been running since 1963 and attracts millions of visitors each winter. Dress warmly: temperatures regularly drop to -25°C. I provide hand warmers and hot ginger tea along the way. We will also stop at a local street vendor for authentic Harbin smoked sausage (hongchang), a must-try winter snack.",
    "Harbin, Heilongjiang",
    "culture", 45.00, "3 hours", 8, null, "approved"
  );

  insertTour(
    liweiId,
    "Songhua River Winter Activities",
    "When the Songhua River freezes solid in December, it transforms into Harbin's largest outdoor playground. Join me for a morning of traditional winter activities right on the frozen river. We will try ice sledding, winter swimming viewing (the famous Harbin winter swimmers!), and horse-drawn sleigh rides. I will share stories about how the river shaped Harbin's history as a trading post and railway hub. For the adventurous, there is an option to drill a hole and try ice fishing — if we catch anything, a nearby restaurant will cook it for us. This is how locals actually spend their winters, not just tourists.",
    "Harbin, Heilongjiang",
    "adventure", 35.00, "4 hours", 6, null, "approved"
  );

  insertTour(
    liweiId,
    "Russian Heritage Walking Tour",
    "Harbin's unique Russian architectural heritage sets it apart from any other Chinese city. On this walking tour through the Daoli District, we visit Saint Sophia Cathedral (now a museum), stroll along Central Street (Zhongyang Dajie) with its cobblestones and European-style buildings, and explore the old Russian trading quarter. I explain how the Chinese Eastern Railway brought thousands of Russian settlers here in the early 1900s, creating a cultural fusion that still defines Harbin today. We will stop at a Russian bakery for authentic lieba bread and kvass drink. Photography stops are built into the route — I know the best angles for every building.",
    "Harbin, Heilongjiang",
    "culture", 30.00, "2.5 hours", 10, null, "approved"
  );

  // Zhang Mei's tours (Fujian)
  const teaJourneyId = insertTour(
    zhangmeiId,
    "Wuyi Mountain Tea Journey",
    "Discover the birthplace of oolong tea in the UNESCO World Heritage Wuyi Mountains. We start at my family's small tea farm where you will pick tea leaves by hand, watch the traditional roasting process, and learn to distinguish between Da Hong Pao, Rou Gui, and Shui Xian varieties through a guided tasting of six teas. I will teach you the proper gongfu tea ceremony technique that you can practice at home. After the tea experience, we take a short hike along the Nine Bends River to see the famous cliff tea gardens where the most prized Da Hong Pao mother trees grow. These six original bushes are insured for over 10 million yuan each. Lunch features local Wuyi specialties paired with complementary teas.",
    "Wuyishan, Fujian",
    "food", 55.00, "6 hours", 6, null, "approved"
  );

  insertTour(
    zhangmeiId,
    "Tulou Roundhouse Village Stay",
    "The Fujian Tulou — massive earthen roundhouses built by the Hakka people — are one of China's most extraordinary architectural achievements. Some are over 700 years old and still house dozens of families. On this overnight experience, we visit the Tianluokeng Tulou cluster, have dinner with a local Hakka family, and sleep inside a tulou guest room. I translate and facilitate conversation with the elderly residents who remember life before the buildings became a UNESCO site. In the morning, we climb the hillside for a panoramic view of the 'four dishes and a soup' tulou formation, then visit a less-touristed tulou village nearby where daily life continues unchanged.",
    "Nanjing County, Fujian",
    "culture", 85.00, "2 days", 4, null, "approved"
  );

  // Wang Peng's tours (Yunnan)
  const gorgeId = insertTour(
    wangpengId,
    "Tiger Leaping Gorge Trek",
    "One of the world's deepest river gorges, Tiger Leaping Gorge offers a two-day trek with jaw-dropping views of the Jinsha River cutting between Jade Dragon Snow Mountain and Haba Snow Mountain. I lead you along the upper trail — the classic high route — with stops at the best viewpoints and overnight at a guesthouse perched on the cliff edge. I know this trail intimately and can adjust the pace for your fitness level. Along the way, I share knowledge about the Naxi minority culture in the villages we pass through, point out medicinal plants, and help you photograph the gorge in the best light. Includes packed lunch, snacks, and plenty of water stops. Not recommended for those with severe fear of heights.",
    "Lijiang, Yunnan",
    "adventure", 70.00, "2 days", 6, null, "approved"
  );

  insertTour(
    wangpengId,
    "Lijiang Old Town Photography Walk",
    "Lijiang Old Town is a photographer's paradise — but only if you know when and where to go. Most tourists see it packed with crowds during the day. I take you out at dawn, when the cobblestone streets are empty, the canal water is mirror-still, and the light hits the traditional Naxi wooden buildings at the perfect angle. We cover the lesser-known alleys, hidden courtyards, and a rooftop terrace with a stunning view of Jade Dragon Snow Mountain. I provide tips on composition, exposure for the tricky light conditions, and even help with phone photography. After the morning shoot, we visit a local Naxi family who makes traditional Dongba paper — a 1,200-year-old craft — and you can try your hand at it.",
    "Lijiang, Yunnan",
    "culture", 40.00, "4 hours", 5, null, "approved"
  );

  insertTour(
    wangpengId,
    "Shangri-La Highland Adventure",
    "Journey to the Tibetan plateau town of Shangri-La (formerly Zhongdian) at 3,300 meters elevation. We visit the Songzanlin Monastery — the largest Tibetan Buddhist monastery in Yunnan, often called 'Little Potala Palace' — and walk around the sacred Napa Lake where yaks graze and black-necked cranes winter. I have a Tibetan friend who hosts us for a yak butter tea and tsampa experience in his traditional home. We also explore the rebuilt old town with its giant prayer wheel and local craft shops. If the season is right (June-August), we make a detour to the alpine meadows at Pudacuo National Park, covered in wildflowers. Altitude sickness can affect some visitors — I carry oxygen canisters and we take it slow.",
    "Shangri-La, Yunnan",
    "adventure", 60.00, "Full day", 6, null, "pending"
  );

  // Seed bookings
  const insertBooking = db.prepare(
    "INSERT INTO bookings (tour_id, tourist_id, booking_date, guests, status) VALUES (?, ?, ?, ?, ?)"
  );
  insertBooking.run(iceWalkId, tourist1Id, "2025-01-15", 2, "confirmed");
  insertBooking.run(teaJourneyId, tourist1Id, "2025-03-20", 1, "confirmed");
  insertBooking.run(gorgeId, tourist1Id, "2025-04-10", 3, "cancelled");

  const where = process.env.TURSO_DATABASE_URL ? "Turso (hosted)" : "travelguide.db (local file)";
  console.log(`✅ Seeded TravelGuide database in ${where}:`);
  console.log("   - 6 users (1 admin, 3 guides, 2 tourists)");
  console.log("   - 8 tours (7 approved, 1 pending)");
  console.log("   - 3 bookings");
  console.log("");
  console.log("   Test accounts (all use password: password123):");
  console.log("   Admin:   admin");
  console.log("   Guides:  liwei, zhangmei, wangpeng");
  console.log("   Tourist: tourist1, tourist2");
}

try {
  seed();
} catch (err) {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
}
