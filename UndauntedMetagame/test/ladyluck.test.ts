import { RemoveTestDb } from "./setup";
import "./authenv";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { Call, StartApp, StopApp } from "./appclient";
import { GetDb } from "../src/db";
import { inventory } from "../src/db/schema";
import { CreateStorePurchase, GetStoreOffer, GrantKind, ListStoreOffers, RedeemStorePurchase } from "../src/controllers/freestore";
import { MakePlayer, StackQuantity } from "./helpers";
import { GrantEntitlementInTx } from "../src/controllers/entitlements";
import { TRIALS_CHAMPION_ENTITLEMENT } from "../src/controllers/trials";

before(async () => {
    await StartApp();
});

after(async () => {
    await StopApp();
    RemoveTestDb(() => GetDb().$client.close());
});

beforeEach(() => {
    process.env.STORE = "off";
    process.env.TRIALS_STORE = "1";
    process.env.MIDDLEMAN_STORE = "0";
});

function Credit(CharacterId: string, CatalogId: string, Quantity: number){
    GetDb().insert(inventory).values({
        characterId: CharacterId,
        instancedItems: "[]",
        stackedItems: JSON.stringify([{catalogId: CatalogId, quantity: Quantity}])
    }).onConflictDoUpdate({
        target: inventory.characterId,
        set: {stackedItems: JSON.stringify([{catalogId: CatalogId, quantity: Quantity}])}
    }).run();
}

function ReadInstanced(CharacterId: string){
    const Row = GetDb().select().from(inventory).where(eq(inventory.characterId, CharacterId)).get();
    return JSON.parse(Row?.instancedItems ?? "[]") as any[];
}

function Buy(UserId: string, Currency: string, Sku: string){
    const Token = CreateStorePurchase(UserId, Currency, Sku).purchaseToken;
    return RedeemStorePurchase(UserId, Currency, Token);
}

