require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const { rateLimit } = require("express-rate-limit");
const crypto = require("crypto");

const app = express();
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}
const PORT = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI;

const mongoClient = mongoUri
    ? new MongoClient(mongoUri)
    : null;
let db;
let authSessionMiddleware;

const SESSION_COOKIE_NAME = "campusloop.sid";
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);

function usersCollection() {
    if (!db) throw new Error("Database is not available.");
    return db.collection("users");
}

function publicUser(user) {
    return { id: user._id.toString(), name: user.name, email: user.email };
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
    if (error && error.code === 11000) {
        return res.status(409).json({ status: "error", message: "An account with this email already exists." });
    }
    console.error("Authentication database operation failed.");
    return res.status(db ? 500 : 503).json({
        status: "error",
        message: db ? "Could not complete the authentication request." : "Authentication service is unavailable."
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

function productsCollection() {
    if (!db) {
        throw new Error("Database is not available.");
    }
    return db.collection("products");
}

function toProductResponse(document) {
    if (!document) return null;
    const { _id, ...product } = document;
    return product;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function handleProductDatabaseError(res, error) {
    console.error("Product database operation failed:", error.message);
    return res.status(db ? 500 : 503).json({
        status: "error",
        message: db
            ? "Could not complete the product request."
            : "Product database is unavailable."
    });
}

async function connectToMongoDB() {
    if (!mongoClient) {
        console.log("MongoDB URI not configured.");
        return;
    }

    try {
        await mongoClient.connect();
        db = mongoClient.db("campusloop");
        await db.collection("users").createIndex(
            { email: 1 },
            { unique: true, name: "unique_user_email_ci", collation: { locale: "en", strength: 2 } }
        );
        if (typeof SESSION_SECRET === "string" && Buffer.byteLength(SESSION_SECRET, "utf8") >= 32) {
            authSessionMiddleware = session({
                name: SESSION_COOKIE_NAME,
                secret: SESSION_SECRET,
                store: MongoStore.create({
                    clientPromise: Promise.resolve(mongoClient),
                    dbName: "campusloop",
                    collectionName: "sessions",
                    ttl: Math.floor(SESSION_MAX_AGE / 1000)
                }),
                resave: false,
                saveUninitialized: false,
                cookie: { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE }
            });
        } else {
            console.error("Authentication is disabled: configure SESSION_SECRET with at least 32 bytes.");
        }
        const collection = db.collection("products");
        await collection.bulkWrite(sampleProducts.map(product => ({
            updateOne: {
                filter: { _id: product.id },
                update: { $setOnInsert: product },
                upsert: true
            }
        })), { ordered: true });
        const eventsCollection = db.collection("events");
        await eventsCollection.bulkWrite(sampleEvents.map(event => ({
            updateOne: {
                filter: { _id: event.id },
                update: { $setOnInsert: event },
                upsert: true
            }
        })), { ordered: true });
        console.log("MongoDB connected successfully!");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exitCode = 1;
    }
}

// ==========================================
// BASIC CONFIGURATION
// ==========================================

const websiteFolder = __dirname;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication sessions are enabled only after MongoDB connects.
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
        message: "CampusLoop AI server is running!"
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
        const result = await usersCollection().insertOne({ name, email, passwordHash, createdAt: new Date() });
        const user = { _id: result.insertedId, name, email };
        await regenerateSession(req);
        req.session.userId = result.insertedId.toString();
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
        const user = await usersCollection().findOne({ email });
        const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : dummyPasswordHash);
        if (!user || !passwordMatches) {
            return res.status(401).json({ status: "error", message: "Email or password is incorrect." });
        }
        await regenerateSession(req);
        req.session.userId = user._id.toString();
        return req.session.save(error => {
            if (error) return handleAuthDatabaseError(res, error);
            return res.json({ status: "success", message: "Signed in successfully.", user: publicUser(user) });
        });
    } catch (error) {
        return handleAuthDatabaseError(res, error);
    }
});

app.get("/api/auth/me", async (req, res) => {
    if (!req.session || !req.session.userId || !ObjectId.isValid(req.session.userId)) {
        return res.status(401).json({ status: "error", message: "Not authenticated." });
    }
    try {
        const user = await usersCollection().findOne({ _id: new ObjectId(req.session.userId) });
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
        const products = (await productsCollection()
            .find({})
            .sort({ id: 1 })
            .toArray()).map(toProductResponse);

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
    const filter = {};

    if (query) {
        const search = new RegExp(escapeRegex(query), "i");
        filter.$or = [
            { name: search },
            { description: search },
            { category: search }
        ];
    }
    if (category !== "All") filter.category = category;

    try {
        const results = (await productsCollection()
            .find(filter)
            .sort({ id: 1 })
            .toArray()).map(toProductResponse);

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
        const product = toProductResponse(await productsCollection()
            .findOne({ _id: productId }));

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

function eventsCollection() {
    if (!db) {
        throw new Error("Database is not available.");
    }
    return db.collection("events");
}

function handleEventDatabaseError(res, error) {
    console.error("Event database operation failed:", error.message);
    return res.status(db ? 500 : 503).json({
        status: "error",
        message: db
            ? "Could not complete the event request."
            : "Event database is unavailable."
    });
}

app.get("/api/events", async (req, res) => {
    try {
        const events = (await eventsCollection()
            .find({})
            .sort({ id: 1 })
            .toArray()).map(toProductResponse);

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
    const filter = {};

    if (query) {
        const search = new RegExp(escapeRegex(query), "i");
        filter.$or = [
            { title: search },
            { category: search },
            { location: search }
        ];
    }

    try {
        const events = (await eventsCollection()
            .find(filter)
            .sort({ id: 1 })
            .toArray()).map(toProductResponse);

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
    await connectToMongoDB();

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
