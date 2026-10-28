CREATE TABLE `alerts_sent` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listing_id` int NOT NULL,
	`type` varchar(16) NOT NULL,
	`price` int NOT NULL DEFAULT 0,
	`date` varchar(32) NOT NULL,
	`seen` boolean NOT NULL DEFAULT false,
	CONSTRAINT `alerts_sent_id` PRIMARY KEY(`id`),
	CONSTRAINT `alerts_sent_listing_type_price_uq` UNIQUE(`listing_id`,`type`,`price`)
);
--> statement-breakpoint
CREATE TABLE `api_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(32) NOT NULL,
	`month` varchar(7) NOT NULL,
	`calls` int NOT NULL DEFAULT 0,
	CONSTRAINT `api_usage_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_usage_source_month_uq` UNIQUE(`source`,`month`)
);
--> statement-breakpoint
CREATE TABLE `check_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`started_at` varchar(32) NOT NULL,
	`finished_at` varchar(32),
	`status` varchar(16) NOT NULL DEFAULT 'running',
	`log` mediumtext NOT NULL,
	CONSTRAINT `check_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(32) NOT NULL,
	`base` varchar(8) NOT NULL,
	`quote` varchar(8) NOT NULL,
	`rate` double NOT NULL,
	CONSTRAINT `fx_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `fx_rates_date_pair_uq` UNIQUE(`date`,`base`,`quote`)
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(32) NOT NULL,
	`source_listing_id` varchar(191) NOT NULL,
	`vin` varchar(64),
	`watch_id` int NOT NULL,
	`title` text,
	`make` varchar(100),
	`model` varchar(100),
	`year` int,
	`trim` text,
	`km` int,
	`price` int,
	`currency` varchar(16) NOT NULL,
	`seller_type` varchar(16) NOT NULL DEFAULT 'unknown',
	`seller_name` text,
	`location` text,
	`country` varchar(8),
	`url` text,
	`listed_at` varchar(32),
	`first_seen` varchar(32) NOT NULL,
	`last_seen` varchar(32) NOT NULL,
	`currency_override` varchar(16),
	`location_override` text,
	`last_checked` varchar(32),
	`missed_checks` int NOT NULL DEFAULT 0,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	CONSTRAINT `listings_id` PRIMARY KEY(`id`),
	CONSTRAINT `listings_watch_source_id_uq` UNIQUE(`watch_id`,`source`,`source_listing_id`)
);
--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`watch_id` int NOT NULL,
	`week` varchar(32) NOT NULL,
	`median_ask` int,
	`median_sold` int,
	`listing_count` int NOT NULL,
	`median_days_listed` double,
	`currency` varchar(16) NOT NULL,
	CONSTRAINT `market_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `market_snapshots_watch_week_uq` UNIQUE(`watch_id`,`week`)
);
--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listing_id` int NOT NULL,
	`date` varchar(32) NOT NULL,
	`price` int NOT NULL,
	`currency` varchar(16) NOT NULL,
	CONSTRAINT `price_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sold_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(32) NOT NULL,
	`source_result_id` varchar(191) NOT NULL,
	`auction_house` text,
	`title` text NOT NULL,
	`make` varchar(100),
	`model` varchar(100),
	`year` int,
	`km` int,
	`price` int NOT NULL,
	`currency` varchar(8) NOT NULL,
	`sold_date` varchar(32) NOT NULL,
	`url` text,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `sold_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `sold_results_source_id_uq` UNIQUE(`source`,`source_result_id`)
);
--> statement-breakpoint
CREATE TABLE `watch_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`watch_id` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	`content_type` varchar(64) NOT NULL,
	`data` longblob NOT NULL,
	`file_name` text,
	`width` int,
	`height` int,
	`wheels` text,
	`faces_right` boolean NOT NULL DEFAULT false,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `watch_images_id` PRIMARY KEY(`id`),
	CONSTRAINT `watch_images_watch_kind_uq` UNIQUE(`watch_id`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`make` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`year_min` int NOT NULL,
	`year_max` int NOT NULL,
	`max_km` int,
	`trim` text,
	`target_price` int,
	`target_currency` varchar(16) NOT NULL DEFAULT 'CAD',
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`last_refreshed` varchar(32),
	`last_sold_pull` varchar(32),
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `watchlist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `alerts_sent` ADD CONSTRAINT `alerts_sent_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_watch_id_watchlist_id_fk` FOREIGN KEY (`watch_id`) REFERENCES `watchlist`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD CONSTRAINT `market_snapshots_watch_id_watchlist_id_fk` FOREIGN KEY (`watch_id`) REFERENCES `watchlist`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_snapshots` ADD CONSTRAINT `price_snapshots_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `watch_images` ADD CONSTRAINT `watch_images_watch_id_watchlist_id_fk` FOREIGN KEY (`watch_id`) REFERENCES `watchlist`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `listings_watch_vin_idx` ON `listings` (`watch_id`,`vin`);--> statement-breakpoint
CREATE INDEX `listings_watch_status_idx` ON `listings` (`watch_id`,`status`);--> statement-breakpoint
CREATE INDEX `price_snapshots_listing_idx` ON `price_snapshots` (`listing_id`,`date`);--> statement-breakpoint
CREATE INDEX `sold_results_model_date_idx` ON `sold_results` (`make`,`model`,`sold_date`);