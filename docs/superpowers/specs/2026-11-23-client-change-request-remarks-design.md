# Client change requests shown in Remarks (design)

**Intent / why:** When a Client Owner requests changes (or posts a remark) in the Client Portal, the team can only read a truncated notification. They need the full text under Remarks on the milestone / sub task in Phase Management.

**Finding:** Portal.tsx `requestChanges` and `postRemark` only notify (and `postRemark` sets `remarkAlert`); neither writes to `item.remarks`, which Phases.tsx renders.

**Approaches considered:** (1) append to existing `remarks` array with a `kind` tag - chosen, reuses both modals; (2) separate `clientRequests` field + new UI block - more code, two places to look; (3) widen the notification - doesn't put it under Remarks.

**Design:**
- `requestChanges` and `postRemark` append `{id, text, by: client name, at, kind:'change-request'|'client'}` to the milestone/sub task `remarks` (change request only when text is non-empty).
- Phases.tsx remark rows (milestone panel + sub task modal): `kind==='change-request'` renders amber with a "Client requested changes" label; `kind==='client'` shows a small "Client" tag. Full text, wrapped.

**Non-goals:** backfilling past requests (full text not stored); changing approval/notification behaviour.
**Left to builder:** exact styling classes, matching existing Tailwind patterns.
