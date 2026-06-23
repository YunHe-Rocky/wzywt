-- AlterTable
ALTER TABLE `hero_powers` ADD UNIQUE INDEX `hero_powers_userId_heroId_roleType_key`(`user_id`, `hero_id`, `role_type`);

-- AlterTable
ALTER TABLE `temp_player_applications` ADD UNIQUE INDEX `temp_player_applications_tournamentId_applicantId_key`(`tournament_id`, `applicant_id`);

-- AlterTable
ALTER TABLE `admin_operations` DROP FOREIGN KEY `admin_operations_adminId_fkey`;
ALTER TABLE `admin_operations` ADD CONSTRAINT `admin_operations_adminId_fkey` FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
