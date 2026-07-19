import { describe, expect, it } from "vitest";

import { selectDeterministicActions } from "./actions";
import { CALIBRATION_FIXTURES } from "./calibration-fixtures";
import { scoreAnalysis } from "./scoring";

describe("versioned heuristic calibration fixtures", () => {
  it.each(CALIBRATION_FIXTURES)(
    "preserves the golden outcome for $name",
    ({ checks, expected, snapshot }) => {
      const result = scoreAnalysis(checks, snapshot);
      const actions = selectDeterministicActions(checks);

      expect(result.score).toBeGreaterThanOrEqual(expected.scoreBand[0]);
      expect(result.score).toBeLessThanOrEqual(expected.scoreBand[1]);
      expect(result.verdict).toBe(expected.verdict);
      expect(result.growth).toEqual(expected.growth);
      expect(actions.map((action) => action.remediationCode)).toEqual(
        expected.topActionCodes,
      );
      for (const [id, disposition] of Object.entries(
        expected.dispositions,
      )) {
        expect(checks.find((check) => check.id === id)).toMatchObject(
          disposition,
        );
      }
    },
  );
});
