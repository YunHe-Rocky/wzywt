-- Permanent match archives, protected combat posts, and team-private tactics.

CREATE TABLE `internal_matches` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tournament_id` INTEGER NOT NULL,
  `played_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  `winner_side` VARCHAR(4) NULL,
  `red_total_kills` SMALLINT UNSIGNED NULL,
  `blue_total_kills` SMALLINT UNSIGNED NULL,
  `consistency_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `consistency_details` JSON NULL,
  `created_by` INTEGER NOT NULL,
  `submitted_by` INTEGER NULL,
  `submitted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `internal_matches_tournament_id_key` (`tournament_id`),
  INDEX `internal_matches_played_at_idx` (`played_at`),
  INDEX `internal_matches_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `match_players` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `match_id` INTEGER NOT NULL,
  `side` VARCHAR(4) NOT NULL,
  `slot` TINYINT UNSIGNED NOT NULL,
  `member_id` INTEGER NULL,
  `is_guest` BOOLEAN NOT NULL DEFAULT false,
  `game_nickname` VARCHAR(32) NOT NULL,
  `hero_id` INTEGER NULL,
  `hero_name` VARCHAR(64) NULL,
  `role_type` VARCHAR(16) NULL,
  `score` DECIMAL(6, 2) NULL,
  `is_winner` BOOLEAN NULL,
  `identity_confirmed_at` DATETIME(3) NULL,
  `identity_confirmed_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `match_players_match_id_side_slot_key` (`match_id`, `side`, `slot`),
  UNIQUE INDEX `match_players_match_id_member_id_key` (`match_id`, `member_id`),
  INDEX `match_players_match_id_idx` (`match_id`),
  INDEX `match_players_member_id_idx` (`member_id`),
  INDEX `match_players_hero_id_idx` (`hero_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `match_player_stats` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `match_player_id` INTEGER NOT NULL,
  `damage_dealt` INTEGER UNSIGNED NULL,
  `damage_taken` INTEGER UNSIGNED NULL,
  `gold` INTEGER UNSIGNED NULL,
  `participation_rate` DECIMAL(8, 4) NULL,
  `damage_conversion_rate` DECIMAL(8, 4) NULL,
  `damage_taken_per_death` INTEGER UNSIGNED NULL,
  `jungle_gold` INTEGER UNSIGNED NULL,
  `minion_kills` INTEGER UNSIGNED NULL,
  `kills` SMALLINT UNSIGNED NULL,
  `deaths` SMALLINT UNSIGNED NULL,
  `assists` SMALLINT UNSIGNED NULL,
  `control_score` DECIMAL(10, 2) NULL,
  `healing` INTEGER UNSIGNED NULL,
  `tower_damage` INTEGER UNSIGNED NULL,
  `confirmed_at` DATETIME(3) NULL,
  `confirmed_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `match_player_stats_match_player_id_key` (`match_player_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `match_screenshots` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `match_id` INTEGER NOT NULL,
  `type` VARCHAR(16) NOT NULL,
  `storage_key` VARCHAR(255) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(64) NOT NULL,
  `size` INTEGER UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `uploaded_by` INTEGER NOT NULL,
  `recognition_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `recognition_payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `match_screenshots_storage_key_key` (`storage_key`),
  UNIQUE INDEX `match_screenshots_match_id_type_key` (`match_id`, `type`),
  INDEX `match_screenshots_match_id_idx` (`match_id`),
  INDEX `match_screenshots_match_id_type_idx` (`match_id`, `type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `match_recognitions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `match_id` INTEGER NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `engine` VARCHAR(64) NOT NULL,
  `started_by` INTEGER NOT NULL,
  `raw_result` JSON NULL,
  `normalized_result` JSON NULL,
  `warnings` JSON NULL,
  `error_code` VARCHAR(64) NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `match_recognitions_match_id_created_at_idx` (`match_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `match_disputes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `match_id` INTEGER NOT NULL,
  `match_player_id` INTEGER NULL,
  `field` VARCHAR(64) NULL,
  `current_value` JSON NULL,
  `message` VARCHAR(1000) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `created_by` INTEGER NOT NULL,
  `handled_by` INTEGER NULL,
  `handled_at` DATETIME(3) NULL,
  `resolution` VARCHAR(1000) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `match_disputes_match_id_idx` (`match_id`),
  INDEX `match_disputes_status_created_at_idx` (`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `combat_posts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tournament_id` INTEGER NULL,
  `match_id` INTEGER NULL,
  `author_id` INTEGER NOT NULL,
  `title` VARCHAR(128) NOT NULL,
  `content` TEXT NOT NULL,
  `video_storage_key` VARCHAR(255) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(64) NOT NULL,
  `size` INTEGER UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'published',
  `moderated_by` INTEGER NULL,
  `moderated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `combat_posts_video_storage_key_key` (`video_storage_key`),
  INDEX `combat_posts_status_created_at_idx` (`status`, `created_at`),
  INDEX `combat_posts_match_id_idx` (`match_id`),
  INDEX `combat_posts_tournament_id_idx` (`tournament_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `combat_post_likes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `post_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `combat_post_likes_post_id_user_id_key` (`post_id`, `user_id`),
  INDEX `combat_post_likes_user_id_idx` (`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `combat_post_comments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `post_id` INTEGER NOT NULL,
  `author_id` INTEGER NOT NULL,
  `content` VARCHAR(1000) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `moderated_by` INTEGER NULL,
  `moderated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `combat_post_comments_post_id_status_created_at_idx` (`post_id`, `status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tactic_rooms` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `match_id` INTEGER NOT NULL,
  `side` VARCHAR(4) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `tactic_rooms_match_id_side_key` (`match_id`, `side`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tactic_layers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `room_id` INTEGER NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `sort_order` INTEGER NOT NULL,
  `start_time` INTEGER UNSIGNED NULL,
  `end_time` INTEGER UNSIGNED NULL,
  `description` VARCHAR(1000) NULL,
  `created_by` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `tactic_layers_room_id_sort_order_key` (`room_id`, `sort_order`),
  INDEX `tactic_layers_room_id_idx` (`room_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tactic_routes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `layer_id` INTEGER NOT NULL,
  `owner_member_id` INTEGER NOT NULL,
  `color_key` VARCHAR(16) NOT NULL,
  `geometry` JSON NOT NULL,
  `revision` INTEGER UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `tactic_routes_layer_id_owner_member_id_key` (`layer_id`, `owner_member_id`),
  INDEX `tactic_routes_owner_member_id_idx` (`owner_member_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tactic_markers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `layer_id` INTEGER NOT NULL,
  `owner_member_id` INTEGER NOT NULL,
  `type` VARCHAR(16) NOT NULL,
  `x` DECIMAL(7, 6) NOT NULL,
  `y` DECIMAL(7, 6) NOT NULL,
  `text` VARCHAR(120) NULL,
  `revision` INTEGER UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `tactic_markers_layer_id_owner_member_id_idx` (`layer_id`, `owner_member_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `admin_operations`
  ADD COLUMN `match_id` INTEGER NULL,
  ADD COLUMN `details` JSON NULL,
  ADD INDEX `admin_operations_match_id_action_created_at_idx` (`match_id`, `action`, `created_at`);

ALTER TABLE `internal_matches` ADD CONSTRAINT `internal_matches_tournament_id_fkey` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `internal_matches` ADD CONSTRAINT `internal_matches_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `internal_matches` ADD CONSTRAINT `internal_matches_submitted_by_fkey` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `match_players` ADD CONSTRAINT `match_players_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `internal_matches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `match_players` ADD CONSTRAINT `match_players_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `match_players` ADD CONSTRAINT `match_players_hero_id_fkey` FOREIGN KEY (`hero_id`) REFERENCES `heroes` (`hero_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `match_players` ADD CONSTRAINT `match_players_identity_confirmed_by_fkey` FOREIGN KEY (`identity_confirmed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `match_player_stats` ADD CONSTRAINT `match_player_stats_match_player_id_fkey` FOREIGN KEY (`match_player_id`) REFERENCES `match_players` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `match_player_stats` ADD CONSTRAINT `match_player_stats_confirmed_by_fkey` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `match_screenshots` ADD CONSTRAINT `match_screenshots_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `internal_matches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `match_screenshots` ADD CONSTRAINT `match_screenshots_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `match_recognitions` ADD CONSTRAINT `match_recognitions_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `internal_matches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `match_recognitions` ADD CONSTRAINT `match_recognitions_started_by_fkey` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `match_disputes` ADD CONSTRAINT `match_disputes_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `internal_matches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `match_disputes` ADD CONSTRAINT `match_disputes_match_player_id_fkey` FOREIGN KEY (`match_player_id`) REFERENCES `match_players` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `match_disputes` ADD CONSTRAINT `match_disputes_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `match_disputes` ADD CONSTRAINT `match_disputes_handled_by_fkey` FOREIGN KEY (`handled_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `combat_posts` ADD CONSTRAINT `combat_posts_tournament_id_fkey` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `combat_posts` ADD CONSTRAINT `combat_posts_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `internal_matches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `combat_posts` ADD CONSTRAINT `combat_posts_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `combat_posts` ADD CONSTRAINT `combat_posts_moderated_by_fkey` FOREIGN KEY (`moderated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `combat_post_likes` ADD CONSTRAINT `combat_post_likes_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `combat_posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `combat_post_likes` ADD CONSTRAINT `combat_post_likes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `combat_post_comments` ADD CONSTRAINT `combat_post_comments_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `combat_posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `combat_post_comments` ADD CONSTRAINT `combat_post_comments_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `combat_post_comments` ADD CONSTRAINT `combat_post_comments_moderated_by_fkey` FOREIGN KEY (`moderated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `tactic_rooms` ADD CONSTRAINT `tactic_rooms_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `internal_matches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tactic_layers` ADD CONSTRAINT `tactic_layers_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `tactic_rooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tactic_layers` ADD CONSTRAINT `tactic_layers_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `tactic_routes` ADD CONSTRAINT `tactic_routes_layer_id_fkey` FOREIGN KEY (`layer_id`) REFERENCES `tactic_layers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tactic_routes` ADD CONSTRAINT `tactic_routes_owner_member_id_fkey` FOREIGN KEY (`owner_member_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `tactic_markers` ADD CONSTRAINT `tactic_markers_layer_id_fkey` FOREIGN KEY (`layer_id`) REFERENCES `tactic_layers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tactic_markers` ADD CONSTRAINT `tactic_markers_owner_member_id_fkey` FOREIGN KEY (`owner_member_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `admin_operations` ADD CONSTRAINT `admin_operations_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `internal_matches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
