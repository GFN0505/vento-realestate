-- Runs once, when the local volume is first created.
-- A separate database for automated tests so they never touch development data.
CREATE DATABASE vento_test OWNER vento;
