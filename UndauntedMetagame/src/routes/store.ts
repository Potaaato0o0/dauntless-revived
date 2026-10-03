import { Router } from "express";
import { logger } from "../logger";
import { HasUndauntedMetagameAuth } from "../middleware/HasUndauntedMetagameAuth";
import { GetHeldCurrencies, GetNotesForUser, OverlayHeldCurrencies } from "../controllers/store";
import { PlayerTokenOnly } from "../middleware/PlayerAuth";
import { CreateStorePurchase, GetStoreOffer, IsKnownStoreTag, ListStoreOffers, RedeemStorePurchase, StoreError } from "../controllers/freestore";
import { BalanceFromInventory, StoreMode } from "../features";

export const storeRouter = Router();

// BALANCE_FROM_INVENTORY=1 (the default; roadmap 2.17): the currencies the account's active character
// holds replace the sheet's fixed values (controllers/store.ts). Off: the fixed sheet, as before. The
// idea is from Harmonic's fork (github.com/Harmonicrain/Undaunted 895f7c7), without its wallet table.
function ApplyHeldCurrencies(AccountId: unknown, Sheet: Record<string, unknown>){
    if(!BalanceFromInventory() || typeof AccountId !== "string"){
        return;
    }

    const { CharacterId, Held } = GetHeldCurrencies(AccountId);
    const Changed = OverlayHeldCurrencies(Sheet, Held);

    if(Changed.length > 0){
        logger.info(`Balances of ${AccountId} from the inventory of character ${CharacterId}: ${Changed.map((Key) => `${Key} ${Sheet[Key]}`).join(", ")}`);
    }
}

storeRouter.post("/reconcile", HasUndauntedMetagameAuth, async (req: any, res) => {
    const Notes = await GetNotesForUser(req.AuthData.userId);

    logger.info(`Retrieved notes balance of ${Notes} for ${req.AuthData.userId}`);

    const Balances: Record<string, unknown> = {
        id_currency_notes: Notes,
        CURRENCY_NOTES: Notes
    };

    ApplyHeldCurrencies(req.AuthData.userId, Balances);

    res.status(200);
    res.json({
        balances: Balances,
        refreshInventory: true
    });
});

storeRouter.get("/creator", HasUndauntedMetagameAuth, async (req: any, res) => {
    logger.info("SupportACreator (stubbed)");

    res.status(200);
    res.json({
        "expirationDate": "2099-01-01T01:00:00.041Z",
        "slug": "MROWMROW",
        "success": true
    });
})

storeRouter.get("/balance", HasUndauntedMetagameAuth, async (req: any, res) => {
    const UserId = req.AuthData.userId;

    const NotesBalance = await GetNotesForUser(UserId);

    logger.info(`Fetched notes balance of ${NotesBalance} for userId ${UserId}`);

    const Sheet: Record<string, unknown> = {
        id_currency_s20_coin: 0,
        CURRENCY_GAUNTLET_COIN_FADED: 0,
        CURRENCY_S20_COIN: 0,
        CURRENCY_S18_COIN: 0,
        id_currency_seasonal_coin: 0,
        id_currency_s18_coin: 0,
        id_currency_weapon_token: 25,
        id_currency_celldust: 0,
        id_currency_event_ramsgiving: 0,
        CURRENCY_NOTES: NotesBalance,
        id_currency_event_frostfall: 0,
        CURRENCY_EVENT_DARKHARVEST: 0,
        CURRENCY_S19_COIN: 0,
        id_currency_s16_coin: 0,
        CURRENCY_S16_COIN: 0,
        id_currency_gauntlet_coin: 0,
        id_currency_s13_coin: 0,
        CURRENCY_MARKS_STEEL: 0,
        CURRENCY_S13_COIN: 0,
        CURRENCY_EVENT_FROSTFALL: 0,
        CURRENCY_GAUNTLET_COIN: 0,
        id_currency_marks_steel: 0,
        id_currency_rewardcache: 0,
        CURRENCY_PRESTIGE: 0,
        CURRENCY_SEASONAL_COIN: 0,
        CURRENCY_REWARDCACHE: 0,
        id_currency_token_exchange_speed_up: 0,
        id_currency_event_springtide: 0,
        CURRENCY_TOKEN_EXCHANGE_SPEED_UP: 0,
        id_currency_gauntlet_coin_faded: 0,
        CURRENCY_S15_COIN: 0,
        CURRENCY_PLATINUM: 0,
        id_currency_platinum: 0,
        id_currency_s15_coin: 0,
        id_currency_marks_gilded: 0,
        id_currency_event_darkharvest: 0,
        id_currency_event_saintsbond: 0,
        CURRENCY_EVENT_SPRINGTIDE: 0,
        id_currency_s19_coin: 0,
        id_currency_notes: NotesBalance,
        id_currency_prestige: 0,
        id_currency_s13_daily: 0,
        CURRENCY_WEAPON_TOKEN: 25,
        CURRENCY_MARKS_GILDED: 0,
        CURRENCY_S13_DAILY: 0,
        CURRENCY_CELLDUST: 0,
        CURRENCY_S14_COIN: 0,
        CURRENCY_EVENT_SAINTSBOND: 0,
        CURRENCY_S17_COIN: 0,
        id_currency_s14_coin: 0,
        CURRENCY_EVENT_RAMSGIVING: 0,
        id_currency_s17_coin: 0
    };

    ApplyHeldCurrencies(UserId, Sheet);

    res.status(200);
    res.json(Sheet);
});

