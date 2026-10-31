const express = require("express");
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
}
const supabase = createClient(supabaseUrl, supabaseKey);
const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});
async function testSupabaseConnection() {
    const { data, error } = await supabase
        .from('products')
        .select('id')
        .limit(1);

    if (error) {
        console.error('Supabase connection failed:', error.message);
        return;
    }

    console.log('Supabase connected successfully!');
}
testSupabaseConnection();
const path = require("path");
const fs = require("fs");

const app = express();
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

const PORT = Number(process.env.PORT) || 3000;
const websiteFolder = __dirname;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(websiteFolder));

app.get("/", (req, res) => {
    const indexPath = path.join(websiteFolder, "index.html");
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    return res.status(404).send("index.html not found!");
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "success",
        message: "CampusLoop AI server is running!"
    });
});

app.get("/api/products", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .order("id", { ascending: true });

        if (error) {
            console.error("Products error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not fetch products."
            });
        }

        return res.json({
            status: "success",
            count: data.length,
            products: data
        });
    } catch (error) {
        console.error("Products error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Something went wrong while fetching products."
        });
    }
});

const storageUnavailable = feature => (req, res) => res.status(503).json({
    status: "error",
    message: `${feature} is temporarily unavailable until storage is configured.`
});

function normalizeEmail(value) {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
    return email;
}

function validPassword(value) {
    return typeof value === "string" &&
        value.length >= 8 &&
        value.length <= 128 &&
        Buffer.byteLength(value, "utf8") <= 72;
}

function setAuthCookies(res, session) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const cookieOptions = `; HttpOnly; SameSite=Lax; Path=/${secure}`;
    res.append("Set-Cookie", `campusloop.access-token=${encodeURIComponent(session.access_token)}${cookieOptions}`);
    res.append("Set-Cookie", `campusloop.refresh-token=${encodeURIComponent(session.refresh_token)}${cookieOptions}`);
}

function clearAuthCookies(res) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const cookieOptions = `; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=0`;
    res.append("Set-Cookie", `campusloop.access-token=${cookieOptions}`);
    res.append("Set-Cookie", `campusloop.refresh-token=${cookieOptions}`);
}

function getRequestCookies(req) {
    const cookies = {};
    for (const part of (req.get("cookie") || "").split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0) continue;
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (name) cookies[name] = decodeURIComponent(value);
    }
    return cookies;
}

async function getAuthenticatedUser(req, res) {
    const cookies = getRequestCookies(req);
    let accessToken = cookies["campusloop.access-token"];
    const refreshToken = cookies["campusloop.refresh-token"];
    let session;

    if (accessToken) {
        const result = await authClient.auth.getUser(accessToken);
        if (result.data.user) {
            session = { user: result.data.user };
        }
    }

    if (!session && refreshToken) {
        const result = await authClient.auth.setSession({
            access_token: accessToken || "",
            refresh_token: refreshToken
        });
        if (result.data.user && result.data.session) {
            accessToken = result.data.session.access_token;
            session = { user: result.data.user, session: result.data.session };
        }
    }

    if (!session) {
        clearAuthCookies(res);
        return null;
    }

    if (session.session) setAuthCookies(res, session.session);
    return session.user;
}

