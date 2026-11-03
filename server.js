const express = require("express");
const crypto = require("crypto");
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
const colleges = [
    "BIT Mesra",
    "Birla Institute of Technology, Patna",
    "IIT Patna",
    "NIT Patna",
    "Patna University",
    "AIIMS Patna"
];
const marketplaceCollege = "Birla Institute of Technology, Patna";
function missingCollegeColumn(error) {
    return /column .*college does not exist/i.test(error?.message || "");
}

async function getProfileById(userId) {
    const profileResult = await supabase
        .from("profiles")
        .select("name,email,college")
        .eq("id", userId)
        .maybeSingle();

    if (!missingCollegeColumn(profileResult.error)) return profileResult;

    console.warn("Profiles college column is unavailable; using legacy profile fields.");
    return supabase
        .from("profiles")
        .select("name,email")
        .eq("id", userId)
        .maybeSingle()
        .then(result => ({
            data: result.data ? { ...result.data, college: null } : result.data,
            error: result.error
        }));
}
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
const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT === "live" ? "live" : "sandbox";
const paypalApiBase = paypalEnvironment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
const paypalClientId = process.env.PAYPAL_CLIENT_ID || "";
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET || "";

app.use(express.json({ limit: "8mb" }));
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

    app.get("/api/paypal/config", (req, res) => {
        if (!paypalClientId || !paypalClientSecret) {
            return res.status(503).json({
                status: "error",
                message: "PayPal Sandbox is not configured yet."
            });
        }
        return res.json({
            status: "success",
            clientId: paypalClientId,
            environment: paypalEnvironment,
            currency: "INR"
        });
    });

    async function getPayPalAccessToken() {
        const credentials = Buffer.from(`${paypalClientId}:${paypalClientSecret}`).toString("base64");
        const response = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: "grant_type=client_credentials"
        });
        const data = await response.json();
        if (!response.ok || !data.access_token) {
            throw new Error(data.error_description || "PayPal authentication failed.");
        }
        return data.access_token;
    }

    function normalizePaymentItems(value) {
        if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
        const items = [];
        for (const item of value) {
            if (!item || !Number.isSafeInteger(item.id) || item.id < 1 ||
                !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
                return null;
            }
            const existing = items.find(entry => entry.id === item.id);
            if (existing) existing.quantity = Math.min(99, existing.quantity + item.quantity);
            else items.push({ id: item.id, quantity: item.quantity });
        }
        return items;
    }

    async function getPricedPaymentItems(items) {
        const ids = items.map(item => item.id);
        const { data, error } = await supabase
            .from("products")
            .select("id,name,price")
            .in("id", ids)
            .eq("college", marketplaceCollege);
        if (error && missingCollegeColumn(error)) {
            const legacyResult = await supabase
                .from("products")
                .select("id,name,price")
                .in("id", ids);
            if (legacyResult.error) throw legacyResult.error;
            return legacyResult.data;
        }
        if (error) throw error;
        return data;
    }

    app.post("/api/paypal/orders", async (req, res) => {
        const authUser = await getAuthenticatedUser(req, res);
        if (!authUser) {
            return res.status(401).json({ status: "error", message: "Not authenticated." });
        }
        if (!paypalClientId || !paypalClientSecret) {
            return res.status(503).json({ status: "error", message: "PayPal Sandbox is not configured yet." });
        }
        const items = normalizePaymentItems(req.body?.items);
        if (!items) {
            return res.status(400).json({ status: "error", message: "Your cart is invalid or empty." });
        }

        try {
            const products = await getPricedPaymentItems(items);
            const lineItems = items.map(item => {
                const product = products.find(entry => entry.id === item.id);
                const price = Number(product?.price);
                if (!product || !Number.isInteger(price) || price < 0) {
                    throw new Error("One or more cart items are no longer available.");
                }
                return {
                    name: String(product.name || "Campus item").slice(0, 127),
                    quantity: String(item.quantity),
                    unit_amount: { currency_code: "INR", value: price.toFixed(2) },
                    category: "PHYSICAL_GOODS"
                };
            });
            const total = lineItems.reduce((sum, item) =>
                sum + Number(item.unit_amount.value) * Number(item.quantity), 0);
            const accessToken = await getPayPalAccessToken();
            const response = await fetch(`${paypalApiBase}/v2/checkout/orders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "PayPal-Request-Id": crypto.randomUUID()
                },
                body: JSON.stringify({
                    intent: "CAPTURE",
                    purchase_units: [{
                        custom_id: authUser.id,
                        amount: {
                            currency_code: "INR",
                            value: total.toFixed(2),
                            breakdown: { item_total: { currency_code: "INR", value: total.toFixed(2) } }
                        },
                        items: lineItems
                    }]
                })
            });
            const data = await response.json();
            if (!response.ok || !data.id) {
                console.error("PayPal order creation error:", data);
                return res.status(502).json({ status: "error", message: "PayPal could not create the order." });
            }
            return res.status(201).json({ status: "success", orderId: data.id });
        } catch (error) {
            console.error("PayPal order error:", error.message);
            return res.status(502).json({ status: "error", message: error.message });
        }
    });

    app.post("/api/paypal/orders/:orderId/capture", async (req, res) => {
        const authUser = await getAuthenticatedUser(req, res);
        if (!authUser) {
            return res.status(401).json({ status: "error", message: "Not authenticated." });
        }
        if (!paypalClientId || !paypalClientSecret) {
            return res.status(503).json({ status: "error", message: "PayPal Sandbox is not configured yet." });
        }
        const orderId = typeof req.params.orderId === "string" ? req.params.orderId.trim() : "";
        if (!/^[A-Z0-9-]+$/i.test(orderId) || orderId.length > 80) {
            return res.status(400).json({ status: "error", message: "Invalid PayPal order." });
        }

        try {
            const accessToken = await getPayPalAccessToken();
            const orderResponse = await fetch(`${paypalApiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const order = await orderResponse.json();
            if (!orderResponse.ok || order.purchase_units?.[0]?.custom_id !== authUser.id) {
                return res.status(403).json({ status: "error", message: "This PayPal order does not belong to your session." });
            }
            if (order.status !== "CREATED") {
                return res.status(409).json({ status: "error", message: "This PayPal order is no longer available." });
            }
            const captureResponse = await fetch(`${paypalApiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "PayPal-Request-Id": crypto.randomUUID()
                },
                body: "{}"
            });
            const capture = await captureResponse.json();
            if (!captureResponse.ok || capture.status !== "COMPLETED") {
                console.error("PayPal capture error:", capture);
                return res.status(502).json({ status: "error", message: "PayPal could not complete the payment." });
            }
            return res.json({
                status: "success",
                message: "Sandbox payment completed successfully.",
                orderId,
                captureId: capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || null
            });
        } catch (error) {
            console.error("PayPal capture error:", error.message);
            return res.status(502).json({ status: "error", message: "PayPal payment could not be completed." });
        }
    });

app.get("/api/products", async (req, res) => {
    try {
        let productsQuery = supabase
            .from("products")
            .select("*")
            .eq("college", marketplaceCollege)
            .order("created_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false });

        const { data, error } = await productsQuery;

        if (error) {
            console.error("Products error:", error.message);
            if (missingCollegeColumn(error)) {
                const legacyResult = await supabase
                    .from("products")
                    .select("*")
                    .order("id", { ascending: false });
                if (!legacyResult.error) {
                    return res.json({
                        status: "success",
                        count: legacyResult.data.length,
                        products: legacyResult.data
                    });
                }
            }
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
    const college = typeof body.college === "string" ? body.college.trim() : "";

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
    if (!colleges.includes(college)) {
        return res.status(400).json({
            status: "error",
            message: "Select a valid college."
        });
    }

    let authUser;
    try {
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name, college }
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
            .insert({ id: authUser.id, name, email, college });

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
                email,
                college
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

        const { data: profile, error: profileError } = await getProfileById(data.user.id);

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
                email: profile?.email || data.user.email || email,
                college: profile?.college || data.user.user_metadata?.college || null
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

        const { data: profile, error } = await getProfileById(authUser.id);

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
                email: profile?.email || authUser.email,
                college: profile?.college || authUser.user_metadata?.college || null
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

app.post("/api/products", async (req, res) => {
    try {
        const authUser = await getAuthenticatedUser(req, res);
        if (!authUser) {
            return res.status(401).json({
                status: "error",
                message: "Log in before listing an item."
            });
        }

        const body = req.body && typeof req.body === "object" ? req.body : {};
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const description = typeof body.description === "string" ? body.description.trim() : "";
        const category = typeof body.category === "string" ? body.category.trim() : "";
        const icon = typeof body.icon === "string" ? body.icon.trim() : "📦";
        const price = typeof body.price === "number" ? body.price : Number(body.price);
        const imageData = typeof body.imageData === "string" ? body.imageData : "";
        const imageMatch = imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
        const imageBuffer = imageMatch ? Buffer.from(imageMatch[2], "base64") : null;

        if (!name || name.length > 120 || description.length > 2000 ||
            !category || category.length > 80 || !Number.isFinite(price) ||
            !Number.isInteger(price) || price < 0 || price > 10000000 ||
            !/^\S+$/.test(icon) || !imageBuffer || imageBuffer.length === 0 ||
            imageBuffer.length > 5 * 1024 * 1024) {
            return res.status(400).json({
                status: "error",
                message: "Enter valid item details and upload a JPG, PNG, or WebP photo up to 5 MB."
            });
        }

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("college")
            .eq("id", authUser.id)
            .maybeSingle();
        if (profileError) {
            console.error("Product profile lookup error:", profileError.message);
            return res.status(500).json({
                status: "error",
                message: "Could not determine your college."
            });
        }
        if (profile?.college !== marketplaceCollege) {
            return res.status(400).json({
                status: "error",
                message: `Listings are currently available only for ${marketplaceCollege}.`
            });
        }

        const extension = imageMatch[1] === "image/jpeg" ? "jpg" : imageMatch[1].slice(6);
        const imagePath = `${authUser.id}/${crypto.randomUUID()}.${extension}`;
        const uploadResult = await supabase.storage
            .from("product-images")
            .upload(imagePath, imageBuffer, {
                contentType: imageMatch[1],
                upsert: false
            });
        if (uploadResult.error) {
            console.error("Product image upload error:", uploadResult.error.message);
            return res.status(503).json({
                status: "error",
                message: "Photo storage is not configured yet."
            });
        }
        const { data: publicImage } = supabase.storage
            .from("product-images")
            .getPublicUrl(imagePath);

        const { data, error } = await supabase
            .from("products")
            .insert({
                name,
                description: description || null,
                category,
                price,
                icon,
                college: profile.college,
                image_url: publicImage.publicUrl
            })
            .select("*")
            .single();
        if (error) {
            console.error("Product creation error:", error.message);
            if (missingCollegeColumn(error)) {
                return res.status(503).json({
                    status: "error",
                    message: "College listings are unavailable until the products college migration is applied."
                });
            }
            return res.status(500).json({
                status: "error",
                message: "Could not create the item."
            });
        }

        return res.status(201).json({
            status: "success",
            message: "Item listed successfully.",
            product: data
        });
    } catch (error) {
        console.error("Product creation error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Something went wrong while creating the item."
        });
    }
});

app.get("/api/people/grouped", async (req, res) => {
    try {
        const authUser = await getAuthenticatedUser(req, res);
        if (!authUser) {
            return res.status(401).json({
                status: "error",
                message: "Not authenticated."
            });
        }

        const { data, error } = await supabase
            .from("profiles")
            .select("name,college")
            .not("college", "is", null)
            .order("college", { ascending: true })
            .order("name", { ascending: true });

        if (error) {
            console.error("People directory error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not load the college directory."
            });
        }

        const groups = {};
        for (const profile of data) {
            if (!groups[profile.college]) groups[profile.college] = [];
            groups[profile.college].push({ name: profile.name });
        }

        return res.json({
            status: "success",
            groups: Object.entries(groups).map(([college, students]) => ({
                college,
                count: students.length,
                students
            }))
        });
    } catch (error) {
        console.error("People directory error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Could not load the college directory."
        });
    }
});

// Listings and events require persistent storage.
app.get("/api/products/search", async (req, res) => {
    const searchTerm = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

    try {
        let productsQuery = supabase
            .from("products")
            .select("*")
            .eq("college", marketplaceCollege)
            .order("created_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false });

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
            if (missingCollegeColumn(error)) {
                let legacyQuery = supabase
                    .from("products")
                    .select("*")
                    .order("id", { ascending: false });
                if (searchTerm) {
                    const safeSearchTerm = searchTerm.replace(/[(),\\]/g, " ");
                    legacyQuery = legacyQuery.or(`name.ilike.%${safeSearchTerm}%,description.ilike.%${safeSearchTerm}%`);
                }
                if (category && category !== "All") legacyQuery = legacyQuery.eq("category", category);
                const legacyResult = await legacyQuery;
                if (!legacyResult.error) {
                    return res.json({
                        status: "success",
                        count: legacyResult.data.length,
                        products: legacyResult.data
                    });
                }
            }
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
app.post("/api/events", async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";

    if (!title || title.length > 120 ||
        description.length > 2000 ||
        !date || Number.isNaN(Date.parse(date)) ||
        !location || location.length > 200 ||
        !category || category.length > 80) {
        return res.status(400).json({
            status: "error",
            message: "Enter a valid title, date, location, and category."
        });
    }

    try {
        const { data, error } = await supabase
            .from("events")
            .insert({
                title,
                description: description || null,
                date: new Date(date).toISOString(),
                location,
                category
            })
            .select("*")
            .single();

        if (error) {
            console.error("Event creation error:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Could not create the event."
            });
        }

        return res.status(201).json({
            status: "success",
            message: "Event created successfully.",
            event: data
        });
    } catch (error) {
        console.error("Event creation error:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Something went wrong while creating the event."
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
    if (err.type === "entity.too.large") {
        return res.status(413).json({
            status: "error",
            message: "The uploaded photo is too large. Choose an image up to 5 MB."
        });
    }
    res.status(500).json({
        status: "error",
        message: "Something went wrong on the server."
    });
});

app.listen(PORT, () => {
    console.log(`CampusLoop AI server listening on port ${PORT}`);
});