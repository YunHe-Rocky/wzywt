-- AlterTable
ALTER TABLE `users`
  ADD COLUMN `is_temporary` BOOLEAN NOT NULL DEFAULT false;

-- Backfill legacy placeholder accounts created for temporary tournament players.
UPDATE `users` AS `u`
SET `u`.`is_temporary` = true
WHERE `u`.`password_hash` = ''
  AND EXISTS (
    SELECT 1
    FROM `tournament_players` AS `tp`
    WHERE `tp`.`user_id` = `u`.`id`
      AND `tp`.`is_temporary` = true
  );
