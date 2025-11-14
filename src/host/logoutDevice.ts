import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/admin";

export const logoutDevice = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    try {
      const { uid, sessionId } = req.body || {};

      if (!uid || !sessionId) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      await db
        .collection("users")
        .doc(uid)
        .collection("hostSessions")
        .doc(sessionId)
        .delete();

      res.json({ success: true });
    } catch (err) {
      console.error("logoutDevice error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
