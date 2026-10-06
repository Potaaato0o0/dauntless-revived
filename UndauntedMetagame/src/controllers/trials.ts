import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { GetDb } from "../db";
import { characters, cooldowns, trialsresults, users } from "../db/schema";
import rotation from "../vendor/trials_rotation.json";
import { ApplyInventoryTransactionInTx } from "./inventory";
import { GetActiveCharacter } from "./activecharacter";
import type { Tx } from "./savehistory";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STEEL = "CURRENCY_MARKS_STEEL";
const GILDED = "CURRENCY_MARKS_GILDED";

// The original Trials reward ladder in the 1.4.4 era: a clear, sub-5 and sub-3
// each award 100 marks. Leaderboard completion_time is centiseconds (14948 = 149.48 s).
export const TRIAL_REWARD_TIERS = [
    { rank: "bronze", maxCompletionTime: 180000, amount: 100 },
    { rank: "silver", maxCompletionTime: 30000, amount: 100 },
    { rank: "gold", maxCompletionTime: 18000, amount: 100 }
] as const;

export class TrialsError extends Error {
    constructor(public Status: number, message: string){
        super(message);
        this.name = "TrialsError";
    }
}

export type TrialDifficulty = 0 | 1;
export type TrialCategory = "solo" | "group";
type Participant = {
    phx_account_id: string;
    character_id: string;
    platform: string;
    platform_name: string;
    player_role_id: string;
    weapon: number;
    secondary_weapon: number;
};

function Difficulty(Value: unknown): TrialDifficulty {
    const N = typeof Value === "string" && /^[01]$/.test(Value) ? Number(Value) : Value;
    if(N !== 0 && N !== 1) throw new TrialsError(400, "difficulty must be 0 (Normal) or 1 (Dauntless)");
    return N;
}

export function GetCurrentTrialsRotation(Now = new Date()){
    const EpochText = process.env.TRIALS_ROTATION_EPOCH ?? rotation.epochDefault;
    const Epoch = Date.parse(EpochText);
    if(Number.isNaN(Epoch)) throw new Error("Invalid TRIALS_ROTATION_EPOCH");
    if(rotation.suffixes.length === 0) throw new Error("Trials rotation has no valid rows");

    const WeekIndex = Math.floor((Now.getTime() - Epoch) / WEEK_MS);
    const Index = ((WeekIndex % rotation.suffixes.length) + rotation.suffixes.length) % rotation.suffixes.length;
    const Suffix = rotation.suffixes[Index];

    return {
        epoch: new Date(Epoch).toISOString(),
        weekIndex: WeekIndex,
        suffix: Suffix,
        rotationId: `${new Date(Epoch).toISOString().slice(0, 10)}:${WeekIndex}:${Suffix}`
    };
}

export function GetCurrentTrialId(DifficultyValue: TrialDifficulty, Now = new Date()){
    const Suffix = GetCurrentTrialsRotation(Now).suffix;
    return `Arena_MatchmakerHunt_${DifficultyValue === 1 ? "Elite" : "Hard"}_${Suffix}`;
}

function Int(Value: unknown, Name: string, Min: number, Max: number){
    if(!Number.isSafeInteger(Value) || (Value as number) < Min || (Value as number) > Max){
        throw new TrialsError(400, `${Name} must be an integer from ${Min} to ${Max}`);
    }
    return Value as number;
}

function Text(Value: unknown, Name: string, Required = true){
    if(typeof Value !== "string" || (Required && Value.length === 0)) throw new TrialsError(400, `${Name} must be a string`);
    return Value;
}

