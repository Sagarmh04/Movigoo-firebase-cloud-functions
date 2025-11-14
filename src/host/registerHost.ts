import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";

export const registerHost = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
        return;
      }

      const { uid, name, phone } = req.body || {};

      if (!uid || !name) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();

      if (userSnap.exists) {
        const data = userSnap.data()!;

        // Conflict prevention
        if (data.isCustomer) {
          res.status(409).json({
            error: "ACCOUNT_ALREADY_CUSTOMER",
          });
          return;
        }

        // Upgrade existing account to host
        await userRef.update({
          name,
          phone: phone ?? null,
          isHost: true,
          isCustomer: false,
        });

        res.json({ success: true, updated: true });
        return;
      }

      // Create brand-new host account
      await userRef.set({
        name,
        phone: phone ?? null,
        isHost: true,
        isCustomer: false,
        createdAt: Date.now(),
      });

      res.json({ success: true, created: true });
    } catch (err) {
      console.error("registerHost error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
