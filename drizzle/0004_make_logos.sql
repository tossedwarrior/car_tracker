CREATE TABLE `make_logos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`make_key` varchar(100) NOT NULL,
	`make` varchar(100) NOT NULL,
	`content_type` varchar(64) NOT NULL,
	`data` longblob NOT NULL,
	`file_name` text,
	`width` int,
	`height` int,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `make_logos_id` PRIMARY KEY(`id`),
	CONSTRAINT `make_logos_make_key_uq` UNIQUE(`make_key`)
);
