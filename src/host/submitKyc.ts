import { onRequest } from "firebase-functions/v2/https";
import { auth, db } from "../utils/admin";

export const submitKyc = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
        return;
      }

      const { idToken, documentType, documentNumber, documentUrl, fullName, address } = req.body || {};

      if (!idToken || !documentType || !documentNumber || !documentUrl || !fullName) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      // Verify Firebase ID Token
      let decoded;
      try {
        decoded = await auth.verifyIdToken(idToken);
      } catch (tokenErr) {
        console.warn("Invalid ID Token on KYC submission:", tokenErr);
        res.status(401).json({ error: "INVALID_TOKEN" });
        return;
      }

      const uid = decoded.uid;

      // Check if user exists and is a host
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        res.status(403).json({ error: "USER_NOT_FOUND" });
        return;
      }

      const userData = userDoc.data()!;
      if (!userData.isHost) {
        res.status(403).json({ error: "NOT_A_HOST_ACCOUNT" });
        return;
      }

      // Check if KYC already verified
      const kycDoc = await db.collection("kyc").doc(uid).get();
      if (kycDoc.exists) {
        const kycData = kycDoc.data()!;
        if (kycData.status === "verified") {
          res.status(400).json({ 
            error: "KYC_ALREADY_VERIFIED",
            message: "Your KYC is already verified. No need to submit again."
          });
          return;
        }
      }

      // Create/Update KYC document
      const kycData = {
        userId: uid,
        userRef: db.collection("users").doc(uid),
        fullName,
        documentType, // "aadhar", "voter_id", "driving_license", "passport"
        documentNumber,
        documentUrl,
        address: address || null,
        status: "pending", // "pending", "verified", "rejected"
        submittedAt: Date.now(),
        updatedAt: Date.now(),
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
      };

      await db.collection("kyc").doc(uid).set(kycData, { merge: true });

      // Update user profile with KYC status
      await db.collection("users").doc(uid).update({
        "profile.kycStatus": "pending",
        "profile.kycSubmittedAt": Date.now(),
      });

      console.log(`KYC submitted for user ${uid}`);
      res.json({ 
        success: true,
        kycStatus: "pending",
        message: "KYC submitted successfully. Pending admin verification."
      });
    } catch (err) {
      console.error("submitKyc error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", details: String(err) });
    }
  }
);
