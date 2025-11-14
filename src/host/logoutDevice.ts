import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/admin";
import {
  SessionVerificationError,
  verifySessionFromHeaders,
} from "./sessionVerifier";

export const logoutDevice = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    try {
      const { sessionId } = req.body || {};

      if (!sessionId) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

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

      if (session.sessionId !== sessionId) {
        res.status(403).json({ error: "SESSION_MISMATCH" });
        return;
      }

      await db
        .collection("users")
        .doc(session.uid)
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
