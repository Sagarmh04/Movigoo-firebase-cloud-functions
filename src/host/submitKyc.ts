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

      const { idToken, name, email, phone, documents } = req.body || {};

      // Validate required fields
      if (!idToken || !name || !documents || !Array.isArray(documents) || documents.length === 0) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      // Validate documents array (max 3)
      if (documents.length > 3) {
        res.status(400).json({ error: "TOO_MANY_DOCUMENTS", message: "Maximum 3 documents allowed" });
        return;
      }

      // Validate each document has required fields
      for (const doc of documents) {
        if (!doc.type || !doc.url) {
          res.status(400).json({ error: "INVALID_DOCUMENT", message: "Each document must have type and url" });
          return;
        }
        // Validate document type
        const validTypes = ["aadhar", "voter_id", "driving_license", "passport", "other"];
        if (!validTypes.includes(doc.type)) {
          res.status(400).json({ error: "INVALID_DOCUMENT_TYPE", message: "Invalid document type" });
          return;
        }
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

      // Update user profile with submitted data
      await db.collection("users").doc(uid).update({
        "profile.name": name,
        "profile.email": email || null,
        "profile.phone": phone || null,
        "profile.kycStatus": "pending",
        "profile.kycSubmittedAt": Date.now(),
      });

      // Create/Update KYC document
      const kycData = {
        userId: uid,
        userRef: db.collection("users").doc(uid),
        name,
        email: email || null,
        phone: phone || null,
        documents: documents.map((doc: any) => ({
          type: doc.type,
          url: doc.url,
          uploadedAt: Date.now(),
        })),
        status: "pending", // "none", "pending", "verified"
        submittedAt: Date.now(),
        updatedAt: Date.now(),
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
      };

      await db.collection("kyc").doc(uid).set(kycData, { merge: true });

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
