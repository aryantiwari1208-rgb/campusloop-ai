"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDatabaseDiagnostic } = require("../database-diagnostics");

test("database diagnostics do not include connection strings or raw messages", () => {
    const secret = "postgresql://db-user:private-password@cluster.example.net/";
    const error = Object.assign(new Error("connection failed for " + secret), { code: "ECONNREFUSED" });
    const summary = formatDatabaseDiagnostic(error);
    assert.match(summary, /category=database/);
    assert.doesNotMatch(summary, /private-password|db-user|cluster\\.example/);
    assert.doesNotMatch(summary, /connection failed/);
});
