-- The contract between kloakware's Steward user storage and Steward's own
-- `users` table: these columns, with these names. Steward's persistence test
-- reads this file and fails when its entity no longer provides them.
SELECT id, email, display_name, password_hash, roles, status FROM users