function ParticipantFrom(Raw: any, tx: Tx): Participant {
    const AccountId = Text(Raw?.phx_account_id ?? Raw?.account_id ?? Raw?.accountId, "phx_account_id");
    const Owned = tx.select().from(characters).where(eq(characters.userId, AccountId)).all();
    if(Owned.length === 0) throw new TrialsError(400, `unknown participant ${AccountId}`);

    let CharacterId = Raw?.character_id ?? Raw?.characterId;
    if(CharacterId == undefined) CharacterId = GetActiveCharacter(tx, AccountId)?.characterId;
    if(typeof CharacterId !== "string" || !Owned.some((Row) => Row.characterId === CharacterId)){
        throw new TrialsError(400, `character does not belong to ${AccountId}`);
    }

    const Name = tx.select({name: users.name}).from(users).where(eq(users.userId, AccountId)).get()?.name ?? AccountId;

    return {
        phx_account_id: AccountId,
        character_id: CharacterId,
        platform: typeof Raw?.platform === "string" ? Raw.platform : "",
        platform_name: typeof Raw?.platform_name === "string" ? Raw.platform_name : Name,
        player_role_id: typeof Raw?.player_role_id === "string" ? Raw.player_role_id : "",
        weapon: Number.isSafeInteger(Raw?.weapon) ? Raw.weapon : 0,
        secondary_weapon: Number.isSafeInteger(Raw?.secondary_weapon) ? Raw.secondary_weapon : 0
    };
}

function RewardCurrency(DifficultyValue: TrialDifficulty){
    return DifficultyValue === 1 ? GILDED : STEEL;
}

function Hash(Value: unknown){
    return createHash("sha256").update(JSON.stringify(Value)).digest("hex");
}

function ClaimRewards(tx: Tx, SubmissionId: string, RotationId: string, DifficultyValue: TrialDifficulty, CompletionTime: number, Players: Participant[], CompletedDate: string){
    const Rewards: {accountId: string, currency: string, amount: number, rank: string}[] = [];
    const Currency = RewardCurrency(DifficultyValue);

    for(const Player of Players){
        for(const Tier of TRIAL_REWARD_TIERS){
            if(CompletionTime > Tier.maxCompletionTime) continue;
            const CooldownId = `trials_reward:${RotationId}:${DifficultyValue}:${Tier.rank}`;
            const Existing = tx.select().from(cooldowns).where(and(eq(cooldowns.accountId, Player.phx_account_id), eq(cooldowns.cooldownId, CooldownId))).get();
            if(Existing !== undefined) continue;

            ApplyInventoryTransactionInTx(tx, {
                UserId: Player.phx_account_id,
                CharacterId: Player.character_id,
                TransactionId: `trials:${SubmissionId}:${Player.phx_account_id}:${Tier.rank}`,
                StackedItemsToAdd: [{catalogId: Currency, quantity: Tier.amount}]
            }, {Caller: "gameserver", Source: `trials:${RotationId}`});

            tx.insert(cooldowns).values({
                accountId: Player.phx_account_id,
                cooldownId: CooldownId,
                startedDate: CompletedDate,
                updatedDate: CompletedDate
            }).run();

            Rewards.push({accountId: Player.phx_account_id, currency: Currency, amount: Tier.amount, rank: Tier.rank});
        }
    }

    return Rewards;
}

