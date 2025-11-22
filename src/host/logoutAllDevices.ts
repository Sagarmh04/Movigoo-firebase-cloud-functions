import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";

export const logoutAllDevices = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
        return;
      }

      const { idToken } = req.body || {};

      if (!idToken) {
        console.warn("Missing idToken for logout all");
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      // Verify the Firebase ID Token to extract the UID
      let decoded;
      try {
        decoded = await auth.verifyIdToken(idToken);
      } catch (tokenErr) {
        console.warn("Invalid ID Token on logout all:", tokenErr);
        res.status(401).json({ error: "INVALID_TOKEN" });
        return;
      }

      const uid = decoded.uid;
      console.log("Deleting all sessions for uid:", uid);

      // Direct path to user's sessions collection
      const col = db.collection("users").doc(uid).collection("hostSessions");
      const allSessions = await col.get();

      if (allSessions.empty) {
        console.log("No sessions to delete");
        res.json({ success: true, message: "NO_SESSIONS" });
        return;
      }

      const batch = db.batch();
      allSessions.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      console.log(`Deleted ${allSessions.size} sessions`);
      res.json({ success: true, deletedCount: allSessions.size });
    } catch (err) {
      console.error("logoutAllDevices error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", details: String(err) });
    }
  }
);
