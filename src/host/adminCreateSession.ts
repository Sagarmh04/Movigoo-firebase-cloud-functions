import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

export const adminCreateSession = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
        return;
      }

      const { idToken } = req.body || {};
      if (!idToken) {
        res.status(400).json({ error: "MISSING_ID_TOKEN" });
        return;
      }

      const decoded = await auth.verifyIdToken(idToken);
      const uid = decoded.uid;

      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        res.status(403).json({ error: "USER_NOT_FOUND" });
        return;
      }

      const data = userDoc.data()!;
      if (!data.isHost || data.isCustomer === true) {
        res.status(403).json({ error: "NOT_A_HOST_ACCOUNT" });
        return;
      }

      const sessionId = uuidv4();
      const rawKey = crypto.randomBytes(32).toString("hex");
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

      const userAgent = req.headers["user-agent"] ?? null;
      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
        req.socket.remoteAddress ||
        null;

      await db
        .collection("users")
        .doc(uid)
        .collection("hostSessions")
        .doc(sessionId)
        .set({
          sessionId,
          keyHash,
          ua: userAgent,
          ip,
          createdAt: Date.now(),
        });

      res.json({
        sessionId,
        sessionKey: rawKey,
      });
    } catch (err) {
      console.error("adminCreateSession error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
