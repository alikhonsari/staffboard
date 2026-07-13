# Mark Day Closed Workflow

## Root cause

The closure feature was assembled through multiple source transforms. The header button and the modal/banner were injected by separate string replacements.

The header replacement could succeed while the modal insertion marker failed after other navigation or layout transforms changed whitespace or structure. That left a visible **Mark Day Closed** button whose click only updated React state; no modal was mounted, so the action appeared to do nothing.

The previous integration also had these weaknesses:

- Transform failures were silent.
- Closure requests did not include the browser's authoritative `stateRevision` and `updatedAt` base values.
- Stale-state responses were not handled as closure-specific conflicts.
- Error responses lost structured codes and request IDs.
- A malformed success response could close the modal without proving the persisted state was returned.
- Duplicate clicks relied only on asynchronous React state.

## Corrected browser flow

1. An Admin or Manager clicks **Mark Day Closed**.
2. StaffBoard opens the closure modal.
3. The admin chooses a reason and scope.
4. `Other` requires a custom reason.
5. The confirmation checkbox enables the submit button.
6. The client prevents duplicate submissions with an in-flight ref.
7. The request includes:
   - Board ID
   - Week start date
   - Operational day
   - Scope
   - Reason and note
   - Effective date
   - Request ID
   - `baseUpdatedAt`
   - `baseStateRevision`
8. The server reconciles the latest Spaces state.
9. The server rejects a stale browser with HTTP 409 before mutating closure data.
10. On success, the server persists the closure, increments revisions, writes audit/history data, and returns the authoritative state.
11. The browser applies the returned state, closes the modal, displays the closure banner, and disables closed-scope editing.

## Conflict behavior

When another admin changes the board first:

- The closure is not applied from stale state.
- The latest authoritative state is loaded.
- The modal remains open.
- The admin sees a conflict explanation and request ID.
- The admin reviews the details and submits again.

## Failure behavior

For validation, authentication, permission, storage, or server failures:

- The modal remains open.
- The submit button leaves its loading state.
- No local closure banner is shown.
- The readable server message is displayed.
- The request ID is shown when available.

## Transform safety

The production build now requires exactly one of each marker:

- `data-day-closure-control="true"`
- `data-day-closure-banner="true"`
- `data-day-closure-modal="true"`
- `data-day-closure-submit="true"`

A missing or duplicated closure integration fails the build instead of shipping a partially working interface.

## Supported scopes

- Entire Operational Day
- Day Shift Only
- Night Shift Only

Entire-day closure affects both shift boards for the selected operation. Shift-only closure remains isolated. Night Shift after midnight remains attached to the operational day on which the shift began.

## Data preservation

Closing a day preserves:

- Assignments
- Attendance history
- Area history
- Rack and production data
- Notes and comments
- Completed scheduled transitions
- Recovery versions
- Audit history
- Builder area-hours history
- Reports and exports

Pending scheduled transitions in the selected scope are canceled and audited. Reopening does not restore canceled schedules.

## Validation

Run:

```bash
npm run test:closures
npm run lint
npm test
npm run build
npm run check
```

## Manual verification

1. Log in as an Admin or Manager.
2. Open SPEED Day Shift for an unlocked test week.
3. Select Monday and click **Mark Day Closed**.
4. Confirm the modal appears.
5. Choose `Maintenance`, select `Day Shift Only`, check confirmation, and submit.
6. Confirm the modal closes only after success.
7. Confirm the banner appears without a manual refresh.
8. Confirm Monday editing and scheduling controls are disabled for Day Shift.
9. Open SPEED Night Shift and confirm it remains open.
10. Repeat with Entire Operational Day and confirm both shifts close.
11. Open a second admin session, change the board, and submit from the stale first session.
12. Confirm the first session loads the latest state, keeps the modal open, and asks for confirmation again.
13. Reopen the test closure and confirm canceled schedules are not restored.
14. Reload the browser and confirm closure status persists.

## Rollback

Revert the pull request merge or redeploy the previous successful commit. No data migration is introduced. Existing closure records and numeric revisions remain backward-compatible in Spaces.
