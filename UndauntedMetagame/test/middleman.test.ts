import { RemoveTestDb } from "./setup";
import "./authenv";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { GetDb } from "../src/db";
import { inventory } from "../src/db/schema";
import { RunInventoryTransaction } from "../src/controllers/inventory";
import { MakePlayer, StackQuantity } from "./helpers";

const Database: any = require("better-sqlite3");
let N = 0;
const Id = (Prefix: string) => `${Prefix}-${process.pid}-${++N}`;
const Cell = (CatalogId: string, InstanceId: string, UpdateVersion = 0) => ({catalogId: CatalogId, instanceId: InstanceId, updateVersion: UpdateVersion});
const Token = (InstanceId: string, SlotID: number, UpdateVersion = 0, EndTime = "2099-01-01T00:00:00.000Z") => ({
    catalogId: "TOKEN_CELL_EXCHANGE", instanceId: InstanceId, updateVersion: UpdateVersion,
    itemData: JSON.stringify({SlotID, EndTime, ResultCell: "CELL_RESULT_3", ExchangeID: InstanceId})
});

async function Txn(UserId: string, CharacterId: string, TransactionId: string, Fields: any, Caller: "admin" | "gameserver" | "client" = "gameserver"){
    return RunInventoryTransaction(UserId, CharacterId, TransactionId,
        Fields.addI ?? [], Fields.addS ?? [], Fields.removeI ?? [], Fields.removeS ?? [], Fields.saveI ?? [],
        {Caller, Source: "middleman-test"});
}

function Instanced(CharacterId: string){
    const Row = GetDb().select().from(inventory).where(eq(inventory.characterId, CharacterId)).get();
    return JSON.parse(Row?.instancedItems ?? "[]") as any[];
}

after(() => RemoveTestDb(() => GetDb().$client.close()));

