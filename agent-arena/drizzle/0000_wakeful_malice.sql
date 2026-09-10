CREATE TABLE `arenas` (
	`owner` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`connection` text
);
