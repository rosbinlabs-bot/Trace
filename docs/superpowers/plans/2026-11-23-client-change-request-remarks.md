# Client Change Requests in Remarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Client Owner's change request / remark in full under Remarks on the milestone and sub task in Phase Management.

**Architecture:** Portal.tsx appends the client's text to the item's existing `remarks` array (tagged with `kind`); Phases.tsx renders tagged rows distinctly in both remark lists.

**Tech Stack:** React + TypeScript, Tailwind; no unit-test runner for screens, verified with `npx tsc -b`.

**Spec:** docs/superpowers/specs/2026-11-23-client-change-request-remarks-design.md

## Global Constraints
- Remark shape stays `{ id: S.uid('RMK'), text, by, at }`, plus optional `kind: 'change-request' | 'client'`.
- Existing remarks (no `kind`) render exactly as today. Notifications, alerts, approval logic unchanged.
- Deploy: commit, `git push origin main` (Vercel auto-deploys); move `.git/*.lock` to `_to_delete/` afterwards.

## Review Focus
- Request Changes with empty draft: no remark added (nothing to show), notification unchanged.
- Very long / multi-line text: wraps in full, preserves line breaks (`whitespace-pre-wrap`).
- Item with no prior `remarks` (undefined): append works.
- Both Milestone and Sub Task levels receive the remark.

---

### Task 1: Save client text into item remarks (Portal.tsx)

**Files:** Modify `src/screens/Portal.tsx` (`requestChanges` ~L205, `postRemark` ~L221)

**Interfaces:** Produces remark objects `{id, text, by: myClientName, at: ISO string, kind}` in `ms.remarks` / `st.remarks`.

- [ ] **Step 1:** In `requestChanges`, when `text` is non-empty, fold the remark append into the existing `S.mutateMs` / `S.mutateSt` updater (`kind:'change-request'`), computing `text` and `at` before the `setTree` call.
- [ ] **Step 2:** In `postRemark`, add the same append (`kind:'client'`) inside the existing `remarkAlert` updaters.
- [ ] **Step 3:** Run `npx tsc -b`; expect no errors.

### Task 2: Render tagged remarks (Phases.tsx)

**Files:** Modify `src/screens/Phases.tsx` (milestone list ~L679, sub task modal ~L914)

- [ ] **Step 1:** In both `.map` blocks, `kind==='change-request'` → amber box (`bg-amber-50 border border-amber-200`) with a "Client requested changes" label; `kind==='client'` → small "Client" tag; text uses `whitespace-pre-wrap break-words`. Untagged rows unchanged.
- [ ] **Step 2:** Run `npx tsc -b`; expect no errors.
- [ ] **Step 3:** Commit and `git push origin main`; expect `<old>..<new> main -> main`.

---
Self-review: spec coverage ✔ (both screens, both levels, no backfill); signatures consistent; Review Focus pinned in the steps above.
