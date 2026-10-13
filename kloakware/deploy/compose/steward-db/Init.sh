#!/bin/sh
#
# Steward's own database, stood in beside kloakware's on the same PostgreSQL:
# what an operator's Steward would hold, so the steward-users storage has a
# users table to read. Runs once, when the data volume is created, from
# /docker-entrypoint-initdb.d. The table is the one Steward's migration
# creates (the column names are pinned by kloakware's steward-users.sql and
# Steward's own test); one local account is seeded for a laptop, its password
# noted in .env.example. Nothing here is for a deployment: there, Steward's
# database is Steward's, and kloakware gets a read-only user on it.
set -eu
: "${STEWARD_DB_PASSWORD:?STEWARD_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 -v password="$STEWARD_DB_PASSWORD" --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE ROLE steward LOGIN PASSWORD :'password';
CREATE DATABASE steward OWNER steward;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname steward <<'SQL'
CREATE TABLE users (
  id              varchar(36)  PRIMARY KEY,
  email           varchar(320) NOT NULL,
  display_name    varchar(200) NOT NULL,
  password_hash   text,
  sso_subject     varchar(200),
  roles           varchar(100) NOT NULL,
  status          varchar(20)  NOT NULL,
  created_at      varchar(32)  NOT NULL,
  updated_at      varchar(32)  NOT NULL,
  last_sign_in_at varchar(32)
);
CREATE UNIQUE INDEX ux_users_email ON users (email);
ALTER TABLE users OWNER TO steward;

-- local.example: an operator who started on a local Steward account. The hash
-- is argon2id over the password in .env.example, made with OpenSSL and checked
-- by the extension's unit test against the same string.
INSERT INTO users (id, email, display_name, password_hash, roles, status, created_at, updated_at)
VALUES (
  '3b7d1b2a-5c3e-4f6a-9d8e-1a2b3c4d5e6f',
  'local@example.test',
  'Local Example',
  '$argon2id$v=19$m=65536,t=3,p=4$a2xvYWt3YXJlLXNlZWQtc2FsdA$VpqgE3NCNDXRFin7D1AZcX2tyYzjb9avYnPG+6S6xtE',
  'OPERATOR',
  'ACTIVE',
  '2026-10-13T00:00:00.000Z',
  '2026-10-13T00:00:00.000Z'
);
SQL
