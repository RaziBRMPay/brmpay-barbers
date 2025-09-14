-- Update admin@brmpay.com to have admin role
UPDATE profiles 
SET role = 'admin', 
    first_name = 'Super', 
    last_name = 'Admin'
WHERE email = 'admin@brmpay.com';