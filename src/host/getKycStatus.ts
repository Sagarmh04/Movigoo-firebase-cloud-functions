import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";

export const getKycStatus = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    try {
      const { idToken } = req.body || {};

      if (!idToken) {
        res.status(400).json({ error: "MISSING_TOKEN" });
        return;
      }

      // Verify Firebase ID Token
      let decoded;
      try {
        decoded = await auth.verifyIdToken(idToken);
      } catch (tokenErr) {
        console.warn("Invalid ID Token on get KYC status:", tokenErr);
        res.status(401).json({ error: "INVALID_TOKEN" });
        return;
      }

      const uid = decoded.uid;

      // Get user profile
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
      }

      const userData = userDoc.data()!;
      const profile = userData.profile || {};

      // Get KYC document if exists
      const kycDoc = await db.collection("kyc").doc(uid).get();
      const kycData = kycDoc.exists ? kycDoc.data() : null;

      res.json({
        kycStatus: profile.kycStatus || "none",
        kycSubmittedAt: profile.kycSubmittedAt || null,
        kycDetails: kycData ? {
          documentType: kycData.documentType,
          submittedAt: kycData.submittedAt,
          status: kycData.status,
          rejectionReason: kycData.rejectionReason || null,
        } : null,
      });
    } catch (err) {
      console.error("getKycStatus error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", details: String(err) });
    }
  }
);
