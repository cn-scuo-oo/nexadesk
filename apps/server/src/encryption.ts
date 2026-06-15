import type { Express } from "express";
import { z } from "zod";
export function registerEncryptionRoutes(app: Express): void {
  const encryptSchema = z.object({ data: z.string().min(1) });
  const decryptSchema = z.object({ data: z.string().min(1) });
  app.post("/api/encrypt", async (req, res, next) => {
    try {
      const parsed = encryptSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
      const b64 = Buffer.from(parsed.data.data, "utf8").toString("base64");
      res.json({ encrypted: b64 });
    } catch (error) { next(error); }
  });
  app.post("/api/decrypt", async (req, res, next) => {
    try {
      const parsed = decryptSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
      const decoded = Buffer.from(parsed.data.data, "base64").toString("utf8");
      res.json({ decrypted: decoded });
    } catch (error) { next(error); }
  });
}