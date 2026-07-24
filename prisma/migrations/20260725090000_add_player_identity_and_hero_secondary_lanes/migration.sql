-- AlterTable
ALTER TABLE `users`
  ADD COLUMN `game_nickname` VARCHAR(32) NULL,
  ADD COLUMN `game_id` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `hero_secondary_lanes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `hero_id` INTEGER NOT NULL,
  `role_type` VARCHAR(16) NOT NULL,

  UNIQUE INDEX `hero_secondary_lanes_hero_id_role_type_key`(`hero_id`, `role_type`),
  INDEX `hero_secondary_lanes_role_type_idx`(`role_type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hero_secondary_lanes`
  ADD CONSTRAINT `hero_secondary_lanes_hero_id_fkey`
  FOREIGN KEY (`hero_id`) REFERENCES `heroes`(`hero_id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
