-- Step 6: Add EXAM_CONTROLLER to user_role enum (non-destructive)
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'EXAM_CONTROLLER';

