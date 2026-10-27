CREATE TABLE `watch_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_id` integer NOT NULL,
	`kind` text NOT NULL,
	`content_type` text NOT NULL,
	`data` blob NOT NULL,
	`file_name` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watchlist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watch_images_watch_kind_uq` ON `watch_images` (`watch_id`,`kind`);