describe("Middleman inventory contract", () => {
    it("commits source cells into a persistent slot and prevents duplicate slots", async () => {
        const A = await MakePlayer();
        await Txn(A.UserId, A.CharacterId, Id("seed"), {addI: [Cell("CELL_POWER_1", "cell-a"), Cell("CELL_POWER_1", "cell-b"), Cell("CELL_TECHNIQUE_1", "cell-c")]}, "admin");

        const Started = await Txn(A.UserId, A.CharacterId, Id("start"), {
            removeI: [Cell("CELL_POWER_1", "cell-a", 1), Cell("CELL_POWER_1", "cell-b", 1)],
            addI: [Token("exchange-0", 0)]
        });
        assert.ok(Started.success);
        assert.deepEqual(Instanced(A.CharacterId).map((I) => I.instanceId).sort(), ["cell-c", "exchange-0"]);

        const Reopened = new Database(process.env.DB_FILENAME!, {readonly: true});
        try{
            const Row = Reopened.prepare("select instancedItems from inventories where characterId = ?").get(A.CharacterId) as any;
            assert.ok(JSON.parse(Row.instancedItems).some((I: any) => I.instanceId === "exchange-0"), "exchange token survives a new database connection");
        }
        finally{ Reopened.close(); }

        const Duplicate = await Txn(A.UserId, A.CharacterId, Id("dupeslot"), {
            removeI: [Cell("CELL_TECHNIQUE_1", "cell-c", 1)],
            addI: [Token("exchange-other", 0)]
        });
        assert.deepEqual(Duplicate, {success: false, error: "conflict"});
        assert.ok(Instanced(A.CharacterId).some((I) => I.instanceId === "cell-c"), "failed exchange rolled source cell back");
    });

    it("spends speed-up tokens strictly and never goes negative", async () => {
        const A = await MakePlayer();
        await Txn(A.UserId, A.CharacterId, Id("seed"), {addI: [Cell("CELL_POWER_1", "cell-a")], addS: [{catalogId:"CURRENCY_TOKEN_EXCHANGE_SPEED_UP", quantity:1}]}, "admin");
        await Txn(A.UserId, A.CharacterId, Id("start"), {removeI:[Cell("CELL_POWER_1","cell-a",1)], addI:[Token("exchange-0",0)]});

        const TooMuch = await Txn(A.UserId, A.CharacterId, Id("speedbad"), {
            removeS:[{catalogId:"CURRENCY_TOKEN_EXCHANGE_SPEED_UP", quantity:2}],
            saveI:[Token("exchange-0",0,1,"2098-01-01T00:00:00.000Z")]
        });
        assert.deepEqual(TooMuch, {success:false,error:"insufficient_quantity"});
        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_TOKEN_EXCHANGE_SPEED_UP"), 1);

        const Ok = await Txn(A.UserId, A.CharacterId, Id("speed"), {
            removeS:[{catalogId:"CURRENCY_TOKEN_EXCHANGE_SPEED_UP", quantity:1}],
            saveI:[Token("exchange-0",0,1,"2000-01-01T00:00:00.000Z")]
        });
        assert.ok(Ok.success);
        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_TOKEN_EXCHANGE_SPEED_UP"), 0);
    });

    it("claims exactly once even across a retry with a different transaction id", async () => {
        const A = await MakePlayer();
        await Txn(A.UserId, A.CharacterId, Id("seed"), {addI:[Cell("CELL_POWER_1","cell-a")]}, "admin");
        await Txn(A.UserId, A.CharacterId, Id("start"), {removeI:[Cell("CELL_POWER_1","cell-a",1)], addI:[Token("exchange-0",0)]});

        const ClaimId = Id("claim");
        const ClaimFields = {removeI:[Token("exchange-0",0,1)], addI:[Cell("CELL_RESULT_3","result-0")]};
        const First = await Txn(A.UserId, A.CharacterId, ClaimId, ClaimFields);
        const Retry = await Txn(A.UserId, A.CharacterId, ClaimId, ClaimFields);
        assert.ok(First.success && Retry.success && Retry.data?.replayed);
        assert.equal(Instanced(A.CharacterId).filter((I) => I.catalogId === "CELL_RESULT_3").length, 1);

        const Other = await Txn(A.UserId, A.CharacterId, Id("claim-again"), {removeI:[Token("exchange-0",0,2)], addI:[Cell("CELL_RESULT_3","result-1")]});
        assert.deepEqual(Other, {success:false,error:"conflict"});
        assert.equal(Instanced(A.CharacterId).filter((I) => I.catalogId === "CELL_RESULT_3").length, 1);
    });

    it("dust salvage consumes a real cell and is idempotent", async () => {
        const A = await MakePlayer();
        await Txn(A.UserId, A.CharacterId, Id("seed"), {addI:[Cell("CELL_DEFENCE_1","dust-me")]}, "admin");
        const SalvageId = Id("dust");
        const Fields = {removeI:[Cell("CELL_DEFENCE_1","dust-me",1)], addS:[{catalogId:"CURRENCY_CELLDUST", quantity:20}]};
        const First = await Txn(A.UserId, A.CharacterId, SalvageId, Fields);
        const Retry = await Txn(A.UserId, A.CharacterId, SalvageId, Fields);
        assert.ok(First.success && Retry.success && Retry.data?.replayed);
        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_CELLDUST"), 20);

        const Missing = await Txn(A.UserId, A.CharacterId, Id("dust-missing"), {removeI:[Cell("CELL_DEFENCE_1","nope",1)], addS:[{catalogId:"CURRENCY_CELLDUST",quantity:20}]});
        assert.deepEqual(Missing, {success:false,error:"conflict"});
        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_CELLDUST"), 20);
    });

    it("ordinary player inventory calls cannot mint Cells, exchange state, dust, speed tokens or Marks", async () => {
        const A = await MakePlayer();
        for(const Fields of [
            {addI:[Cell("CELL_POWER_3","cheat-cell")]},
            {addI:[Token("cheat-exchange",0)]},
            {addS:[{catalogId:"CURRENCY_CELLDUST",quantity:999}]},
            {addS:[{catalogId:"CURRENCY_TOKEN_EXCHANGE_SPEED_UP",quantity:999}]},
            {addS:[{catalogId:"CURRENCY_MARKS_STEEL",quantity:999}]},
            {addS:[{catalogId:"CURRENCY_MARKS_GILDED",quantity:999}]}
        ]){
            const Reply = await Txn(A.UserId, A.CharacterId, Id("client"), Fields, "client");
            assert.deepEqual(Reply, {success:false,error:"forbidden"});
        }
    });
});
