-- Creates the test database used by automated backend tests.
-- This script runs once on container first-start, as the pds_dev user.
SELECT 'CREATE DATABASE pds_test OWNER pds_dev'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pds_test')
\gexec
