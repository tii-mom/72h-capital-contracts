# CLAUDE.md - 72H Engineering Discipline

These rules apply to AI coding work in this repository. They are adapted from the Karpathy-style CLAUDE.md practice and 72H launch requirements.

## 1. Think Before Coding

- Do not assume product intent silently.
- Before changing code, identify the smallest safe fix and the verification gate.
- If a change could affect production, payments, wallets, claims, contracts, or user funds, stop and ask for explicit approval.
- If requirements conflict, surface the conflict before implementation.

## 2. Simplicity First

- Implement the minimum code needed to solve the requested problem.
- Do not add speculative features, abstractions, hidden modes, or broad rewrites.
- Prefer clear product behavior over clever engineering.
- If the solution is becoming large, pause and simplify.

## 3. Surgical Changes

- Touch only files directly required by the task.
- Do not refactor unrelated code.
- Match existing style.
- Clean only issues introduced by your own change.
- Every changed line must trace back to the task.

## 4. Goal-Driven Execution

- Define success as a verifiable result, not “looks done”.
- Add or update tests when behavior changes.
- Run the smallest meaningful gate before reporting completion.
- Report only: changed area, verification, remaining risk, and whether it is ready.

## 72H Safety Boundaries

- Never enable real purchase, payment, wallet signature, claim, financial write, or contract activation unless explicitly approved for that exact action.
- Preview/staging success is not production approval.
- UI state, API result, and stored/backend data must match before a feature is considered fixed.
- For public user flows, verify mobile/user-facing behavior, not only code tests.
