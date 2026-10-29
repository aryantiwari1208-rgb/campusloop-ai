"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyMongoError, formatMongoDiagnostic } = require("../mongo-diagnostics");

test("classifies DNS resolution failures", () => {
    assert.equal(classifyMongoError(Object.assign(new Error("querySrv failed"), { code: "EBADNAME" })), "dns");
});
test("classifies TLS failures from nested causes", () => {
    const cause = Object.assign(new Error("tlsv1 alert internal error"), { code: "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR" });
    const outer = new Error("server selection failed", { cause });
    assert.equal(classifyMongoError(outer), "tls");
    assert.match(formatMongoDiagnostic(outer), /category=tls/);
});
test("classifies authentication failures", () => {
    assert.equal(classifyMongoError(Object.assign(new Error("authentication failed"), { code: 18, codeName: "AuthenticationFailed" })), "authentication");
});
test("classifies network failures", () => {
    assert.equal(classifyMongoError(Object.assign(new Error("socket reset"), { code: "ECONNRESET" })), "network");
});
test("diagnostics never include connection strings or raw messages", () => {
    const secret = "mongodb+srv://db-user:private-password@cluster.example.net/";
    const error = Object.assign(new Error("TLS failure for " + secret), { code: "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR" });
    const summary = formatMongoDiagnostic(error);
    assert.match(summary, /category=tls/);
    assert.doesNotMatch(summary, /private-password|db-user|cluster\\.example/);
    assert.doesNotMatch(summary, /TLS failure/);
});
