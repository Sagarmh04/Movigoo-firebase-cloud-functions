import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/admin";
import {
  SessionVerificationError,
  verifySessionFromHeaders,
} from "./sessionVerifier";

export const logoutAllDevices = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    try {
      let session;
      try {
        session = await verifySessionFromHeaders(req.headers);
      } catch (err) {
        if (err instanceof SessionVerificationError) {
          res.status(err.status).json({ error: err.message });
          return;
        }
        throw err;
      }

      const col = db.collection("users").doc(session.uid).collection("hostSessions");
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
