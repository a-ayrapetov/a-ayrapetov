# Production change by script: gates, backup, verify, rollback

How I push a change to a production network device so that the script cannot send a line nobody approved, and the way back is ready before the first line goes in.

This builds on the change gates in [The script contract](script-contract.md) and covers what goes around them: state gates, a plan the script cannot exceed, the window, the rerun and the guard for devices that get no automatic changes.

## Problem

A surgical team works from a checklist. They confirm the patient and the site before the first cut, counts the instruments before and after, and nobody leaves until the count matches. A network change deserves the same: confirm the device and its state, send only what was agreed, count what changed, and keep the undo within reach.

Most outages from changes are not bad commands. They are the right command on the wrong state, a "success" message with no service behind it, or a rollback that was written after things broke.

## Environment

Vendor neutral in method. Used on campus border and access switches and on a wireless controller managed by a campus controller. The engineer runs the script from a jump host; the author is not on the device.

## What worked

### Before the window

1. Checks first, then fixes, then messages. A read-only check script runs before any change is designed.
2. The plan document lists the exact lines, the verification, the rollback and what else depends on the thing being changed (for example, which routes a new subnet needs upstream).
3. The script holds gates that must all PASS before anything is sent: the device is the expected one, the sessions that must stay up are up, the current config matches what the plan assumed.
4. The script prints a PLAN and can emit only the lines the plan names. A PLAN line that is not in the plan document stops the work.
5. Dry run is the default mode and ends with `DRY RUN: nothing was changed.` The author reads the dry-run folder and compares PLAN to plan, line for line.
6. Pre-built standby config is audited against its live twin before it is switched on. "Configured" is not "ready".

### In the window

1. A named evening, midweek. Dry run again the same day.
2. `--go` saves a backup first and confirms it exists. No confirmed backup, no push.
3. The engineer types an exact capital `YES` per section or device. Any other answer skips that section. The instructions state the exact answers to type.
4. The script verifies after each section. Saving the configuration is its own `YES`, offered only when everything passed.
5. The rollback is printed and written to the run folder before the push. Rolling back is one answer or one paste.

### After

1. Run the dry run once more. It must say there is nothing left to apply. That shows the configuration matches the plan and the script is safe to rerun. Step 2 shows the service works.
2. Verify service, not the tool's status: clients connected, sessions established, traffic moving on the path that was changed.
3. Record the same day: what was applied, the run folder, the verify line, who was told.

### Guarded devices

Some devices do not get automatic changes at all. For those, a guard script wraps the risky step:

1. Back up and snapshot the full model, not only the fields being changed.
2. Refuse to start unless the baseline is healthy.
3. Read state every few seconds while the controller task runs.
4. Restore the saved lines automatically only when the guard's own checks fail, and tell the engineer at once.
5. Keep watching after the task ends, then snapshot, diff and save.

### Unattended mode

Only diffs on a short allowlist, built from evidence and reviewed by a person, are accepted without a prompt. Everything else lands on a "needs a person" list.

### Fleet changes

Never one shot. One canary, verify, then batches. Core devices get their own window.

## Why

Gates turn "I think the device is in the state I expect" into a check. The PLAN restriction means the script has no way to send a line outside the plan. The second dry run answers the question every change review asks: is it done, and what happens if someone runs this again.

## Gotchas

- A controller can report a task as successful while the service it was meant to deliver is broken. Read the service, not the task status.
- On some controllers, compliance or remediation pushes the controller's intent in full. Fix the intent first; never repair the device by hand underneath it.
- Some controllers show an empty diff while they are still recomputing it. Poll until it finishes.
- Never change remote access authentication on the console and the remote lines in the same step. Prove a fresh login from a second session before closing the first.
- An idle device and a missing device look alike. Check a second source before calling it gone.

## Verify

Three lines must exist in the run folder before the change is called done: the gate results, the verify line after the push, and the second dry run reporting nothing to apply.
