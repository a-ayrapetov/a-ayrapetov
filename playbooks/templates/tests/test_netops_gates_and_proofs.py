"""Tests for netops_gates_and_proofs.py. Offline: no device, no controller, no real credential store."""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import netops_gates_and_proofs as t  # noqa: E402


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    """A host that already has these set must not change what the tests prove."""
    monkeypatch.delenv("CREDENTIALS_DIRECTORY", raising=False)
    for key in [k for k in os.environ if k.startswith("NETOPS_PW_")]:
        monkeypatch.delenv(key, raising=False)
    yield
    import logging
    for h in list(logging.getLogger().handlers):
        if isinstance(h, logging.FileHandler):
            h.close()
            logging.getLogger().removeHandler(h)


class FakeKeyring:
    def __init__(self):
        self.store = {}

    def get_password(self, service, user):
        return self.store.get((service, user))

    def set_password(self, service, user, pw):
        self.store[(service, user)] = pw

    def delete_password(self, service, user):
        self.store.pop((service, user), None)


def make_cred(kr, **kw):
    c = t.Cred("lab_ctrl", "svc_reader", "lab controller", **kw)
    c._keyring = lambda: kr
    return c


# ---------------------------------------------------------------- credentials
def test_typed_password_is_saved_only_after_ok_is_called():
    kr = FakeKeyring()
    c = make_cred(kr)
    c._ask = lambda: "typed"
    assert c.get() == "typed" and c.source == "prompt"
    assert kr.store == {}                      # not saved yet: a typo must never be stored
    c.ok()
    assert kr.store[("lab_ctrl", "svc_reader")] == "typed"


def test_stored_password_is_used_without_a_prompt():
    kr = FakeKeyring()
    kr.set_password("lab_ctrl", "svc_reader", "stored")
    c = make_cred(kr)
    c._ask = lambda: pytest.fail("prompted although a stored password exists")
    assert c.get() == "stored" and c.source == "keyring"


def test_rejected_stored_password_is_removed_and_asked_once():
    kr = FakeKeyring()
    kr.set_password("lab_ctrl", "svc_reader", "stale")
    c = make_cred(kr)
    c.get()
    c._ask = lambda: "fresh"
    assert c.bad() == "fresh"
    assert ("lab_ctrl", "svc_reader") not in kr.store
    assert c.bad() is None                     # a second refusal never loops


def test_unattended_run_never_prompts():
    c = make_cred(FakeKeyring(), unattended=True)
    c._ask = lambda: pytest.fail("prompted in an unattended run")
    assert c.get() is None


def test_env_beats_keyring(monkeypatch):
    kr = FakeKeyring()
    kr.set_password("lab_ctrl", "svc_reader", "stored")
    monkeypatch.setenv("NETOPS_PW_LAB_CTRL", "from_env")
    c = make_cred(kr)
    assert c.get() == "from_env" and c.source == "env"


def test_systemd_credential_file_is_read(monkeypatch, tmp_path):
    (tmp_path / "lab_ctrl").write_text("sealed\n", encoding="utf-8")
    monkeypatch.setenv("CREDENTIALS_DIRECTORY", str(tmp_path))
    c = make_cred(FakeKeyring())
    assert c.get() == "sealed" and c.source == "systemd"


def test_keyring_is_not_touched_when_the_environment_has_the_password(monkeypatch):
    class BrokenKeyring:
        def get_password(self, service, user):
            raise RuntimeError("no keyring backend on this host")
    monkeypatch.setenv("NETOPS_PW_LAB_CTRL", "from_env")
    c = make_cred(BrokenKeyring())
    assert c.get() == "from_env" and c.source == "env"


def test_a_broken_keyring_falls_through_to_the_prompt():
    class BrokenKeyring:
        def get_password(self, service, user):
            raise RuntimeError("no keyring backend on this host")
    c = make_cred(BrokenKeyring())
    c._ask = lambda: "typed"
    assert c.get() == "typed" and c.source == "prompt"


