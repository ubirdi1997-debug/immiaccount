-- Test Data for VEVO Application

-- Insert a test admin user
INSERT INTO admins (username, password_hash, salt) VALUES (
    'admin', 
    'd8a5d9b7e1e68b09759309e3e2d78377d0d7a041f42283285c57ef608167f38b', 
    '1234567890abcdef1234567890abcdef'
);

-- Insert test visa applications
INSERT INTO visa_applications (
    reference_type, 
    reference_number, 
    passport_number, 
    country_of_passport, 
    date_of_birth, 
    given_names, 
    family_name, 
    visa_class_subclass, 
    visa_description, 
    visa_applicant_status, 
    visa_status, 
    grant_date, 
    expiry_date, 
    period_of_stay, 
    entries_allowed, 
    work_entitlements, 
    study_entitlements, 
    other_conditions
) VALUES 
('TRN', 'TRN-2026-000001', 'A1234567', 'INDIA', '01/01/1990', 'John', 'Doe', 'Student (subclass 500)', 'Higher Education Sector', 'Primary', 'Approved', '15 January 2025', '15 January 2029', 'Until Visa Expiry', 'Multiple', '["8105 - Work limitation (48 hours per fortnight during study session)"]', '["8202 - Meet course requirements"]', '["8501 - Maintain adequate health insurance"]'),
('Grant Number', 'GN-2026-000001', 'B2345678', 'CHINA', '15/03/1985', 'Jane', 'Smith', 'Work (subclass 482)', 'Skilled Employer Sponsored', 'Secondary', 'In Progress', '10 February 2025', '10 February 2028', 'Until Visa Expiry', 'Multiple', '["8607 - Only work for the sponsor employer"]', '["8202 - Meet course requirements"]', '["8501 - Maintain adequate health insurance"]'),
('Evidence Number', 'EN-2026-000001', 'C3456789', 'UNITED KINGDOM', '20/06/1995', 'Robert', 'Johnson', 'Tourist (subclass 600)', 'Tourist Visa', 'Primary', 'Rejected', '05 March 2025', '05 March 2026', 'Until Visa Expiry', 'Single', '["8105 - Work limitation (48 hours per fortnight during study session)"]', '["8202 - Meet course requirements"]', '["8501 - Maintain adequate health insurance"]'),
('Password', 'PW-2026-000001', 'D4567890', 'AUSTRALIA', '12/12/1988', 'Emily', 'Brown', 'Business (subclass 600)', 'Business Visitor', 'Primary', 'In Effect', '22 April 2025', '22 April 2027', 'Until Visa Expiry', 'Multiple', '["8105 - Work limitation (48 hours per fortnight during study session)"]', '["8202 - Meet course requirements"]', '["8501 - Maintain adequate health insurance"]');