// Account data and sessions require persistent storage.
app.post("/api/auth/register", async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = normalizeEmail(body.email);
    const password = body.password;

    if (name.length < 1 || name.length > 80) {
        return res.status(400).json({
            status: "error",
            message: "Name must be between 1 and 80 characters."
        });
    }
    if (!email) {
        return res.status(400).json({
            status: "error",
            message: "Enter a valid email address."
        });
    }
    if (!validPassword(password)) {
        return res.status(400).json({
            status: "error",
            message: "Password must be 8–128 characters and no more than 72 UTF-8 bytes."
        });
    }
    if (password !== body.confirmPassword) {
        return res.status(400).json({
            status: "error",
            message: "Passwords do not match."
        });
    }

    let authUser;
    try {
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name }
        });

        if (error) {
            if (/already registered|already exists|duplicate/i.test(error.message || "")) {
                return res.status(409).json({
                    status: "error",
                    message: "An account with this email already exists."
                });
            }
            console.error("Registration Auth error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not create the account."
            });
        }

        authUser = data.user;
        const { error: profileError } = await supabase
            .from("profiles")
            .insert({ id: authUser.id, name, email });

        if (profileError) {
            await supabase.auth.admin.deleteUser(authUser.id);
            console.error("Registration profile error:", profileError.message);
            return res.status(500).json({
                status: "error",
                message: "Could not create the account profile."
            });
        }

        return res.status(201).json({
            status: "success",
            message: "Account created successfully.",
            user: {
                id: authUser.id,
                name,
                email
            }
        });
    } catch (error) {
        if (authUser) {
            await supabase.auth.admin.deleteUser(authUser.id).catch(cleanupError => {
                console.error("Registration cleanup error:", cleanupError.message);
            });
        }
        console.error("Registration error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Could not create the account."
        });
    }
});
app.post("/api/auth/login", async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const email = normalizeEmail(body.email);
    const password = body.password;

    if (!email || typeof password !== "string" || password.length === 0 ||
        Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({
            status: "error",
            message: "Enter a valid email and password."
        });
    }

    try {
        const { data, error } = await authClient.auth.signInWithPassword({
            email,
            password
        });

        if (error || !data.session || !data.user) {
            if (error) console.error("Login Auth error:", error.message);
            return res.status(401).json({
                status: "error",
                message: "Email or password is incorrect."
            });
        }

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("name,email")
            .eq("id", data.user.id)
            .maybeSingle();

        if (profileError) {
            console.error("Login profile lookup error:", profileError.message);
            return res.status(500).json({
                status: "error",
                message: "Could not complete the login request."
            });
        }

        setAuthCookies(res, data.session);
        return res.json({
            status: "success",
            message: "Signed in successfully.",
            user: {
                id: data.user.id,
                name: profile?.name || data.user.user_metadata?.name || email,
                email: profile?.email || data.user.email || email
            }
        });
    } catch (error) {
        console.error("Login error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Could not complete the login request."
        });
    }
});
app.get("/api/auth/me", async (req, res) => {
    try {
        const authUser = await getAuthenticatedUser(req, res);
        if (!authUser) {
            return res.status(401).json({
                status: "error",
                message: "Not authenticated."
            });
        }

        const { data: profile, error } = await supabase
            .from("profiles")
            .select("name,email")
            .eq("id", authUser.id)
            .maybeSingle();

        if (error) {
            console.error("Session profile lookup error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not check the authentication session."
            });
        }

        return res.json({
            status: "success",
            user: {
                id: authUser.id,
                name: profile?.name || authUser.user_metadata?.name || authUser.email,
                email: profile?.email || authUser.email
            }
        });
    } catch (error) {
        console.error("Session lookup error:", error.message);
        clearAuthCookies(res);
        return res.status(401).json({
            status: "error",
            message: "Not authenticated."
        });
    }
});
app.post("/api/auth/logout", (req, res) => {
    clearAuthCookies(res);
    return res.json({
        status: "success",
        message: "Logged out."
    });
});

