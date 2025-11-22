import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/admin";
import {
  SessionVerificationError,
  verifySessionFromHeaders,
} from "./sessionVerifier";

export const listHostSessions = onRequest(
  { region: "asia-south1", cors: true },
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

      const snap = await db
        .collection("users")
        .doc(session.uid)
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