def test_no_terminal_means_no_prompt_on_windows_too(monkeypatch):
    class NoTty:
        def isatty(self):
            return False
    monkeypatch.setattr(t, "IS_WINDOWS", True)
    monkeypatch.setattr(t.sys, "stdin", NoTty())
    monkeypatch.setattr(t.subprocess, "run", lambda *a, **k: pytest.fail("opened a login box with no terminal"))
    assert t.Cred("lab_ctrl", "svc_reader", "lab controller")._ask() is None


def test_set_cred_fails_loudly_when_nothing_can_store_it(monkeypatch, tmp_path):
    monkeypatch.setattr(t, "OUT_ROOT", tmp_path)
    monkeypatch.setattr(t.Cred, "_keyring", lambda self: None)
    monkeypatch.setattr(t.Cred, "_ask", lambda self: "typed")
    monkeypatch.setattr(t.sys, "argv", ["x", "--set-cred"])
    assert t.main() == 2


# ---------------------------------------------------------------- run folder
def test_run_folders_are_numbered_and_never_reused(tmp_path):
    a = t.run_folder(tmp_path, "demo")
    b = t.run_folder(tmp_path, "demo")
    assert a != b and a.name.endswith("_run1") and b.name.endswith("_run2")
    assert (a / "raw").is_dir()


def test_raw_reply_is_stored_as_received(tmp_path):
    d = t.run_folder(tmp_path, "demo")
    p = t.save_raw(d, "show version | sw1", "line1\r\nline2\n")
    assert p.parent == d / "raw"
    assert p.read_bytes() == b"line1\r\nline2\n"
    assert "|" not in p.name and " " not in p.name


def test_two_replies_with_the_same_safe_name_are_both_kept(tmp_path):
    d = t.run_folder(tmp_path, "demo")
    a = t.save_raw(d, "show run | sw1", "first\n")
    b = t.save_raw(d, "show run / sw1", "second\n")
    assert a != b and a.read_text() == "first\n" and b.read_text() == "second\n"


# ---------------------------------------------------------------- proofs
def test_two_sources_pass_inside_the_ratio_band():
    assert t.proof_two_sources("rate", 100.0, 103.0).status == "PASS"


def test_two_sources_check_outside_the_ratio_band():
    assert t.proof_two_sources("rate", 100.0, 160.0).status == "CHECK"


def test_two_sources_check_when_one_source_is_missing():
    assert t.proof_two_sources("rate", 100.0, None).status == "CHECK"
    assert t.proof_two_sources("rate", 0.0, 0.0).status == "CHECK"


def test_parts_cannot_exceed_the_whole():
    assert t.proof_bound("hosts vs uplink", [300.0, 400.0], 1000.0).status == "PASS"
    assert t.proof_bound("hosts vs uplink", [700.0, 400.0], 1000.0).status == "CHECK"


def test_identity_needs_every_source_to_agree():
    assert t.proof_identity("port", ["Te6/0/40", "TenGigabitEthernet6/0/40"], same=t.same_interface).status == "PASS"
    assert t.proof_identity("port", ["Te6/0/40", "Te6/0/41"], same=t.same_interface).status == "CHECK"
    assert t.proof_identity("port", ["Te6/0/40"], same=t.same_interface).status == "CHECK"   # one source proves nothing


# ---------------------------------------------------------------- field-proven parsing helpers
@pytest.mark.parametrize("a,b", [
    ("TenGigabitEthernet6/0/40", "Te6/0/40"),
    ("GigabitEthernet1/0/1", "gi1/0/1"),
    ("TwentyFiveGigE2/0/28", "Twe2/0/28"),
    ("TwoGigabitEthernet7/0/35", "Tw7/0/35"),
    ("Port-channel103", "Po103"),
    ("HundredGigE1/0/49", "Hu1/0/49"),
])
def test_long_and_short_interface_names_match(a, b):
    assert t.same_interface(a, b)


