#!/usr/bin/env node
import { runWineGame } from "../unix-common/game-runner.mjs";

try {
  process.exitCode = await runWineGame(process.argv.slice(2));
} catch (error) {
  process.stderr.write("dauntless linux game launcher: " + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 127;
}
