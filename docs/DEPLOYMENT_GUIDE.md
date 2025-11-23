# Backend Deployment & Integration Guide

## 🚀 Deploying the upsertEvent Cloud Function

### Step 1: Build the Functions

```bash
cd functions
npm run build
```

This will compile `src/host/upsertEvent.ts` to `lib/host/upsertEvent.js`.

### Step 2: Deploy to Firebase

```bash
# Deploy only the new function
firebase deploy --only functions:upsertEvent

# Or deploy all functions
firebase deploy --only functions
```

### Step 3: Get the Function URL

After deployment, Firebase will output the function URL:

```
✔  functions[asia-south1-upsertEvent(...)]: Successful create operation.
Function URL (upsertEvent(...)): https://asia-south1-<project-id>.cloudfunctions.net/upsertEvent
```

**Copy this URL** - you'll need it for the frontend.

### Step 4: Test the Function

Use curl or Postman to test:

```bash
curl -X POST https://asia-south1-<project-id>.cloudfunctions.net/upsertEvent \
  -H "Content-Type: application/json" \
  -H "x-session-id: YOUR_SESSION_ID" \
  -H "x-session-key: YOUR_SESSION_KEY" \
  -d '{
    "mode": "draft",
    "basicDetails": {
      "title": "Test Event",
      "description": "Test Description",
      "genres": ["Music"],
      "languages": ["English"],
      "ageLimit": "18",
      "durationMinutes": 120,
      "termsAccepted": true,
      "coverWideUrl": "https://example.com/wide.jpg",
      "coverPortraitUrl": "https://example.com/portrait.jpg"
    },
    "schedule": {
      "locations": [{
        "id": "loc1",
        "name": "Test Location",
        "venues": [{
          "id": "venue1",
          "name": "Test Venue",
          "address": "Test Address",
          "dates": [{
            "id": "date1",
            "date": "2025-12-25",
            "shows": [{
              "id": "show1",
              "startTime": "19:00",
              "endTime": "21:00"
            }]
          }]
        }]
      }]
    },
    "tickets": {
      "venueConfigs": [{
        "venueId": "venue1",
        "ticketTypes": [{
          "id": "ticket1",
          "typeName": "Regular",
          "price": 500,
          "totalQuantity": 100
        }]
      }]
    }
  }'
```

Expected response for draft:
```json
{
  "success": true,
  "eventId": "generated-id",
  "status": "draft",
  "lastSaved": "2025-11-23T10:30:00.000Z"
}
```

---

## 🔌 Frontend Integration

### Step 1: Set Environment Variable

Create/update `.env.local` in the `host/` directory:

```bash
NEXT_PUBLIC_UPSERT_EVENT_URL=https://asia-south1-<project-id>.cloudfunctions.net/upsertEvent
```

### Step 2: Update EventCreationWizard.tsx

Replace the placeholder API calls with real ones:

**File**: `host/components/events/EventCreationWizard.tsx`

#### In handleSaveAsDraft function:

**FIND (around line 100):**
```typescript
try {
  // TODO: Call backend API to save draft
  console.log("[PLACEHOLDER] Saving draft...", { formData, ticketConfigs });

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // PLACEHOLDER: Success response
  const savedEventId = eventId || "new-event-id-123";
```

**REPLACE WITH:**
```typescript
try {
  // Import at top: import { saveEventDraft } from "@/lib/api/events";
  const result = await saveEventDraft(formData, ticketConfigs, eventId);
  const savedEventId = result.eventId;
```

#### In handleHostEvent function:

**FIND (around line 150):**
```typescript
try {
  // Validate all steps
  const allErrors = validateForHosting(formData, ticketConfigs);

  if (allErrors.length > 0) {
    // ... existing validation error handling
  }

  // TODO: Call backend API to host event
  console.log("[PLACEHOLDER] Hosting event...", { formData, ticketConfigs, kycStatus });

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // PLACEHOLDER: Simulate different backend responses

  // Scenario 1: KYC not verified
  if (kycStatus !== "verified") {
    console.log("[PLACEHOLDER] KYC not verified - saving as draft");
    setShowKycDialog(true);
    
    // Save as draft in this case
    setFormData({
      ...formData,
      status: "draft",
      lastSaved: new Date(),
    });
    setHasUnsavedChanges(false);
    return;
  }

  // Scenario 3: Success
  console.log("[PLACEHOLDER] Event hosted successfully!");
```