def test_different_ports_or_speeds_do_not_match():
    assert not t.same_interface("Te6/0/40", "Gi6/0/40")
    assert not t.same_interface("Te6/0/40", "Te6/0/4")
    assert not t.same_interface("TwentyFiveGigE2/0/28", "Tw2/0/28")


def test_api_field_names_are_matched_without_case():
    row = {"RXRATE": 5, "TxRate": 7}
    assert t.ci_get(row, "rxRate") == 5 and t.ci_get(row, "txrate") == 7
    assert t.ci_get(row, "missing", default=-1) == -1


def test_bytes_per_bucket_convert_to_mbps():
    assert t.mbps_from_bytes(450_000_000, 3600) == pytest.approx(1.0)
    with pytest.raises(ValueError):
        t.mbps_from_bytes(1, 0)


# ---------------------------------------------------------------- waits and gates
def test_poll_returns_as_soon_as_the_condition_is_true():
    calls, lines = [], []
    def cond():
        calls.append(1)
        return "done" if len(calls) == 3 else None
    assert t.poll_until(cond, what="task", timeout=5, interval=0, sleep=lambda s: None, out=lines.append) == "done"
    assert len(calls) == 3 and len(lines) >= 2     # progress was printed while waiting


def test_poll_times_out_with_a_named_error():
    clock = iter(range(0, 100))
    with pytest.raises(TimeoutError, match="task"):
        t.poll_until(lambda: None, what="task", timeout=3, interval=1,
                     sleep=lambda s: None, out=lambda s: None, now=lambda: next(clock))


def test_only_exact_capital_yes_applies_a_change():
    assert t.confirm_yes("push to sw1", answer=lambda p: "YES") is True
    for wrong in ("yes", "Yes", "y", "", " YES "):
        assert t.confirm_yes("push to sw1", answer=lambda p, w=wrong: w) is False


def test_change_is_refused_without_a_backup(tmp_path):
    d = t.run_folder(tmp_path, "demo")
    with pytest.raises(RuntimeError, match="no backup, no push"):
        t.require_backup(d, "sw1")
    t.save_backup(d, "sw1", "hostname sw1\n")
    assert t.require_backup(d, "sw1").exists()


def test_another_devices_backup_does_not_open_the_gate(tmp_path):
    d = t.run_folder(tmp_path, "demo")
    t.save_backup(d, "sw10", "hostname sw10\n")
    t.save_raw(d, "backup failed sw1", "% Authorization failed\n")
    with pytest.raises(RuntimeError, match="no backup, no push"):
        t.require_backup(d, "sw1")


def test_an_empty_backup_does_not_open_the_gate(tmp_path):
    d = t.run_folder(tmp_path, "demo")
    t.save_backup(d, "sw1", "")
    with pytest.raises(RuntimeError, match="no backup, no push"):
        t.require_backup(d, "sw1")


# ---------------------------------------------------------------- end of run
def test_exit_code_is_zero_only_when_every_proof_passes(tmp_path, capsys):
    d = t.run_folder(tmp_path, "demo")
    good = [t.Proof("a", "PASS", "x")]
    bad = good + [t.Proof("b", "CHECK", "y")]
    assert t.finish(d, [{"k": "v"}], good) == 0
    assert "VERIFY:" in capsys.readouterr().out.strip().splitlines()[-1]
    assert t.finish(d, [{"k": "v"}], bad) == 1
    assert (d / "ANSWER.md").exists() and (d / "results.csv").exists()


def test_the_password_never_reaches_the_log(tmp_path, monkeypatch):
    monkeypatch.setenv("NETOPS_PW_LAB_CTRL", "S3cr3t-value")
    d = t.run_folder(tmp_path, "demo")
    t.setup_logging(d)
    make_cred(FakeKeyring()).get()
    import logging
    for h in logging.getLogger().handlers:
        h.flush()
    assert "S3cr3t-value" not in (d / "run.log").read_text(encoding="utf-8")
