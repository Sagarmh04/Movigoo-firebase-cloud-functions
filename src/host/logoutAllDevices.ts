import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/admin";

export const logoutAllDevices = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    try {
      const { uid } = req.body || {};

      if (!uid) {
        res.status(400).json({ error: "MISSING_UID" });
        return;
      }

      const col = db.collection("users").doc(uid).collection("hostSessions");
      const snap = await col.get();

      const batch = db.batch();
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      res.json({ success: true });
    } catch (err) {
      console.error("logoutAllDevices error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
