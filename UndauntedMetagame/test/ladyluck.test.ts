import { RemoveTestDb } from "./setup";
import "./authenv";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { Call, StartApp, StopApp } from "./appclient";
import { GetDb } from "../src/db";
import { inventory } from "../src/db/schema";
import { MakePlayer, StackQuantity } from "./helpers";
import LadyLuck from "../src/vendor/lady_luck_catalog.json";

const Database: any = require("better-sqlite3");

before(async () => StartApp());
after(async () => { await StopApp(); RemoveTestDb(() => GetDb().$client.close()); });
beforeEach(() => { delete process.env.STORE; });

function Credit(CharacterId: string, CatalogId: string, Quantity: number){
    const Row = GetDb().select().from(inventory).where(eq(inventory.characterId, CharacterId)).get();
    const Stacks = JSON.parse(Row?.stackedItems ?? "[]");
    const Found = Stacks.find((Item: any) => Item.catalogId === CatalogId);
    if(Found) Found.quantity += Quantity; else Stacks.push({catalogId: CatalogId, quantity: Quantity});
    if(Row) GetDb().update(inventory).set({stackedItems:JSON.stringify(Stacks)}).where(eq(inventory.characterId, CharacterId)).run();
    else GetDb().insert(inventory).values({characterId:CharacterId,instancedItems:"[]",stackedItems:JSON.stringify(Stacks)}).run();
}

function ItemHeld(CharacterId: string, CatalogId: string){
    const Row = GetDb().select().from(inventory).where(eq(inventory.characterId, CharacterId)).get();
    const All = [...JSON.parse(Row?.stackedItems ?? "[]"), ...JSON.parse(Row?.instancedItems ?? "[]")];
    return All.filter((Item: any) => Item.catalogId === CatalogId).length;
}

describe("Lady Luck Trials store", () => {
    it("lists the recovered priced catalogue even when the cosmetic free-store is off", async () => {
        const A = await MakePlayer();
        const Reply = await Call("GET", "/product/skus/public?requiredTags=ladyluckstore", {as:A.UserId});
        assert.equal(Reply.status, 200);
        assert.equal(Reply.json.length, LadyLuck.offers.length);
        assert.ok(Reply.json.every((Offer: any) => Number.isInteger(Offer.steelMarksPrice) !== Number.isInteger(Offer.gildedMarksPrice)));
        assert.equal((await Call("GET", "/product/skus/public?requiredTags=webstore", {as:A.UserId})).status, 400, "normal free-store remains opt-in");
    });

    it("charges Steel Marks atomically, grants once, and a retry is idempotent", async () => {
        const A = await MakePlayer();
        const Offer: any = LadyLuck.offers.find((O: any) => O.steelMarksPrice === 250)!;
        Credit(A.CharacterId, "CURRENCY_MARKS_STEEL", 300);

        const Token = (await Call("GET", `/token/markssteel/${Offer.id}`, {as:A.UserId})).json.purchaseToken;
        assert.equal((await Call("POST", `/notification/markssteel?token=${Token}`, {as:A.UserId})).status, 204);
        assert.equal((await Call("POST", `/notification/markssteel?token=${Token}`, {as:A.UserId})).status, 204);
        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_MARKS_STEEL"), 50);
        assert.equal(ItemHeld(A.CharacterId, Offer.items[0].catalogId), 1);

        const Balance = await Call("GET", "/balance", {as:A.UserId});
        assert.equal(Balance.json.CURRENCY_MARKS_STEEL, 50);
        assert.equal(Balance.json.id_currency_marks_steel, 50);

        const Reopened = new Database(process.env.DB_FILENAME!, {readonly:true});
        try{
            const Row = Reopened.prepare("select stackedItems, instancedItems from inventories where characterId = ?").get(A.CharacterId) as any;
            assert.ok((Row.stackedItems + Row.instancedItems).includes(Offer.items[0].catalogId));
        }
        finally{ Reopened.close(); }
    });

    it("supports Gilded Marks and rejects insufficient balance, wrong currency, and unknown SKU", async () => {
        const A = await MakePlayer();
        const Offer: any = LadyLuck.offers.find((O: any) => O.gildedMarksPrice === 500)!;
        Credit(A.CharacterId, "CURRENCY_MARKS_GILDED", 500);

        assert.equal((await Call("GET", `/token/markssteel/${Offer.id}`, {as:A.UserId})).status, 400);
        assert.equal((await Call("GET", "/token/marksgilded/not-a-real-ladyluck-sku", {as:A.UserId})).status, 404);

        const Token = (await Call("GET", `/token/marksgilded/${Offer.id}`, {as:A.UserId})).json.purchaseToken;
        assert.equal((await Call("POST", `/notification/marksgilded?token=${Token}`, {as:A.UserId})).status, 204);
        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_MARKS_GILDED"), 0);

        const Other: any = LadyLuck.offers.find((O: any) => O.gildedMarksPrice === 1000)!;
        assert.equal((await Call("GET", `/token/marksgilded/${Other.id}`, {as:A.UserId})).status, 409);
    });
});
