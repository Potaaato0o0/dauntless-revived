// Ported from Harmonicrain/Undaunted (895f7c7), Copyright (C) 2026 Harmonic, AGPL-3.0-only; modified for Dauntless Revived.

import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import { GetDb } from "../db";
import { characters, inventory, storepurchases } from "../db/schema";
import { logger } from "../logger";
import { StoreRepeatableTokens } from "../features";
import catalog from "../vendor/store_catalog.json";
import itemKinds from "../vendor/store_item_kinds.json";
import { GetActiveCharacter } from "./activecharacter";
import { GrantEntitlementInTx, HasActiveEntitlement } from "./entitlements";
import { ApplyInventoryTransactionInTx, InventoryErrorOf } from "./inventory";
import { Tx } from "./savehistory";

// The free store (roadmap 3.7, STORE=free). The client's flow (0x140b39657, 0x140b55011):
// - GET /product/skus/public?requiredTags=<tag>: the offers of one tag (the storefront is "webstore"),
//   each with "remaining" (0 once everything it grants is owned);
// - GET /product/sku/<sku>: one offer, for the purchase dialog;
// - GET /token/<currency>/<sku>: a purchase token for that offer;
// - POST /notification/<currency>?token=<token>: confirms the purchase, and the grant happens here.
// Nothing the client sends decides what is granted or what it costs: the offer comes from
// vendor/store_catalog.json, and only free offers (platinumPrice 0) in platinum are sold.
//
// Differences from Harmonic's freeStore.ts: an account may hold several characters, so a token is bound
// to the account's active character when it is issued (that fork refused accounts with more than one); items
// go through our inventory core (the ledger, inventorylog with caller "store"), entitlements through
// GrantEntitlementInTx (source "store:<sku>"), ownership through HasActiveEntitlement (a revoked
// entitlement can be bought again; the default Elite pass reads as owned); the bounty-token bundle is
// sold only with STORE_REPEATABLE_TOKENS=1; the rank-skip offer is not in the catalogue.

export class StoreError extends Error {
    constructor(public Status: number, message: string){
        super(message);
        this.name = "StoreError";
    }
}

type StoreItem = { catalogId: string, quantity: number };
type StoreGrant = { name: string, duration?: number };
export type StoreOffer = { id: string, tags: string[], platinumPrice: number, items: StoreItem[] | null, entitlements: StoreGrant[] | null, remaining: number, [Field: string]: unknown };

const PURCHASE_TOKEN_MINUTES = 10;

// Purchase tokens one account may be issued in a sliding window (counted from its storepurchases rows,
// through the account index), whatever became of them: room for a player buying one cosmetic after
// another, not for a script
export const MAX_TOKENS_PER_WINDOW = 60;
export const TOKEN_WINDOW_MS = 10 * 60 * 1000;
// A redeemed row is the receipt a retried redeem is answered from. The grant itself stays in inventorylog
// (kept forever) and entitlements, so the receipt goes after this many days.
export const RECEIPT_DAYS = 30;
// The sweep over the whole table (expired tokens never redeemed, old receipts): at boot, then at most once
// this often, when a token is issued
const SWEEP_EVERY_MS = 60 * 60 * 1000;
let LastSweep = 0;
let TokenLimit = MAX_TOKENS_PER_WINDOW;

// Tests only: another token limit (undefined: the real one)
export function SetStoreTokenLimitForTests(Limit?: number){
    TokenLimit = Limit ?? MAX_TOKENS_PER_WINDOW;
}

const Catalog = catalog as unknown as Record<string, unknown>;

// Every offer under every tag (keys starting with _ are notes)
const CatalogTags = Object.keys(Catalog).filter((Key) => !Key.startsWith("_") && Array.isArray(Catalog[Key]));
const AllOffers = CatalogTags.flatMap((Tag) => Catalog[Tag] as StoreOffer[]);

// Which items the store may hand out at all: cosmetics, and the repeatable consumable. Anything else
// (currencies, boosts, weapons proper) is refused even if an offer lists it.
const COSMETIC_PREFIXES = ["AR_", "WP_", "EM_", "DYE_", "QI_FLARE_", "BNC_FABRIC_", "BNC_STANDARD_", "BNC_SIGIL_", "LT_"];

// Consumables that may be bought any number of times: TOKEN_BOUNTY_DRAFT_PREMIUM is the
// premium_bounty_token_id of /bounty/game-data, the kind that persists into the next season.
const REPEATABLE_ITEMS = new Set(["TOKEN_BOUNTY_DRAFT_PREMIUM"]);

