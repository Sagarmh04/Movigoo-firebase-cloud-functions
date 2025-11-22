import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";

export const registerHost = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
        return;
      }

      const { idToken, name, phone } = req.body || {};

      if (!idToken || !name) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      let decoded;
      try {
        decoded = await auth.verifyIdToken(idToken);
      } catch (err) {
        console.error("registerHost verifyIdToken error:", err);
        res.status(401).json({ error: "INVALID_ID_TOKEN" });
        return;
      }

      const uid = decoded.uid;
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

        // Update only if profile doesn't exist or is incomplete
        const updateData: any = {
          isHost: true,
          isCustomer: false,
        };

        // Only update profile if it doesn't exist
        if (!data.profile) {
          updateData.profile = {
            name,
            phone: phone ?? null,
            kycStatus: "none",
            kycSubmittedAt: null,
          };
        }

        await userRef.update(updateData);

        res.json({ 
          success: true, 
          updated: true,
          kycStatus: data.profile?.kycStatus || "none"
        });
        return;
      }

      // Create brand-new host account with profile structure
      await userRef.set({
        isHost: true,
        isCustomer: false,
        createdAt: Date.now(),
        profile: {
          name,
          phone: phone ?? null,
          kycStatus: "none",
          kycSubmittedAt: null,
        },
      });

      res.json({ success: true, created: true, kycStatus: "none" });
    } catch (err) {
      console.error("registerHost error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
