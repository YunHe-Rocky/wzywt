CREATE INDEX `tournaments_is_public_status_deadline_idx`
  ON `tournaments`(`is_public`, `status`, `deadline`);

CREATE INDEX `tournament_players_tournament_id_is_spectator_idx`
  ON `tournament_players`(`tournament_id`, `is_spectator`);

CREATE INDEX `temp_player_applications_tournament_id_status_idx`
  ON `temp_player_applications`(`tournament_id`, `status`);

CREATE INDEX `admin_operations_tournament_id_action_created_at_idx`
  ON `admin_operations`(`tournament_id`, `action`, `created_at`);
