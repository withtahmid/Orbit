---
name: goal-completion-semantics-tension
description: Goal ✓/"reached" keys off lifetime funding not current state; spend against a funded goal is invisible; unresolved "fund-then-spend vs maintain-balance" product question.
metadata:
  type: project
---

Goal envelopes (envelope with `target_amount > 0`, `cadence='none'`) have an unresolved
semantic ambiguity that keeps surfacing in the envelope-detail redesign.

**Fact:** Goal completion everywhere keys off `lifetimeFunded` (= SUM of all
`envelop_allocations.amount`), NOT current `remaining` (= allocated − consumed).
The server comment in `envelopeUtilization.mts` makes this deliberate: "a completed
goal stays completed once the user starts spending toward it." So funding to target
lights the gold ✓ badge (EnvelopeGlass), the "Goal reached" pill, and "100% funded"
foot — permanently, even after the saved money is fully spent. `remaining` is computed
but never displayed for goals, so the spend/drain is invisible on the detail page.

**Why it matters:** The badge was added to make "you did it" unmistakable, but it means
a goal funded 1000 / spent 1000 (remaining 0) still shows a triumphant ✓ + "Goal reached".
The rest of the page follows a show-reality principle; this one field contradicts it.

**The open product question (needs an owner decision):**
- Goals = **fund-to-target-then-spend** (trip fund): keep lifetimeFunded as completion
  signal, but add a "Spent" hero number so the drain is visible; soften pill to "Funded"
  once spent>0.
- Goals = **maintain-a-balance** (emergency fund): completion should key off
  `remaining >= target`, so spending un-completes it.

**How to apply:** When reviewing/planning anything touching goal state, flag that the
badge, pill, hero numbers, and the dropped `remaining` all currently assume different
answers. Don't add more goal-state surfaces until this is declared. Relates to
[[plan_envelope_merge_decision]] (goals = envelopes with cadence='none' + target_amount).
