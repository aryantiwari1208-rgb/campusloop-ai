"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = 43100 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;

let server;

test.before(async () => {
    server = spawn(process.execPath, [path.join(root, "server.js")], {
        cwd: root,
        env: { ...process.env, PORT: String(port) },
        stdio: ["ignore", "ignore", "inherit"]
    });

    for (let attempt = 0; attempt < 40; attempt++) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return;
        } catch {
            // The server may still be starting.
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error("Test server did not start.");
});

test.after(() => {
    if (server && server.exitCode === null) server.kill();
});

test("health endpoint works without storage", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        status: "success",
        message: "CampusLoop AI server is running!"
    });
});

test("storage-backed endpoints report temporary unavailability", async () => {
    for (const route of ["/api/products", "/api/events", "/api/auth/me"]) {
        const response = await fetch(baseUrl + route);
        assert.equal(response.status, 503, route);
        const body = await response.json();
        assert.equal(body.status, "error");
        assert.match(body.message, /temporarily unavailable until storage is configured/i);
    }
});

test("non-storage APIs remain available", async () => {
    const campusResponse = await fetch(`${baseUrl}/api/campus`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "A", course: "CSE" })
    });
    assert.equal(campusResponse.status, 200);

    const recommendationResponse = await fetch(`${baseUrl}/api/recommend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interest: "coding" })
    });
    assert.equal(recommendationResponse.status, 200);
    assert.equal((await recommendationResponse.json()).recommendation.category, "Technology");
});