export function SubmitTrialResult(Body: any){
    if(Body == null || typeof Body !== "object" || Array.isArray(Body)) throw new TrialsError(400, "result body must be an object");

    const DifficultyValue = Difficulty(Body.difficulty);
    const CompletionTime = Int(Body.completion_time, "completion_time", 1, 360000);
    const ObjectivesCompleted = Int(Body.objectives_completed ?? 0, "objectives_completed", 0, 20);
    const SessionId = Text(Body.session_id ?? Body.sessionId ?? "", "session_id", false);
    const SubmissionId = Text(Body.submission_id ?? Body.submissionId ?? SessionId, "submission_id");
    const Rotation = GetCurrentTrialsRotation();
    const TrialId = Text(Body.trial_id, "trial_id");
    const ExpectedTrial = GetCurrentTrialId(DifficultyValue);

    if(TrialId !== ExpectedTrial) throw new TrialsError(409, `result is for ${TrialId}, current Trial is ${ExpectedTrial}`);

    const RawParty = Array.isArray(Body.party) ? Body.party : Array.isArray(Body.entries) ? Body.entries
        : Body.phx_account_id != undefined ? [Body] : undefined;
    if(RawParty == undefined || RawParty.length < 1 || RawParty.length > 4) throw new TrialsError(400, "party must contain 1 to 4 players");

    const CompletedDate = new Date().toISOString();
    const RequestHash = Hash(Body);

    return GetDb().transaction((tx) => {
        const Existing = tx.select().from(trialsresults).where(eq(trialsresults.submissionId, SubmissionId)).get();
        if(Existing !== undefined){
            if(Existing.requestHash !== RequestHash) throw new TrialsError(409, "submission_id was already used for a different result");
            return {replayed: true, rewards: [] as any[], resultId: Existing.id};
        }

        const Players: Participant[] = RawParty.map((Entry: any) => ParticipantFrom(Entry, tx));
        if(new Set(Players.map((Player) => Player.phx_account_id)).size !== Players.length) throw new TrialsError(400, "party contains the same account more than once");

        const Category: TrialCategory = Body.category === undefined ? (Players.length === 1 ? "solo" : "group") : Body.category;
        if(Category !== "solo" && Category !== "group") throw new TrialsError(400, "category must be solo or group");
        if(Category === "solo" && Players.length !== 1) throw new TrialsError(400, "solo results must contain one player");
        if(Category === "group" && Players.length < 2) throw new TrialsError(400, "group results must contain at least two players");

        const PartyKey = Players.map((Player) => Player.phx_account_id).sort().join(",");
        const Inserted = tx.insert(trialsresults).values({
            submissionId: SubmissionId,
            requestHash: RequestHash,
            accountId: Players[0].phx_account_id,
            characterId: Players[0].character_id,
            rotationId: Rotation.rotationId,
            trialId: TrialId,
            difficulty: DifficultyValue,
            category: Category,
            completionTime: CompletionTime,
            objectivesCompleted: ObjectivesCompleted,
            sessionId: SessionId,
            partyKey: PartyKey,
            partyJson: JSON.stringify(Players),
            completedDate: CompletedDate
        }).returning({id: trialsresults.id}).get();

        const Rewards = ClaimRewards(tx, SubmissionId, Rotation.rotationId, DifficultyValue, CompletionTime, Players, CompletedDate);
        return {replayed: false, rewards: Rewards, resultId: Inserted.id};
    });
}

type BoardRequest = {difficulty: TrialDifficulty, requestedTrialId: string, expectedTrialId: string, page: number, pageSize: number};

function BoardRequestFrom(Body: any): BoardRequest {
    if(Body == null || typeof Body !== "object" || Array.isArray(Body)) throw new TrialsError(400, "leaderboard body must be an object");
    const difficulty = Difficulty(Body.difficulty);
    const expectedTrialId = GetCurrentTrialId(difficulty);
    const requestedTrialId = typeof Body.trial_id === "string" ? Body.trial_id : expectedTrialId;
    const page = Body.page === undefined ? 0 : Int(Body.page, "page", 0, 100000);
    const pageSize = Body.page_size === undefined ? 100 : Int(Body.page_size, "page_size", 1, 100);
    return {difficulty, requestedTrialId, expectedTrialId, page, pageSize};
}

function BestRows(DifficultyValue: TrialDifficulty, Category: TrialCategory){
    const RotationId = GetCurrentTrialsRotation().rotationId;
    const Rows = GetDb().select().from(trialsresults).where(and(
        eq(trialsresults.rotationId, RotationId),
        eq(trialsresults.difficulty, DifficultyValue),
        eq(trialsresults.category, Category)
    )).orderBy(asc(trialsresults.completionTime), asc(trialsresults.completedDate), asc(trialsresults.id)).all();

    const Seen = new Set<string>();
    return Rows.filter((Row) => {
        const Key = Category === "solo" ? Row.accountId : Row.partyKey;
        if(Seen.has(Key)) return false;
        Seen.add(Key);
        return true;
    });
}

