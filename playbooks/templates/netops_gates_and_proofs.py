# BUILD netops_gates_and_proofs 2026-11-12 r1
"""Gates, proofs and helpers for a network operations script that someone else runs on a host you cannot reach.

READ-ONLY as shipped: show commands and GET calls only. A change script built from this file calls
save_backup(), then require_backup(), then confirm_yes() before any push: no backup on disk and no
exact word YES typed by the person running it means no change.

Run:   python netops_gates_and_proofs.py --selftest     offline checks, no device touched
       python netops_gates_and_proofs.py                normal run (read-only)
       python netops_gates_and_proofs.py --set-cred     store or replace the password, then exit
       python netops_gates_and_proofs.py --unattended   scheduled run: never prompts

Password lookup order (the value is never written to a file, a log or the console):
  1. environment variable NETOPS_PW_<SERVICE>, set in that shell only
  2. systemd credential file $CREDENTIALS_DIRECTORY/<service>
  3. the operating system credential store, through the keyring package
  4. one prompt, announced by name first
A typed password is stored only after the login worked. A stored password that is refused is
removed and asked for once. Standard library only; keyring is optional.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import getpass
import logging
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional

BUILD = "netops_gates_and_proofs 2026-11-12 r1"
TOOL = "netops"                                    # EDIT: short tool name, used for the run folder
OUT_ROOT = Path.home() / "netops_outputs"            # EDIT: where run folders are created
CRED = ("lab_ctrl", "svc_reader")                    # EDIT: (service, user) names in the credential store
ENV_PREFIX = "NETOPS_PW_"
IS_WINDOWS = os.name == "nt"

log = logging.getLogger("netops")


# ------------------------------------------------------------------ credentials
class Cred:
    """get() returns the password or None. Call ok() after a good login, bad() after a refused one."""

    def __init__(self, service: str, user: str, label: str, unattended: bool = False):
        self.service, self.user, self.label, self.unattended = service, user, label, unattended
        self.source: Optional[str] = None
        self.pw: Optional[str] = None

    def _keyring(self):
        try:
            import keyring
            return keyring
        except ImportError:
            return None

    def _ask(self) -> Optional[str]:
        # No terminal, no prompt, on every platform. A scheduled run has no person to answer,
        # pythonw sets stdin to None, and a hidden login box would hang the task.
        if self.unattended or sys.stdin is None or not sys.stdin.isatty():
            return None
        print(f"PASSWORD PROMPT: {self.label} ({self.service} / {self.user})", flush=True)
        if IS_WINDOWS:                               # a login box, so typing is never invisible
            # Names travel in the environment, never inside the command text.
            ps = ("$c=Get-Credential -UserName $env:NETOPS_PROMPT_USER -Message $env:NETOPS_PROMPT_LABEL;"
                  "if($c){$c.GetNetworkCredential().Password}")
            try:
                r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True,
                                   timeout=900, env={**os.environ, "NETOPS_PROMPT_USER": self.user,
                                                     "NETOPS_PROMPT_LABEL": self.label})
                if r.stdout.rstrip("\r\n"):
                    return r.stdout.rstrip("\r\n")
            except (OSError, subprocess.TimeoutExpired) as e:
                log.warning("login box did not open (%s); using the console prompt", type(e).__name__)
        try:
            return getpass.getpass(f"{self.label} password (typing is invisible): ") or None
        except (EOFError, KeyboardInterrupt):
            return None

    def get(self, force_prompt: bool = False) -> Optional[str]:
        env = os.environ.get(ENV_PREFIX + self.service.upper())
        cdir = os.environ.get("CREDENTIALS_DIRECTORY")
        if not force_prompt and env:
            self.source, self.pw = "env", env
        elif not force_prompt and cdir and (Path(cdir) / self.service).exists():
            self.source = "systemd"
            self.pw = (Path(cdir) / self.service).read_text(encoding="utf-8").rstrip("\r\n")
        elif not force_prompt and self._stored():
            self.source, self.pw = "keyring", self._stored()
        else:                                        # the unattended guard sits here, not only inside _ask()
            self.source, self.pw = "prompt", (None if self.unattended else self._ask())
        # The source is logged. The value never is.
        log.info("credential %s/%s from %s", self.service, self.user, self.source if self.pw else "NOWHERE")
        return self.pw

    def _stored(self) -> Optional[str]:
        """Ask the credential store only when env and systemd had nothing. A host with no usable
        store (headless, locked) is treated as an empty store, not as a crash."""
        kr = self._keyring()
        if not kr:
            return None
        try:
            return kr.get_password(self.service, self.user)
        except Exception as e:                       # keyring backends raise their own error types
            log.warning("credential store not usable (%s)", type(e).__name__)
            return None

    def ok(self) -> bool:
        kr = self._keyring()
        if self.source == "prompt" and self.pw and kr:
            kr.set_password(self.service, self.user, self.pw)
            log.info("saved %s/%s to the credential store", self.service, self.user)
            return True
        return False

    def bad(self) -> Optional[str]:
        kr = self._keyring()
        if self.source == "keyring" and kr:
            kr.delete_password(self.service, self.user)
            log.warning("stored password for %s/%s was refused and removed", self.service, self.user)
        if self.source == "prompt" or self.unattended:
            return None                              # asked once already: never loop
        return self.get(force_prompt=True)


# ------------------------------------------------------------------ run folder and evidence
def run_folder(root: Path, tool: str) -> Path:
    """<root>/<tool>_<yyyymmdd>_runN with a raw/ subfolder. Numbered, so a rerun never overwrites."""
    day = dt.date.today().strftime("%Y%m%d")
    n = 1
    while (Path(root) / f"{tool}_{day}_run{n}").exists():
        n += 1
    d = Path(root) / f"{tool}_{day}_run{n}"
    (d / "raw").mkdir(parents=True)
    return d


def setup_logging(d: Path) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S",
                        handlers=[logging.StreamHandler(sys.stdout),
                                  logging.FileHandler(d / "run.log", encoding="utf-8")], force=True)


def save_raw(d: Path, name: str, text: str) -> Path:
    """Keep every device and API reply exactly as received. A parser bug is then fixed and replayed
    offline, without touching the device again."""
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "reply"
    p, n = d / "raw" / f"{safe}.txt", 1
    while p.exists():                                # two names can clean up to one: keep both replies
        n += 1
        p = d / "raw" / f"{safe}_{n}.txt"
    p.write_bytes(text.encode("utf-8"))
    return p


def _backup_path(d: Path, device: str) -> Path:
    return d / "raw" / ("backup__" + re.sub(r"[^A-Za-z0-9._-]+", "_", device) + ".cfg")


def save_backup(d: Path, device: str, config_text: str) -> Path:
    """Save the running configuration of one device before a change. One exact file per device."""
    p = _backup_path(d, device)
    p.write_bytes(config_text.encode("utf-8"))
    return p


def require_backup(d: Path, device: str) -> Path:
    """No backup, no push. Only this device's own non-empty backup file opens the gate."""
    p = _backup_path(d, device)
    if p.exists() and p.stat().st_size > 0:
        return p
    raise RuntimeError(f"no backup, no push: no saved configuration for {device} at {p}")