**REPLACE WITH:**
```typescript
try {
  // Validate all steps
  const allErrors = validateForHosting(formData, ticketConfigs);

  if (allErrors.length > 0) {
    // ... existing validation error handling
  }

  // Import at top: import { hostEvent } from "@/lib/api/events";
  const result = await hostEvent(formData, ticketConfigs, eventId);

  // Handle KYC not verified
  if (result.status === "kyc_required") {
    setShowKycDialog(true);
    setFormData({
      ...formData,
      status: "draft",
      lastSaved: new Date(),
    });
    setHasUnsavedChanges(false);
    return;
  }

  // Handle validation errors from backend
  if (!result.success && result.errors) {
    setErrors(result.errors);
    const firstErrorStep = result.errors[0]?.step || 1;
    setCurrentStep(firstErrorStep);
    scrollToFirstError(result.errors);
    toast.error("Please fix all validation errors before hosting");
    return;
  }

  // Success!
```

**And at the end of the success block:**
```typescript
  setFormData({
    ...formData,
    status: "hosted",
    lastSaved: new Date(),
  });
  setHasUnsavedChanges(false);
  setShowSuccessDialog(true);
```

### Step 3: Add Import Statements

At the top of `EventCreationWizard.tsx`, add:

```typescript
import { saveEventDraft, hostEvent } from "@/lib/api/events";
```

### Step 4: Update Create Event Page

**File**: `host/app/events/create/page.tsx`

**FIND (around line 15):**
```typescript
// TODO: Fetch KYC status from backend
const fetchKycStatus = async () => {
  try {
    console.log("[PLACEHOLDER] Fetching KYC status...");
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // PLACEHOLDER: Mock KYC status - replace with actual API call
    // const response = await fetch("/api/host/getKycStatus");
    // const data = await response.json();
    // setKycStatus(data.status);
    
    // For demo: set to "verified" - change this to test different statuses
    setKycStatus("verified");
```

**REPLACE WITH:**
```typescript
const fetchKycStatus = async () => {
  try {
    // Use existing getKycStatus function
    const response = await fetch(
      `https://asia-south1-<project-id>.cloudfunctions.net/getKycStatus`,
      {
        method: "GET",
        headers: {
          "x-session-id": document.cookie.split("; ").find(r => r.startsWith("sessionId="))?.split("=")[1] || "",
          "x-session-key": document.cookie.split("; ").find(r => r.startsWith("sessionKey="))?.split("=")[1] || "",
        },
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      setKycStatus(data.status || "not_started");
    } else {
      setKycStatus("not_started");
    }
```

Do the same for `host/app/events/[eventId]/edit/page.tsx`.

---

## 🗄️ Firestore Structure

After events are created, your Firestore will look like:

```
users/
  {uid}/
    profile/
      kycStatus: "verified"
    events/
      {eventId}/
        status: "published" or "draft"
        hostUid: {uid}
        basicDetails: { ... }
        schedule: { ... }
        tickets: { ... }
        createdAt: timestamp
        updatedAt: timestamp
        publishedAt: timestamp (only if published)

events/ (root - only published events)
  {eventId}/
    status: "published"
    hostUid: {uid}
    basicDetails: { ... }
    schedule: { ... }
    tickets: { ... }
    createdAt: timestamp
    updatedAt: timestamp
    publishedAt: timestamp
```

### Firestore Security Rules

Add these rules to `firestore.rules`:

```
// Users can read/write their own event drafts
match /users/{uid}/events/{eventId} {
  allow read, write: if request.auth.uid == uid;
}

