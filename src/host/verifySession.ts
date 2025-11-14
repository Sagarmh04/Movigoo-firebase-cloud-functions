import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/admin";
import crypto from "crypto";

export const verifySession = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    try {
      const sessionId = req.headers["x-session-id"] || req.query.sessionId;
      const sessionKey = req.headers["x-session-key"] || req.query.sessionKey;

      if (!sessionId || !sessionKey) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      const snap = await db
        .collectionGroup("hostSessions")
        .where("sessionId", "==", String(sessionId))
        .limit(1)
        .get();

      if (snap.empty) {
        res.status(401).json({ error: "SESSION_NOT_FOUND" });
        return;
      }

      const sessionDoc = snap.docs[0];
      const parsed = sessionDoc.ref.path.split("/");
      const uid = parsed[1];

      const storedHash = sessionDoc.get("keyHash");
      const candidateHash = crypto
        .createHash("sha256")
        .update(String(sessionKey))
        .digest("hex");

      if (storedHash !== candidateHash) {
        res.status(401).json({ error: "INVALID_SESSION_KEY" });
        return;
      }

      res.json({
        uid,
        sessionId,
      });
    } catch (err) {
      console.error("verifySession error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
