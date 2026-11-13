# Scripts A Person Runs And The Run Proves

How I deliver network automation when the script is written in one place (by me or by an AI assistant) and run by an engineer on the one machine that can reach the network.

## Problem

Think of a lab test. A number on its own is worth little. It is worth something when the sheet also shows the sample, the method and the control. A network script is the same: "it said PASS" means nothing unless the run shows what it read, from where, and why the number can be trusted.

The usual setup makes this harder. The author has no session on the devices. The engineer runs the script on a jump host, late, and brings the output back. Anything unclear at that moment costs a second run.

## Environment

Vendor neutral. Used with Python (Netmiko, requests) against switches, a campus controller and a RADIUS server, plus PowerShell where Windows offers no other interface. The script runs from an approved host; the author has no session there.

## What Worked

### Build

1. One file does the whole job: library, self-test, the step, the verification. No multi-file run orders.
2. A new file name for every build: `<WHAT>_<YYYY-MM-DD>_r<N>.py`. Never reuse a name. Line 1 is a build line and the script prints it when it starts.
3. A header that says: target machine, READ-ONLY or CHANGE, the exact run line, where the password comes from.
4. `--selftest` runs offline and touches no device. Its fixtures are real device replies with names and addresses removed, including the reply that broke the previous build. The test fails first, then passes.
5. Read-only by default: read-only commands and GET calls. No config mode, no session-changing API calls.
6. Credentials, first hit wins: environment variable, the operating system credential store, then one prompt that says which login it wants. Never in a file, a script, a log or the record. A typed password goes to the credential store only after the device accepts it. A stored password that fails is deleted and asked for once. An unattended run never prompts: it exits with code 2 and one line saying how to fix it. The log names the source of the credential, never the value.
7. Every wait prints progress at least every 5 seconds: what, n of N, elapsed, left. Every remote call has its own timeout. No step waits for Enter.

### Run

One command, given with the file name and nothing else:

```
cd C:\work\scripts; python .\<file>.py --selftest; if($LASTEXITCODE -eq 0){python .\<file>.py}
```

### Evidence

Every run writes one numbered folder, never loose files:

```
<what>-<YYYYMMDD>-run<N>\
  ANSWER.md      the finding, in plain words, with the numbers
  results.csv    the rows behind it
  run.log        every step, with the credential source
  raw\           every device and API reply, exactly as received
```

Every run prints its proofs as PASS or CHECK:

| Proof | What It Shows |
|---|---|
| Reference value | A value already on record reproduces |
| Two sources | Two sources, as independent as the platform allows, agree within a stated ratio |
| Physics bound | No rate above link speed; hosts do not sum above their uplink |
| Identity agreement | The port seen by the switch, the controller and the RADIUS server is the same port |

The last line is `VERIFY: ... proofs X/Y PASS, folder <path>`. Exit code 0 only when every proof passes.

### Read Back

1. The engineer brings the run folder back. The author reads `ANSWER.md`, the CSV and the log, and opens `raw\` when a value looks odd.
2. A job is finished only if its final status line exists in the log. A log tail is not a result.
3. A parser bug is fixed and replayed offline against `raw\`. Nobody is asked to rerun the network for it.

## Why

The run folder turns one person's run into something a second person can check without touching the network. The proofs catch the two failures that hurt most: a tool that reports a number it misread, and a number that is right for the wrong device. New names per build remove the question "which version did I run".

## Gotchas

- A reused file name once left an old build running while the new one was never started. New name, every build.
- Some controller APIs return the latest sample and the hourly aggregate under similar field names. Report the aggregate.
- Zero hours of data means "no data", not "idle".
- A spreadsheet library is often missing on a jump host. Write CSV and Markdown there; build the workbook afterwards from the run folder.
- A silent window makes the operator close it. Print progress.
- Keep a run short enough to finish inside one remote session.

## Verify

Give the run folder to someone who was not there. They should be able to state the result, name the proof behind each number and find the raw reply it came from, without asking a question.
