require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const { rateLimit } = require("express-rate-limit");
const crypto = require("crypto");
const { formatDatabaseDiagnostic } = require("./database-diagnostics");

const app = express();
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}
const PORT = Number(process.env.PORT) || 3000;
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
let dbAvailable = false;
let authSessionMiddleware;
const PgSessionStore = connectPgSimple(session);

const SESSION_COOKIE_NAME = "campusloop.sid";
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);

function publicUser(user) {
    return { id: String(user.id), name: user.name, email: user.email };
}

function normalizeEmail(value) {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    const at = email.indexOf("@");
    if (email.length > 254 || at < 1 || at !== email.lastIndexOf("@") ||
        email.slice(at + 1).indexOf(".") < 1 || email.split("").some(char => char.charCodeAt(0) <= 32)) return null;
    return email;
}

function validPassword(value) {
    return typeof value === "string" && value.length >= 8 &&
        value.length <= 128 && Buffer.byteLength(value, "utf8") <= 72;
}

function handleAuthDatabaseError(res, error) {
    if (error && error.code === "23505") {
        return res.status(409).json({ status: "error", message: "An account with this email already exists." });
    }
    console.error("Authentication database operation failed:", formatDatabaseDiagnostic(error));
    return res.status(dbAvailable ? 500 : 503).json({
        status: "error",
        message: dbAvailable ? "Could not complete the authentication request." : "Authentication service is unavailable."
    });
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => error ? reject(error) : resolve());
    });
}

function requireSameOrigin(req, res, next) {
    const origin = req.get("origin");
    const fetchSite = req.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
        return res.status(403).json({ status: "error", message: "Cross-origin request rejected." });
    }
    if (origin) {
        try {
            const expectedOrigin = req.protocol + "://" + req.get("host");
            if (new URL(origin).origin !== expectedOrigin) {
                return res.status(403).json({ status: "error", message: "Cross-origin request rejected." });
            }
        } catch {
            return res.status(403).json({ status: "error", message: "Cross-origin request rejected." });
        }
    }
    return next();
}

const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: "error", message: "Too many authentication attempts. Please try again later." }
});
const dummyPasswordHash = DUMMY_PASSWORD_HASH;

const sampleProducts = [
    {
        id: 1,
        name: "Engineering Mathematics",
        category: "Books",
        price: 350,
        icon: "📚",
        description: "Used textbook in good condition"
    },
    {
        id: 2,
        name: "Scientific Calculator",
        category: "Electronics",
        price: 450,
        icon: "🧮",
        description: "Student calculator"
    },
    {
        id: 3,
        name: "Lab Coat",
        category: "Lab",
        price: 250,
        icon: "🥼",
        description: "Clean lab coat, gently used"
    },
    {
        id: 4,
        name: "Circuit Components Kit",
        category: "Lab",
        price: 400,
        icon: "🔌",
        description: "Basic electronics practice kit"
    },
    {
        id: 5,
        name: "Programming in C++",
        category: "Books",
        price: 300,
        icon: "💻",
        description: "Beginner programming book"
    },
    {
        id: 6,
        name: "USB Keyboard",
        category: "Electronics",
        price: 200,
        icon: "⌨️",
        description: "Pre-owned, working keyboard"
    }
];

function handleProductDatabaseError(res, error) {
    console.error("Product database operation failed:", formatDatabaseDiagnostic(error));
    return res.status(dbAvailable ? 500 : 503).json({
        status: "error",
        message: dbAvailable
            ? "Could not complete the product request."
            : "Product database is unavailable."
    });
}

