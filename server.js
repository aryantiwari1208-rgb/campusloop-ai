const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// ==========================================
// BASIC CONFIGURATION
// ==========================================

const websiteFolder = __dirname;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
// CAMPUSLOOP PRODUCTS
// ==========================================

const products = [
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


// Get all products
app.get("/api/products", (req, res) => {
    res.json({
        status: "success",
        count: products.length,
        products: products
    });
});


// Search products
app.get("/api/products/search", (req, res) => {

    const query = (req.query.q || "").toLowerCase().trim();
    const category = req.query.category || "All";

    const results = products.filter(product => {

        const matchesSearch =
            !query ||
            product.name.toLowerCase().includes(query) ||
            product.description.toLowerCase().includes(query) ||
            product.category.toLowerCase().includes(query);

        const matchesCategory =
            category === "All" ||
            product.category === category;

        return matchesSearch && matchesCategory;
    });

    res.json({
        status: "success",
        count: results.length,
        products: results
    });
});


// ==========================================
// GET SINGLE PRODUCT
// ==========================================

app.get("/api/products/:id", (req, res) => {

    const productId = Number(req.params.id);

    const product = products.find(
        item => item.id === productId
    );

    if (!product) {
        return res.status(404).json({
            status: "error",
            message: "Product not found."
        });
    }

    res.json({
        status: "success",
        product: product
    });
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

app.get("/api/events", (req, res) => {

    const events = [
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

    res.json({
        status: "success",
        count: events.length,
        events: events
    });
});


// ==========================================
// EVENT SEARCH
// ==========================================

app.get("/api/events/search", (req, res) => {

    const query = (req.query.q || "").toLowerCase();

    const events = [
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

    if (!query) {
        return res.json({
            status: "success",
            events: events
        });
    }

    const results = events.filter(event =>
        event.title.toLowerCase().includes(query) ||
        event.category.toLowerCase().includes(query) ||
        event.location.toLowerCase().includes(query)
    );

    res.json({
        status: "success",
        query: query,
        count: results.length,
        events: results
    });
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