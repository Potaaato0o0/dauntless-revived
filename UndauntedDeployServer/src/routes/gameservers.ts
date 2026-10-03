import { Router } from "express";
import { DescribeGameservers } from "../controllers/gameservers";
import { DescribeOverflow } from '../controllers/overflow';

export const gameserversRouter = Router();

// 127.0.0.0/8 and ::1, also as IPv4-mapped IPv6
export function IsLoopbackAddress(Address: string | undefined){
    return Address != undefined && (/^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(Address) || Address === "::1");
}

// Headers any proxy (the public-mode gateway included) adds. The metagame never sends them.
const PROXY_HEADERS = ["x-dauntless-gateway", "x-forwarded-for", "forwarded", "x-real-ip", "x-forwarded-host", "x-forwarded-proto", "via"];

// The deploy server has no authentication: only the metagame on this machine may talk to
// it, straight over loopback. A caller elsewhere, or anything relayed by a proxy, gets 403.
export function IsDirectLoopbackRequest(req: { socket?: { remoteAddress?: string }, headers: Record<string, unknown> }){
    return IsLoopbackAddress(req.socket?.remoteAddress) && !PROXY_HEADERS.some((Header) => req.headers[Header] !== undefined);
}

// The running game servers, read-only, for the metagame's /undaunted/api/ServerStatus:
// {servers: [{id, port, kind, map, gameMode, behemoth, huntId, matchmakerHuntId,
// expectedPlayers, maxPlayers, startedAt}]}. The list holds account ids, so it is for
// the metagame on this machine only: the deploy server binds loopback, and this route
// also refuses any caller that is not on loopback.
gameserversRouter.get("/gameservers", async (req, res) => {
    if(!IsDirectLoopbackRequest(req)){
        res.status(403);
        res.send();
        return;
    }

    res.status(200);
    res.json({
        servers: [...DescribeGameservers(), ...await DescribeOverflow()]
    });
});
