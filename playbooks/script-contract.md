# The script contract

Writing a script for a network you cannot touch is like handing someone a recipe for a kitchen you will never enter. The recipe has to check itself, be labelled so nobody cooks last week's version, and leave a receipt you can read afterwards.

That is the usual position for a consultant. One host inside the customer network reaches the controller, the policy servers and the switches. The customer's admin, or you on a remote session with no tools of your own, runs what you wrote. Most of what follows exists because its absence caused a real failure.

## The contract

**One file does the whole job.** Library, tests, the step and its verification live in one real `.py` or `.ps1`. No paste blocks, no run orders across five files.

**A new name for every build.** `<WHAT>_<date>_r<N>`, with the build printed on the first line of output. A rebuilt script that kept its old name once left the old version running while newer builds were never run.

**Read only unless the name says otherwise.** Show commands and GET calls. No configuration mode, no re-authentication calls, nothing that changes state.

**It tests itself first.** `--selftest` runs offline against fixtures pasted from real device replies, including the reply that broke the last version. The run line chains them: selftest, and only on exit 0 the real run.

**It never goes quiet.** Every wait prints what it is waiting on, how far along, and how long is left, at least every five seconds. Every remote call has its own short timeout. Long jobs poll a status endpoint instead of sleeping for a fixed time.

**Credentials stay out of files.** Lookup order: environment variable for one shell, sealed service credential, operating system credential store, then one prompt that is announced by name. A typed password is saved only after the login worked. A stored password that is refused is removed and asked for once, never in a loop. A scheduled run never prompts; it exits with a line that names the missing entry.

**Every run leaves a receipt.** A numbered run folder holds the log, a results file, a one page answer and a `raw` folder with every device and API reply exactly as received. When a parser turns out to be wrong, the fix is replayed against `raw` without touching the network again.

**A number without a proof is a draft.** The last lines of every run print proofs as PASS or CHECK, then one `VERIFY` line. Exit code 0 only when every proof passes.

## Changes

A change script adds four gates.

1. Dry run is the default.
2. Applying needs the exact word `YES`, per device or section. The delivery note states the exact answers to type.
3. The running configuration is saved into the run folder first. No backup, no push.
4. The script verifies with the device's own output afterwards and prints the rollback.

Unattended mode exists only for differences on an allow list built from evidence, and it prints a list of what still needs a person.

## On a controller managed network

The order of preference is fixed: controller intent through its API, then a controller template attached and deployed through provisioning, then an existing automation extended, and device CLI last. A CLI change on a managed device must be matched in the controller's intent, or the next reprovision can overwrite it.

When the controller and the device disagree, fix the intent. Compliance remediation can push intent over an exception someone added on purpose. A remediation diff read while the controller is still recomputing can look empty and still push.

## Why it holds up

Each rule removes one way of being wrong without knowing it: the wrong version ran, the parser misread, the wait was a hang, the password was a typo, the change had no way back. The person running the script needs no context beyond one command, and the person reading the result needs nothing beyond the run folder.

The gates, the credential handling and the proof helpers are in [templates/netops_gates_and_proofs.py](templates/netops_gates_and_proofs.py), with 35 tests.