describe("Lady Luck Trials store", () => {
    it("uses the 1.4.4 flat-price shape and hides Champion gear until leaderboard placement is earned", async () => {
        const A = await MakePlayer();
        const Offers = ListStoreOffers(A.UserId, "ladyluckstore");

        assert.equal(Offers.length, 22);
        assert.ok(Offers.every((Offer) => !Object.prototype.hasOwnProperty.call(Offer, "prices")));
        assert.ok(Offers.every((Offer) => Number.isInteger(Offer.steelMarksPrice) !== Number.isInteger(Offer.gildedMarksPrice)));
        assert.equal(GetStoreOffer(A.UserId, "ladyluck_weapon_strikers_normal").gildedMarksPrice, 500);
        assert.equal(GetStoreOffer(A.UserId, "ladyluck_cb_passive_trials_02").steelMarksPrice, 250);
        assert.throws(() => GetStoreOffer(A.UserId, "ladyluck_weapon_strikers_prestige"), {Status: 404});
        assert.throws(() => CreateStorePurchase(A.UserId, "marksgilded", "ladyluck_weapon_strikers_prestige"), {Status: 404});

        GetDb().transaction((tx) => GrantEntitlementInTx(tx, A.UserId, TRIALS_CHAMPION_ENTITLEMENT, 0, "test"));
        assert.equal(ListStoreOffers(A.UserId, "ladyluckstore").length, 36);
        assert.equal(GetStoreOffer(A.UserId, "ladyluck_weapon_strikers_prestige").gildedMarksPrice, 1000);
    });

    it("uses captured instanced-vs-stacked grant kinds instead of guessing from prefixes", () => {
        assert.equal(GrantKind("WP_AC_TRIALS_00"), "instanced");
        assert.equal(GrantKind("AR_TRIALS_CHEST_00"), "instanced");
        assert.equal(GrantKind("CONTAINER_CORE_GOLD_POWER_CELLCORE"), "stacked");
        assert.equal(GrantKind("QI_LANTERN_POTION"), "stacked");
        assert.equal(GrantKind("PR_FRANK"), "instanced");
    });

    it("charges Gilded Marks once, grants an instanced cosmetic once, and then marks it owned", async () => {
        const A = await MakePlayer();
        Credit(A.CharacterId, "CURRENCY_MARKS_GILDED", 700);

        const Token = CreateStorePurchase(A.UserId, "CURRENCY_MARKS_GILDED", "ladyluck_weapon_strikers_normal").purchaseToken;
        const First = RedeemStorePurchase(A.UserId, "CURRENCY_MARKS_GILDED", Token);
        const Retry = RedeemStorePurchase(A.UserId, "CURRENCY_MARKS_GILDED", Token);

        assert.equal(First.Replayed, false);
        assert.equal(Retry.Replayed, true);
        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_MARKS_GILDED"), 200);
        assert.equal(ReadInstanced(A.CharacterId).filter((Item) => Item.catalogId === "WP_AC_TRIALS_00").length, 1);
        assert.equal(GetStoreOffer(A.UserId, "ladyluck_weapon_strikers_normal").remaining, 0);
        assert.throws(() => CreateStorePurchase(A.UserId, "marksgilded", "ladyluck_weapon_strikers_normal"), {Status: 409});
    });

    it("keeps the 1.4.4-era uncommon core repeatable and excludes proven later store additions", async () => {
        const A = await MakePlayer();
        Credit(A.CharacterId, "CURRENCY_MARKS_STEEL", 300);

        Buy(A.UserId, "markssteel", "ladyluck_core_silver_slayer");
        Buy(A.UserId, "CURRENCY_MARKS_STEEL", "ladyluck_core_silver_slayer");

        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_MARKS_STEEL"), 0);
        assert.equal(StackQuantity(A.CharacterId, "CONTAINER_CORE_SILVER_CELLCORE"), 2);
        assert.equal(GetStoreOffer(A.UserId, "ladyluck_core_silver_slayer").remaining, 1);

        for(const Sku of [
            "ladyluck_bundle_consumables_00",
            "ladyluck_bundle_consumables_01",
            "trials_cell_core_gold_defence",
            "trials_cell_core_gold_power",
            "trials_cell_core_gold_technique",
            "trials_cell_core_gold_mobility",
            "trials_cell_core_gold_utility"
        ]){
            assert.throws(() => GetStoreOffer(A.UserId, Sku), {Status: 404});
        }
    });

    it("charges Steel Marks for one-time gameplay rewards", async () => {
        const A = await MakePlayer();
        Credit(A.CharacterId, "CURRENCY_MARKS_STEEL", 300);

        Buy(A.UserId, "CURRENCY_MARKS_STEEL", "ladyluck_cb_passive_trials_02");

        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_MARKS_STEEL"), 50);
        assert.equal(StackQuantity(A.CharacterId, "PART_CB_PASSIVE_TRIALS_02"), 1);
        assert.equal(GetStoreOffer(A.UserId, "ladyluck_cb_passive_trials_02").remaining, 0);
    });

    it("uses its priced routes while the unrelated free cosmetic store stays off", async () => {
        const A = await MakePlayer();

        const Listed = await Call("GET", "/product/skus/public?requiredTags=ladyluckstore", {as: A.UserId});
        assert.equal(Listed.status, 200);
        assert.equal(Listed.json.length, 22);

        const Single = await Call("GET", "/product/sku/ladyluck_cb_passive_trials_02", {as: A.UserId});
        assert.equal(Single.status, 200);
        assert.equal(Single.json.steelMarksPrice, 250);

        const WebStore = await Call("GET", "/product/skus/public?requiredTags=webstore", {as: A.UserId});
        assert.equal(WebStore.status, 400);
    });

    it("is hidden behind TRIALS_STORE without exposing single-offer purchases", async () => {
        const A = await MakePlayer();
        process.env.TRIALS_STORE = "0";

        assert.deepEqual(ListStoreOffers(A.UserId, "ladyluckstore"), []);
        assert.throws(() => GetStoreOffer(A.UserId, "ladyluck_weapon_strikers_normal"), {Status: 404});
        assert.throws(() => CreateStorePurchase(A.UserId, "marksgilded", "ladyluck_weapon_strikers_normal"), {Status: 404});
    });
});
