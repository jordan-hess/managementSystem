-- Dummy customers — run in Supabase SQL Editor
-- Uses the first admin profile as created_by

DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM profiles WHERE role = 'admin' LIMIT 1;

  INSERT INTO customers (name, phone, email, account_number, notes, created_by) VALUES
    ('Sipho Dlamini',    '+27 82 111 2233', 'sipho.dlamini@gmail.com',     'ACC-10041', 'Prefers callbacks in the morning.',          admin_id),
    ('Fatima Hendricks', '+27 71 334 5567', 'fatima.h@webmail.co.za',      'ACC-10042', 'Has an ongoing billing dispute.',            admin_id),
    ('Pieter van Wyk',   '+27 83 667 8890', 'pieter.vanwyk@outlook.com',   'ACC-10043', NULL,                                         admin_id),
    ('Nomsa Khumalo',    '+27 79 445 6612', 'nomsa.k@gmail.com',           'ACC-10044', 'Requested an account upgrade last month.',   admin_id),
    ('Rajan Pillay',     '+27 84 223 7745', 'rajan.pillay@icloud.com',     'ACC-10045', NULL,                                         admin_id),
    ('Anele Botha',      '+27 72 889 0034', 'anele.botha@yahoo.com',       'ACC-10046', 'Escalation pending review.',                 admin_id),
    ('Liesl Engelbrecht','+27 81 556 3321', 'liesl.e@mweb.co.za',          'ACC-10047', 'VIP customer — handle with priority.',       admin_id),
    ('Thabo Mokoena',    '+27 76 112 9988', 'thabo.mokoena@gmail.com',     'ACC-10048', NULL,                                         admin_id),
    ('Priya Naicker',    '+27 83 778 4456', 'priya.naicker@webmail.co.za', 'ACC-10049', 'Asked about fibre upgrade options.',         admin_id),
    ('Gareth Fourie',    '+27 71 990 2278', 'gareth.fourie@outlook.com',   'ACC-10050', 'Intermittent connectivity complaints.',      admin_id);
END $$;
