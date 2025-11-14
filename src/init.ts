// functions/src/init.ts
import * as admin from "firebase-admin";

// Protect against double-init in local emulator or hot reload
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

export { admin };
