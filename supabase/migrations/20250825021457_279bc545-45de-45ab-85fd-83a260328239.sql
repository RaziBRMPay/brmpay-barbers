-- Fix empty shop names in merchants table
UPDATE merchants 
SET shop_name = 'Default Shop' 
WHERE shop_name = '' OR shop_name IS NULL;