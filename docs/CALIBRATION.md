# Heuristic calibration

The automated calibration gate is implemented in
`src/lib/analysis/calibration.test.ts`. It protects six synthetic scenarios and
must pass whenever a detector, weight, verdict rule, or action priority changes.

## Golden scenarios

1. Strong enforced evidence.
2. Missing repository evidence.
3. Concrete multi-domain structural failure.
4. Partial scan.
5. Compact initial Lovable export.
6. Unrecognized mixed stack.

The assertions pin selected check dispositions, score bands, verdict caps,
growth labels, and top remediation codes. False-positive and false-negative
detector cases remain next to the relevant control tests.

## External calibration still required

Before claiming that the heuristic is calibrated beyond the hackathon:

1. Have at least three technical reviewers independently assess the six
   scenarios without seeing the golden expectations.
2. Record each disagreement as a dated issue linked to the affected control;
   do not adjust a weight during the review.
3. Ask founders to explain the verdict, the reason for each action, and the
   evidence that would change it.
4. Change the heuristic only after grouping repeated disagreements, then bump
   the version and update the golden suite.

This human review has not been represented as completed by automated tests.