// Listings and events require persistent storage.
app.get("/api/products/search", async (req, res) => {
    const searchTerm = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

    try {
        let productsQuery = supabase
            .from("products")
            .select("*")
            .order("id", { ascending: true });

        if (searchTerm) {
            const safeSearchTerm = searchTerm.replace(/[(),\\]/g, " ");
            const pattern = `%${safeSearchTerm}%`;
            productsQuery = productsQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
        }
        if (category && category !== "All") {
            productsQuery = productsQuery.eq("category", category);
        }

        const { data, error } = await productsQuery;
        if (error) {
            console.error("Product search error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not search products."
            });
        }

        return res.json({
            status: "success",
            count: data.length,
            products: data
        });
    } catch (error) {
        console.error("Product search error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Something went wrong while searching products."
        });
    }
});
app.get("/api/products/:id", async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(404).json({
            status: "error",
            message: "Product not found."
        });
    }

    try {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", productId)
            .maybeSingle();

        if (error) {
            console.error("Product lookup error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not fetch the product."
            });
        }

        if (!data) {
            return res.status(404).json({
                status: "error",
                message: "Product not found."
            });
        }

        return res.json({
            status: "success",
            product: data
        });
    } catch (error) {
        console.error("Product lookup error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Something went wrong while fetching the product."
        });
    }
});
app.get("/api/events", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("events")
            .select("*")
            .order("date", { ascending: true })
            .order("id", { ascending: true });

        if (error) {
            console.error("Events error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not fetch events."
            });
        }

        return res.json({
            status: "success",
            count: data.length,
            events: data
        });
    } catch (error) {
        console.error("Events error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Something went wrong while fetching events."
        });
    }
});
app.get("/api/events/search", async (req, res) => {
    const searchTerm = req.query.q === undefined ? "" : req.query.q;
    const category = req.query.category === undefined ? "" : req.query.category;
    if (typeof searchTerm !== "string" || typeof category !== "string") {
        return res.status(400).json({
            status: "error",
            message: "Search and category filters must be text values."
        });
    }

    try {
        let eventsQuery = supabase
            .from("events")
            .select("*")
            .order("date", { ascending: true })
            .order("id", { ascending: true });

        const trimmedSearchTerm = searchTerm.trim();
        const trimmedCategory = category.trim();
        if (trimmedSearchTerm) {
            const safeSearchTerm = trimmedSearchTerm.replace(/[(),\\]/g, " ");
            const pattern = `%${safeSearchTerm}%`;
            eventsQuery = eventsQuery.or(`title.ilike.${pattern},location.ilike.${pattern}`);
        }
        if (trimmedCategory && trimmedCategory !== "All") {
            eventsQuery = eventsQuery.eq("category", trimmedCategory);
        }

        const { data, error } = await eventsQuery;
        if (error) {
            console.error("Event search error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not search events."
            });
        }

        return res.json({
            status: "success",
            count: data.length,
            events: data
        });
    } catch (error) {
        console.error("Event search error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Something went wrong while searching events."
        });
    }
});

app.post("/api/campus", (req, res) => {
    const { name, course } = req.body;
    if (!name || !course) {
        return res.status(400).json({
            status: "error",
            message: "Name and course are required."
        });
    }

    const student = {
        name: name.trim(),
        course: course.trim()
    };

    return res.json({
        status: "success",
        message: `Welcome ${student.name}!`,
        student
    });
});

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

    if (text.includes("coding") || text.includes("programming") ||
        text.includes("technology") || text.includes("computer") || text.includes("ai")) {
        recommendation = {
            category: "Technology",
            event: "Hackathon",
            reason: "This matches your interest in technology and programming."
        };
    } else if (text.includes("music") || text.includes("dance") ||
        text.includes("art") || text.includes("culture")) {
        recommendation = {
            category: "Cultural",
            event: "Cultural Fest",
            reason: "This matches your interest in creative and cultural activities."
        };
    } else if (text.includes("learning") || text.includes("workshop") ||
        text.includes("study")) {
        recommendation = {
            category: "Workshop",
            event: "AI Workshop",
            reason: "This matches your interest in learning and skill development."
        };
    } else {
        recommendation = {
            category: "General",
            event: "Explore Campus",
            reason: "We recommend exploring different campus activities."
        };
    }

    return res.json({
        status: "success",
        interest,
        recommendation
    });
});

app.use("/api", (req, res) => {
    res.status(404).json({
        status: "error",
        message: "API endpoint not found."
    });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({
        status: "error",
        message: "Something went wrong on the server."
    });
});

app.listen(PORT, () => {
    console.log(`CampusLoop AI server listening on port ${PORT}`);
});