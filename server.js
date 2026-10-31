const express = require("express");
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

const storageUnavailable = feature => (req, res) => res.status(503).json({
    status: "error",
    message: `${feature} is temporarily unavailable until storage is configured.`
});

// Account data and sessions require persistent storage.
app.post("/api/auth/register", storageUnavailable("Account registration"));
app.post("/api/auth/login", storageUnavailable("Account login"));
app.get("/api/auth/me", storageUnavailable("Authentication"));
app.post("/api/auth/logout", storageUnavailable("Authentication"));

// Listings and events require persistent storage.
app.get("/api/products", storageUnavailable("Marketplace listings"));
app.get("/api/products/search", storageUnavailable("Marketplace search"));
app.get("/api/products/:id", storageUnavailable("Marketplace listings"));
app.get("/api/events", storageUnavailable("Campus events"));
app.get("/api/events/search", storageUnavailable("Campus event search"));

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
