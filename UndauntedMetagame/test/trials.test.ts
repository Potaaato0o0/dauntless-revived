import { RemoveTestDb } from "./setup";
import "./authenv";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { Call, StartApp, StopApp } from "./appclient";
import { GetDb } from "../src/db";
import { cooldowns, inventory, trialsresults } from "../src/db/schema";
import { GetCurrentTrialId, GetCurrentTrialsRotation } from "../src/controllers/trials";
import { MakePlayer, StackQuantity } from "./helpers";
import LadyLuck from "../src/vendor/lady_luck_catalog.json";

const Database: any = require("better-sqlite3");
let Submission = 0;
const SubmitId = () => `trial-${process.pid}-${++Submission}`;

before(async () => StartApp());
after(async () => { await StopApp(); RemoveTestDb(() => GetDb().$client.close()); });

function ResultBody(Player: {UserId:string,CharacterId:string}, Difficulty=0, Completion=17000, Extra:any={}){
    return {
        submission_id: SubmitId(),
        trial_id: GetCurrentTrialId(Difficulty as 0|1),
        difficulty: Difficulty,
        completion_time: Completion,
        objectives_completed: 3,
        session_id: `session-${Submission}`,
        party: [{phx_account_id:Player.UserId, character_id:Player.CharacterId, platform:"WIN", platform_name:"Tester", player_role_id:"PR_BASTION", weapon:1}],
        ...Extra
    };
}

