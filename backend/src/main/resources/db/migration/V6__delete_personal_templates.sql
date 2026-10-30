-- Keep template configuration for already accepted tasks and their history.
ALTER TABLE template ADD COLUMN deleted_at TIMESTAMP(3) NULL;
