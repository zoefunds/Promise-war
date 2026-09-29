"""Real execution tests against the actual contract methods — not AST/source
inspection. Installs `_genlayer_stub` as `genlayer` (see that module's
docstring for exactly what it does and doesn't provide) so
promise_war_contract.py can be imported and its settlement/consensus
methods called on real `PromiseWar` instances with real state, closing the
gap the second-round review flagged: static checks that the right
identifiers appear in the source don't prove the code actually behaves
correctly when run.

Run with: pytest contracts/test/test_contract_execution.py
"""

import importlib.util
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import _genlayer_stub  # noqa: E402

_genlayer_stub.install()

_CONTRACT_PATH = Path(__file__).parents[1] / "promise_war_contract.py"
_spec = importlib.util.spec_from_file_location("promise_war_contract", _CONTRACT_PATH)
contract = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(contract)

gl = sys.modules["genlayer"].gl
u32 = contract.u32
u64 = contract.u64
u256 = contract.u256
TreeMap = contract.TreeMap
Address = contract.Address


def _make_engine() -> "contract.PromiseWar":
    """Build a bare PromiseWar instance with exactly the storage attributes
    the settlement methods under test touch, real TreeMaps rather than
    mocks, so the actual dict-shaped lookups execute for real."""
    engine = object.__new__(contract.PromiseWar)
    engine.owner = Address("0xOWNER0000000000000000000000000000000000")
    engine.claims = TreeMap()
    engine.evidence_store = TreeMap()
    engine.claim_evidence_ids = TreeMap()
    engine.side_stakes = TreeMap()
    engine.side_claimed = TreeMap()
    engine.side_claimed_stake_wei = TreeMap()
    engine.side_distributed_wei = TreeMap()
    engine.evidence_claimed = TreeMap()
    engine.balances = TreeMap()
    engine.reputation_wins = TreeMap()
    engine.reputation_losses = TreeMap()
    engine.reputation_evidence_rewards = TreeMap()
    engine.reputation_flags = TreeMap()
    engine.activity = TreeMap()
    engine.accrued_treasury_wei = u256(0)
    engine.total_claims_settled = u64(0)
    engine.total_payouts_wei = u256(0)
    return engine


def _make_claim(**overrides) -> "contract.Claim":
    fields = dict(
        id=u32(1),
        creator=Address("0xCREATOR0000000000000000000000000000000000"),
        statement="stmt",
        description="",
        resolution_criteria="",
        category="general",
        created_ts=u64(0),
        participation_deadline_ts=u64(0),
        evidence_deadline_ts=u64(0),
        status=contract.u8(contract.STATUS_ADJUDICATED),
        min_side_stake_wei=u256(0),
        min_evidence_stake_wei=u256(0),
        support_stake_wei=u256(0),
        challenge_stake_wei=u256(0),
        protocol_fee_bps_snapshot=u32(contract.DEFAULT_PROTOCOL_FEE_BPS),
        slash_treasury_share_bps_snapshot=u32(contract.DEFAULT_SLASH_TREASURY_SHARE_BPS),
        slash_pool_share_bps_snapshot=u32(contract.DEFAULT_SLASH_POOL_SHARE_BPS),
        evidence_count=u32(0),
        support_evidence_count=u32(0),
        challenge_evidence_count=u32(0),
        neutral_evidence_count=u32(0),
        verdict="",
        reasoning_summary="",
        review_attempts=u32(0),
        last_review_attempt_ts=u64(0),
        adjudicated_at=u64(0),
        settled_at=u64(0),
        side_payouts_settled=False,
        evidence_payouts_settled=False,
        third_party_joined=True,
        evidence_slash_pool_wei=u256(0),
    )
    fields.update(overrides)
    return contract.Claim(**fields)


# ---------------------------------------------------------------------------
# Positive pool, zero stakers on the winning side — settle_claim_sides()
# and claim_side_payout() actually executed, not just grep'd for the right
# identifiers.
# ---------------------------------------------------------------------------


def test_settle_claim_sides_routes_positive_pool_to_the_only_staked_side():
    engine = _make_engine()
    support_staker = Address("0xSUPPORT000000000000000000000000000000000")
    # NOT_FULFILLED means CHALLENGE is the "winning" side by verdict, but
    # nobody ever staked CHALLENGE — only SUPPORT has real GEN in the pool.
    # This is exactly the case the review asked to be exercised: a positive
    # pool whose nominal winner has zero eligible stakers.
    claim = _make_claim(
        verdict=contract.VERDICT_NOT_FULFILLED,
        support_stake_wei=u256(1_000),
        challenge_stake_wei=u256(0),
        evidence_count=u32(0),
    )
    engine.claims[u32(1)] = claim
    engine.side_stakes[contract._side_key(1, contract.SIDE_SUPPORT, support_staker)] = u256(1_000)

    engine.settle_claim_sides(1)

    assert bool(claim.side_payouts_settled) is True
    # Fee must be waived on the zero-staker recovery route.
    assert int(engine.accrued_treasury_wei) == 0
    assert int(engine.total_payouts_wei) == 1_000

    gl.message.sender_address = support_staker
    engine.claim_side_payout(1, contract.SIDE_SUPPORT)

    # The only real staker gets the ENTIRE combined pool — not merely
    # their proportional share of a side that officially "lost".
    assert int(engine.balances[support_staker]) == 1_000


