# Multi-User Migration Checklist & Single-User Assumptions

This document lists the remaining single-user architecture assumptions in the codebase that must be resolved in subsequent phases to make the multi-user architecture fully functional.

---

## 1. Global Sync & Concurrency Control (Backend)
- **Assumption**: The sync process uses a single global locking boolean `isProcessing`.
- **Location**: [server.js](file:///c:/Users/Admin/email-tracker/backend/server.js)
- **Impact**: If User A triggers a sync, it blocks User B from running a sync until User A's sync finishes.
- **Fix in Phase 2/3**: Replace `isProcessing` with an in-memory map or a database-level locking system keyed by the specific user/account ID (e.g. locking per user-email/account).

## 2. Global Sync Abort Flag (Backend)
- **Assumption**: The sync process uses a single global abort flag `clearRequested`.
- **Location**: [server.js](file:///c:/Users/Admin/email-tracker/backend/server.js)
- **Impact**: When any user requests to clear all applications, the global flag is set to `true`, which aborts the email sync loop for *any and all* users currently running a sync.
- **Fix in Phase 2/3**: Scope the abort flag/state to specific user account IDs.

## 3. Global Database Wipes (Backend Routes)
- **Assumption**: Deleting data/logout clears the entire collections globally.
- **Locations**:
  - GET `/logout` in [server.js](file:///c:/Users/Admin/email-tracker/backend/server.js) calls `await Account.deleteMany({});` which disconnects all Gmail accounts in the system.
  - DELETE `/clear-all-applications` in [server.js](file:///c:/Users/Admin/email-tracker/backend/server.js) calls `await Application.deleteMany({});` which deletes all applications across all users.
  - DELETE `/clear` in [applicationRoutes.js](file:///c:/Users/Admin/email-tracker/backend/routes/applicationRoutes.js) calls `await Application.deleteMany({});`.
- **Impact**: Multi-user operations will wipe other users' data.
- **Fix in Phase 2/3**: Scope all write and delete operations using filters (e.g., `{ email: req.headers["x-user-email"] }`).

## 4. Global Company Deduplication and Merging (Backend Helper)
- **Assumption**: When a new message is parsed, the backend checks for duplicates globally.
- **Location**: [server.js:L584-588](file:///c:/Users/Admin/email-tracker/backend/server.js#L584-L588) inside `processMessage`:
  ```javascript
  contentExists = await Application.findOne({
    companyKey,
    isDeleted: { $ne: true }
  });
  ```
- **Impact**: If User A has an application for "Google", and User B syncs an email for "Google", User B's new event will be merged into User A's application document rather than creating a new application document for User B.
- **Fix in Phase 2/3**: Add the user's email or account reference to the search query:
  ```javascript
  contentExists = await Application.findOne({
    companyKey,
    email: acc.email,
    isDeleted: { $ne: true }
  });
  ```

## 5. Frontend Session & Identity Logic
- **Assumption**: The frontend assumes there is a single active login email stored directly in `localStorage` under the key `"userEmail"`.
- **Location**: [page.js](file:///c:/Users/Admin/email-tracker/frontend/app/page.js)
- **Impact**: Standard authentication cookies or session objects are not used. A user can trivially spoof their identity on the client-side by setting another email in `localStorage` or sending a modified `x-user-email` header.
- **Fix in Phase 2/3**: Implement a secure authentication service (such as JSON Web Tokens or cookie-based sessions) and verify identity signatures on the backend.
