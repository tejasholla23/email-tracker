# Multi-User Migration Progress Tracker

This document tracks the incremental progress of refactoring the Email Tracker application into a user-scoped multi-user dashboard.

---

## Migration Roadmap

### Phase 1: Database Schema & Migration
- [ ] Add `userId` (Account ObjectId reference) to the `Application` schema.
- [ ] Update Mongoose compound indexes to be user-scoped:
  - `{ userId: 1, isDeleted: 1, date: -1 }` (Dashboard cards query)
  - `{ userId: 1, isDeleted: 1, deadlineISO: 1 }` (Deadlines query)
  - `{ userId: 1, isDeleted: 1, status: 1, date: -1 }` (Sidebar filters)
  - `{ userId: 1, companyKey: 1, isDeleted: 1 }` (Duplicate check index)
  - `{ userId: 1, messageId: 1 }` (Gmail message ID unique sparse index)
- [ ] Write and run DB migration script (`migrate_to_user_scoped.js`) to assign existing applications to the primary account ID.
- [ ] Verify database integrity and index correctness.

### Phase 2: JWT Auth & Token Verification Middleware
- [ ] Install `jsonwebtoken` dependency.
- [ ] Implement `authCheck` middleware verifying JWT Bearer tokens.
- [ ] Update Google OAuth callback to generate and redirect with a signed JWT.

### Phase 3: Route Scoping
- [ ] Apply `authCheck` middleware to all endpoints.
- [ ] Enforce `{ userId: req.user.userId }` scoping on all Application controller queries.

### Phase 4: Scoped Sync Pipeline & State Cleanup
- [ ] Refactor `fetchAndProcessEmails` to accept user scope.
- [ ] Move global sync flags (`isProcessing`, `clearRequested`) to individual `Account` documents.
- [ ] Implement asynchronous background sync execution and frontend status polling (Option B).

### Phase 5: Frontend Multi-User Integration
- [ ] Implement login / landing screen for unauthenticated users.
- [ ] Store JWT token in `localStorage`.
- [ ] Attach `Authorization` headers to all API fetch calls.
- [ ] Update UI dropdowns, sync polling, and user logout logic.

### Phase 6: E2E Verification & Security Boundary Checks
- [ ] Run verification tests ensuring User A cannot read, modify, or delete User B's applications.
- [ ] Confirm Gmail synchronization works independently for parallel users.
