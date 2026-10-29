"use strict";

function errorChain(root) {
    const pending = root && typeof root === "object" ? [root] : [];
    const seen = new Set();
    const result = [];
    while (pending.length && result.length < 24) {
        const current = pending.shift();
        if (!current || typeof current !== "object" || seen.has(current)) continue;
        seen.add(current);
        result.push(current);
        if (current.cause && typeof current.cause === "object") pending.push(current.cause);
        if (current.originalError && typeof current.originalError === "object") pending.push(current.originalError);
        const reason = current.reason;
        if (reason instanceof Map) {
            for (const value of reason.values()) if (value && value.error) pending.push(value.error);
        } else if (reason && reason.servers instanceof Map) {
            for (const value of reason.servers.values()) if (value && value.error) pending.push(value.error);
        }
    }
    return result;
}

function classifyMongoError(error) {
    const chain = errorChain(error);
    const codes = chain.map(item => String(item.code || "").toUpperCase());
    const names = chain.map(item => String(item.name || "").toLowerCase());
    const codeNames = chain.map(item => String(item.codeName || "").toLowerCase());
    const messages = chain.map(item => typeof item.message === "string" ? item.message.toLowerCase() : "").join(" ");
    if (codes.some(code => /^(ENOTFOUND|EAI_AGAIN|EBADNAME|ENODATA|ESERVFAIL|EFORMERR|EREFUSED)$/.test(code)) || /querysrv|dns lookup|srv record/.test(messages)) return "dns";
    if (codes.some(code => code.startsWith("ERR_SSL") || code.startsWith("ERR_TLS")) || /ssl routines|tlsv[0-9.]+ alert|tls handshake|certificate verify/.test(messages)) return "tls";
    if (codes.includes("18") || codeNames.includes("authenticationfailed") || /authentication failed|auth failed|bad auth/.test(messages)) return "authentication";
    if (codes.some(code => /^(ECONNREFUSED|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE)$/.test(code)) || names.some(name => name === "mongonetworkerror" || name === "mongoserverselectionerror")) return "network";
    return "database";
}

function safeToken(value) {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value)) return value;
    return "";
}

function formatMongoDiagnostic(error) {
    const chain = errorChain(error);
    const name = chain.map(item => safeToken(item.name)).find(Boolean) || "Error";
    const code = chain.map(item => safeToken(item.codeName) || safeToken(item.code)).find(Boolean) || "unknown";
    return "category=" + classifyMongoError(error) + " name=" + name + " code=" + code;
}

module.exports = { classifyMongoError, formatMongoDiagnostic };