// How each item is granted, from the stackable flag of the client's item catalogue (a prefix rule got
// individual items wrong: most weapon skins and a few arrivals are instanced, a few fabrics and lanterns
// stacked).
const ITEM_KINDS = itemKinds as unknown as Record<string, string>;

const Hash = (Value: string) => createHash("sha256").update(Value).digest("hex");
const OfferHash = (Offer: StoreOffer) => Hash(JSON.stringify(Offer));

export function GrantKind(CatalogId: string): "stacked" | "instanced" | undefined {
    if(!REPEATABLE_ITEMS.has(CatalogId) && !COSMETIC_PREFIXES.some((Prefix) => CatalogId.startsWith(Prefix))){
        return undefined;
    }

    const Kind = ITEM_KINDS[CatalogId];

    return Kind === "stacked" || Kind === "instanced" ? Kind : undefined;
}

// A repeatable offer sells consumables only; it is never "owned", and each purchase grants its full quantity
function IsRepeatable(Offer: StoreOffer){
    const Items = Offer.items ?? [];

    return Items.length > 0 && Items.every((Item) => REPEATABLE_ITEMS.has(Item.catalogId));
}

function IsListed(Offer: StoreOffer){
    return !IsRepeatable(Offer) || StoreRepeatableTokens();
}

function FindOffer(SkuId: string){
    return AllOffers.find((Offer) => Offer.id === SkuId && IsListed(Offer));
}

// Free offers only, of permanent cosmetics, repeatable consumables and entitlements
function CheckOffer(Offer: StoreOffer){
    const Items = Offer.items ?? [];
    const Grants = Offer.entitlements ?? [];

    if(Offer.platinumPrice !== 0){
        throw new StoreError(409, "Offer is not free");
    }

    if(Items.length === 0 && Grants.length === 0){
        throw new StoreError(409, "Offer grants nothing");
    }

    const Repeatable = IsRepeatable(Offer);

    if(Repeatable && Grants.length > 0){
        throw new StoreError(409, "Repeatable offers cannot grant entitlements");
    }

    const Unsupported = Items.some((Item) => GrantKind(Item.catalogId) === undefined ||
        REPEATABLE_ITEMS.has(Item.catalogId) !== Repeatable ||
        (Repeatable ? GrantKind(Item.catalogId) !== "stacked" || !Number.isSafeInteger(Item.quantity) || Item.quantity <= 0 : Item.quantity !== 1));

    if(Unsupported){
        throw new StoreError(409, "Offer is not a supported free item");
    }

    if(Grants.some((Grant) => typeof Grant.name !== "string" || Grant.name.length === 0 || (Grant.duration !== undefined && (!Number.isSafeInteger(Grant.duration) || Grant.duration < 0)))){
        throw new StoreError(409, "Offer has an unusable entitlement");
    }
}

function CheckCurrency(Currency: string){
    if(Currency !== "platinum"){
        throw new StoreError(400, "Unsupported store currency");
    }
}

// Every catalogue id the character holds, stacked (quantity above 0) or instanced
function HeldCatalogIds(tx: Tx, CharacterId: string | undefined){
    const Held = new Set<string>();

    if(CharacterId == undefined){
        return Held;
    }

    const Row = tx.select().from(inventory).where(eq(inventory.characterId, CharacterId)).get();

    for(const Stack of JSON.parse(Row?.stackedItems ?? "[]") as any[]){
        if(typeof Stack?.catalogId === "string" && Number(Stack.quantity) > 0){
            Held.add(Stack.catalogId);
        }
    }

    for(const Instance of JSON.parse(Row?.instancedItems ?? "[]") as any[]){
        if(typeof Instance?.catalogId === "string"){
            Held.add(Instance.catalogId);
        }
    }

    return Held;
}

// Owned when everything it grants is held: all of its items and all of its entitlements (active ones:
// a revoked or expired entitlement can be bought again)
function WithRemaining(tx: Tx, AccountId: string, Held: Set<string>, Offer: StoreOffer): StoreOffer {
    if(IsRepeatable(Offer)){
        return {...Offer, remaining: 1};
    }

    const Items = Offer.items ?? [];
    const Grants = Offer.entitlements ?? [];
    const Owned = (Items.length > 0 || Grants.length > 0)
        && Items.every((Item) => Held.has(Item.catalogId))
        && Grants.every((Grant) => HasActiveEntitlement(tx, AccountId, Grant.name));

    return {...Offer, remaining: Owned ? 0 : 1};
}