function Party(Row: typeof trialsresults.$inferSelect): Participant[] {
    try { return JSON.parse(Row.partyJson) as Participant[]; } catch { return []; }
}

function SoloEntry(Row: typeof trialsresults.$inferSelect, Rank: number){
    const Player = Party(Row)[0];
    return {
        completion_time: Row.completionTime,
        objectives_completed: Row.objectivesCompleted,
        phx_account_id: Player?.phx_account_id ?? Row.accountId,
        platform: Player?.platform ?? "",
        platform_name: Player?.platform_name ?? Row.accountId,
        player_role_id: Player?.player_role_id ?? "",
        rank: Rank,
        session_id: Row.sessionId,
        trial_id: Row.trialId,
        weapon: Player?.weapon ?? 0,
        secondary_weapon: Player?.secondary_weapon ?? 0
    };
}

function GroupEntry(Row: typeof trialsresults.$inferSelect, Rank: number){
    return {
        completion_time: Row.completionTime,
        entries: Party(Row).map((Player) => ({
            phx_account_id: Player.phx_account_id,
            platform: Player.platform,
            platform_name: Player.platform_name,
            player_role_id: Player.player_role_id,
            weapon: Player.weapon,
            secondary_weapon: Player.secondary_weapon
        })),
        objectives_completed: Row.objectivesCompleted,
        rank: Rank,
        session_id: Row.sessionId,
        trial_id: Row.trialId
    };
}

function Entries(Request: BoardRequest, Category: TrialCategory){
    if(Request.requestedTrialId !== Request.expectedTrialId) return [];
    const Ranked = BestRows(Request.difficulty, Category).map((Row, Index) => Category === "solo" ? SoloEntry(Row, Index + 1) : GroupEntry(Row, Index + 1));
    return Ranked.slice(Request.page * Request.pageSize, (Request.page + 1) * Request.pageSize);
}

export function GetTrialsLeaderboard(Body: any, Category: TrialCategory){
    const Request = BoardRequestFrom(Body);
    return {
        code: null,
        message: "OK",
        payload: {
            difficulty: Request.difficulty,
            page: Request.page,
            page_size: Request.pageSize,
            trial_id: Request.requestedTrialId,
            entries: Entries(Request, Category)
        }
    };
}

export function GetTrialsLeaderboardAll(Body: any){
    const Request = BoardRequestFrom(Body);
    return {
        code: null,
        message: "OK",
        payload: {
            difficulty: Request.difficulty,
            guild: {},
            page: Request.page,
            page_size: Request.pageSize,
            trial_id: Request.requestedTrialId,
            world: {
                group: {difficulty: Request.difficulty, entries: Entries(Request, "group")},
                solo: {all: {difficulty: Request.difficulty, entries: Entries(Request, "solo")}}
            }
        }
    };
}

export function GetTrialsIndividual(Body: any, Category: TrialCategory){
    const Request = BoardRequestFrom(Body);
    const AccountId = Text(Body.phx_account_id, "phx_account_id");
    if(Request.requestedTrialId !== Request.expectedTrialId) return {code: null, message: "OK", payload: {}};

    const Ranked = BestRows(Request.difficulty, Category);
    const Index = Ranked.findIndex((Row) => Category === "solo" ? Row.accountId === AccountId : Party(Row).some((Player) => Player.phx_account_id === AccountId));
    if(Index < 0) return {code: null, message: "OK", payload: {}};

    const Entry: any = Category === "solo" ? SoloEntry(Ranked[Index], Index + 1) : GroupEntry(Ranked[Index], Index + 1);
    Entry.difficulty = String(Request.difficulty);
    return {code: null, message: "OK", payload: Entry};
}