# ------------------------------------------------------------------ proofs
@dataclass
class Proof:
    name: str
    status: str                                      # PASS or CHECK
    detail: str


def proof_two_sources(name: str, a: Optional[float], b: Optional[float], lo: float = 0.8, hi: float = 1.25) -> Proof:
    """Two independent sources measured the same quantity. PASS when their ratio is inside lo..hi."""
    if not a or not b:
        return Proof(name, "CHECK", f"one source is missing or zero (a={a}, b={b})")
    ratio = a / b
    return Proof(name, "PASS" if lo <= ratio <= hi else "CHECK", f"a={a:g} b={b:g} ratio={ratio:.2f} (band {lo}..{hi})")


def proof_bound(name: str, parts: Iterable[float], whole: float, tolerance: float = 0.0) -> Proof:
    """Physics bound: the parts cannot add up to more than the whole (hosts versus their uplink)."""
    total = sum(parts)
    ok = total <= whole * (1 + tolerance)
    return Proof(name, "PASS" if ok else "CHECK", f"sum of parts {total:g} vs whole {whole:g}")


def proof_identity(name: str, values: list, same: Optional[Callable] = None) -> Proof:
    """Every source names the same thing (controller port == policy server port == switch port)."""
    same = same or (lambda x, y: x == y)
    if len(values) < 2:
        return Proof(name, "CHECK", "only one source; one source proves nothing")
    ok = all(same(values[0], v) for v in values[1:])
    return Proof(name, "PASS" if ok else "CHECK", " | ".join(str(v) for v in values))


