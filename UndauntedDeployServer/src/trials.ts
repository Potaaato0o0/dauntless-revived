import TrialsHardHuntTable from "./vendor/trials_hard_table.json";
import TrialsEliteHuntTable from "./vendor/trials_elite_table.json";

export const TRIALS_ROTATION_EPOCH_DEFAULT = "2020-09-17T00:00:00.000Z";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const HardRows = (TrialsHardHuntTable[0].Rows as any);
const EliteRows = (TrialsEliteHuntTable[0].Rows as any);
const HardPrefix = "Arena_MatchmakerHunt_Hard_";
const ElitePrefix = "Arena_MatchmakerHunt_Elite_";

function NumberedSuffixes(Rows: Record<string, unknown>, Prefix: string){
    return Object.keys(Rows)
        .filter((Key) => Key.startsWith(Prefix) && /^\d{3}$/.test(Key.slice(Prefix.length)))
        .map((Key) => Key.slice(Prefix.length));
}

export function GetValidTrialSuffixes(){
    const Hard = new Set(NumberedSuffixes(HardRows, HardPrefix));
    return NumberedSuffixes(EliteRows, ElitePrefix)
        .filter((Suffix) => Hard.has(Suffix))
        .sort((A, B) => Number(A) - Number(B));
}

export type TrialsRotation = {
    epoch: string;
    weekIndex: number;
    rotationId: string;
    suffix: string;
    hardHuntId: string;
    eliteHuntId: string;
};

export function GetTrialsRotation(Now = new Date(), Epoch = process.env.TRIALS_ROTATION_EPOCH ?? TRIALS_ROTATION_EPOCH_DEFAULT): TrialsRotation {
    const EpochMs = Date.parse(Epoch);
    if(Number.isNaN(EpochMs)){
        throw new Error("Invalid TRIALS_ROTATION_EPOCH");
    }

    const Valid = GetValidTrialSuffixes();
    if(Valid.length === 0){
        throw new Error("Trials tables have no shared numbered Hard/Elite rows");
    }

    const WeekIndex = Math.floor((Now.getTime() - EpochMs) / WEEK_MS);
    const Index = ((WeekIndex % Valid.length) + Valid.length) % Valid.length;
    const Suffix = Valid[Index];

    return {
        epoch: new Date(EpochMs).toISOString(),
        weekIndex: WeekIndex,
        rotationId: `${new Date(EpochMs).toISOString().slice(0, 10)}:${WeekIndex}:${Suffix}`,
        suffix: Suffix,
        hardHuntId: `${HardPrefix}${Suffix}`,
        eliteHuntId: `${ElitePrefix}${Suffix}`
    };
}

export function GetActiveTrialsData(IsElite: boolean, Now = new Date()){
    const Rotation = GetTrialsRotation(Now);
    const TrialsHuntId = IsElite ? Rotation.eliteHuntId : Rotation.hardHuntId;
    const Row = IsElite ? EliteRows[TrialsHuntId] : HardRows[TrialsHuntId];

    if(Row == undefined){
        throw new Error(`Trials rotation selected missing row ${TrialsHuntId}`);
    }

    return {
        Behemoth: Row.SpecificBehemoth.BehemothAsset.AssetPathName as string,
        TrialsHuntId,
        Rotation
    };
}
