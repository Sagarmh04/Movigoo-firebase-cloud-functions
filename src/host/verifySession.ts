import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";
import crypto from "crypto";

export const verifySession = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    try {
      // Parse body first for POST requests
      let bodyData: any = {};
      if (req.method === "POST") {
        try {
          bodyData = req.body || {};
        } catch (e) {
          console.warn("Failed to parse body:", e);
        }
      }

      // Support multiple input methods (body takes priority)
      const sessionId = bodyData.sessionId || req.query.sessionId || req.headers["x-session-id"];
      const sessionKey = bodyData.sessionKey || req.query.sessionKey || req.headers["x-session-key"];
      const idToken = bodyData.idToken;

      // If idToken provided, use token-based verification (more secure)
      if (idToken) {
        try {
          const decoded = await auth.verifyIdToken(idToken);
          const uid = decoded.uid;

          // Check if user has any active sessions
          const sessionsSnap = await db
            .collection("users")
            .doc(uid)
            .collection("hostSessions")
            .limit(1)
            .get();

          if (sessionsSnap.empty) {
            res.status(401).json({ error: "NO_ACTIVE_SESSIONS" });
            return;
          }

          res.json({ uid, verified: true });
          return;
        } catch (tokenErr) {
          console.warn("Invalid token in verifySession:", tokenErr);
          res.status(401).json({ error: "INVALID_TOKEN" });
          return;
        }
      }

      // Fallback to session key verification (for middleware)
      if (!sessionId || !sessionKey) {
        console.warn("Missing sessionId or sessionKey");
        res.status(401).json({ error: "UNAUTHORIZED", message: "Missing session credentials" });
        return;
      }

      // Use collection group query to find session
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
        verified: true,
      });
    } catch (err) {
      console.error("verifySession error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
