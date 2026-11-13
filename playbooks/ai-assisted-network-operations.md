# Run network and security operations with an AI assistant and a human at the keyboard

## Problem
Think of a surgeon and a scrub nurse who knows every procedure by heart: the nurse prepares, checks and hands over the right instrument, and only the surgeon touches the patient. An AI assistant on a production network works the same way. It can write the commands, scripts and click paths faster than a person, and it must never be the one holding the session. Without rules, the usual failures show up quickly: commands from the wrong software release, "done" reported with no proof, context re-explained in every chat, and work that stops whenever one person is away.

## Where it fits
Any team that uses an AI assistant for changes, audits or troubleshooting on switches, policy servers, monitoring platforms or industrial networks. Vendor-neutral. Written for regulated and availability-first environments.

## What works
1. **Split the roles.** The assistant writes commands, scripts and click paths. A person runs them and returns the output as a log file, an export or a screenshot. The assistant has no session on any device or console.
2. **Keep one record.** One knowledge base holds the rules, the facts, a status board and a tracker. Every chat reads it first and writes back what changed in the same reply. A chat has no reliable end, so nothing is saved for later. Any assistant or colleague pointed at the record can continue the work.
3. **Source every volatile fact.** Addresses, VLANs, tags, versions, CLI syntax and GUI paths come from output in the conversation, from the record, or from the vendor document for the exact platform and release, with the source named. Anything else is marked `[VERIFY: how to check]`. Never from model memory.
4. **Climb a fixed ladder for missing facts.** Output already given, then the record, then local files, then vendor documentation, then one read-only command for the person to run. Do not ask before climbing.
5. **No completion claim without evidence.** "Done", "fixed" and "working" require output read in that reply. A colleague saying it worked, a plan, or a script that exists is not evidence. A job finished only if its final status line is in the log.
6. **Ship changes in one shape.** Scope, operational impact, verification command and expected value, rollback ready to paste, and how the device is reached if the change locks you out. One change at a time, canary first, stop at the first device that does not verify.
7. **Make answers executable.** Full device name and address every time. No placeholders. All unknowns collected in one read-only block instead of one question per turn.
8. **Write decisions with defaults.** Every open decision carries an owner and a default, so work continues when the owner is busy.
9. **Scripts are read-only unless asked.** A change script has a dry run, an explicit apply switch, a backup before, a verification after and a rollback file. Credentials come from the operating system's store or an ignored local file, never from the script, a log or the chat.
10. **Keep a fallback.** The record is plain text behind a standard protocol, mirrored to a folder. If one assistant is unavailable, another reads the same files. If none is, the runbooks are complete enough for a person.

## Why it works
The assistant is strongest at recall and drafting and weakest at knowing what is true on a live network right now. The split puts each side where it is reliable: the person supplies ground truth, the assistant supplies speed, and the record carries memory across sessions and people.

## Gotchas
- A helper that passes unit tests can still fail on first real use. Run a preflight on the real machine and a small real read-only run before the full run.
- Synthetic test data hides real export quirks. Test parsers on a real export.
- When a new script replaces an old one, compare their safety checks first. Safeguards get lost in rewrites.
- A shared workbook with formulas should not be rewritten by a generic file library. Patch it narrowly or use the spreadsheet application, then compare against a backup.
- Recon output can contain keys and credentials. Keep such lines out of capture blocks and scrub before anything is shared.

## Verify
Pick any statement the assistant made today and ask where it came from. If the answer is a path in the record, a line of output or a vendor page for the right release, the method is working.
