# Field Playbooks

How the work gets done on my engagements, written down so a colleague or an AI assistant can follow it cold. Each one is a method I use in production work, with the customer removed.

| Playbook | Use It When | What You Get |
|---|---|---|
| [Scripts A Person Runs And The Run Proves](operator-run-scripts.md) | The author of a script is not the one who runs it | A build and delivery standard, a run folder layout, and four checks that catch a misread number |
| [Production Change By Script](gated-production-change.md) | A change must go to a production device | Gates, a plan the script cannot exceed, backup, verify, rollback, and a rerun that shows nothing is left to apply |
| [One Record](one-record-operations.md) | Work has to survive a change of engineer, assistant or tool | One source of truth, a working loop, source order, decisions with defaults, and a handoff shape |

## Rules They Share

**Checks first.** Then fixes. Messages and documents come after.

**Evidence over opinion.** No "done" without the line that proves it.

**Read-only by default.** A change is a deliberate mode with its own gates.

**No credentials in files, repos or records.** The record says where a login lives, never what it is.

**No real networks here.** No customer names, device names or addresses.
