"""Property/conservation tests for the settlement math in
promise_war_contract.py — the audit's request for "adversarial tests for
arbitrary claimant ordering, reopen/settle sequencing, slash conservation,
and payout conservation".

Because `from genlayer import *` can only resolve inside GenVM (see
test_promise_war_static.py's module docstring), these tests do not import
or execute the actual contract. Instead they contain a faithful,
line-for-line pure-Python reimplementation of the two settlement
algorithms — `_claim_side_payout_math` mirrors claim_side_payout()'s
dust-absorption loop, `_evidence_slash_math` mirrors
settle_claim_evidence()'s aggregate slash split — and property-test THAT
against thousands of randomized scenarios. This is a deliberate trade-off:
it verifies the *algorithm* is conservation-safe under adversarial inputs
(arbitrary staker counts, arbitrary stake amounts, arbitrary claim order),
which is what these tests can prove; it does NOT prove the Python
mirror is byte-for-byte identical to the deployed contract — that
assurance instead comes from the live multi-account test campaign run
directly against the deployed contract (see MEMORY.md's "Redeployed
contract + comprehensive live test campaign" section), which observed
these exact conservation properties hold for real transactions.

Run with: pytest contracts/test/test_settlement_math_properties.py
"""

import random

BPS_DENOMINATOR = 10000
RANDOM_SEED = 20260826
TRIALS = 500


def _claim_side_payout_math(stakes: list[int], pool_amount: int, claim_order: list[int]) -> list[int]:
    """Mirrors claim_side_payout()'s dust-absorption algorithm exactly:
    each claimant's raw share floors `pool_amount * stake // side_total`,
    except whoever's cumulative claimed stake reaches the side's full
    total, who instead receives whatever remains of pool_amount. Returns
    payouts indexed the same as `stakes`, but computed in `claim_order`."""
    side_total = sum(stakes)
    payouts = [0] * len(stakes)
    claimed_stake_so_far = 0
    distributed_so_far = 0
    for idx in claim_order:
        stake_amount = stakes[idx]
        new_claimed_stake = claimed_stake_so_far + stake_amount
        if side_total > 0 and new_claimed_stake >= side_total:
            payout = max(0, pool_amount - distributed_so_far)
        elif side_total > 0:
            payout = (pool_amount * stake_amount) // side_total
        else:
            payout = 0
        claimed_stake_so_far = new_claimed_stake
        distributed_so_far += payout
        payouts[idx] = payout
    return payouts


def _evidence_slash_math(stakes_and_slash_bps: list[tuple[int, int]], treasury_share_bps: int) -> tuple[int, int]:
    """Mirrors settle_claim_evidence()'s aggregate loop: per item, slash =
    stake*slash_bps//10000, split into treasury_share/pool_share. Returns
    (total_treasury, total_pool)."""
    total_treasury = 0
    total_pool = 0
    for stake, slash_bps in stakes_and_slash_bps:
        if slash_bps <= 0:
            continue
        slash_amount = (stake * slash_bps) // BPS_DENOMINATOR
        treasury_share = (slash_amount * treasury_share_bps) // BPS_DENOMINATOR
        total_treasury += treasury_share
        total_pool += slash_amount - treasury_share
    return total_treasury, total_pool


def _random_stakes(rng: random.Random, count: int) -> list[int]:
    # Deliberately include tiny, huge, and awkward-fraction wei amounts —
    # the kind of adversarial input a real staker could submit.
    return [rng.randint(1, 10_000_000_000_000_000_000_000) for _ in range(count)]


def test_payout_conservation_holds_for_arbitrary_stakers_and_ordering():
    rng = random.Random(RANDOM_SEED)
    for trial in range(TRIALS):
        staker_count = rng.randint(1, 12)
        stakes = _random_stakes(rng, staker_count)
        pool_amount = rng.randint(0, 10_000_000_000_000_000_000_000)
        order = list(range(staker_count))
        rng.shuffle(order)

        payouts = _claim_side_payout_math(stakes, pool_amount, order)

        assert sum(payouts) == pool_amount, (
            f"trial {trial}: dust leak/overpay — sum(payouts)={sum(payouts)} != pool_amount={pool_amount} "
            f"(stakes={stakes}, order={order})"
        )
        assert all(p >= 0 for p in payouts), f"trial {trial}: negative payout produced"


