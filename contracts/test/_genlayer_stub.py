"""A minimal, faithful-enough stand-in for the `genlayer` package so
`promise_war_contract.py` can actually be IMPORTED and EXECUTED outside
GenVM, instead of only parsed as AST text (see test_promise_war_static.py's
module docstring for why the AST-only approach exists at all).

This stub is deliberately narrow: it provides just enough of `gl.*`,
`Address`, `u256`/`u32`/`u64`/`u8`, `TreeMap`, `DynArray`, and
`allow_storage` for the contract module to import cleanly and for its pure
settlement/consensus-adjudication methods to run against real instances
with real ledger state. It does NOT reimplement GenVM's storage layer,
consensus scheduling, or nondeterministic LLM/web execution — tests that
need those still rely on the live-deployment verification described in
review.md. What this DOES let tests do, that pure AST inspection cannot:
actually call `settle_claim_sides` / `claim_side_payout` /
`_evidence_outcomes_agree` on a real `PromiseWar` instance and observe the
real return values, mutated state, and control flow.

Install with `install()` before importing the contract module; the import
is idempotent.
"""

from __future__ import annotations

import sys
import types


def _identity(fn):
    return fn


class _Int(int):
    """Base for the u8/u32/u64/u256 storage-width aliases. The real GenVM
    types enforce bit-width and wraparound; none of the methods under test
    here rely on that enforcement, so plain `int` semantics are enough."""

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"{type(self).__name__}({int(self)})"


class Address(str):
    """Real GenLayer addresses are their own type distinct from str; a str
    subclass is enough for equality/dict-key behavior in these tests."""

    @property
    def as_hex(self) -> str:
        return str(self)


class TreeMap(dict):
    def __class_getitem__(cls, item):
        return cls


class DynArray(list):
    def __class_getitem__(cls, item):
        return cls


def allow_storage(cls):
    return cls


class UserError(Exception):
    def __init__(self, message: str = ""):
        super().__init__(message)
        self.message = message


class Return:
    """Marker type run_nondet_unsafe's leader branch would normally wrap
    its result in. Not exercised by these tests (they call the pure
    agreement-checking methods directly), but must exist as an attribute
    for `isinstance(x, gl.vm.Return)` checks elsewhere in the module to
    resolve at import time."""


def run_nondet_unsafe(leader, validator):  # pragma: no cover - unused by these tests
    result = leader()
    validator(Return())
    return result


class _Write:
    def __call__(self, fn):
        return fn

    payable = staticmethod(_identity)


class _Public:
    def __init__(self):
        self.write = _Write()
        self.view = staticmethod(_identity).__func__


class _Message:
    def __init__(self):
        self.sender_address = Address("0x0000000000000000000000000000000000000000")
        self.value = 0


class _WebNondet:
    def render(self, url, mode="text"):  # pragma: no cover - unused by these tests
        raise RuntimeError("network access is not available in the test stub")

    def get(self, url):  # pragma: no cover - unused by these tests
        raise RuntimeError("network access is not available in the test stub")


class _Nondet:
    def __init__(self):
        self.web = _WebNondet()

    def exec_prompt(self, prompt, response_format="json"):  # pragma: no cover
        raise RuntimeError("LLM access is not available in the test stub")


class _Vm:
    UserError = UserError
    Return = Return
    run_nondet_unsafe = staticmethod(run_nondet_unsafe)


class _Evm:
    contract_interface = staticmethod(_identity)


class Contract:
    """Real deployments never call `object.__new__` directly — GenVM
    constructs instances and manages storage. Tests here build instances
    with `object.__new__(PromiseWar)` and set exactly the attributes the
    method under test touches, so this base class needs no behavior of
    its own."""


def install() -> types.ModuleType:
    """Register the stub as `sys.modules['genlayer']` if not already
    present (or if a previous install left a stub in place), then return
    it. Safe to call multiple times."""
    existing = sys.modules.get("genlayer")
    if existing is not None and getattr(existing, "__is_promise_war_test_stub__", False):
        return existing

    mod = types.ModuleType("genlayer")
    mod.__is_promise_war_test_stub__ = True

    gl = types.SimpleNamespace()
    gl.Contract = Contract
    gl.public = _Public()
    gl.message = _Message()
    gl.vm = _Vm()
    gl.nondet = _Nondet()
    gl.evm = _Evm()

    mod.gl = gl
    mod.Address = Address
    mod.TreeMap = TreeMap
    mod.DynArray = DynArray
    mod.allow_storage = allow_storage
    mod.u256 = type("u256", (_Int,), {})
    mod.u64 = type("u64", (_Int,), {})
    mod.u32 = type("u32", (_Int,), {})
    mod.u8 = type("u8", (_Int,), {})
    mod.__all__ = ["gl", "Address", "TreeMap", "DynArray", "allow_storage", "u256", "u64", "u32", "u8"]

    sys.modules["genlayer"] = mod
    return mod
