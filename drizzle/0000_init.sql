CREATE TABLE `alerts_sent` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`type` text NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`date` text NOT NULL,
	`seen` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_sent_listing_type_price_uq` ON `alerts_sent` (`listing_id`,`type`,`price`);--> statement-breakpoint
CREATE TABLE `api_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`month` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_usage_source_month_uq` ON `api_usage` (`source`,`month`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`rate` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_date_pair_uq` ON `fx_rates` (`date`,`base`,`quote`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_listing_id` text NOT NULL,
	`vin` text,
	`watch_id` integer NOT NULL,
	`title` text,
	`make` text,
	`model` text,
	`year` integer,
	`trim` text,
	`km` integer,
	`price` integer,
	`currency` text NOT NULL,
	`seller_type` text DEFAULT 'unknown' NOT NULL,
	`seller_name` text,
	`location` text,
	`country` text,
	`url` text,
	`listed_at` text,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`missed_checks` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watchlist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listings_source_id_uq` ON `listings` (`source`,`source_listing_id`);--> statement-breakpoint
CREATE INDEX `listings_vin_idx` ON `listings` (`vin`);--> statement-breakpoint
CREATE INDEX `listings_watch_status_idx` ON `listings` (`watch_id`,`status`);--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_id` integer NOT NULL,
	`week` text NOT NULL,
	`median_ask` integer,
	`median_sold` integer,
	`listing_count` integer NOT NULL,
	`median_days_listed` real,
	`currency` text NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watchlist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_snapshots_watch_week_uq` ON `market_snapshots` (`watch_id`,`week`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`date` text NOT NULL,
	`price` integer NOT NULL,
	`currency` text NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_snapshots_listing_idx` ON `price_snapshots` (`listing_id`,`date`);--> statement-breakpoint
CREATE TABLE `sold_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_result_id` text NOT NULL,
	`auction_house` text,
	`title` text NOT NULL,
	`make` text,
	`model` text,
	`year` integer,
	`km` integer,
	`price` integer NOT NULL,
	`currency` text NOT NULL,
	`sold_date` text NOT NULL,
	`url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sold_results_source_id_uq` ON `sold_results` (`source`,`source_result_id`);--> statement-breakpoint
CREATE INDEX `sold_results_model_date_idx` ON `sold_results` (`make`,`model`,`sold_date`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`year_min` integer NOT NULL,
	`year_max` integer NOT NULL,
	`max_km` integer,
	`trim` text,
	`target_price` integer,
	`target_currency` text DEFAULT 'CAD' NOT NULL,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