# ------------------------------------------------------------------ parsing helpers that have bitten before
_LONG = {"fastethernet": "fa", "gigabitethernet": "gi", "twogigabitethernet": "tw", "tengigabitethernet": "te",
         "twentyfivegige": "twe", "twentyfivegigabitethernet": "twe", "fortygigabitethernet": "fo",
         "hundredgige": "hu", "hundredgigabitethernet": "hu", "appgigabitethernet": "ap",
         "port-channel": "po", "vlan": "vl", "loopback": "lo"}   # EDIT: add names your platform prints


def _if_key(name: str):
    m = re.match(r"^\s*([A-Za-z-]+)\s*([\d/.:]+)\s*$", name)
    if not m:
        return (name.strip().lower(), "")
    prefix = m.group(1).lower()
    return (_LONG.get(prefix, prefix), m.group(2))


def same_interface(a: str, b: str) -> bool:
    """TenGigabitEthernet6/0/40 and Te6/0/40 are one port. An API wants the long name, a CLI prints
    the short one, and a plain string compare loses every match. Tw (2.5G) and Twe (25G) differ."""
    return _if_key(a) == _if_key(b)


def ci_get(row: dict, key: str, default=None):
    """Controllers have returned a field as rxRate in the spec and RXRATE on the box. Match without case."""
    want = key.lower()
    for k, v in row.items():
        if str(k).lower() == want:
            return v
    return default


def mbps_from_bytes(byte_count: float, seconds: float) -> float:
    """Average rate over a bucket. Byte counters are unit-safe; a rate field's unit must be read from the spec."""
    if seconds <= 0:
        raise ValueError("bucket length must be positive")
    return byte_count * 8 / seconds / 1e6


# ------------------------------------------------------------------ waits and gates
def poll_until(cond: Callable, what: str, timeout: float, interval: float = 5.0,
               sleep: Callable = time.sleep, out: Callable = print, now: Callable = time.monotonic):
    """Wait on a condition, never on a fixed sleep, and never silently: one progress line per check."""
    start = now()
    while True:
        value = cond()
        if value:
            return value
        elapsed = now() - start
        if elapsed >= timeout:
            raise TimeoutError(f"{what}: not done after {timeout:g} s")
        out(f"waiting on {what}: {elapsed:.0f} s of {timeout:g} s")
        sleep(min(interval, 5.0))


def confirm_yes(what: str, answer: Callable = input) -> bool:
    """A change applies only on the exact word YES. Anything else is a dry run."""
    return answer(f"{what}\nType YES to apply (anything else leaves it as a dry run): ") == "YES"


