-- Add foreign key constraint between merchants and profiles
ALTER TABLE merchants 
ADD CONSTRAINT fk_merchants_user_id 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;