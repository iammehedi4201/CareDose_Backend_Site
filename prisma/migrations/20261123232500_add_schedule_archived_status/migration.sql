-- Add ARCHIVED value to ScheduleStatus enum for soft-archiving medication schedules
ALTER TYPE "ScheduleStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