async function connectToDatabase() {
    if (!pool) {
        console.log("DATABASE_URL not configured.");
        return;
    }

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS products (
                id BIGINT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
                price NUMERIC NOT NULL, icon TEXT NOT NULL, description TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                id BIGINT PRIMARY KEY, title TEXT NOT NULL, date DATE NOT NULL,
                location TEXT NOT NULL, category TEXT NOT NULL
            );
        `);
        if (typeof SESSION_SECRET === "string" && Buffer.byteLength(SESSION_SECRET, "utf8") >= 32) {
            authSessionMiddleware = session({
                name: SESSION_COOKIE_NAME,
                secret: SESSION_SECRET,
                store: new PgSessionStore({ pool, tableName: "session", createTableIfMissing: true, pruneSessionInterval: 60 * 15 }),
                resave: false,
                saveUninitialized: false,
                cookie: { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE }
            });
        } else {
            console.error("Authentication is disabled: configure SESSION_SECRET with at least 32 bytes.");
        }
        for (const product of sampleProducts) await pool.query("INSERT INTO products (id,name,category,price,icon,description) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING", [product.id, product.name, product.category, product.price, product.icon, product.description]);
        for (const event of sampleEvents) await pool.query("INSERT INTO events (id,title,date,location,category) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING", [event.id, event.title, event.date, event.location, event.category]);
        dbAvailable = true;
        console.log("PostgreSQL connected successfully!");
    } catch (error) {
        dbAvailable = false;
        authSessionMiddleware = null;
        console.error("PostgreSQL connection failed:", formatDatabaseDiagnostic(error));
    }
}

// ==========================================
// BASIC CONFIGURATION
// ==========================================

const websiteFolder = __dirname;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication sessions are enabled only after PostgreSQL connects.
app.use((req, res, next) => {
    if (!req.path.startsWith("/api/auth/")) return next();
    if (!authSessionMiddleware) {
        return res.status(503).json({ status: "error", message: "Authentication service is unavailable." });
    }
    return authSessionMiddleware(req, res, next);
});

// Serve frontend files
app.use(express.static(websiteFolder));


// ==========================================
// HOMEPAGE
// ==========================================

app.get("/", (req, res) => {
    const indexPath = path.join(websiteFolder, "index.html");

    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("index.html not found!");
    }
});


// ==========================================
// HEALTH CHECK
// ==========================================
app.get("/api/health", (req, res) => {
    res.json({
        status: "success",
        message: "CampusLoop AI server is running!",
        database: dbAvailable ? "connected" : "disconnected"
    });
});



// ==========================================
// STUDENT AUTHENTICATION
// ==========================================

app.post("/api/auth/register", requireSameOrigin, authRateLimit, async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = normalizeEmail(body.email);
    const password = body.password;
    if (name.length < 1 || name.length > 80) {
        return res.status(400).json({ status: "error", message: "Name must be between 1 and 80 characters." });
    }
    if (!email) return res.status(400).json({ status: "error", message: "Enter a valid email address." });
    if (!validPassword(password)) {
        return res.status(400).json({ status: "error", message: "Password must be 8–128 characters and no more than 72 UTF-8 bytes." });
    }
    if (password !== body.confirmPassword) {
        return res.status(400).json({ status: "error", message: "Passwords do not match." });
    }
    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const { rows: [user] } = await pool.query("INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email", [name, email, passwordHash]);
        await regenerateSession(req);
        req.session.userId = String(user.id);
        return req.session.save(error => {
            if (error) return handleAuthDatabaseError(res, error);
            return res.status(201).json({ status: "success", message: "Account created successfully.", user: publicUser(user) });
        });
    } catch (error) {
        return handleAuthDatabaseError(res, error);
    }
});

app.post("/api/auth/login", requireSameOrigin, authRateLimit, async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const email = normalizeEmail(body.email);
    const password = body.password;
    if (!email || typeof password !== "string" || password.length === 0 || Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ status: "error", message: "Enter a valid email and password." });
    }
    try {
        const { rows: [user] } = await pool.query("SELECT id,name,email,password_hash AS \"passwordHash\" FROM users WHERE email=$1", [email]);
        const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : dummyPasswordHash);
        if (!user || !passwordMatches) {
            return res.status(401).json({ status: "error", message: "Email or password is incorrect." });
        }
        await regenerateSession(req);
        req.session.userId = String(user.id);
        return req.session.save(error => {
            if (error) return handleAuthDatabaseError(res, error);
            return res.json({ status: "success", message: "Signed in successfully.", user: publicUser(user) });
        });
    } catch (error) {
        return handleAuthDatabaseError(res, error);
    }
});

app.get("/api/auth/me", async (req, res) => {
    if (!req.session || !/^\d+$/.test(String(req.session.userId || ""))) {
        return res.status(401).json({ status: "error", message: "Not authenticated." });
    }
    try {
        const { rows: [user] } = await pool.query("SELECT id,name,email FROM users WHERE id=$1", [req.session.userId]);
        if (!user) {
            return req.session.destroy(() => res.status(401).json({ status: "error", message: "Not authenticated." }));
        }
        return res.json({ status: "success", user: publicUser(user) });
    } catch (error) {
        return handleAuthDatabaseError(res, error);
    }
});

app.post("/api/auth/logout", requireSameOrigin, (req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" });
    if (!req.session) return res.json({ status: "success", message: "Logged out." });
    return req.session.destroy(error => {
        if (error) return handleAuthDatabaseError(res, error);
        return res.json({ status: "success", message: "Logged out." });
    });
});
// ==========================================
// CAMPUSLOOP PRODUCTS
// ==========================================

// Get all products
app.get("/api/products", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id,name,category,price,icon,description FROM products ORDER BY id");
        const products = rows.map(product => ({ ...product, id: Number(product.id), price: Number(product.price) }));

        return res.json({
            status: "success",
            count: products.length,
            products
        });
    } catch (error) {
        return handleProductDatabaseError(res, error);
    }
});


// Search products
app.get("/api/products/search", async (req, res) => {
    const query = (req.query.q || "").toLowerCase().trim();
    const category = req.query.category || "All";
    try {
        const { rows } = await pool.query("SELECT id,name,category,price,icon,description FROM products WHERE ($1='' OR name ILIKE $2 OR description ILIKE $2 OR category ILIKE $2) AND ($3='All' OR category=$3) ORDER BY id", [query, `%${query}%`, category]);
        const results = rows.map(product => ({ ...product, id: Number(product.id), price: Number(product.price) }));

        return res.json({
            status: "success",
            count: results.length,
            products: results
        });
    } catch (error) {
        return handleProductDatabaseError(res, error);
    }
});


// ==========================================
// GET SINGLE PRODUCT
// ==========================================

app.get("/api/products/:id", async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(404).json({
            status: "error",
            message: "Product not found."
        });
    }

    try {
        const { rows: [row] } = await pool.query("SELECT id,name,category,price,icon,description FROM products WHERE id=$1", [productId]);
        const product = row && { ...row, id: Number(row.id), price: Number(row.price) };

        if (!product) {
            return res.status(404).json({
                status: "error",
                message: "Product not found."
            });
        }

        return res.json({
            status: "success",
            product
        });
    } catch (error) {
        return handleProductDatabaseError(res, error);
    }
});




// ==========================================
// STUDENT API
// ==========================================

app.post("/api/campus", (req, res) => {
    const { name, course } = req.body;

    // Validation
    if (!name || !course) {
        return res.status(400).json({
            status: "error",
            message: "Name and course are required."
        });
    }

    // CampusLoop logic
    const student = {
        name: name.trim(),
        course: course.trim()
    };

    res.json({
        status: "success",
        message: `Welcome ${student.name}!`,
        student: student
    });
});


// ==========================================
// CAMPUS EVENTS
// ==========================================

const sampleEvents = [
    {
        id: 1,
        title: "Hackathon",
        date: "2026-11-10",
        location: "Main Auditorium",
        category: "Technology"
    },
    {
        id: 2,
        title: "Cultural Fest",
        date: "2026-11-15",
        location: "Campus Ground",
        category: "Cultural"
    },
    {
        id: 3,
        title: "AI Workshop",
        date: "2026-11-20",
        location: "Computer Lab",
        category: "Workshop"
    }
];

function handleEventDatabaseError(res, error) {
    console.error("Event database operation failed:", formatDatabaseDiagnostic(error));
    return res.status(dbAvailable ? 500 : 503).json({
        status: "error",
        message: dbAvailable
            ? "Could not complete the event request."
            : "Event database is unavailable."
    });
}

app.get("/api/events", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id,title,date::text,location,category FROM events ORDER BY id");
        const events = rows.map(event => ({ ...event, id: Number(event.id) }));

        return res.json({
            status: "success",
            count: events.length,
            events
        });
    } catch (error) {
        return handleEventDatabaseError(res, error);
    }
});


// ==========================================
// EVENT SEARCH
// ==========================================

app.get("/api/events/search", async (req, res) => {
    const query = (req.query.q || "").toLowerCase().trim();
    try {
        const { rows } = await pool.query("SELECT id,title,date::text,location,category FROM events WHERE ($1='' OR title ILIKE $2 OR category ILIKE $2 OR location ILIKE $2) ORDER BY id", [query, `%${query}%`]);
        const events = rows.map(event => ({ ...event, id: Number(event.id) }));

        if (!query) {
            return res.json({
                status: "success",
                events
            });
        }

        return res.json({
            status: "success",
            query,
            count: events.length,
            events
        });
    } catch (error) {
        return handleEventDatabaseError(res, error);
    }
});


// ==========================================
// AI-STYLE CAMPUS RECOMMENDATION
// ==========================================

app.post("/api/recommend", (req, res) => {

    const { interest } = req.body;

    if (!interest) {
        return res.status(400).json({
            status: "error",
            message: "Please provide an interest."
        });
    }

    const text = interest.toLowerCase();

    let recommendation;

    if (
        text.includes("coding") ||
        text.includes("programming") ||
        text.includes("technology") ||
        text.includes("computer") ||
        text.includes("ai")
    ) {
        recommendation = {
            category: "Technology",
            event: "Hackathon",
            reason: "This matches your interest in technology and programming."
        };
    }

    else if (
        text.includes("music") ||
        text.includes("dance") ||
        text.includes("art") ||
        text.includes("culture")
    ) {
        recommendation = {
            category: "Cultural",
            event: "Cultural Fest",
            reason: "This matches your interest in creative and cultural activities."
        };
    }

    else if (
        text.includes("learning") ||
        text.includes("workshop") ||
        text.includes("study")
    ) {
        recommendation = {
            category: "Workshop",
            event: "AI Workshop",
            reason: "This matches your interest in learning and skill development."
        };
    }

    else {
        recommendation = {
            category: "General",
            event: "Explore Campus",
            reason: "We recommend exploring different campus activities."
        };
    }

    res.json({
        status: "success",
        interest: interest,
        recommendation: recommendation
    });
});


// ==========================================
// 404 API HANDLER
// ==========================================

app.use("/api", (req, res) => {
    res.status(404).json({
        status: "error",
        message: "API endpoint not found."
    });
});


// ==========================================
// ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({
        status: "error",
        message: "Something went wrong on the server."
    });
});


// ==========================================
// START SERVER
// ==========================================
async function startServer() {
    await connectToDatabase();

    app.listen(PORT, () => {
        console.log("");
        console.log("======================================");
        console.log("       CAMPUSLOOP AI SERVER");
        console.log("======================================");
        console.log("");
        console.log(`Website: http://localhost:${PORT}`);
        console.log(`Health:  http://localhost:${PORT}/api/health`);
        console.log("");
        console.log("Server is running successfully!");
        console.log("");
    });
}

startServer();

;
