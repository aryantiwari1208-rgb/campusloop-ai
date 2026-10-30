"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { once } = require("node:events");

test("database-backed APIs return 503 without a PostgreSQL URL", async t => {
    const port = 43000 + Math.floor(Math.random() * 10000);
    const base = "http://127.0.0.1:" + port;
    const root = path.resolve(__dirname, "..");
    const child = spawn(process.execPath, [path.join(root, "server.js")], {
        cwd: root,
        env: { ...process.env, PORT: String(port), DATABASE_URL: "", SUPABASE_DB_URL: "" },
        stdio: ["ignore", "ignore", "ignore"]
    });
    t.after(async () => {
        if (child.exitCode === null) {
            child.kill();
            await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 3000))]);
        }
    });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
        if (child.exitCode !== null) break;
        try {
            const response = await fetch(base + "/api/health");
            if (response.ok) { ready = true; break; }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(ready, true, "server should remain available when PostgreSQL is unconfigured");
    for (const route of ["/api/products", "/api/events", "/api/auth/me"]) {
        const response = await fetch(base + route);
        assert.equal(response.status, 503, route + " should report database unavailability");
        const body = await response.json();
        assert.equal(body.status, "error");
        assert.doesNotMatch(JSON.stringify(body), /postgres(?:ql)?:\/\/|password|SESSION_SECRET/i);
    }
});
