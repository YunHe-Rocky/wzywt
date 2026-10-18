CREATE TABLE `media_upload_usage` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `bytes` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `media_upload_usage_user_id_created_at_idx` (`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve known historical uploads. Overwritten/deleted pre-migration traffic
-- cannot be reconstructed and is not invented by this migration.
INSERT INTO `media_upload_usage` (`id`, `user_id`, `bytes`, `created_at`)
SELECT CONCAT('legacy-screenshot:', `id`), `uploaded_by`, `size`, `created_at` FROM `match_screenshots`;
INSERT INTO `media_upload_usage` (`id`, `user_id`, `bytes`, `created_at`)
SELECT CONCAT('legacy-video:', `id`), `author_id`, `size`, `created_at` FROM `combat_posts`;
