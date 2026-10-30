"use strict";

function formatDatabaseDiagnostic(error) {
    const code = error && typeof error.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code)
        ? error.code
        : "unknown";
    const name = error && typeof error.name === "string" && /^[A-Za-z0-9_.-]{1,48}$/.test(error.name)
        ? error.name
        : "Error";
    return `category=database name=${name} code=${code}`;
}

module.exports = { formatDatabaseDiagnostic };