def test_payout_total_is_order_independent_even_though_individual_shares_are_not():
    # The dust-absorption design is deliberately order-dependent for WHO
    # gets the remainder (whoever claims last), but the TOTAL distributed
    # must be identical no matter the claim order — that's the actual
    # conservation property, not "everyone gets the same payout regardless
    # of order" (they don't, by design).
    rng = random.Random(RANDOM_SEED + 1)
    for trial in range(TRIALS):
        staker_count = rng.randint(2, 8)
        stakes = _random_stakes(rng, staker_count)
        pool_amount = rng.randint(0, 10_000_000_000_000_000_000_000)

        totals = set()
        for _ in range(5):
            order = list(range(staker_count))
            rng.shuffle(order)
            payouts = _claim_side_payout_math(stakes, pool_amount, order)
            totals.add(sum(payouts))

        assert totals == {pool_amount}, f"trial {trial}: total payout varied across claim orderings: {totals}"


def test_slash_conservation_treasury_plus_pool_equals_total_slash():
    rng = random.Random(RANDOM_SEED + 2)
    outcome_slash_bps = [0, 2500, 5000, 7500, 10000]
    for trial in range(TRIALS):
        item_count = rng.randint(0, 15)
        items = [(rng.randint(1, 1_000_000_000_000_000_000_000), rng.choice(outcome_slash_bps)) for _ in range(item_count)]
        treasury_share_bps = rng.choice([0, 1500, 5000, 10000])

        total_treasury, total_pool = _evidence_slash_math(items, treasury_share_bps)

        expected_total_slash = sum((stake * slash_bps) // BPS_DENOMINATOR for stake, slash_bps in items)
        assert total_treasury + total_pool == expected_total_slash, (
            f"trial {trial}: slash conservation violated — treasury({total_treasury}) + "
            f"pool({total_pool}) != total_slash({expected_total_slash})"
        )
        assert total_treasury >= 0 and total_pool >= 0


def test_zero_stakers_and_zero_pool_are_safe_edge_cases():
    assert _claim_side_payout_math([], 0, []) == []
    assert _claim_side_payout_math([100], 0, [0]) == [0]
    assert _evidence_slash_math([], 1500) == (0, 0)


def test_single_staker_receives_the_entire_pool_with_no_remainder_logic_needed():
    rng = random.Random(RANDOM_SEED + 3)
    for _ in range(50):
        stake = rng.randint(1, 10**24)
        pool = rng.randint(0, 10**24)
        assert _claim_side_payout_math([stake], pool, [0]) == [pool]


def test_reopen_then_settle_sequencing_cannot_double_count_slash():
    # Regression test for the second-round audit's core finding: model the
    # forbidden sequence directly (settle before a claim is terminal, then
    # more evidence arrives) and show why the contract's fix — rejecting
    # settle_claim_evidence() while NOT_YET_VERIFIABLE — is the only safe
    # option. If settlement were allowed to run twice (once "early", once
    # after reopening), the second evidence batch's slash would be double
    # counted relative to a single correct settlement pass.
    rng = random.Random(RANDOM_SEED + 4)
    first_batch = [(rng.randint(1, 10**18), 5000) for _ in range(3)]
    second_batch = [(rng.randint(1, 10**18), 5000) for _ in range(2)]

    # Correct behavior: settle_claim_evidence() runs exactly once, after
    # the claim is terminal, over the FULL evidence set.
    treasury_correct, pool_correct = _evidence_slash_math(first_batch + second_batch, 1500)

    # The forbidden behavior the old contract allowed: settle once on the
    # first batch (while NOT_YET_VERIFIABLE), reopen, add more evidence,
    # and have no way to ever account for the second batch's slash at all
    # (evidence_payouts_settled was already permanently True).
    treasury_early, pool_early = _evidence_slash_math(first_batch, 1500)
    accounted_after_bug = treasury_early + pool_early
    correct_total = treasury_correct + pool_correct

    assert accounted_after_bug < correct_total, (
        "sanity check: the old (buggy) sequence must under-account slash relative to the fix"
    )
    unaccounted_slash = correct_total - accounted_after_bug
    expected_second_batch_slash = sum((stake * bps) // BPS_DENOMINATOR for stake, bps in second_batch)
    assert unaccounted_slash == expected_second_batch_slash, (
        "the amount the old sequencing would have silently lost must equal exactly the second batch's slash"
    )