# ------------------------------------------------------------------ end of run
def finish(d: Path, rows: list, proofs: list) -> int:
    if rows:
        with open(d / "results.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)
    lines = [f"# {TOOL}", "", f"Build: {BUILD}", "", "| Proof | Result | Detail |", "|---|---|---|"]
    lines += [f"| {p.name} | {p.status} | {p.detail} |" for p in proofs]
    (d / "ANSWER.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    passed = sum(1 for p in proofs if p.status == "PASS")
    for p in proofs:
        print(f"{p.status}: {p.name}: {p.detail}")
    print(f"VERIFY: {len(rows)} rows, proofs {passed}/{len(proofs)} PASS, folder {d}")
    return 0 if proofs and passed == len(proofs) else 1


# ------------------------------------------------------------------ the job
def login(pw: str) -> bool:
    """EDIT: the real login (controller token request, SSH connect, API GET). Return True or False."""
    return bool(pw)


def collect(d: Path) -> tuple:
    """EDIT: the real read-only work. Save every reply with save_raw() and return (rows, proofs)."""
    save_raw(d, "example reply", "replace this with the reply as received\n")
    rows = [{"check": "login", "result": "PASS"}]
    proofs = [Proof("login", "PASS", "token accepted")]
    return rows, proofs


def selftest() -> int:
    import tempfile

    class FakeKR:
        def __init__(self):
            self.store = {}

        def get_password(self, s, u):
            return self.store.get((s, u))

        def set_password(self, s, u, p):
            self.store[(s, u)] = p

        def delete_password(self, s, u):
            self.store.pop((s, u), None)

    kr, ok = FakeKR(), []

    def mk(**kw):
        c = Cred("selftest", "reader", "selftest", **kw)
        c._keyring = lambda: kr
        return c

    c = mk(); c._ask = lambda: "typed"
    ok.append(c.get() == "typed" and not kr.store)                 # typed, not stored yet
    ok.append(c.ok() and kr.store.get(("selftest", "reader")) == "typed")
    c = mk(); c.get(); c._ask = lambda: "fresh"
    ok.append(c.bad() == "fresh" and not kr.store and c.bad() is None)
    ok.append(mk(unattended=True).get() is None)
    with tempfile.TemporaryDirectory() as tmp:
        a, b = run_folder(Path(tmp), "st"), run_folder(Path(tmp), "st")
        ok.append(a != b and (a / "raw").is_dir())
        save_backup(a, "sw10", "hostname sw10\n")       # another device's backup must not open the gate
        try:
            require_backup(a, "sw1"); ok.append(False)
        except RuntimeError:
            ok.append(True)
        ok.append(save_raw(a, "x | y", "1") != save_raw(a, "x / y", "2"))
    ok.append(proof_two_sources("r", 100, 103).status == "PASS" and proof_two_sources("r", 100, 160).status == "CHECK")
    ok.append(proof_bound("b", [700, 400], 1000).status == "CHECK")
    ok.append(same_interface("TenGigabitEthernet6/0/40", "Te6/0/40") and not same_interface("Tw1/0/1", "Twe1/0/1"))
    ok.append(ci_get({"RXRATE": 5}, "rxRate") == 5 and mbps_from_bytes(450_000_000, 3600) == 1.0)
    ok.append(confirm_yes("x", answer=lambda p: "YES") and not confirm_yes("x", answer=lambda p: "yes"))
    print(f"SELFTEST {sum(ok)}/{len(ok)} {'PASS' if all(ok) else 'FAIL'}")
    return 0 if all(ok) else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--selftest", action="store_true", help="offline checks, no device touched")
    ap.add_argument("--set-cred", action="store_true", help="store or replace the password, then exit")
    ap.add_argument("--unattended", action="store_true", help="scheduled run: never prompt")
    a = ap.parse_args()
    print(f"BUILD {BUILD}")
    if a.selftest:
        return selftest()
    d = run_folder(OUT_ROOT, TOOL)
    setup_logging(d)
    log.info("run folder %s", d)
    cred = Cred(*CRED, label="lab controller reader", unattended=a.unattended)     # EDIT: label
    pw = cred.get(force_prompt=a.set_cred)
    if pw and not login(pw):
        pw = cred.bad()
        pw = pw if pw and login(pw) else None
    if not pw:
        log.error("FAIL: no working password for %s/%s; run once with --set-cred", *CRED)
        return 2
    saved = cred.ok()
    if a.set_cred:
        if not saved and cred.source == "prompt":
            log.error("FAIL: password accepted but not stored: no credential store on this host (install keyring)")
            return 2
        return 0
    rows, proofs = collect(d)
    return finish(d, rows, proofs)


if __name__ == "__main__":
    sys.exit(main())
