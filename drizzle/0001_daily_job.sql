CREATE TABLE `check_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`log` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DROP INDEX `listings_source_id_uq`;--> statement-breakpoint
DROP INDEX `listings_vin_idx`;--> statement-breakpoint
ALTER TABLE `listings` ADD `last_checked` text;--> statement-breakpoint
CREATE UNIQUE INDEX `listings_watch_source_id_uq` ON `listings` (`watch_id`,`source`,`source_listing_id`);--> statement-breakpoint
CREATE INDEX `listings_watch_vin_idx` ON `listings` (`watch_id`,`vin`);