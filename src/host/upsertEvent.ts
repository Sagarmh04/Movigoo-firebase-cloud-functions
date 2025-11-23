/**
 * Event Upsert Cloud Function
 * Handles both draft saving and event hosting (publishing)
 * 
 * Routes:
 * - Draft: Save event without KYC requirement
 * - Publish: Host event with full KYC and validation checks
 * 
 * Domain: corporate.movigoo.in
 */

import { onRequest } from "firebase-functions/v2/https";
import { db, auth } from "../utils/admin";
import * as crypto from "crypto";

interface UpsertEventRequest {
  mode: "draft" | "publish";
  eventId?: string;
  basicDetails: {
    title: string;
    description: string;
    genres: string[];
    languages: string[];
    ageLimit: string | number;
    durationMinutes: number;
    termsAccepted: boolean;
    termsText?: string;
    coverWideUrl: string;
    coverPortraitUrl: string;
  };
  schedule: {
    locations: Array<{
      id: string;
      name: string;
      venues: Array<{
        id: string;
        name: string;
        address: string;
        dates: Array<{
          id: string;
          date: string;
          shows: Array<{
            id: string;
            name?: string;
            startTime: string;
            endTime: string;
          }>;
        }>;
      }>;
    }>;
  };
  tickets: {
    venueConfigs: Array<{
      venueId: string;
      ticketTypes: Array<{
        id: string;
        typeName: string;
        price: number;
        totalQuantity: number;
      }>;
    }>;
  };
  // Session auth
  sessionId?: string;
  sessionKey?: string;
  idToken?: string;
}

interface ValidationError {
  [fieldPath: string]: string;
}

export const upsertEvent = onRequest(
  { region: "asia-south1", cors: true },
  async (req, res) => {
    // 1. CORS - Allow corporate.movigoo.in and localhost for dev
    const allowedOrigins = [
      "https://corporate.movigoo.in",
      "http://localhost:3000",
      "http://localhost:3001",
    ];
    
    const origin = req.headers.origin || "";
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-session-id, x-session-key, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // Only accept POST
    if (req.method !== "POST") {
      res.status(405).json({
        error: "METHOD_NOT_ALLOWED",
        message: "Only POST requests are accepted.",
      });
      return;
    }

    try {
      // 2. Parse & basic validation
      const body = req.body as UpsertEventRequest;

      if (!body.mode || !["draft", "publish"].includes(body.mode)) {
        res.status(400).json({
          error: "INVALID_REQUEST",
          message: "Mode must be either 'draft' or 'publish'.",
        });
        return;
      }

      // 3. Session verification
      const uid = await verifySession(req);
      if (!uid) {
        res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Invalid or missing session credentials.",
        });
        return;
      }

      // 4. Decide if new or existing event
      let eventId = body.eventId;
      const isNewEvent = !eventId;

      if (!isNewEvent && eventId) {
        // Check ownership
        const hasAccess = await verifyEventOwnership(eventId, uid);
        if (!hasAccess) {
          res.status(403).json({
            error: "FORBIDDEN",
            message: "You do not have permission to modify this event.",
          });
          return;
        }
      } else {
        // Generate new event ID
        eventId = db.collection("events").doc().id;
      }

      // 5. Fetch KYC status
      const kycStatus = await getKycStatus(uid);

      // 6. Branch by mode
      if (body.mode === "draft") {
        // Save draft - no KYC check, minimal validation
        const result = await saveDraft(uid, eventId!, body);
        res.status(200).json({
          success: true,
          eventId: eventId!,
          status: "draft",
          lastSaved: result.lastSaved,
        });
      } else {
        // Publish/Host event
        const result = await hostEvent(uid, eventId!, body, kycStatus);
        
        if (result.error) {
          res.status(result.statusCode || 400).json(result);
        } else {
          res.status(200).json(result);
        }
      }
    } catch (error: any) {
      console.error("Error in upsertEvent:", error);
      
      // Handle specific error types
      if (error.code === "UNAUTHORIZED") {
        res.status(401).json({
          error: "UNAUTHORIZED",
          message: error.message || "Authentication failed.",
        });
        return;
      }
      
      if (error.code === "FORBIDDEN") {
        res.status(403).json({
          error: "FORBIDDEN",
          message: error.message || "Access denied.",
        });
        return;
      }
      
      if (error.code === "NOT_FOUND") {
        res.status(404).json({
          error: "EVENT_NOT_FOUND",
          message: error.message || "Event not found.",
        });
        return;
      }

      // Generic internal error
      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      });
    }
  }
);

