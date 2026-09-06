-- Add explicit account deactivation and match evidence/record revisions.
ALTER TABLE `users`
  ADD COLUMN `deleted_at` DATETIME(3) NULL;

ALTER TABLE `internal_matches`
  ADD COLUMN `evidence_revision` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `active_recognition_id` INTEGER NULL,
  ADD COLUMN `record_revision` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `match_screenshots`
  ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `match_recognitions`
  ADD COLUMN `evidence_revision` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `input_snapshot` JSON NULL,
  ADD COLUMN `attempt_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `heartbeat_at` DATETIME(3) NULL;

CREATE INDEX `match_recognitions_match_id_status_evidence_revision_idx`
  ON `match_recognitions`(`match_id`, `status`, `evidence_revision`);

CREATE INDEX `match_recognitions_status_available_at_idx`
  ON `match_recognitions`(`status`, `available_at`);

CREATE TABLE `media_upload_reservations` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` INTEGER NOT NULL,
  `kind` VARCHAR(32) NOT NULL,
  `bytes` BIGINT UNSIGNED NOT NULL,
  `state` VARCHAR(16) NOT NULL DEFAULT 'RESERVED',
  `storage_key` VARCHAR(255) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `media_upload_reservations_storage_key_key`(`storage_key`),
  INDEX `media_upload_reservations_state_expires_at_idx`(`state`, `expires_at`),
  INDEX `media_upload_reservations_user_id_state_created_at_idx`(`user_id`, `state`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `media_upload_reservations_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `combat_post_comments_author_id_created_at_idx`
  ON `combat_post_comments`(`author_id`, `created_at`);
