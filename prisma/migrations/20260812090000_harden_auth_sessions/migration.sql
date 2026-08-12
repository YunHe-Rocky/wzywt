ALTER TABLE `users`
  ADD COLUMN `session_version` INTEGER NOT NULL DEFAULT 1;

CREATE TABLE `auth_rate_limits` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `scope` VARCHAR(32) NOT NULL,
  `key_hash` CHAR(64) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `window_start` DATETIME(3) NOT NULL,
  `blocked_until` DATETIME(3) NULL,
  UNIQUE INDEX `auth_rate_limits_scope_key_hash_key` (`scope`, `key_hash`),
  INDEX `auth_rate_limits_blocked_until_idx` (`blocked_until`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `password_reset_tokens` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `password_reset_tokens_token_hash_key` (`token_hash`),
  INDEX `password_reset_tokens_user_id_expires_at_idx` (`user_id`, `expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
