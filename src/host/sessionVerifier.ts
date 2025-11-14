import type { IncomingHttpHeaders } from "http";
import crypto from "crypto";
import { db } from "../utils/admin";

export class SessionVerificationError extends Error {
  status: number;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

function normalizeHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function verifySessionFromHeaders(headers: IncomingHttpHeaders) {
  const sessionId = normalizeHeaderValue(headers["x-session-id"]);
  const sessionKey = normalizeHeaderValue(headers["x-session-key"]);

  if (!sessionId || !sessionKey) {
    throw new SessionVerificationError(401, "UNAUTHORIZED");
  }

  const snap = await db
    .collectionGroup("hostSessions")
    .where("sessionId", "==", sessionId)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new SessionVerificationError(401, "SESSION_NOT_FOUND");
  }

  const sessionDoc = snap.docs[0];
  const storedHash = sessionDoc.get("keyHash");
  const candidateHash = crypto.createHash("sha256").update(sessionKey).digest("hex");

  if (storedHash !== candidateHash) {
    throw new SessionVerificationError(401, "INVALID_SESSION_KEY");
  }

  const pathSegments = sessionDoc.ref.path.split("/");
  const uid = pathSegments[1];

  return {
    uid,
    sessionId,
  };
}

