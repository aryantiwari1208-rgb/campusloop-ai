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

test("registration validates input before calling Supabase Auth", async () => {
    const cases = [
        [{ name: "", email: "student@example.com", password: "password123", confirmPassword: "password123" }, "Name must be between 1 and 80 characters."],
        [{ name: "Student", email: "invalid", password: "password123", confirmPassword: "password123" }, "Enter a valid email address."],
        [{ name: "Student", email: "student@example.com", password: "short", confirmPassword: "short" }, "Password must be 8–128 characters and no more than 72 UTF-8 bytes."],
        [{ name: "Student", email: "student@example.com", password: "password123", confirmPassword: "different123" }, "Passwords do not match."]
    ];

    for (const [body, message] of cases) {
        const response = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { status: "error", message });
    }
});

test("login validates input before calling Supabase Auth", async () => {
    const cases = [
        [{ email: "invalid", password: "password123" }],
        [{ email: "student@example.com", password: "" }],
        [{ email: "student@example.com", password: "x".repeat(73) }]
    ];

    for (const body of cases) {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            status: "error",
            message: "Enter a valid email and password."
        });
    }
});

test("products are available and other storage-backed endpoints report temporary unavailability", async () => {
    const productsResponse = await fetch(`${baseUrl}/api/products`);
    assert.equal(productsResponse.status, 200);
    const productsBody = await productsResponse.json();
    assert.equal(productsBody.status, "success");
    assert.equal(productsBody.count, productsBody.products.length);
    assert.equal(productsBody.count, 4);

    const eventsResponse = await fetch(`${baseUrl}/api/events`);
    assert.equal(eventsResponse.status, 200);
    const eventsBody = await eventsResponse.json();
    assert.equal(eventsBody.status, "success");
    assert.equal(eventsBody.count, eventsBody.events.length);
    assert.ok(eventsBody.events.every((event, index, events) =>
        index === 0 || new Date(events[index - 1].date) <= new Date(event.date)
    ));

});

test("unauthenticated session check returns 401", async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
        status: "error",
        message: "Not authenticated."
    });
});

test("invalid authentication cookies do not create a session", async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
            cookie: "campusloop.access-token=invalid; campusloop.refresh-token=invalid"
        }
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
        status: "error",
        message: "Not authenticated."
    });
});

test("logout clears authentication cookies", async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        status: "success",
        message: "Logged out."
    });
    assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
});

test("product search supports text and category filters", async () => {
    const textResponse = await fetch(`${baseUrl}/api/products/search?q=book`);
    assert.equal(textResponse.status, 200);
    const textBody = await textResponse.json();
    assert.equal(textBody.status, "success");
    assert.equal(textBody.count, 2);
    assert.ok(textBody.products.every(product =>
        /book/i.test(product.name) || /book/i.test(product.description)
    ));

    const categoryResponse = await fetch(`${baseUrl}/api/products/search?category=Electronics`);
    assert.equal(categoryResponse.status, 200);
    const categoryBody = await categoryResponse.json();
    assert.equal(categoryBody.status, "success");
    assert.equal(categoryBody.count, 1);
    assert.ok(categoryBody.products.every(product => product.category === "Electronics"));
});

test("product lookup returns an existing product and 404 for invalid or missing IDs", async () => {
    const existingResponse = await fetch(`${baseUrl}/api/products/1`);
    assert.equal(existingResponse.status, 200);
    const existingBody = await existingResponse.json();
    assert.equal(existingBody.status, "success");
    assert.equal(existingBody.product.id, 1);

    for (const id of ["999999", "not-a-number", "0"]) {
        const response = await fetch(`${baseUrl}/api/products/${id}`);
        assert.equal(response.status, 404, id);
        const body = await response.json();
        assert.deepEqual(body, {
            status: "error",
            message: "Product not found."
        });
    }
});

test("event search supports text and category filters", async () => {
    const textResponse = await fetch(`${baseUrl}/api/events/search?q=campus`);
    assert.equal(textResponse.status, 200);
    const textBody = await textResponse.json();
    assert.equal(textBody.status, "success");
    assert.equal(textBody.count, textBody.events.length);
    assert.ok(textBody.events.every((event, index, events) =>
        index === 0 || new Date(events[index - 1].date) <= new Date(event.date)
    ));

    const categoryResponse = await fetch(`${baseUrl}/api/events/search?category=Technology`);
    assert.equal(categoryResponse.status, 200);
    const categoryBody = await categoryResponse.json();
    assert.equal(categoryBody.status, "success");
    assert.equal(categoryBody.count, categoryBody.events.length);
    assert.ok(categoryBody.events.every(event => event.category === "Technology"));
});

test("event search rejects non-text filters", async () => {
    const response = await fetch(`${baseUrl}/api/events/search?q=campus&q=location`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        status: "error",
        message: "Search and category filters must be text values."
    });
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
