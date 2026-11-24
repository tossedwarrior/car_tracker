CREATE TABLE `follows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`watch_id` int NOT NULL,
	`target_price` int,
	`target_currency` varchar(16) NOT NULL DEFAULT 'CAD',
	`notes` text,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `follows_id` PRIMARY KEY(`id`),
	CONSTRAINT `follows_user_watch_uq` UNIQUE(`user_id`,`watch_id`)
);
--> statement-breakpoint
CREATE TABLE `login_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` varchar(32) NOT NULL,
	`used_at` varchar(32),
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `login_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `login_tokens_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` varchar(32) NOT NULL,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`name` varchar(100),
	`is_admin` boolean NOT NULL DEFAULT false,
	`listing_emails` boolean NOT NULL DEFAULT true,
	`monthly_report` boolean NOT NULL DEFAULT true,
	`created_at` varchar(32) NOT NULL,
	`last_sign_in_at` varchar(32),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `alerts_sent_listing_idx` ON `alerts_sent` (`listing_id`);--> statement-breakpoint
ALTER TABLE `alerts_sent` DROP INDEX `alerts_sent_listing_type_price_uq`;--> statement-breakpoint
ALTER TABLE `alerts_sent` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `alerts_sent` ADD CONSTRAINT `alerts_sent_user_listing_type_price_uq` UNIQUE(`user_id`,`listing_id`,`type`,`price`);--> statement-breakpoint
ALTER TABLE `follows` ADD CONSTRAINT `follows_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follows` ADD CONSTRAINT `follows_watch_id_watchlist_id_fk` FOREIGN KEY (`watch_id`) REFERENCES `watchlist`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `login_tokens` ADD CONSTRAINT `login_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `follows_watch_idx` ON `follows` (`watch_id`);--> statement-breakpoint
CREATE INDEX `login_tokens_user_idx` ON `login_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `alerts_sent` ADD CONSTRAINT `alerts_sent_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `alerts_sent_user_seen_idx` ON `alerts_sent` (`user_id`,`seen`);
