import "./setup";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GetActiveTrialsData, GetTrialsRotation, GetValidTrialSuffixes, TRIALS_ROTATION_EPOCH_DEFAULT } from "../src/trials";

describe("weekly Trials rotation", () => {
    it("builds the valid rotation from the rows actually present in both cooked tables", () => {
        const Suffixes = GetValidTrialSuffixes();
        assert.equal(Suffixes.length, 88);
        assert.equal(Suffixes[0], "001");
        assert.equal(Suffixes.at(-1), "088");
        assert.equal(new Set(Suffixes).size, Suffixes.length);
    });

    it("is stable for a week, advances at the boundary, and pairs Hard with Elite", () => {
        const A = new Date("2026-10-05T12:00:00.000Z");
        const B = new Date("2026-10-07T12:00:00.000Z");
        const First = GetTrialsRotation(A);
        const SameWeek = GetTrialsRotation(B);
        assert.equal(First.rotationId, SameWeek.rotationId);

        const Next = GetTrialsRotation(new Date(A.getTime() + 7 * 24 * 60 * 60 * 1000));
        assert.notEqual(First.rotationId, Next.rotationId);
        assert.equal(First.hardHuntId.replace("_Hard_", "_Elite_"), First.eliteHuntId);

        const Hard = GetActiveTrialsData(false, A);
        const Elite = GetActiveTrialsData(true, A);
        assert.equal(Hard.Rotation.rotationId, Elite.Rotation.rotationId);
        assert.equal(Hard.TrialsHuntId.replace("_Hard_", "_Elite_"), Elite.TrialsHuntId);
    });

    it("uses a configurable epoch and rejects a malformed one", () => {
        const Old = process.env.TRIALS_ROTATION_EPOCH;
        try{
            process.env.TRIALS_ROTATION_EPOCH = "2026-10-01T00:00:00.000Z";
            assert.equal(GetTrialsRotation(new Date("2026-10-01T00:00:00.000Z")).weekIndex, 0);
            process.env.TRIALS_ROTATION_EPOCH = "not-a-date";
            assert.throws(() => GetTrialsRotation(), /Invalid TRIALS_ROTATION_EPOCH/);
        }
        finally{
            if(Old === undefined) delete process.env.TRIALS_ROTATION_EPOCH;
            else process.env.TRIALS_ROTATION_EPOCH = Old;
        }

        assert.ok(!Number.isNaN(Date.parse(TRIALS_ROTATION_EPOCH_DEFAULT)));
    });
});