/**
 * Verify session using idToken or sessionId + sessionKey
 * Returns uid if valid, null otherwise
 */
async function verifySession(req: any): Promise<string | null> {
  const idToken = req.headers.authorization?.replace("Bearer ", "");
  const sessionId = req.headers["x-session-id"] || req.query.sessionId;
  const sessionKey = req.headers["x-session-key"] || req.query.sessionKey;

  try {
    // Method 1: ID Token
    if (idToken) {
      const decodedToken = await auth.verifyIdToken(idToken);
      const uid = decodedToken.uid;

      // Verify user has at least one active host session
      const sessionsSnapshot = await db
        .collectionGroup("hostSessions")
        .where("uid", "==", uid)
        .limit(1)
        .get();

      if (sessionsSnapshot.empty) {
        const error: any = new Error("No active host sessions found.");
        error.code = "UNAUTHORIZED";
        throw error;
      }

      return uid;
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

    // No valid credentials provided
    return null;
  } catch (error) {
    console.error("Session verification error:", error);
    throw error;
  }
}

/**
 * Verify event ownership
 */
async function verifyEventOwnership(
  eventId: string,
  uid: string
): Promise<boolean> {
  // Check in user's draft collection
  const draftDoc = await db
    .collection("users")
    .doc(uid)
    .collection("events")
    .doc(eventId)
    .get();

  if (draftDoc.exists) {
    return true;
  }

  // Check in root events collection
  const eventDoc = await db.collection("events").doc(eventId).get();
  
  if (eventDoc.exists) {
    const eventData = eventDoc.data();
    return eventData?.hostUid === uid;
  }

  return false;
}

/**
 * Get KYC status for user
 */
async function getKycStatus(uid: string): Promise<string> {
  const userDoc = await db.collection("users").doc(uid).get();
  
  if (!userDoc.exists) {
    return "not_started";
  }

  const userData = userDoc.data();
  return userData?.profile?.kycStatus || "not_started";
}

/**
 * Save event as draft
 * No KYC check, minimal validation
 */
async function saveDraft(
  uid: string,
  eventId: string,
  body: UpsertEventRequest
): Promise<{ lastSaved: string }> {
  const now = new Date().toISOString();
  
  const draftData = {
    status: "draft",
    basicDetails: body.basicDetails || {},
    schedule: body.schedule || { locations: [] },
    tickets: body.tickets || { venueConfigs: [] },
    updatedAt: now,
  };

  // Check if this is a new draft
  const draftRef = db
    .collection("users")
    .doc(uid)
    .collection("events")
    .doc(eventId);
  
  const existingDraft = await draftRef.get();
  
  if (!existingDraft.exists) {
    // New draft
    await draftRef.set({
      ...draftData,
      createdAt: now,
      hostUid: uid,
    });
  } else {
    // Update existing draft
    await draftRef.update(draftData);
  }

  return { lastSaved: now };
}

/**
 * Host event (publish)
 * Requires KYC verification and full validation
 */
async function hostEvent(
  uid: string,
  eventId: string,
  body: UpsertEventRequest,
  kycStatus: string
): Promise<any> {
  // 5.1 KYC Check - HARD BLOCK
  if (kycStatus !== "verified") {
    // Option B: Save as draft but block hosting
    await saveDraft(uid, eventId, body);
    
    return {
      error: "KYC_NOT_VERIFIED",
      statusCode: 403,
      message: "KYC verification is required to host events. Your changes have been saved as a draft.",
      status: "draft",
      savedAsDraft: true,
      eventId,
    };
  }

  // 5.2 Full Validation (only if KYC verified)
  const validationErrors = validateEventData(body);
  
  if (Object.keys(validationErrors).length > 0) {
    // Save as draft even with validation errors
    await saveDraft(uid, eventId, body);
    
    return {
      error: "VALIDATION_FAILED",
      statusCode: 400,
      message: "Please fix the validation errors before hosting.",
      details: validationErrors,
      status: "draft",
    };
  }

  // 5.3 Firestore Write - Event is valid and KYC verified
  const now = new Date().toISOString();
  
  const eventData = {
    status: "published",
    hostUid: uid,
    basicDetails: body.basicDetails,
    schedule: body.schedule,
    tickets: body.tickets,
    publishedAt: now,
    updatedAt: now,
  };

  // Write to both locations
  const batch = db.batch();

  // User's events collection
  const userEventRef = db
    .collection("users")
    .doc(uid)
    .collection("events")
    .doc(eventId);
  
  // Root events collection
  const rootEventRef = db.collection("events").doc(eventId);

  // Check if event exists to determine createdAt
  const existingEvent = await userEventRef.get();
  const isNewEvent = !existingEvent.exists;

  if (isNewEvent) {
    batch.set(userEventRef, { ...eventData, createdAt: now });
    batch.set(rootEventRef, { ...eventData, createdAt: now });
  } else {
    // Preserve createdAt on updates
    const existingData = existingEvent.data();
    batch.update(userEventRef, { ...eventData, createdAt: existingData?.createdAt || now });
    batch.update(rootEventRef, { ...eventData, createdAt: existingData?.createdAt || now });
  }

  await batch.commit();

  // 5.4 Success Response
  return {
    success: true,
    eventId,
    status: "published",
    message: "Event hosted successfully!",
  };
}

/**
 * Validate event data for hosting
 * Returns object with field paths as keys and error messages as values
 */
function validateEventData(body: UpsertEventRequest): ValidationError {
  const errors: ValidationError = {};

  // A. Basic Details Validation
  const bd = body.basicDetails;

  if (!bd) {
    errors["basicDetails"] = "Basic details are required.";
    return errors;
  }

  // Title
  if (!bd.title || bd.title.trim().length === 0) {
    errors["basicDetails.title"] = "Title is required.";
  } else if (bd.title.trim().length > 50) {
    errors["basicDetails.title"] = "Title cannot exceed 50 characters.";
  }

  // Description
  if (!bd.description || bd.description.trim().length === 0) {
    errors["basicDetails.description"] = "Description is required.";
  }

  // Genres
  if (!bd.genres || !Array.isArray(bd.genres) || bd.genres.length === 0) {
    errors["basicDetails.genres"] = "Select at least one genre.";
  }

  // Languages
  if (!bd.languages || !Array.isArray(bd.languages) || bd.languages.length === 0) {
    errors["basicDetails.languages"] = "Select at least one language.";
  }

  // Age Limit
  if (bd.ageLimit === undefined || bd.ageLimit === null || bd.ageLimit === "") {
    errors["basicDetails.ageLimit"] = "Age limit is required.";
  }

  // Duration
  if (!bd.durationMinutes || bd.durationMinutes <= 0) {
    errors["basicDetails.durationMinutes"] = "Duration must be greater than 0.";
  }

  // Terms
  if (!bd.termsAccepted) {
    errors["basicDetails.termsAccepted"] = "You must accept the terms and conditions.";
  }

  // Cover Photos
  if (!bd.coverWideUrl || bd.coverWideUrl.trim().length === 0) {
    errors["basicDetails.coverWideUrl"] = "Wide cover photo is required.";
  }

  if (!bd.coverPortraitUrl || bd.coverPortraitUrl.trim().length === 0) {
    errors["basicDetails.coverPortraitUrl"] = "Portrait cover photo is required.";
  }

  // B. Schedule Validation
  const schedule = body.schedule;

  if (!schedule || !schedule.locations || schedule.locations.length === 0) {
    errors["schedule.locations"] = "At least one location is required.";
    return errors; // Can't continue validation without locations
  }

  schedule.locations.forEach((location, locIdx) => {
    // Location name
    if (!location.name || location.name.trim().length === 0) {
      errors[`schedule.locations[${locIdx}].name`] = "Location name is required.";
    }

    // Must have at least one venue
    if (!location.venues || location.venues.length === 0) {
      errors[`schedule.locations[${locIdx}].venues`] = "At least one venue is required.";
      return;
    }

    location.venues.forEach((venue, venueIdx) => {
      // Venue name
      if (!venue.name || venue.name.trim().length === 0) {
        errors[`schedule.locations[${locIdx}].venues[${venueIdx}].name`] = "Venue name is required.";
      }

      // Venue address
      if (!venue.address || venue.address.trim().length === 0) {
        errors[`schedule.locations[${locIdx}].venues[${venueIdx}].address`] = "Venue address is required.";
      }

      // Must have at least one date
      if (!venue.dates || venue.dates.length === 0) {
        errors[`schedule.locations[${locIdx}].venues[${venueIdx}].dates`] = "At least one date is required.";
        return;
      }

      venue.dates.forEach((date, dateIdx) => {
        // Date
        if (!date.date || date.date.trim().length === 0) {
          errors[`schedule.locations[${locIdx}].venues[${venueIdx}].dates[${dateIdx}].date`] = "Date is required.";
        }

        // Must have at least one show
        if (!date.shows || date.shows.length === 0) {
          errors[`schedule.locations[${locIdx}].venues[${venueIdx}].dates[${dateIdx}].shows`] = "At least one show is required.";
          return;
        }

        date.shows.forEach((show, showIdx) => {
          // Start time
          if (!show.startTime || show.startTime.trim().length === 0) {
            errors[`schedule.locations[${locIdx}].venues[${venueIdx}].dates[${dateIdx}].shows[${showIdx}].startTime`] = "Start time is required.";
          }

          // End time
          if (!show.endTime || show.endTime.trim().length === 0) {
            errors[`schedule.locations[${locIdx}].venues[${venueIdx}].dates[${dateIdx}].shows[${showIdx}].endTime`] = "End time is required.";
          }

          // Validate end > start (if both present)
          if (show.startTime && show.endTime && show.startTime >= show.endTime) {
            errors[`schedule.locations[${locIdx}].venues[${venueIdx}].dates[${dateIdx}].shows[${showIdx}].endTime`] = "End time must be after start time.";
          }
        });
      });
    });
  });

  // C. Tickets Validation
  const tickets = body.tickets;

  if (!tickets || !tickets.venueConfigs) {
    errors["tickets"] = "Ticket configuration is required.";
    return errors;
  }

  // Get all venues that have shows
  const venuesWithShows: string[] = [];
  schedule.locations.forEach((location) => {
    location.venues.forEach((venue) => {
      const hasShows = venue.dates.some((date) => date.shows && date.shows.length > 0);
      if (hasShows) {
        venuesWithShows.push(venue.id);
      }
    });
  });

  // Each venue with shows must have ticket config
  venuesWithShows.forEach((venueId) => {
    const config = tickets.venueConfigs.find((vc) => vc.venueId === venueId);

    if (!config || !config.ticketTypes || config.ticketTypes.length === 0) {
      errors[`tickets.venue[${venueId}]`] = "At least one ticket type is required for this venue.";
      return;
    }

    config.ticketTypes.forEach((ticket, ticketIdx) => {
      // Type name
      if (!ticket.typeName || ticket.typeName.trim().length === 0) {
        errors[`tickets.venue[${venueId}].ticketTypes[${ticketIdx}].typeName`] = "Ticket type name is required.";
      }

      // Price
      if (!ticket.price || ticket.price <= 0) {
        errors[`tickets.venue[${venueId}].ticketTypes[${ticketIdx}].price`] = "Price must be greater than 0.";
      }

      // Quantity
      if (!ticket.totalQuantity || ticket.totalQuantity <= 0 || !Number.isInteger(ticket.totalQuantity)) {
        errors[`tickets.venue[${venueId}].ticketTypes[${ticketIdx}].totalQuantity`] = "Total quantity must be a positive integer.";
      }
    });
  });

  return errors;
}
