-- User can cancel a running AMI assessment mid-flight (Cancel button on the
-- progress bar). The worker stops dispatching new indicators and marks the
-- session CANCELLED instead of RUNNING/COMPLETED/FAILED.
ALTER TYPE "AssessmentStatus" ADD VALUE 'CANCELLED';
