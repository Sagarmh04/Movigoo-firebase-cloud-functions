import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";

export const updateProfile = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
        return;
      }

      const { idToken, name, email, phone } = req.body || {};

      if (!idToken) {
        res.status(400).json({ error: "MISSING_TOKEN" });
        return;
      }

      // At least one field must be provided
      if (!name && !email && !phone) {
        res.status(400).json({ error: "NO_FIELDS_TO_UPDATE" });
        return;
      }

      // Verify Firebase ID Token
      let decoded;
      try {
        decoded = await auth.verifyIdToken(idToken);
      } catch (tokenErr) {
        console.warn("Invalid ID Token on profile update:", tokenErr);
        res.status(401).json({ error: "INVALID_TOKEN" });
        return;
      }

      const uid = decoded.uid;

      // Check if user exists
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
      }

      // Build update object
      const updateData: any = {};
      if (name !== undefined) updateData["profile.name"] = name;
      if (email !== undefined) updateData["profile.email"] = email;
      if (phone !== undefined) updateData["profile.phone"] = phone;

      // Update user profile
      await db.collection("users").doc(uid).update(updateData);

      console.log(`Profile updated for user ${uid}`);
      res.json({ 
        success: true,
        message: "Profile updated successfully."
      });
    } catch (err) {
      console.error("updateProfile error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", details: String(err) });
    }
  }
);
