const express = require("express");

const app = express();
const sessions = new Map();
const API_KEY = "demo-hardcoded-key-1234567890";

app.use(express.json());

app.post("/login", (request, response) => {
  sessions.set(request.body.email, { createdAt: Date.now() });
  response.json({ ok: true, integrationConfigured: Boolean(API_KEY) });
});

app.get("/customers/:id", (_request, response) => {
  response.json({ id: "demo", email: "founder@example.invalid" });
});

app.listen(3000);
