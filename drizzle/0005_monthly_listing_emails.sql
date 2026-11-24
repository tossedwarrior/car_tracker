ALTER TABLE `users` ADD `listing_email_day` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `listing_email_next` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `listing_email_sent_on` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `listings_emailed_through` int DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Listings already emailed about, one refresh at a time, before monthly emails.
UPDATE `users` SET `listings_emailed_through` = (SELECT COALESCE(MAX(`id`), 0) FROM `alerts_sent`);