// ---- The free store (roadmap 3.7, controllers/freestore.ts): only with STORE=free. ----
// With STORE=off (the default) these routes step aside: the storefront gets the old 400 below and the
// three purchase routes the catalogue-less 404 they always got. Every store route acts for the player
// whose token it carries; a game server's key alone gets 403. The four routes are adapted from the
// store routes of Harmonic's fork (github.com/Harmonicrain/Undaunted 895f7c7, routes/store.ts).

function StoreOn(req: any, res: any, next: any){
    next(StoreMode() === "free" ? undefined : "route");
}

function SendStoreError(res: any, error: unknown, What: string){
    if(error instanceof StoreError){
        logger.warn(`Store ${What} refused (${error.Status}): ${error.message}`);
        res.status(error.Status);
        res.json({ code: String(error.Status), message: error.message });
        return;
    }

    logger.error(error, `Store ${What} failed`);
    res.status(500);
    res.json({ code: "500", message: "Store request failed" });
}

// StoreGetItemByTagEndpoint: a bare array of offers
storeRouter.get("/product/skus/public", StoreOn, HasUndauntedMetagameAuth, PlayerTokenOnly, (req: any, res) => {
    const RequiredTags = req.query.requiredTags;

    if(typeof RequiredTags !== "string" || RequiredTags.length === 0){
        logger.warn("Store SKU request with no requiredTags");
        res.status(400);
        res.json({ code: "400", message: "missing requiredTags query parameter" });
        return;
    }

    try{
        const Offers = ListStoreOffers(req.AuthData.userId, RequiredTags);

        if(IsKnownStoreTag(RequiredTags)){
            logger.info(`Store SKUs for tag ${RequiredTags}: ${Offers.length} offer(s)`);
        }
        else{
            logger.warn(`Store SKUs requested for unknown tag ${RequiredTags}: an empty list`);
        }

        res.status(200);
        res.json(Offers);
    }
    catch(error){
        SendStoreError(res, error, `list ${RequiredTags}`);
    }
});

// StoreGetItemByIdEndpoint: one offer, for the purchase dialog
storeRouter.get("/product/sku/:skuId", StoreOn, HasUndauntedMetagameAuth, PlayerTokenOnly, (req: any, res) => {
    try{
        res.status(200);
        res.json(GetStoreOffer(req.AuthData.userId, req.params.skuId));
    }
    catch(error){
        SendStoreError(res, error, `offer ${req.params.skuId}`);
    }
});

// StorePurchaseItemEndpoint: {purchaseToken}. Whatever else the request carries is ignored.
storeRouter.get("/token/:currency/:skuId", StoreOn, HasUndauntedMetagameAuth, PlayerTokenOnly, (req: any, res) => {
    try{
        res.status(200);
        res.json(CreateStorePurchase(req.AuthData.userId, req.params.currency, req.params.skuId));
    }
    catch(error){
        SendStoreError(res, error, `token for ${req.params.skuId}`);
    }
});

// StorePurchaseItemConfirmEndpoint: redeems the token; 204, also for a token already redeemed
storeRouter.post("/notification/:currency", StoreOn, HasUndauntedMetagameAuth, PlayerTokenOnly, (req: any, res) => {
    try{
        RedeemStorePurchase(req.AuthData.userId, req.params.currency, req.query.token);
        res.status(204);
        res.send();
    }
    catch(error){
        SendStoreError(res, error, "purchase");
    }
});

// STORE=off: the answer the store screen always got
storeRouter.get("/product/skus/public", HasUndauntedMetagameAuth, async (req: any, res) => {
    logger.info("Store SKUs (stubbed)");

    // TODO: No clue if this is microtransactions or game transactions yet
    // If game transactions, I'll support it as it was on live
    // If microtransactions, I'll prob rewire to make everything earnable (no real money here!)

    res.status(400);
    res.json({
        code: "400",
        message: "The store is not available on Dauntless Revived yet."
    });
});