describe("Trials results, rewards and leaderboards", () => {
    it("accepts only game-server-authenticated results, rewards once, and persists the run", async () => {
        const A = await MakePlayer();
        const Body = ResultBody(A, 0, 17000);

        assert.equal((await Call("POST", "/trials/results", {as:A.UserId, body:Body})).status, 403);
        const First = await Call("POST", "/trials/results", {gs:true, body:Body});
        const Retry = await Call("POST", "/trials/results", {gs:true, body:Body});
        assert.equal(First.status, 200);
        assert.equal(First.json.replayed, false);
        assert.equal(First.json.rewards.length, 3);
        assert.equal(Retry.status, 200);
        assert.equal(Retry.json.replayed, true);
        assert.equal(StackQuantity(A.CharacterId, "CURRENCY_MARKS_STEEL"), 300);
        assert.equal(GetDb().select().from(trialsresults).where(eq(trialsresults.accountId,A.UserId)).all().length, 1);
        assert.equal(GetDb().select().from(cooldowns).where(eq(cooldowns.accountId,A.UserId)).all().filter((R)=>R.cooldownId.startsWith("trials_reward:")).length, 3);

        const Reopened = new Database(process.env.DB_FILENAME!, {readonly:true});
        try{ assert.equal((Reopened.prepare("select count(*) n from trialsresults where accountId = ?").get(A.UserId) as any).n, 1); }
        finally{ Reopened.close(); }
    });

    it("keeps the faster personal best, ranks ties deterministically, and exposes all five recovered 1.4.4 routes", async () => {
        const A = await MakePlayer(), B = await MakePlayer();
        const FastA = ResultBody(A,0,20000);
        const SlowA = ResultBody(A,0,25000);
        const FastB = ResultBody(B,0,20000);
        await Call("POST","/trials/results",{gs:true,body:FastA});
        await Call("POST","/trials/results",{gs:true,body:SlowA});
        await Call("POST","/trials/results",{gs:true,body:FastB});

        const Query={difficulty:0,trial_id:GetCurrentTrialId(0),page:0,page_size:100,phx_account_id:A.UserId};
        const All=await Call("POST","/trials/leaderboards",{as:A.UserId,body:Query});
        const Solo=await Call("POST","/trials/leaderboards/solo",{as:A.UserId,body:Query});
        const SoloMe=await Call("POST","/trials/leaderboards/solo/individual",{as:A.UserId,body:Query});
        const Group=await Call("POST","/trials/leaderboards/group",{as:A.UserId,body:Query});
        const GroupMe=await Call("POST","/trials/leaderboards/group/individual",{as:A.UserId,body:Query});
        assert.equal(All.status,200); assert.equal(Solo.status,200); assert.equal(SoloMe.status,200); assert.equal(Group.status,200); assert.equal(GroupMe.status,200);
        assert.equal(Solo.json.payload.entries.filter((E:any)=>E.phx_account_id===A.UserId).length,1);
        assert.equal(SoloMe.json.payload.completion_time,20000);
        assert.deepEqual(Solo.json.payload.entries.slice(0,2).map((E:any)=>E.rank),[1,2]);
    });

    it("records group boards separately and isolates a new weekly rotation", async () => {
        const A=await MakePlayer(), B=await MakePlayer();
        const Body=ResultBody(A,1,15000,{
            category:"group",
            party:[
                {phx_account_id:A.UserId,character_id:A.CharacterId,platform:"WIN",platform_name:"A",player_role_id:"PR_BASTION",weapon:1},
                {phx_account_id:B.UserId,character_id:B.CharacterId,platform:"WIN",platform_name:"B",player_role_id:"PR_FRANK",weapon:2}
            ]
        });
        const Reply=await Call("POST","/trials/results",{gs:true,body:Body});
        assert.equal(Reply.status,200);
        assert.equal(StackQuantity(A.CharacterId,"CURRENCY_MARKS_GILDED"),300);
        assert.equal(StackQuantity(B.CharacterId,"CURRENCY_MARKS_GILDED"),300);

        const Q={difficulty:1,trial_id:GetCurrentTrialId(1),page:0,page_size:100,phx_account_id:B.UserId};
        const Board=await Call("POST","/trials/leaderboards/group",{as:A.UserId,body:Q});
        assert.equal(Board.json.payload.entries.length,1);
        assert.equal(Board.json.payload.entries[0].entries.length,2);

        const NextWeek=new Date(Date.now()+7*24*60*60*1000);
        assert.notEqual(GetCurrentTrialsRotation().rotationId,GetCurrentTrialsRotation(NextWeek).rotationId);
        const Stale=await Call("POST","/trials/leaderboards/group",{as:A.UserId,body:{...Q,trial_id:GetCurrentTrialId(1,NextWeek)}});
        assert.deepEqual(Stale.json.payload.entries,[]);
    });

    it("completes the Trial -> Marks -> balance -> Lady Luck purchase loop", async () => {
        const A=await MakePlayer();
        const Result=await Call("POST","/trials/results",{gs:true,body:ResultBody(A,0,17000)});
        assert.equal(Result.status,200);
        let Balance=await Call("GET","/balance",{as:A.UserId});
        assert.equal(Balance.json.CURRENCY_MARKS_STEEL,300);

        const Offer:any=LadyLuck.offers.find((O:any)=>O.steelMarksPrice===250)!;
        const Token=(await Call("GET",`/token/markssteel/${Offer.id}`,{as:A.UserId})).json.purchaseToken;
        assert.equal((await Call("POST",`/notification/markssteel?token=${Token}`,{as:A.UserId})).status,204);
        Balance=await Call("GET","/balance",{as:A.UserId});
        assert.equal(Balance.json.CURRENCY_MARKS_STEEL,50);

        const Row=GetDb().select().from(inventory).where(eq(inventory.characterId,A.CharacterId)).get()!;
        assert.ok((Row.instancedItems+Row.stackedItems).includes(Offer.items[0].catalogId));
    });

    it("rejects malformed, stale-week and duplicate-id-with-different-body submissions", async () => {
        const A=await MakePlayer();
        assert.equal((await Call("POST","/trials/results",{gs:true,body:{}})).status,400);
        const Wrong=ResultBody(A,0,17000,{trial_id:"Arena_MatchmakerHunt_Hard_999"});
        assert.equal((await Call("POST","/trials/results",{gs:true,body:Wrong})).status,409);

        const Good=ResultBody(A,0,17000);
        assert.equal((await Call("POST","/trials/results",{gs:true,body:Good})).status,200);
        assert.equal((await Call("POST","/trials/results",{gs:true,body:{...Good,completion_time:16000}})).status,409);
    });
});
