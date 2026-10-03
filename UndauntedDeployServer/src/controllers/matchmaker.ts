import { logger } from "../logger";
import { GetRamsgateConnectionDetails, GetTrainingDojoConnectionDetails, StartupGameserverWithArgs, StartupGameserverWithHuntIdAndPlayers } from "./gameservers";
import { Gameservers, KindOfGameserver } from './gameservers';
import { HuntRouter } from './overflow';

const Router = new HuntRouter(() => Gameservers.filter(server => ['hunt', 'tutorial'].includes(KindOfGameserver(server))).length);

export async function HandleMatchmakingRequest(GameMode: string, GameArgs: string, HuntId: string, ExpectedPlayers: string[] | undefined){
    if (process.env.HUNT_WORKER === '1' && GameMode !== 'ISLAND') throw new Error('Hunt worker only accepts ISLAND requests');
    return Router.launch({GameMode, GameArgs, HuntId, ExpectedPlayers}, () => HandleLocalMatchmaking(GameMode, GameArgs, HuntId, ExpectedPlayers));
}

async function HandleLocalMatchmaking(GameMode: string, GameArgs: string, HuntId: string, ExpectedPlayers: string[] | undefined){
    logger.info(`Handling matchmaking with GameMode: ${GameMode} HuntId: ${HuntId} and GameArgs: ${GameArgs} and ExpectedPlayers ${ExpectedPlayers}`);

    if(GameMode === "CITY"){
        return await GetRamsgateConnectionDetails();
    }
    else if(GameMode === "SHARED"){
        if (HuntId != undefined && HuntId.trim().length > 0){
            if(HuntId == "ShatteredIsles_TrainingDojo"){
                return await GetTrainingDojoConnectionDetails();
            }
        }
    }
    else if(GameMode === "ISLAND"){
        if(GameArgs != undefined && GameArgs.trim().length > 0){
            return await StartupGameserverWithArgs(GameArgs);
        }

        if(HuntId != undefined && HuntId.trim().length > 0 && ExpectedPlayers != undefined){
            return await StartupGameserverWithHuntIdAndPlayers(HuntId, ExpectedPlayers!);
        }
    }

    if (process.env.HUNT_WORKER === '1') throw new Error('No hunt could be resolved on worker');
    logger.error("Matchmaking failed, sending you to Ramsgate!");

    return await GetRamsgateConnectionDetails();
}
