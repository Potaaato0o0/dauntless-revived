import { Router } from "express";
import { HasUndauntedMetagameAuth } from "../middleware/HasUndauntedMetagameAuth";
import { GetTrialsIndividual, GetTrialsLeaderboard, GetTrialsLeaderboardAll, SubmitTrialResult, TrialsError } from "../controllers/trials";
import { logger } from "../logger";

export const trialsRouter = Router();

function Send(res: any, Work: () => unknown){
    try{
        res.status(200);
        res.json(Work());
    }
    catch(error){
        if(error instanceof TrialsError){
            res.status(error.Status);
            res.json({code: String(error.Status), message: error.message});
            return;
        }
        logger.error(error, "Trials request failed");
        res.status(500);
        res.json({code: "500", message: "Trials request failed"});
    }
}

trialsRouter.post("/trials/leaderboards", HasUndauntedMetagameAuth, (req: any, res) => Send(res, () => GetTrialsLeaderboardAll(req.body)));
trialsRouter.post("/trials/leaderboards/solo", HasUndauntedMetagameAuth, (req: any, res) => Send(res, () => GetTrialsLeaderboard(req.body, "solo")));
trialsRouter.post("/trials/leaderboards/group", HasUndauntedMetagameAuth, (req: any, res) => Send(res, () => GetTrialsLeaderboard(req.body, "group")));
trialsRouter.post("/trials/leaderboards/solo/individual", HasUndauntedMetagameAuth, (req: any, res) => Send(res, () => GetTrialsIndividual(req.body, "solo")));
trialsRouter.post("/trials/leaderboards/group/individual", HasUndauntedMetagameAuth, (req: any, res) => Send(res, () => GetTrialsIndividual(req.body, "group")));

// Internal trust-boundary route: the stock player client cannot submit times. The 1.4.4 executable
// exposes the five read routes above but no recoverable result-upload endpoint; only a process holding
// the local game-server API key can record a completion here.
trialsRouter.post("/trials/results", HasUndauntedMetagameAuth, (req: any, res) => {
    if(req.AuthData?.IsGameserver !== true){
        res.status(403);
        res.json({code: "403", message: "game-server authentication required"});
        return;
    }

    Send(res, () => SubmitTrialResult(req.body));
});
