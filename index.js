import express from "express";
import dotenv from "dotenv";
import session from "express-session";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.use(cors({ origin: "*", credentials: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "cosmic-secret-2024",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "🌌 Slow down, cosmic traveler!" }
});

const db = new Database("astromitra.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT, role TEXT, content TEXT, mood TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS moods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT, mood TEXT, confidence REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const moodMap = {
  stressed: { keywords: ["stressed","overwhelmed","pressure","deadline"], confidence: 0.9 },
  sad: { keywords: ["sad","lonely","hurt","cry"], confidence: 0.85 },
  anxious: { keywords: ["anxious","panic","nervous","worried"], confidence: 0.88 },
  happy: { keywords: ["happy","great","excited"], confidence: 0.8 }
};

function detectMood(message) {
  const lower = message.toLowerCase();
  let bestMood = "neutral", bestConfidence = 0;
  for (const mood in moodMap) {
    const matches = moodMap[mood].keywords.filter(w => lower.includes(w));
    if (matches.length > 0 && moodMap[mood].confidence > bestConfidence) {
      bestMood = mood; bestConfidence = moodMap[mood].confidence;
    }
  }
  return { mood: bestMood, confidence: bestConfidence };
}

const memory = new Map();

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.json({ reply: "🌌 Send a message!" });
    
    const userId = req.session.id;
    const moodData = detectMood(message);
    
    if (!memory.has(userId)) memory.set(userId, []);
    const history = memory.get(userId);
    history.push({ role: "user", content: message });
    if (history.length > 20) history.splice(0, 2);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You are AstroMitra AI ✨. 2-4 sentences. Cosmic tone. Practical student advice. Mood: ${moodData.mood}` },
          ...history.slice(-10)
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error("AI unavailable");
    
    const data = await response.json();
    const reply = data.choices[0].message.content.trim();
    
    history.push({ role: "assistant", content: reply });
    
    db.prepare("INSERT INTO messages (userId, role, content, mood) VALUES (?, ?, ?, ?)")
      .run(userId, "user", message, moodData.mood);
    db.prepare("INSERT INTO messages (userId, role, content, mood) VALUES (?, ?, ?, ?)")
      .run(userId, "assistant", reply, moodData.mood);

    res.json({ reply, mood: moodData.mood });
  } catch (err) {
    res.json({ reply: "🌌 Cosmic interference... Try again?" });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "🚀 AstroMitra Online" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 AstroMitra on port ${PORT}`));
