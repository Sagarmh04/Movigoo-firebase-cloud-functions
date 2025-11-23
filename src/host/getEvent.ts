/**
 * Get Event Cloud Function
 * Fetches event data (draft or published) for the authenticated user
 * 
 * Security: Only returns events owned by the authenticated user
 */

import { onRequest } from "firebase-functions/v2/https";
import { db, auth } from "../utils/admin";
import * as crypto from "crypto";

export const getEvent = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    // CORS
    const allowedOrigins = [
      "https://corporate.movigoo.in",
      "http://localhost:3000",
      "http://localhost:3001",
    ];
    
    const origin = req.headers.origin || "";
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-session-id, x-session-key, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      // 1. Verify Session
      const uid = await verifySession(req);
      
      if (!uid) {
        res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Invalid or missing authentication credentials.",
        });
        return;
      }

      // 2. Get eventId from query or body
      const eventId = req.query.eventId as string || req.body.eventId;
      
      if (!eventId) {
        res.status(400).json({
          error: "BAD_REQUEST",
          message: "eventId is required.",
        });
        return;
      }

      // 3. Try to fetch from user's events collection first (draft)
      const userEventRef = db
        .collection("users")
        .doc(uid)
        .collection("events")
        .doc(eventId);
      
      const userEventDoc = await userEventRef.get();
      
      if (userEventDoc.exists) {
        const eventData = userEventDoc.data();
        
        res.status(200).json({
          success: true,
          event: {
            eventId: eventId,
            status: eventData?.status || "draft",
            basicDetails: eventData?.basicDetails || {},
            schedule: eventData?.schedule || { locations: [] },
            tickets: eventData?.tickets || { venueConfigs: [] },
            createdAt: eventData?.createdAt,
            updatedAt: eventData?.updatedAt,
            publishedAt: eventData?.publishedAt,
          },
        });
        return;
      }

      // 4. If not found in user's collection, check root events (published)
      const rootEventRef = db.collection("events").doc(eventId);
      const rootEventDoc = await rootEventRef.get();
      
      if (rootEventDoc.exists) {
        const eventData = rootEventDoc.data();
        
        // Verify ownership
        if (eventData?.hostUid !== uid) {
          res.status(403).json({
            error: "FORBIDDEN",
            message: "You do not have permission to access this event.",
          });
          return;
        }
        
        res.status(200).json({
          success: true,
          event: {
            eventId: eventId,
            status: eventData?.status || "published",
            basicDetails: eventData?.basicDetails || {},
            schedule: eventData?.schedule || { locations: [] },
            tickets: eventData?.tickets || { venueConfigs: [] },
            createdAt: eventData?.createdAt,
            updatedAt: eventData?.updatedAt,
            publishedAt: eventData?.publishedAt,
          },
        });
        return;
      }

      // 5. Event not found
      res.status(404).json({
        error: "EVENT_NOT_FOUND",
        message: "Event not found.",
      });

    } catch (error: any) {
      console.error("getEvent error:", error);
      
      if (error.code === "UNAUTHORIZED") {
        res.status(401).json({
          error: "UNAUTHORIZED",
          message: error.message || "Authentication failed.",
        });
        return;
      }

      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      });
    }
  }
);

/**
 * Verify session using idToken or sessionId + sessionKey
 */
async function verifySession(req: any): Promise<string | null> {
  const idToken = req.headers.authorization?.replace("Bearer ", "");
  const sessionId = req.headers["x-session-id"] || req.query.sessionId;
  const sessionKey = req.headers["x-session-key"] || req.query.sessionKey;

  try {
    // Method 1: ID Token
    if (idToken) {
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken.uid;
    }

    // Method 2: Session ID + Key
    if (sessionId && sessionKey) {
      const sessionsSnapshot = await db
        .collectionGroup("hostSessions")
        .where("sessionId", "==", sessionId)
        .limit(1)
        .get();

      if (sessionsSnapshot.empty) {
        const error: any = new Error("Session not found.");
        error.code = "UNAUTHORIZED";
        throw error;
      }

      const sessionDoc = sessionsSnapshot.docs[0];
      const sessionData = sessionDoc.data();

      // Verify key hash
      const providedHash = crypto
        .createHash("sha256")
        .update(sessionKey)
        .digest("hex");

      if (providedHash !== sessionData.keyHash) {
        const error: any = new Error("Invalid session key.");
        error.code = "UNAUTHORIZED";
        throw error;
      }

      // Extract uid from document path
      const pathSegments = sessionDoc.ref.path.split("/");
      const uid = pathSegments[1]; // users/{uid}/hostSessions/{sessionId}

      return uid;
    }

    return null;
  } catch (error) {
    console.error("Session verification error:", error);
    throw error;
  }
}
