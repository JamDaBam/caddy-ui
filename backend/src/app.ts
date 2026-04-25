import { existsSync } from "node:fs";
import path from "node:path";

import express from "express";

import type { EntryInput } from "@caddy-ui/shared";

import { CaddyService } from "./caddyService.js";

function validateEntryInput(value: unknown): value is EntryInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.label === "string" && candidate.label.trim().length > 0 && typeof candidate.raw === "string";
}

export function createApp(service: CaddyService) {
  const app = express();
  app.use(express.json());
  const frontendDist = resolveFrontendDist();

  app.get("/api/health", async (_request, response) => {
    try {
      response.json(await service.getHealth());
    } catch (error) {
      response.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/entries", async (_request, response) => {
    try {
      response.json(await service.getEntries());
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/entries", async (request, response) => {
    if (!validateEntryInput(request.body)) {
      response.status(400).json({ error: "Invalid entry payload" });
      return;
    }

    try {
      response.status(201).json(await service.createEntry(request.body));
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put("/api/entries/:id", async (request, response) => {
    if (!validateEntryInput(request.body)) {
      response.status(400).json({ error: "Invalid entry payload" });
      return;
    }

    try {
      const updated = await service.updateEntry(request.params.id, request.body);
      if (!updated) {
        response.status(404).json({ error: "Entry not found" });
        return;
      }
      response.json(updated);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.delete("/api/entries/:id", async (request, response) => {
    try {
      const updated = await service.deleteEntry(request.params.id);
      if (!updated) {
        response.status(404).json({ error: "Entry not found" });
        return;
      }
      response.json(updated);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/apply", async (request, response) => {
    const reload = Boolean(request.body?.reload);
    try {
      const result = await service.apply({ reload });
      response.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  if (frontendDist) {
    app.use(express.static(frontendDist));
    app.get(/^\/(?!api\/).*/, (_request, response) => {
      response.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  return app;
}

function resolveFrontendDist() {
  const candidates = [
    path.resolve(process.cwd(), "frontend/dist"),
    path.resolve(process.cwd(), "../frontend/dist")
  ];

  return candidates.find((candidate) => existsSync(candidate));
}
