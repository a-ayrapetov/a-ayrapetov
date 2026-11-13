# Cut NDR alarm noise without going blind: a six-step loop

## Problem
A noisy detection platform is a smoke alarm that goes off every time someone makes toast: after a week nobody looks up, and the one real fire gets the same shrug. Flow-analytics and NDR platforms in large networks often show thousands of alarms a day, most from a handful of rules and a handful of unclassified hosts. Suppressing rules wholesale makes the dashboard quiet and the network invisible.

## Where it fits
Any flow-analytics or NDR platform with host groups and custom rules. Vendor-neutral. Works for a team of two or three taking a few items a day.

## What works
Measure with **hosts in alarm per day**, not raw alarm counts. Raw counts can inflate badly and reward the wrong fixes.

1. **Size it.** Pick the rule with the most alarming hosts. Record seven daily values as the Before number. Skip anything small.
2. **Find who.** List sources and targets for that rule. One target repeated across many sources is usually one cause.
3. **Prove what it is.** Host report, flow search, reverse DNS, inventory. An unclassified host is a finding in itself.
4. **Decide.** It is noise only if you can name the owner and the reason. Internet answers, traffic crossing zones, scanning by unknown hosts and anything with no owner stay alarming and get reported.
5. **Change one thing.** Read the rule's existing exclusions first. Screenshot the rule before editing: that picture is your rollback. Prefer classifying the host into an existing functional group that the rule already excludes. If the rule does not exclude that group, do both: classify the host and add the exclusion. Narrowest scope, one rule per change.
6. **Log and prove.** One row per change in a shared tracker with before, after, where it was applied and how to undo it.

## Proof that a change worked
- After the save time, the device still sends the traffic (flow search), and no alarm for that rule starts after the save time. Traffic continues plus no new alarm is the proof.
- The number of exclusions on the rule is exactly one more than before. Fewer means something was dropped during the edit.
- Compare the next day's value with Before. Fixes for overnight scanners are proven the next morning.
- Run the same check the same day and the next morning from an export or API script, so the numbers do not depend on who looked at the dashboard.

## Why it works
Most of the noise comes from hosts that were never classified. Putting hosts where they belong fixes many rules at once and makes the remaining alarms mean something.

## Gotchas
- Adding a host to a group does nothing if the rule does not exclude that group. Read the exclusions first.
- In some products the rule editor can drop existing exclusions while you edit. Count before and after.
- Old alarms can stay marked active after a change. Judge by when an alarm first became active.
- Group names go stale. Check what is actually in a group before tuning it.
- Scanners left unclassified make quiet devices look like they are violating segmentation by answering scans.
- Safety-related systems never go into exception groups. Report them to their owner.
- Temporary exception groups need a written membership rule, an owner and an exit: when the owner fixes the device, remove the exclusion and delete the group.

## Verify
One week after a change: hosts in alarm per day for that rule is lower than Before, the tracker row has its proof, and nothing that was excluded has an unknown owner.