// Published events in root collection
match /events/{eventId} {
  // Anyone can read published events
  allow read: if true;
  
  // Only hosts with verified KYC can write
  allow write: if request.auth.uid != null &&
                  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.profile.kycStatus == "verified";
}
```

---

## 🧪 Testing Checklist

### Draft Mode (No KYC Required)
- [ ] Create new draft with incomplete data
- [ ] Save draft at Step 1
- [ ] Save draft at Step 2
- [ ] Save draft at Step 3
- [ ] Edit existing draft
- [ ] Verify draft saved in `users/{uid}/events/{eventId}`
- [ ] Verify NO document created in root `events/` collection

### Publish Mode (KYC Not Verified)
- [ ] Attempt to host event with KYC = "pending"
- [ ] Verify returns 403 with `KYC_NOT_VERIFIED`
- [ ] Verify event saved as draft
- [ ] Verify KYC dialog shown in UI
- [ ] Verify NO document created in root `events/` collection

### Publish Mode (KYC Verified, Validation Errors)
- [ ] Host event with missing title
- [ ] Host event with missing genres
- [ ] Host event with no locations
- [ ] Host event with no ticket types
- [ ] Verify returns 400 with `VALIDATION_FAILED`
- [ ] Verify error details map to correct fields
- [ ] Verify errors displayed in UI at correct step

### Publish Mode (KYC Verified, Valid Data)
- [ ] Host complete event with all fields
- [ ] Verify returns 200 with success
- [ ] Verify document created in `users/{uid}/events/{eventId}`
- [ ] Verify document created in root `events/{eventId}`
- [ ] Both documents have status: "published"
- [ ] Both documents have same data
- [ ] Success dialog shown in UI
- [ ] Can navigate to event view

### Session Handling
- [ ] Request without session credentials returns 401
- [ ] Request with invalid session ID returns 401
- [ ] Request with invalid session key returns 401
- [ ] Request with valid session succeeds

### Edge Cases
- [ ] Edit event owned by different user returns 403
- [ ] Update existing published event (re-host after edit)
- [ ] Create event with very long title (>50 chars) - validation error
- [ ] Create event with negative price - validation error
- [ ] Create event with decimal quantity - validation error

---

## 📊 Monitoring & Logs

### View Function Logs

```bash
# View recent logs
firebase functions:log

# Follow logs in real-time
firebase functions:log --only upsertEvent
```

### Cloud Console

Visit: https://console.cloud.google.com/functions/list

Select your function to see:
- Execution count
- Error rate
- Execution time
- Memory usage

---

## 🐛 Troubleshooting

### CORS Errors
**Problem**: Browser shows CORS error

**Solution**: Verify the function sets correct CORS headers for `corporate.movigoo.in`

### 401 Unauthorized
**Problem**: All requests return 401

**Solution**: Check session cookies are being sent correctly. Verify session verification logic.

### 403 KYC Not Verified
**Problem**: Events can't be hosted even with KYC verified

**Solution**: Check `users/{uid}.profile.kycStatus` value in Firestore. Must be exactly "verified".

### Validation Always Fails
**Problem**: Valid data returns validation errors

**Solution**: Check request payload format matches backend expectations. Log the `body` in Cloud Function.

### Event Not Appearing
**Problem**: Event hosted successfully but not visible

**Solution**: Check both collections:
- `users/{uid}/events/{eventId}` (should exist)
- `events/{eventId}` (should exist for published)

---

## 🔐 Security Considerations

1. **Session Verification**: Always verify session before any operation
2. **KYC Check**: Hard-block hosting if KYC not verified
3. **Ownership**: Verify user owns event before editing
4. **Input Validation**: Validate all inputs server-side
5. **CORS**: Only allow corporate.movigoo.in in production
6. **Rate Limiting**: Consider adding rate limits for production
7. **Data Sanitization**: Sanitize user inputs before storing

---

## 🚀 Production Checklist

Before going live:

- [ ] Update CORS to only allow production domain
- [ ] Set up proper error monitoring (Sentry, etc.)
- [ ] Add rate limiting if needed
- [ ] Test with real KYC verification flow
- [ ] Load test with concurrent requests
- [ ] Set up alerting for function errors
- [ ] Document recovery procedures
- [ ] Train support team on error codes
- [ ] Create rollback plan
- [ ] Update Firestore indexes if needed

---

## 📞 Support

For issues:
1. Check function logs first
2. Verify request payload format
3. Test with curl to isolate frontend/backend
4. Check Firestore security rules
5. Review session verification logic

**Function Name**: `upsertEvent`
**Region**: `asia-south1`
**Runtime**: Node.js 20
**Memory**: Default (256MB)
**Timeout**: Default (60s)