// GET /product/skus/public?requiredTags=<tag>. An unknown tag is an empty list.
export function ListStoreOffers(AccountId: string, Tag: string): StoreOffer[] {
    const ForTag = CatalogTags.includes(Tag) ? (Catalog[Tag] as StoreOffer[]).filter(IsListed) : [];

    return GetDb().transaction((tx) => {
        const Held = HeldCatalogIds(tx, GetActiveCharacter(tx, AccountId)?.characterId);

        return ForTag.map((Offer) => WithRemaining(tx, AccountId, Held, Offer));
    });
}

export function IsKnownStoreTag(Tag: string){
    return CatalogTags.includes(Tag);
}

// GET /product/sku/<sku>, from any tag (the Elite pass is under season09b_pass)
export function GetStoreOffer(AccountId: string, SkuId: string): StoreOffer {
    const Offer = FindOffer(SkuId);

    if(Offer == undefined){
        throw new StoreError(404, "Unknown store offer");
    }

    return GetDb().transaction((tx) => WithRemaining(tx, AccountId, HeldCatalogIds(tx, GetActiveCharacter(tx, AccountId)?.characterId), Offer));
}

// The whole table: tokens past their expiry that were never redeemed, and receipts redeemed more than
// RECEIPT_DAYS ago (at boot, then at most once an hour from CreateStorePurchase)
export function PruneExpiredStorePurchases(){
    const Now = Date.now();

    LastSweep = Now;

    const Expired = GetDb().delete(storepurchases)
        .where(and(isNull(storepurchases.redeemedDate), lt(storepurchases.expiresDate, new Date(Now).toISOString()))).returning().all().length;
    const Receipts = GetDb().delete(storepurchases)
        .where(and(isNotNull(storepurchases.redeemedDate), lt(storepurchases.redeemedDate, new Date(Now - RECEIPT_DAYS * 24 * 60 * 60 * 1000).toISOString()))).returning().all().length;

    if(Expired > 0){
        logger.info(`Removed ${Expired} expired store purchase token(s) that were never redeemed`);
    }

    if(Receipts > 0){
        logger.info(`Removed ${Receipts} store purchase receipt(s) redeemed more than ${RECEIPT_DAYS} days ago`);
    }

    return {Expired, Receipts};
}

// GET /token/<currency>/<sku>: a 64-hex purchase token, bound to the account's active character and to
// the offer as it is now; valid for 10 minutes. Refused (409) for an offer the account already owns (the
// repeatable bundle is never owned) and past MAX_TOKENS_PER_WINDOW tokens in TOKEN_WINDOW_MS.
export function CreateStorePurchase(AccountId: string, Currency: string, SkuId: string){
    CheckCurrency(Currency);

    const Offer = FindOffer(SkuId);

    if(Offer == undefined){
        throw new StoreError(404, "Unknown store offer");
    }

    CheckOffer(Offer);

    if(Date.now() - LastSweep >= SWEEP_EVERY_MS){
        PruneExpiredStorePurchases();
    }

    const Token = randomBytes(32).toString("hex");

    const CharacterId = GetDb().transaction((tx) => {
        const Now = new Date();

        // This account's own expired tokens, through the account index
        tx.delete(storepurchases)
            .where(and(eq(storepurchases.accountId, AccountId), isNull(storepurchases.redeemedDate), lt(storepurchases.expiresDate, Now.toISOString()))).run();

        const Character = GetActiveCharacter(tx, AccountId);

        if(Character == undefined){
            throw new StoreError(409, "The account has no character to deliver the purchase to");
        }

        if(WithRemaining(tx, AccountId, HeldCatalogIds(tx, Character.characterId), Offer).remaining === 0){
            throw new StoreError(409, "You already own everything this offer grants");
        }

        const Recent = tx.select({ Issued: count() }).from(storepurchases)
            .where(and(eq(storepurchases.accountId, AccountId), gt(storepurchases.createdDate, new Date(Now.getTime() - TOKEN_WINDOW_MS).toISOString()))).get()?.Issued ?? 0;

        if(Recent >= TokenLimit){
            throw new StoreError(409, `Too many purchases: at most ${TokenLimit} in ${TOKEN_WINDOW_MS / 60000} minutes`);
        }

        tx.insert(storepurchases).values({
            tokenHash: Hash(Token),
            accountId: AccountId,
            characterId: Character.characterId,
            skuId: SkuId,
            offerHash: OfferHash(Offer),
            createdDate: Now.toISOString(),
            expiresDate: new Date(Now.getTime() + PURCHASE_TOKEN_MINUTES * 60 * 1000).toISOString(),
            redeemedDate: null
        }).run();

        return Character.characterId;
    });

    logger.info(`Store purchase token for ${SkuId} issued to ${AccountId} (character ${CharacterId})`);

    return {purchaseToken: Token};
}

