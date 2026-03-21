CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`word` text NOT NULL,
	`lang` text NOT NULL,
	`normalized_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collects` (
	`id` text PRIMARY KEY NOT NULL,
	`word` text NOT NULL,
	`lang` text NOT NULL,
	`source_url` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`page_title` text DEFAULT '' NOT NULL,
	`hostname` text DEFAULT '' NOT NULL,
	`captured_at` integer,
	`created_at` integer NOT NULL
);
