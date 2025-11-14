import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/admin";

export const listHostSessions = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    try {
      const { uid } = req.query || {};

      if (!uid) {
        res.status(400).json({ error: "MISSING_UID" });
        return;
      }

      const snap = await db
        .collection("users")
        .doc(String(uid))
        .collection("hostSessions")
        .get();

      const list = snap.docs.map((d) => d.data());

      res.json({ sessions: list });
    } catch (err) {
      console.error("listHostSessions error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
