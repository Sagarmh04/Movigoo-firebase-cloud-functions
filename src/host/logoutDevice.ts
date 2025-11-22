import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";

export const logoutDevice = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
        return;
      }

      const { idToken, sessionId } = req.body || {};

      if (!sessionId || !idToken) {
        console.warn("Missing fields for logout");
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      // Verify the Firebase ID Token to extract the UID
      let decoded;
      try {
        decoded = await auth.verifyIdToken(idToken);
      } catch (tokenErr) {
        console.warn("Invalid ID Token on logout:", tokenErr);
        res.status(401).json({ error: "INVALID_TOKEN" });
        return;
      }

      const uid = decoded.uid;

      // Direct path to the session document
      const sessionRef = db
        .collection("users")
        .doc(uid)
        .collection("hostSessions")
        .doc(sessionId);

      console.log(`Deleting session ${sessionId} for user ${uid}`);
      await sessionRef.delete();

      res.json({ success: true });
    } catch (err) {
      console.error("logoutDevice error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", details: String(err) });
    }
  }
);
