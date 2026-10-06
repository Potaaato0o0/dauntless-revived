CREATE TABLE `trialsresults` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `submissionId` text NOT NULL,
    `requestHash` text NOT NULL,
    `accountId` text NOT NULL,
    `characterId` text NOT NULL,
    `rotationId` text NOT NULL,
    `trialId` text NOT NULL,
    `difficulty` integer NOT NULL,
    `category` text NOT NULL,
    `completionTime` integer NOT NULL,
    `objectivesCompleted` integer NOT NULL,
    `sessionId` text NOT NULL,
    `partyKey` text NOT NULL,
    `partyJson` text NOT NULL,
    `completedDate` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trialsresults_submission` ON `trialsresults` (`submissionId`);
--> statement-breakpoint
CREATE INDEX `trialsresults_board` ON `trialsresults` (`rotationId`, `difficulty`, `category`, `completionTime`, `completedDate`);
--> statement-breakpoint
CREATE INDEX `trialsresults_account` ON `trialsresults` (`accountId`, `rotationId`);
