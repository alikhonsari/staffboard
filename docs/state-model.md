# StaffBoard State Model

## Top-level authoritative fields

The shared state contains active board context plus persisted board stores. Important server-managed fields include:

- `currentBoardId`
- `boardShift`
- `weekStartDate`
- `selectedDay`
- `weeklyData`
- `weeklyBoards`
- `boardStore`
- `builderPool`
- `scheduledTransitions`
- `scheduleRevision`
- `dayClosures`
- `closureRevision`
- `recoveryRevision`
- `stateRevision`
- `updatedAt`

Unknown historical fields are preserved by compatible validation.

## Isolation rules

- SPEED, FA Lab, and Bodega boards are isolated by board ID.
- Day and Night Shift are isolated board contexts.
- Night activity after midnight belongs to the operational day on which Night Shift began.
- Weekly data is isolated by week start date.
- Recovery and closure state cannot be removed by stale browser saves.

## Revision rules

- Missing `stateRevision` is treated as zero for backward compatibility.
- The next authoritative save increments the highest persisted/runtime revision by one.
- New clients use `baseStateRevision` for optimistic concurrency.
- Older clients may continue to use `baseUpdatedAt`.

## Validation policy

Compatible mode validates required structure and known enums while preserving unknown fields. It rejects malformed top-level state, unknown active board IDs, invalid selected weekdays, missing weekly data, and invalid collection types.
