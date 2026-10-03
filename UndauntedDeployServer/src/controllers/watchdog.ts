import { logger } from "../logger";
import { Gameservers, CleanupServer, IsGameserverAlive } from "./gameservers";

/**
 * TODO:
 * This watchdog is SUPER basic rn, only releases resources, the server itself handles cleaning itself up
 */

export async function RunWatchdog(){
    logger.info(`Running Gameserver Watchdog!`);

    for(const Gameserver of Gameservers){
        if(!IsGameserverAlive(Gameserver)){
            console.log(`Cleaning up Gameserver on port ${Gameserver.port}`);

            // A restart of Ramsgate or the Dojo that fails is logged; it must not end the deploy server
            CleanupServer(Gameserver).catch((error) => logger.error(`Could not restart the game server on port ${Gameserver.port}: ${error instanceof Error ? error.message : String(error)}`));
        }
    }
}
