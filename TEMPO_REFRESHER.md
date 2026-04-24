# Tempo Codebase Refresher

**Last Updated:** April 2026  
**Owner Context:** Returning from Twilio A2P 10DLC compliance work  
**Tech Stack:** Firebase + Capacitor iOS + Vanilla JS (ES6 modules)  
**Live Domain:** tempocal.app

---

## Quick Orientation

Tempo is a **social app for musicians** that helps bands coordinate rehearsals and gigs. The core loop:
1. Create or join a **band** with other musicians
2. Create **events** (gigs or rehearsals)
3. **Invite band members** and manage **RSVPs** (via SMS, email, or in-app)
4. **Discover musicians** and build **connections** for future collaborations
5. **Share updates** via a social feed

The app is **iOS-native** (Capacitor wrapper) plus **web-responsive**. Backend is entirely **Firebase** (Firestore, Auth, Storage, Cloud Functions, Hosting).

---

## Top-Level Directory Structure

```
/Users/andrewstrader/Projects/tempo/
├── public/                   # Frontend (ES6 modules loaded in index.html)
│   ├── index.html           # Single-page app shell
│   ├── app-module.js        # ~10K lines: main app logic
│   ├── app-legacy.js        # Legacy code (not in use)
│   ├── styles.css           # All UI styling
│   ├── sms.html             # SMS messaging landing page
│   ├── sms-signup.html      # SMS opt-in consent form
│   ├── privacy.html         # Privacy policy
│   ├── terms.html           # Terms of service
│   ├── tempo-logo.svg       # Branding
│   └── images/              # PNGs, OGs
├── functions/               # Cloud Functions (Node 20)
│   ├── index.js             # ~1200 lines: all HTTP & Firestore triggers
│   ├── package.json         # Dependencies: firebase-admin, twilio, cheerio
│   └── package-lock.json
├── firestore.rules          # Security rules for all collections
├── firebase.json            # Hosting + Functions config
├── capacitor.config.json    # iOS Capacitor config
└── .firebase/               # Firebase project files
```

### Key Hosted Routes (firebase.json)

- `/` → index.html (app shell)
- `/e/{gigId}` → Cloud Function `ogTags` (OG meta tags for social sharing)
- `/b/{bandId}` → Cloud Function `bandPreview` (OG meta tags for band invite links)
- `/sms-signup` → sms-signup.html (consent form for A2P 10DLC)
- `/sms` → sms.html (generic SMS info page)
- `/privacy`, `/terms` → static pages
- Everything else → index.html (SPA routing)

---

## Firestore Collections (Data Model)

Inferred from `firestore.rules` and function code:

### Core Collections

| Collection | Key Fields | Notes |
|------------|-----------|-------|
| **users** | uid, name, bio, phone, location, photoURLs[], instruments[], calendarConnected, discoverable | User profiles; open read, self-write |
| **bands** | name, leaderId, leaderName, bio, photoURL, memberCount, createdAt | Band metadata |
| **bandMembers** | bandId, memberId, email, status, joinedAt | M2M join table; status = pending/accepted |
| **gigs** | bandId, bandName, venue, showDate, loadIn, setTime, setLength, notes, creatorId, responderIds, invites[], confirmedTimes, showGraphic | Events with RSVP data |
| **rehearsals** | name, bandId, date, startTime, endTime, location, notes, creatorId, invitedMembers[], linkedGigId, setlist[], isRecurring, parentRehearsalId | Rehearsal events; similar invite structure |
| **posts** | content, authorId, authorName, authorPhoto, authorInstruments[], imageUrl, linkUrl, linkPreview, createdAt, commentCount | Social feed posts |
| **posts/{id}/comments** | authorId, authorName, content, createdAt | Comments on posts |
| **conversations** | participants[], lastMessage, lastMessageAt, createdAt | 1-on-1 DMs; only participants can read |
| **conversations/{id}/messages** | senderId, content, createdAt, imageUrl | Message history |
| **connections** | users[] (UIDs), requestedBy, status, message, createdAt | Connection requests / follows |
| **messages** (band messages) | bandId, senderId, senderName, content, createdAt | Band group chat (different from conversations) |
| **smsMessages** | sentBy, recipientPhone, body, type, referenceType, referenceId, status, twilioSid, inboundReply, replyAt, sentAt | SMS audit log; Cloud Functions only write |
| **optouts** | phone, optedOutAt | Numbers that texted STOP; checked before sending |
| **smsOptIns** | fullName, phone, disclosureText, disclosureVersion, ip, userAgent, consentedAt, recordedAt | A2P 10DLC consent audit trail (no client reads/writes) |
| **calendarTokens** | refreshToken, accessToken, expiresAt, connectedAt | OAuth tokens for Google Calendar integration |
| **mail** | to, message {subject, html} | Documents for Firebase "Trigger Email" extension (legacy) |
| **notifications** | type, recipientEmail, bandName, responderCount, confirmedTimes, sent, sentAt | Transactional notification trigger docs |

