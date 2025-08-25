-- Create a storage bucket for report files
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', true);

-- Create RLS policies for the reports bucket
CREATE POLICY "Reports are publicly accessible for reading" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'reports');

CREATE POLICY "Authenticated users can upload reports" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update their reports" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete their reports" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'reports' AND auth.uid() IS NOT NULL);