// POST /notification/<currency>?token=<token>: the grant and the receipt in one transaction. A token
// that was already redeemed answers again and grants nothing (a retry after a lost answer).
export function RedeemStorePurchase(AccountId: string, Currency: string, Token: unknown){
    if(Currency !== "platinum" || typeof Token !== "string" || !/^[a-f0-9]{64}$/.test(Token)){
        throw new StoreError(400, "Invalid purchase token or currency");
    }

    const TokenHash = Hash(Token);

    const Result = GetDb().transaction((tx) => {
        const Purchase = tx.select().from(storepurchases).where(eq(storepurchases.tokenHash, TokenHash)).get();

        if(Purchase == undefined || Purchase.accountId !== AccountId){
            throw new StoreError(403, "Invalid purchase token");
        }

        const Character = tx.select({userId: characters.userId}).from(characters).where(eq(characters.characterId, Purchase.characterId)).get();

        if(Character == undefined || Character.userId !== AccountId){
            throw new StoreError(403, "The purchase's character is no longer the account's");
        }

        if(Purchase.redeemedDate != null){
            return {Replayed: true, SkuId: Purchase.skuId, CharacterId: Purchase.characterId, Items: 0, Entitlements: 0};
        }

        if(Purchase.expiresDate < new Date().toISOString()){
            throw new StoreError(410, "Purchase token expired");
        }

        const Offer = FindOffer(Purchase.skuId);

        if(Offer == undefined){
            throw new StoreError(409, "Offer is no longer sold; request a new token");
        }

        CheckOffer(Offer);

        if(OfferHash(Offer) !== Purchase.offerHash){
            throw new StoreError(409, "Offer changed; request a new token");
        }

        // Cosmetics are unlocks: something the character already holds is not granted again (overlapping
        // bundles, a second token). The repeatable consumable grants its full quantity every time.
        const Held = HeldCatalogIds(tx, Purchase.characterId);
        const ToGrant = IsRepeatable(Offer) ? (Offer.items ?? []) : (Offer.items ?? []).filter((Item) => !Held.has(Item.catalogId));

        const Stacked = ToGrant.filter((Item) => GrantKind(Item.catalogId) === "stacked")
            .map((Item) => ({catalogId: Item.catalogId, quantity: Item.quantity}));

        // Instanced items need an id; derived from the token, a retried redeem names the same instance
        const Instanced = ToGrant.filter((Item) => GrantKind(Item.catalogId) === "instanced")
            .map((Item) => ({catalogId: Item.catalogId, instanceId: Hash(`${TokenHash}:${Item.catalogId}`).slice(0, 32), updateVersion: 0}));

        if(Stacked.length > 0 || Instanced.length > 0){
            try{
                ApplyInventoryTransactionInTx(tx, {
                    UserId: AccountId,
                    CharacterId: Purchase.characterId,
                    TransactionId: `store:${TokenHash}`,
                    InstancedItemsToAdd: Instanced,
                    StackedItemsToAdd: Stacked
                }, {Caller: "store", Source: `store:${Purchase.skuId}`});
            }
            catch(error){
                if(InventoryErrorOf(error) !== undefined){
                    throw new StoreError(409, `The inventory refused the grant: ${(error as Error).message}`);
                }

                throw error;
            }
        }

        const Grants = Offer.entitlements ?? [];

        for(const Grant of Grants){
            GrantEntitlementInTx(tx, AccountId, Grant.name, Grant.duration ?? 0, `store:${Purchase.skuId}`);
        }

        tx.update(storepurchases).set({redeemedDate: new Date().toISOString()}).where(eq(storepurchases.tokenHash, TokenHash)).run();

        return {Replayed: false, SkuId: Purchase.skuId, CharacterId: Purchase.characterId, Items: Stacked.length + Instanced.length, Entitlements: Grants.length};
    }, {behavior: "immediate"});

    logger.info(Result.Replayed
        ? `Store purchase ${Result.SkuId} of ${AccountId} was already redeemed; nothing granted again`
        : `Store purchase ${Result.SkuId} for ${AccountId} (character ${Result.CharacterId}): ${Result.Items} item(s), ${Result.Entitlements} entitlement(s)`);

    return Result;
}
