# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default Deny Catch-All**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Strict Separation of Participant vs Administrator**:
   - Public participants (`request.auth == null` or non-admin users) can **ONLY** read (`get`, `list`) documents in `/courses/{courseId}` where `resource.data.status == 'published'`.
   - Public participants can **NEVER** create, update, or delete courses, nor read draft/archived courses.
   - Public participants can **NEVER** read or list `/admins/{adminId}`, `/participants/{participantId}`, or `/participant_sessions/{sessionId}` (PII & other users' answers/statistics isolation).
3. **Bootstrapped & Verified Admin**:
   - An administrator is strictly verified via `isSignedIn() && request.auth.token.email_verified == true` and either matches the bootstrapped admin email (`gomezramosmanuel@gmail.com`) or exists in `/admins/$(request.auth.uid)`.
4. **Schema, Key & Size Enforcement**:
   - Every write (`create`, `update`) must pass `isValid[Entity](incoming())` and `isValidId(docId)`.
   - All string fields enforce strict `.size()` bounds matching `firebase-blueprint.json`.
   - Temporal fields (`createdAt`, `updatedAt`) enforce `request.time`, and immutable fields (`id`, `uid`, `createdAt`, `authorUid`) cannot be mutated on `update`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Course Creation**: Anonymous user attempts `create` on `/courses/course-1` -> `PERMISSION_DENIED`.
2. **Draft Course Scraping**: Public user attempts `get` or `list` on `/courses/draft-course` where `status == 'draft'` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Course**: Admin attempts `create` on `/courses/course-1` with an undeclared field `isSuperSecret: true` -> `PERMISSION_DENIED`.
4. **Unverified Admin Email Spoofing**: Authenticated user with `email == 'gomezramosmanuel@gmail.com'` but `email_verified == false` attempts `write` -> `PERMISSION_DENIED`.
5. **Participant PII Scraping**: Public user or non-admin signed-in user attempts `get` or `list` on `/participants/part-1` -> `PERMISSION_DENIED`.
6. **Session Results Scraping**: Public user attempts `list` on `/participant_sessions` to view other participants' scores -> `PERMISSION_DENIED`.
7. **Self-Assigned Admin Escalation**: Non-admin user attempts `create` on `/admins/attacker-uid` with `role: 'super_admin'` -> `PERMISSION_DENIED`.
8. **ID Poisoning Attack**: Admin attempts `create` on `/courses/invalid id with spaces!` -> `PERMISSION_DENIED`.
9. **Value Poisoning on Update**: Admin attempts `update` on `/courses/course-1` setting `passingScore` to `"high"` (string instead of number) -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: Admin attempts `update` on `/courses/course-1` mutating `createdAt` or `authorUid` -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: Admin attempts `create` on `/courses/course-1` with a forged past/future `createdAt` != `request.time` -> `PERMISSION_DENIED`.
12. **Orphaned Session Creation**: Admin attempts `create` on `/participant_sessions/sess-1` referencing a non-existent `participantId` or `courseId` -> `PERMISSION_DENIED`.
