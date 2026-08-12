-- Reconcile schema changes that were previously applied with `prisma db push`
-- but had no migration. Legacy production databases baseline this migration;
-- fresh databases execute it normally.

ALTER TABLE `admin_operations`
  DROP FOREIGN KEY `admin_operations_adminId_fkey`;

ALTER TABLE `heroes`
  ADD COLUMN `base_json` JSON NULL,
  ADD COLUMN `data_hash` VARCHAR(64) NULL,
  ADD COLUMN `hero_type` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `hero_type2` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `image_url` VARCHAR(255) NOT NULL,
  ADD COLUMN `mingge` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `mingge_name` VARCHAR(64) NULL,
  ADD COLUMN `mingge_related_id` INTEGER NULL,
  ADD COLUMN `skins_json` TEXT NULL;

ALTER TABLE `role_preferences`
  ADD COLUMN `peak_rank` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `peak_score` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `role_rank` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `tournaments`
  ADD COLUMN `announcement` TEXT NULL,
  ADD COLUMN `is_public` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `split_result` JSON NULL;

ALTER TABLE `users`
  ADD COLUMN `avatar` VARCHAR(255) NULL,
  ADD COLUMN `banned` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `role` VARCHAR(16) NOT NULL DEFAULT 'user',
  ADD COLUMN `security_answer_hash` VARCHAR(255) NULL,
  ADD COLUMN `security_question` VARCHAR(255) NULL;

CREATE TABLE `hero_skills` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `hero_id` INTEGER NOT NULL,
  `skill_index` INTEGER NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `cd` VARCHAR(32) NOT NULL,
  `cost` VARCHAR(32) NOT NULL,
  `desc` TEXT NOT NULL,
  `damage_type` VARCHAR(8) NULL,
  `data_hash` VARCHAR(64) NOT NULL,
  `extra_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `hero_skills_hero_id_skill_index_key` (`hero_id`, `skill_index`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `equipment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `item_id` INTEGER NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `price` INTEGER NOT NULL DEFAULT 0,
  `image_url` VARCHAR(255) NULL,
  `atk` INTEGER NOT NULL DEFAULT 0,
  `ap` INTEGER NOT NULL DEFAULT 0,
  `def` INTEGER NOT NULL DEFAULT 0,
  `mdef` INTEGER NOT NULL DEFAULT 0,
  `hp` INTEGER NOT NULL DEFAULT 0,
  `mp` INTEGER NOT NULL DEFAULT 0,
  `cd_reduce` INTEGER NOT NULL DEFAULT 0,
  `atk_speed` INTEGER NOT NULL DEFAULT 0,
  `move_speed` INTEGER NOT NULL DEFAULT 0,
  `crit_rate` INTEGER NOT NULL DEFAULT 0,
  `lifesteal` INTEGER NOT NULL DEFAULT 0,
  `passive_json` JSON NULL,
  `components` JSON NULL,
  `data_hash` VARCHAR(64) NULL,
  `extra_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `equipment_item_id_key` (`item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hero_lane_overrides` (
  `hero_id` INTEGER NOT NULL,
  `role_type` VARCHAR(16) NOT NULL,

  PRIMARY KEY (`hero_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `kv_cache` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,

  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `announcements` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(128) NOT NULL,
  `version` VARCHAR(32) NULL,
  `brief` VARCHAR(255) NOT NULL,
  `content` TEXT NULL,
  `slug` VARCHAR(64) NOT NULL,
  `published` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `announcements_slug_key` (`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tournament_picks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tournament_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `team` VARCHAR(4) NOT NULL,
  `role_type` VARCHAR(16) NOT NULL,
  `hero_id` INTEGER NOT NULL,
  `equip_json` JSON NULL,

  UNIQUE INDEX `tournament_picks_tournament_id_user_id_key` (`tournament_id`, `user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hero_skills`
  ADD CONSTRAINT `hero_skills_hero_id_fkey`
  FOREIGN KEY (`hero_id`) REFERENCES `heroes` (`hero_id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `admin_operations`
  ADD CONSTRAINT `admin_operations_admin_id_fkey`
  FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `tournament_picks`
  ADD CONSTRAINT `tournament_picks_tournament_id_fkey`
  FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `hero_powers`
  RENAME INDEX `hero_powers_userId_heroId_roleType_key`
  TO `hero_powers_user_id_hero_id_role_type_key`;

ALTER TABLE `temp_player_applications`
  RENAME INDEX `temp_player_applications_tournamentId_applicantId_key`
  TO `temp_player_applications_tournament_id_applicant_id_key`;
