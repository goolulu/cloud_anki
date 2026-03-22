ALTER TABLE `collects` ADD `card_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `collects`
SET `card_id` = 'legacy-card:' || `id`
WHERE `card_id` = '';
--> statement-breakpoint
INSERT INTO `cards` (`id`, `word`, `lang`, `normalized_json`, `created_at`)
SELECT
	`collects`.`card_id`,
	`collects`.`word`,
	`collects`.`lang`,
	json_object(
		'id', `collects`.`card_id`,
		'word', `collects`.`word`,
		'phonetic', '',
		'pos', json_array(),
		'senses', json_array(),
		'source', json_object(
			'url', `collects`.`source_url`,
			'context', `collects`.`context`
		),
		'template', 'basic_bilingual'
	),
	`collects`.`created_at`
FROM `collects`
WHERE NOT EXISTS (
	SELECT 1
	FROM `cards`
	WHERE `cards`.`id` = `collects`.`card_id`
);
--> statement-breakpoint
CREATE TABLE `__new_collects` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`word` text NOT NULL,
	`lang` text NOT NULL,
	`source_url` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`page_title` text DEFAULT '' NOT NULL,
	`hostname` text DEFAULT '' NOT NULL,
	`captured_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_collects` (
	`id`,
	`card_id`,
	`word`,
	`lang`,
	`source_url`,
	`context`,
	`page_title`,
	`hostname`,
	`captured_at`,
	`created_at`
)
SELECT
	`id`,
	`card_id`,
	`word`,
	`lang`,
	`source_url`,
	`context`,
	`page_title`,
	`hostname`,
	`captured_at`,
	`created_at`
FROM `collects`;
--> statement-breakpoint
DROP TABLE `collects`;
--> statement-breakpoint
ALTER TABLE `__new_collects` RENAME TO `collects`;