**Contacts** are stored as a subcollection under users:
- `users/{userId}/contacts/{contactId}` → {name, phone}

---

## 1. High-Level Architecture

### Frontend (app-module.js)

**Framework:** Vanilla ES6 modules; DOM-driven state management  
**Firebase SDK:** v10.7.0 (Firestore, Auth, Storage, Functions, Cloud Messaging ready but not actively used)  
**Styling:** CSS grid/flexbox; responsive for mobile-first

**Entry Point:** `index.html` loads `app-module.js` as ES6 module  
**Routing:** Custom URL-based routing via `window.history.pushState()`  
**Auth:** Google Sign-In (Capacitor plugin on iOS, popup/redirect on web/mobile browser)

**Screen System:** Multiple screens toggled by `classList`:
- `screenFeed` (social feed home)
- `screenMyBands` (user's bands list)
- `screenBandDetail` (single band view)
- `screenMySchedule` (gigs + rehearsals)
- `screenCreateRehearsal` (rehearsal composer)
- `screenMusicianDiscovery` (browse musicians)
- `screenConnections` (requests & follows)
- `screenConversations` (DM list)
- `screenChat` (1-on-1 chat)
- `screenEditProfile` (user profile editor)
- `screenCreatePost` (social feed post composer)
- `screenPostDetail` (single post & comments)

**Tab Bar:** At bottom; routes to Feed, Bands, Schedule, Discovery, Profile, Messages

**Modals:**
- `unifiedInviteModal` (SMS + Email invite composer for events)
- `availModalOverlay` (band calendar availability picker)
- `createPostModal` (post composer)
- `addContactsModal` (import phone contacts for SMS)
- `smsInviteModal` (legacy SMS-only invite)

### Firebase Functions (index.js)

**Trigger Types:**

1. **HTTP Callable** (client-side JS can call):
   - `sendSMS(data, context)` → Send single SMS via Twilio
   - `sendBulkSMS(req, res)` → Send batch SMS (HTTP with Bearer token auth)

2. **HTTP Webhook** (Twilio callbacks):
   - `handleInboundSMS(req, res)` → Process incoming SMS (opt-in/out/RSVP)
   - `smsStatusCallback(req, res)` → Delivery status updates

3. **HTTP Rewrite** (Firebase Hosting rewrites):
   - `ogTags(req, res)` → Generate OG meta tags for `/e/{gigId}` links
   - `bandPreview(req, res)` → Generate OG meta tags for `/b/{bandId}` links
   - `fetchLinkPreview(req, res)` → Scrape & return meta tags for any URL

4. **Google Calendar OAuth**:
   - `startCalendarAuth(req, res)` → Redirect user to Google consent screen
   - `oauthCallback(req, res)` → Exchange OAuth code for refresh token
   - `disconnectCalendar(req, res)` → Revoke access
   - `getBandBusyTimes(req, res)` → Query Google Calendar API for band availability

5. **Firestore Triggers**:
   - `processNotification(snap, context)` → Create email docs when notification written (uses Trigger Email extension)

6. **Consent Tracking**:
   - `recordSmsOptIn(req, res)` → Record A2P 10DLC consent + audit fields

### Firestore Security Rules

**Public reads:** `users`, `bands`, `gigs`, `rehearsals`, `posts`, `posts/{id}/comments`  
**Authenticated reads:** `connections`, `conversations`, `conversations/{id}/messages`, `bandMembers`, `smsMessages`, `optouts`  
**Self-write only:** `users/{userId}` (profile), `users/{userId}/contacts`  
**Auth + ownership:** Posts (create/update/delete), comments (create/delete), conversations (create/participate)  
**Cloud Functions only:** `smsMessages` (no client writes), `smsOptIns` (no client access), `optouts` (no client writes)

---

## 2. User-Facing Features by Area

### Authentication

**Status:** LIVE  
**Entry Point:** Google Sign-In button (home screen, after sign-out)  
**Flow:**
- Native iOS: Capacitor `FirebaseAuthentication.signInWithGoogle()` → returns ID token → `signInWithCredential()`
- Web/Mobile Safari: popup on desktop, redirect on mobile
- Redirect handling: Restores pending actions from localStorage (e.g., pending band join)

**Profile Requirement:** New users are sent to `showProfileSetup()` after first sign-in  
**Current User:** Stored in `window.currentUser` and `window.currentUserProfile`

**Key Functions:**
- `signInWithGoogle()`, `signInWithGoogleAndCheckProfile()`
- `signOutUser()`
- `onAuthStateChanged()` listener (watches for profile setup, pending actions)

---

### User Profiles

**Status:** LIVE  
**Key Fields:** name, bio, phone, location, photoURLs[], instruments[], calendarConnected, discoverable  
**Storage:** Photos → Firebase Storage (`gs://bandcal-89c81.firebasestorage.app`)

**Profile Setup Flow (`showProfileSetup()`):**
1. Enter name (required)
2. Select instruments (multi-select chips)
3. Select city/location (autocomplete)
4. Enter bio (optional)
5. Upload profile photo(s)
6. Option to connect Google Calendar
7. Option to add phone for SMS (with A2P 10DLC consent)
8. Save → creates/updates Firestore doc

**Profile Edit (`showEditProfile()`):**
- Modify all fields above
- Photo carousel: add/remove/reorder photos, set primary
- Calendar connection status shown
- Phone number management (add/update with consent, or remove)
- Disclosure version tracking (`SMS_CONSENT_DISCLOSURE_VERSION: '2026-04-16'`)

**Photo Management:**
- Multiple photos per user; one marked as primary
- Resizing & compression before upload (max 10 MB, resize to ~2 MB)
- HEIC to JPEG conversion (via heic2any.js)
- Photo viewer overlay (swipe-able, full-screen)

**Discovery Flag:** Users can opt in to `discoverable: true` for musician discovery feature

---

### Bands

**Status:** LIVE  
**Create Band (`showCreateBand()`):**
- Band name (required)
- Select leader: self, another user (by email), or leave empty
- Add members: by email, with invite emails sent
- Band photo upload
- Bio/description
- Saves to Firestore `bands` collection

**Band Detail (`showBandDetail(bandId)`):**
- Band info (name, photo, bio, member list)
- Member badges: show who has SMS phone number connected
- Gigs tab: upcoming gigs for band
- Actions:
  - If leader: "Create Gig" button
  - If leader: "Add Member" (modal with email form)
  - If leader: "Remove Member" button per member
  - Copy band link (generates `/b/{bandId}` shareable link with OG tags)
  - Share to messages button

**Band Invite Landing (`showBandInviteLanding(bandId)`):**
- Public page at `/b/{bandId}`
- Shows band name, photo, bio
- If not logged in: sign-in prompt + "Join Band" CTA
- If logged in: "Join" button → `joinBandFromInvite()` → creates bandMembers doc, user becomes "accepted" member

**Band Members:**
- Query `bandMembers` collection
- Status: pending (invited but not yet signed up) or accepted (member of band)
- Email stored for sending invites
- When member accepts, `acceptLeaderRole()` promotes them if they were invited as leader

---

### Events (Gigs & Rehearsals)

#### Gigs

**Status:** LIVE (basic version; RSVP flow partially scaffolded)  
**Create Gig (`createGigForBand()`):**
- Linked to a band
- Fields: venue, showDate, loadIn time, setTime, setLength, notes, show graphic URL
- Stores creatorId (user who created)
- Saves to `gigs` collection

**Gig Detail (`loadGig(gigId)`):**
- Shows band, venue, date, times, notes
- "Musician view" (non-leaders): RSVP buttons (in/out/maybe) — **stored in invites array**
- "Leader view" (creator): See confirmed responses, button to "Finalize Schedule" (band availability picker modal)

**Availability Modal (`availModalOverlay`):**
- Leader clicks "Finalize Schedule" on a gig
- System queries `getBandBusyTimes()` Cloud Function
- Function checks all band members' Google Calendars (if connected)
- Shows calendar heatmap: green (all free) → yellow (some conflicts) → red (all busy)
- Leader can click date → see time slots
- Select rehearsal times → confirms times → triggers email notification (processNotification Cloud Function)

**Invites on Gigs:**
- Can be sent via SMS (needs phone + consent) or email
- RSVP tracking: invites[].rsvp = 'yes' | 'no' | 'maybe'

#### Rehearsals

**Status:** LIVE  
**Create Rehearsal (`showCreateRehearsal()`):**
- Select band (loads members) OR add individual emails
- Name, date, start time, end time (optional)
- Location, notes, linked gig (optional)
- Recurring option (weekly/biweekly/monthly)
- Setlist: add songs with duration + delete
- Suggest times button (if band members have calendars connected)
- Saves to `rehearsals` collection; if recurring, creates child docs

**Rehearsal Detail (`showRehearsalDetail(rehearsalId)`):**
- Shows all event info
- Setlist display
- Invitee list with RSVP status
- If creator: can edit, delete, or send SMS invites
- If attendee: can RSVP

**Recurring Rehearsals:**
- Parent doc: `isRecurring: true`, `parentRehearsalId: null`
- Child docs: `parentRehearsalId: parentId`, `isRecurring: false`
- Each instance has independent RSVP state

**Invite Notifications:**
- Email sent to all invitees via Firestore `mail` collection (Trigger Email extension)
- SMS can be sent separately via modal

---

### SMS Messaging System

**Status:** LIVE + A2P 10DLC Scaffolding (compliance records written but not linked to real user flows yet)

#### End-to-End Flow

**1. SMS Setup (Profile):**
- User adds phone number in profile edit
- Sees checkbox: "I agree to receive SMS from Tempo..." (disclosure text v2026-04-16)
- On save: `recordSmsOptIn()` Cloud Function called
  - Stores consent doc in `smsOptIns` collection (no client access)
  - Includes: fullName, phone, IP, User-Agent, disclosure text, version, timestamp
  - Deletes any prior opt-out record for that number (re-opt-in)

**2. Sending SMS:**
- Two UI paths:
  a. **Unified Invite Modal** (`unifiedInviteModal`): For events
     - Recipient tabs: Band, Contacts, Manual entry
     - Multi-select recipients
     - Delivery method checkboxes: SMS, Email
     - Personalized message composer (160 char limit shown)
     - Preview shows counts for SMS-eligible + email-eligible
     
  b. **Direct SMS Modal** (legacy, still used): `showSmsInviteModal()`
     - Similar flow, SMS-only

- **Eligibility Checks:**
  - Must have `phone` + `smsConsent` checked on profile
  - Recipient must not be in `optouts` collection
  - E.164 format validation: `+1[0-9]{10}`

- **Send Path:**
  - Client calls `sendBulkSMS()` Cloud Function (HTTP POST)
  - Bearer token auth (Firebase ID token)
  - Payload: recipients[], messageTemplate, referenceType, referenceId
  - Function:
    1. Validates auth token
    2. Queries all optouts
    3. Loop: for each recipient
       - Validate phone format
       - Skip if opted out
       - Personalize message (replace {name})
       - Add opt-out language if isFirstContact
       - Call `twilio.messages.create()`
       - Log to `smsMessages` collection: {twilioSid, sentAt, sentBy, type, recipientPhone, body, status: 'queued', ...}
       - Rate limit: 1 sec delay between messages
    4. Return results: {sent, failed, skipped, results[]}

**3. Inbound SMS (RSVP Reply):**
- User texts to Twilio number
- Twilio webhook calls `handleInboundSMS()`
- Function:
  1. Validates Twilio signature
  2. Extracts From (phone), Body (message)
  3. **STOP/UNSUBSCRIBE/QUIT/CANCEL** → writes to `optouts` collection, replies "You have been unsubscribed"
  4. **START/UNSTOP** → deletes from optouts, replies "You have been resubscribed"
  5. **YES/Y/GOING/IN/YEP/YA/YEAH** → rsvpStatus = 'yes'
  6. **NO/N/CANT/OUT/NOPE/NAH** → rsvpStatus = 'no'
  7. **MAYBE/M/UNSURE/?/IDK/POSSIBLY** → rsvpStatus = 'maybe'
  8. If valid RSVP:
     - Find most recent outbound SMS to that phone
     - Update smsMessages doc: {inboundReply, replyAt}
     - Update corresponding gig/rehearsal invites[].rsvp
     - Reply with confirmation ("Got it! You're in. 🎸")
  9. Else: Reply with usage hint

**4. Opt-out Tracking:**
- Stored in `optouts` collection: {phone, optedOutAt}
- Checked before every send
- Can be cleared via START reply or `recordSmsOptIn()` (re-opt-in from consent form)

#### A2P 10DLC Compliance Scaffolding

**What's Written:**
- `recordSmsOptIn()` function creates `smsOptIns` collection docs (Cloud Functions only write)
- Captures: consent text, version, IP, User-Agent, timestamp, name, phone, source
- Accessible only to backend (no client reads)

**What's NOT Linked Yet:**
- Actual SMS sends don't trigger new opt-in records (reuse existing or assume one-time profile setup)
- No per-campaign opt-in (uses global "I agree to Tempo texts")
- No branded short code flow (uses Twilio default phone number)
- Campaign registration docs not created

**Next Steps (When Time):**
- Capture disclosure text + version per SMS send (store in smsMessages)
- Create "campaign" concept in Firestore for TCR registration
- Per-campaign opt-in tracking
- Branded short code integration

---

### Connections & Discovery

**Status:** LIVE  
**Musician Discovery (`showMusicianDiscovery()`):**
- Browse all discoverable users
- Filter by instrument
- Search by name
- Card view: photo, name, instruments, location, "Connect" button

**Connection Requests:**
- Two-way request/response system
- Tables:
  - "Connections": established mutual connections
  - "Pending": requests sent by me (can cancel)
  - "Requests": requests received by others (can accept/decline)

**Functions:**
- `sendConnectionRequest(toUserId, message)` → creates connection doc, requestedBy = currentUser
- `acceptConnection(connectionId)` → updates status to 'accepted'
- `declineConnection(connectionId)` → deletes connection doc
- `removeConnection(connectionId)` → delete established connection

**Connection Badges:**
- Shown on user cards, band members list
- Indicates mutual vs. pending state

---

### Messaging (Conversations & Band Messages)

#### Private 1-on-1 Chat

**Status:** LIVE  
**Conversations:**
- Stored in `conversations` collection
- participants[] (array of 2 UIDs)
- lastMessage, lastMessageAt (for sorting)
- Only participants can read (Firestore rule: `uid in participants`)

**Messages:**
- Subcollection `conversations/{conversationId}/messages`
- senderId, content, createdAt
- Only sender can update/delete (Firestore rule)

**Chat UI (`showChat()`):**
- Real-time listener on messages subcollection
- Message rendering: sender photo, name, timestamp, content
- Input field for new message
- Emoji picker (emojilib)
- Auto-scroll to bottom on new message
- Unread badge tracking

**Entry Points:**
- Click on musician → "Contact" button → `getOrCreateConversation()` → `showChat()`
- Or: Conversations tab → list of active chats

#### Band Group Messages

**Status:** LIVE but underdeveloped  
**Collection:** `bands/{bandId}/messages` subcollection  
**Fields:** senderId, senderName, content, createdAt  
**Rules:** Any authenticated user can create/read (permissive; no band membership check in rules)

**UI:** Band detail screen has messages section (visible but minimal interaction in code)

---

### Social Feed & Posts

**Status:** LIVE  
**Feed Home (`showFeedHome()`):**
- Loads recent posts (up to 50, ordered by createdAt desc)
- If logged in: "Create Post" button/prompt
- Post cards show: author, photo, instruments, content, image, link preview, comment count

**Create Post (`showCreatePost()`):**
- Text content (required)
- Image upload (optional, image preview shown)
- Link paste (optional, auto-fetches OG tags via `fetchLinkPreview()`)
- Modal: `createPostModal`
- On save: creates doc in `posts` collection

**Post Detail (`showPostDetail(postId)`):**
- Full post display
- Comments section
- If logged in: "Add comment" input
- Comments ordered by createdAt asc (oldest first)

**Link Preview Fetching:**
- `fetchLinkPreview(req, res)` Cloud Function
- Receives URL in query param
- Uses cheerio to parse HTML
- Extracts og:title, og:description, og:image
- Returns {title, description, image}
- Cached: 1 hour

**OG Tags for Gigs/Bands:**
- `ogTags()` function for `/e/{gigId}` links
- `bandPreview()` for `/b/{bandId}` links
- Used by social platforms (iMessage, Slack, etc.) for rich link previews
- Cache: 5 min CDN, 10 min browser

---

### Calendar Integration (Google)

**Status:** LIVE  
**Feature:** Band leaders can see members' calendar availability when scheduling rehearsals

**Flow:**
1. User goes to profile setup/edit
2. Clicks "Connect Google Calendar"
3. Redirected to `startCalendarAuth()` → Google OAuth consent screen
4. After consent, `oauthCallback()` exchanges code for tokens
5. Refresh token stored in `calendarTokens/{userId}` (encrypted at rest by Firebase)
6. Profile updated: `calendarConnected: true`

**Availability Check:**
- When creating rehearsal & band selected: `checkBandCalendarStatusForRehearsal()`
- Lists members with calendars connected
- "Suggest Times" button triggers `availModalOverlay`
- Leader selects band, date → `getBandBusyTimes()` queries all members' calendars
- Uses Google Calendar API freeBusy endpoint
- Displays calendar heatmap

**Token Refresh:**
- `getFreshAccessToken()` checks expiry (5 min buffer)
- If expired, uses refresh token to get new access token
- Updates stored token expiry

**Disconnect:**
- `disconnectGoogleCalendar()` calls Cloud Function
- Deletes calendarTokens doc
- Sets user.calendarConnected = false

---

### Admin Tooling

**Status:** Minimal  
**Rough Features:**
- Help screen (`showHelp()`) → static info
- Privacy policy page (`showPrivacy()`)
- Terms of service page (`showTerms()`)

---

## 3. SMS System Deep Dive

### The Current Live Flow

```
[User creates rehearsal/gig with invites]
    ↓
[Opens Unified Invite Modal] 
    → Selects recipients (band members, contacts, manual)
    → Selects "SMS" delivery
    → Composes message
    ↓
[Client calls sendBulkSMS() Cloud Function]
    → Validates auth token
    → Checks optouts
    → For each recipient:
        - Validates E.164 format
        - Adds opt-out language if first contact
        - Calls twilio.messages.create()
        - Logs to smsMessages collection
    → Returns {sent, failed, skipped, results[]}
    ↓
[SMS delivered via Twilio]
    ↓
[User texts YES/NO/MAYBE back]
    ↓
[Twilio webhook → handleInboundSMS()]
    → Validates signature
    → Parses response (yes/no/maybe/stop)
    → Finds original outbound message
    → Updates smsMessages: {inboundReply, replyAt}
    → Updates gig/rehearsal invites[].rsvp
    → Sends TwiML reply
```

### A2P 10DLC Compliance Records (Written but Scaffolded)

**When Triggered:**
- User saves phone number in profile with SMS consent checked
- `recordSmsOptIn()` Cloud Function called (via fetch from client)

**What's Recorded:**
- `smsOptIns` collection doc:
  - fullName, phone, consentedAt, disclosureText, disclosureVersion, source, pageUrl, ip, userAgent, recordedAt
  - All persisted for audit by TCR reviewers

**What's NOT Connected Yet:**
- Per-SMS tracking of which disclosure was shown
- Campaign IDs (for TCR registration)
- Branded short codes
- Integration with Twilio Campaign Services

**Live Pieces:**
- Consent text defined: `window.SMS_CONSENT_DISCLOSURE_TEXT` (2026-04-16 version)
- Opt-in records written to Firestore
- Opt-out handling complete (STOP/START)
- Phone number validation (E.164)

---

## 4. Known Rough Edges & TODOs

### In Code

1. **Musician Discovery Self-Filter (app-module.js:1866)**
   - Comment: `// TODO: Uncomment to hide yourself`
   - Currently shows user their own card in discovery feed
   - Easy fix: add `if (currentUser && doc.id === currentUser.uid) return;`

2. **Debugging Logs (app-module.js:9332+)**
   - Multiple `console.log('DEBUG:...')` left in `sendSmsInvites()` flow
   - Should be removed or converted to proper error tracking

3. **Phone Formatting (app-module.js:9936+)**
   - Comment in phone input formatter: `// Format as (XXX) XXX-XXXX`
   - Works but could be more robust for international numbers (currently US-only)

### Feature-Level

1. **Band Group Messages** (`bands/{bandId}/messages`)
   - Collection exists, Firestore rules allow create/read
   - UI minimal in band detail screen
   - No real-time updates wired in
   - Likely not fully usable yet

2. **Recurring Rehearsals**
   - Code exists (`createRecurringRehearsals()`)
   - Creates child instances with independent RSVP state
   - Monthly frequency hardcoded to 30 days (not accounting for actual month length)

3. **Notifications Collection**
   - Used for "all responded" and "rehearsals confirmed" emails
   - Transactional flow works (creates mail docs)
   - But no general notification system (no push, no in-app alerts)

4. **A2P 10DLC Campaign Registration**
   - Consent records written ✓
   - Actual Twilio TCR flow not integrated
   - No campaign ID stored in SMS records
   - No branded short code flow

5. **Link Preview in Posts**
   - Fetched via Cloud Function (works)
   - Shown in feed (works)
   - But no image proxy (links directly to external URLs)
   - Could break if sites block it

### Potentially Dead Code

- `app-legacy.js` (10K lines, not loaded)
- SMS modal (legacy) still has functions but unified modal is preferred
- Some old conversation/messaging scaffolding

---

## 5. Surprising Things (Features You Might've Forgotten)

1. **Mobile Redirect Sign-In Flow**
   - If on mobile browser (not Capacitor), Google auth uses `signInWithRedirect()` instead of popup
   - Pending actions (band join, RSVP, etc.) saved to localStorage before redirect
   - Restored on auth state change
   - See `window.pendingBandJoin`, `window.pendingLeaderAccept`, `window.pendingRsvpReload`, etc.

2. **Photo Carousel & Viewer**
   - Users can upload multiple profile photos
   - Primary photo chosen via radio selection
   - Photo viewer overlay: full-screen, swipe-able, keyboard nav
   - HEIC → JPEG conversion on upload
   - Resizing to ~2 MB before upload (client-side)

3. **Availability Calendar Modal**
   - Not just a "select times" tool; actually queries Google Calendars
   - Shows heatmap (all free → some conflicts → all busy)
   - Members' real-time availability taken into account
   - Modal is complex, multi-step

4. **Connection Requests with Messages**
   - When user clicks "Connect," can optionally add a personal message
   - Message shown in pending requests list
   - Helps musicians introduce themselves

5. **Open Graph Metadata**
   - Gigs shareable at `/e/{gigId}` with dynamic OG tags (band, venue, date, confirmed rehearsals count)
   - Bands shareable at `/b/{bandId}` with OG tags (band name, photo, bio)
   - Works for social preview in iMessage, Slack, etc.
   - 5-min cache (meant to be fast)

6. **Band Member Invites with Email**
   - When adding a member to a band, email sent to invite them
   - They can accept/decline
   - Different flow than joining via `/b/{bandId}` link

7. **Leader Promotion**
   - Band can be created without a leader
   - When invited member accepts, can be promoted to leader role via `acceptLeaderRole()`
   - Separate from band membership

8. **Unified Invite Modal**
   - Handles SMS + Email in one flow
   - Shows eligible counts ("X recipients via SMS, Y via email")
   - Personalization per channel (e.g., SMS gets opt-out language)
   - Preview before send

---

## 6. Deployment & Configuration

**Firebase Project ID:** `bandcal-89c81`  
**Hosting Domain:** `tempocal.app` (custom domain set up)  
**Region:** us-central1 (Cloud Functions)

**Environment:** Production (no emulator flags in shipped code; emulator only runs locally on localhost)

**Secrets Managed by Firebase Functions:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (for Calendar OAuth)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

**iOS App:**
- App ID: `app.tempocal.tempo`
- Built with Capacitor 8.3.0
- Plugins: FirebaseAuthentication, iOS native
- WebView: loads app from Firebase Hosting

---

## 7. Quick Reference: Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `public/app-module.js` | ~10K | All frontend logic (screens, forms, API calls, real-time listeners) |
| `public/index.html` | ~1500+ | DOM structure (screens, modals, forms) |
| `public/styles.css` | ? | All styling |
| `functions/index.js` | ~1200 | Cloud Functions (SMS, Calendar, OG tags, email triggers) |
| `firestore.rules` | 126 | Security rules for all collections |
| `firebase.json` | 64 | Hosting rewrites & function config |
| `capacitor.config.json` | 24 | iOS app metadata & Capacitor plugins |
| `public/sms-signup.html` | ? | SMS consent form (links to recordSmsOptIn) |

---

## 8. Next Steps / Recommendations

### If Resuming A2P 10DLC Work:

1. **Link SMS Sends to Campaign Records**
   - Create `campaigns` collection (one per SMS send)
   - Store campaign_id in smsMessages
   - Track disclosure text version per send

2. **Integrate Twilio Campaign Services**
   - Register campaign with Twilio TCR
   - Use branded short code (not shared Twilio number)
   - Store short code in smsMessages

3. **Audit Trail**
   - `smsOptIns` collection fully populated ✓
   - `smsMessages` has detailed log ✓
   - Add campaign registration status tracking

4. **Testing**
   - Spin up staging with test Twilio account
   - Verify recordSmsOptIn captures all fields correctly
   - Test opt-in/opt-out flow end-to-end
   - Verify IP/User-Agent capture on consent form

### If Resuming Feature Work:

1. **Band Group Messages** — wire up real-time listener & UI
2. **Recurring Rehearsals** — fix month day calculation
3. **Notifications** — add push notifications (Firebase Cloud Messaging ready but not used)
4. **Analytics** — track user actions (currently no GA or custom events)
5. **Musician Discovery** — add more filters (genre, skill level, etc.)

---

**Document Generated:** 2026-04-23  
**For:** Andrew Strader  
**Context:** Post-A2P 10DLC compliance work refresher