def test_settle_claim_evidence_recovers_slash_pool_to_treasury_when_winner_has_no_stakers():
    engine = _make_engine()
    claim = _make_claim(
        verdict=contract.VERDICT_NOT_FULFILLED,
        support_stake_wei=u256(500),
        challenge_stake_wei=u256(0),  # winning side (CHALLENGE) has no stakers
        evidence_count=u32(1),
    )
    engine.claims[u32(1)] = claim
    engine.claim_evidence_ids[u32(1)] = [u32(1)]
    evidence = contract.Evidence(
        id=u32(1),
        claim_id=u32(1),
        side=contract.SIDE_SUPPORT,
        submitter=Address("0xSUBMITTER00000000000000000000000000000000"),
        source_url="https://example.com/a",
        source_title="",
        publisher="",
        publication_date="",
        retrieval_date="",
        summary="",
        source_type="",
        stake_wei=u256(1_000),
        submitted_at=u64(0),
        adjudicated=True,
        outcome=contract.OUTCOME_MALICIOUSLY_MANIPULATED,
        authenticity_assessment="",
        authority_assessment="",
        relevance_assessment="",
        timeliness_assessment="",
        claim_support_assessment="",
        reasoning_summary="",
        slash_bps=u32(contract.OUTCOME_SLASH_BPS[contract.OUTCOME_MALICIOUSLY_MANIPULATED]),
        reward_eligible=False,
        flagged=True,
        superseded=False,
    )
    engine.evidence_store[u32(1)] = evidence

    engine.settle_claim_evidence(1)

    assert bool(claim.evidence_payouts_settled) is True
    # No unclaimable bonus pool is created for a winning side with no
    # stakers; the entire slash (treasury share + pool share) lands in the
    # treasury instead.
    assert int(claim.evidence_slash_pool_wei) == 0
    expected_total_slash = (1_000 * contract.OUTCOME_SLASH_BPS[contract.OUTCOME_MALICIOUSLY_MANIPULATED]) // contract.BPS_DENOMINATOR
    assert int(engine.accrued_treasury_wei) == expected_total_slash
    assert expected_total_slash > 0


# ---------------------------------------------------------------------------
# An unverified (leader-only) evidence reasoning_summary must not be able
# to drive settlement — _evidence_outcomes_agree actually invoked, not just
# checked for the right substrings.
# ---------------------------------------------------------------------------


def test_evidence_validator_rejects_matching_outcome_with_fabricated_summary():
    engine = _make_engine()
    leader_data = {
        "outcome": contract.OUTCOME_STRONGLY_SUPPORTS,
        "reasoning_summary": (
            "The fetched article from a major national newspaper directly "
            "confirms the claim's central factual assertion with named "
            "sources and a dated report."
        ),
    }
    # Same outcome tag (so payout/slash/reward/flag buckets all match) —
    # but the validator's independently-produced reasoning describes a
    # completely different basis. A leader that fabricated its summary
    # while still landing on a plausible-looking outcome tag must not be
    # able to settle on outcome agreement alone.
    validator_data = {
        "outcome": contract.OUTCOME_STRONGLY_SUPPORTS,
        "reasoning_summary": (
            "Completely unrelated boilerplate text about cookie policies "
            "and site navigation with no connection to the claim at all."
        ),
    }

    assert engine._evidence_outcomes_agree(leader_data, validator_data) is False


def test_evidence_validator_accepts_matching_outcome_with_substantively_agreeing_summary():
    engine = _make_engine()
    leader_data = {
        "outcome": contract.OUTCOME_WEAK_OR_INCOMPLETE,
        "reasoning_summary": (
            "The source is authentic and relevant to the claim but only "
            "briefly touches the claim without decisive supporting detail."
        ),
    }
    validator_data = {
        "outcome": contract.OUTCOME_WEAK_OR_INCOMPLETE,
        "reasoning_summary": (
            "The source is authentic and relevant to the claim but the "
            "coverage is brief and lacks decisive supporting detail."
        ),
    }

    assert engine._evidence_outcomes_agree(leader_data, validator_data) is True


def test_evidence_validator_still_rejects_on_outcome_bucket_mismatch_regardless_of_summary():
    engine = _make_engine()
    shared_summary = (
        "The source is authentic, on topic, and clearly bears on the "
        "claim's central factual question with specific supporting detail."
    )
    leader_data = {"outcome": contract.OUTCOME_STRONGLY_SUPPORTS, "reasoning_summary": shared_summary}
    validator_data = {"outcome": contract.OUTCOME_FABRICATED_OR_UNVERIFIABLE, "reasoning_summary": shared_summary}

    assert engine._evidence_outcomes_agree(leader_data, validator_data) is False


@pytest.mark.parametrize("field", ["reasoning_summary"])
def test_summary_substance_helper_rejects_too_short_or_disjoint_text(field):
    engine = _make_engine()
    assert engine._summary_substance_agrees("too short", "also short") is False
    assert (
        engine._summary_substance_agrees(
            "a" * 50,
            "completely different padding text of similar length here now",
        )
        is False
    )
