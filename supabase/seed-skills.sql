-- Seed script for skill categories and skills
-- Run this in Supabase SQL Editor or via psql

-- Insert skill categories
INSERT INTO skill_categories (id, name, description, is_active) VALUES
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Web Development', 'Frontend and backend web development technologies', true),
  ('b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', 'Mobile Development', 'iOS, Android, and cross-platform mobile development', true),
  ('c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'Data Science', 'Data analysis, machine learning, and AI', true),
  ('d4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a', 'DevOps', 'Cloud infrastructure, CI/CD, and deployment', true),
  ('e5f6a7b8-c9d0-8e9f-2a3b-4c5d6e7f8a9b', 'Design', 'UI/UX design and graphic design', true),
  ('f6a7b8c9-d0e1-9f0a-3b4c-5d6e7f8a9b0c', 'Blockchain', 'Smart contracts and decentralized applications', true)
ON CONFLICT (id) DO NOTHING;

-- Insert skills for Web Development
INSERT INTO skills (id, category_id, name, description, is_active) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'TypeScript', 'Typed superset of JavaScript', true),
  ('11111111-1111-4111-8111-111111111112', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'JavaScript', 'Dynamic programming language for web', true),
  ('11111111-1111-4111-8111-111111111113', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'React', 'JavaScript library for building user interfaces', true),
  ('11111111-1111-4111-8111-111111111114', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Node.js', 'JavaScript runtime for server-side development', true),
  ('11111111-1111-4111-8111-111111111115', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Vue.js', 'Progressive JavaScript framework', true),
  ('11111111-1111-4111-8111-111111111116', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Angular', 'Platform for building web applications', true),
  ('11111111-1111-4111-8111-111111111117', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Next.js', 'React framework for production', true),
  ('11111111-1111-4111-8111-111111111118', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Express.js', 'Web framework for Node.js', true),
  ('11111111-1111-4111-8111-111111111119', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'HTML/CSS', 'Web markup and styling', true),
  ('11111111-1111-4111-8111-11111111111a', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Tailwind CSS', 'Utility-first CSS framework', true)
ON CONFLICT (id) DO NOTHING;

-- Insert skills for Mobile Development
INSERT INTO skills (id, category_id, name, description, is_active) VALUES
  ('22222222-2222-4222-8222-222222222221', 'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', 'React Native', 'Cross-platform mobile development with React', true),
  ('22222222-2222-4222-8222-222222222222', 'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', 'Flutter', 'Google UI toolkit for mobile apps', true),
  ('22222222-2222-4222-8222-222222222223', 'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', 'Swift', 'Apple programming language for iOS', true),
  ('22222222-2222-4222-8222-222222222224', 'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', 'Kotlin', 'Modern language for Android development', true)
ON CONFLICT (id) DO NOTHING;

-- Insert skills for Data Science
INSERT INTO skills (id, category_id, name, description, is_active) VALUES
  ('33333333-3333-4333-8333-333333333331', 'c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'Python', 'General-purpose programming language', true),
  ('33333333-3333-4333-8333-333333333332', 'c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'Machine Learning', 'AI and predictive modeling', true),
  ('33333333-3333-4333-8333-333333333333', 'c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'TensorFlow', 'Open-source ML framework', true),
  ('33333333-3333-4333-8333-333333333334', 'c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'SQL', 'Database query language', true)
ON CONFLICT (id) DO NOTHING;

-- Insert skills for DevOps
INSERT INTO skills (id, category_id, name, description, is_active) VALUES
  ('44444444-4444-4444-8444-444444444441', 'd4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a', 'Docker', 'Container platform', true),
  ('44444444-4444-4444-8444-444444444442', 'd4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a', 'Kubernetes', 'Container orchestration', true),
  ('44444444-4444-4444-8444-444444444443', 'd4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a', 'AWS', 'Amazon Web Services cloud platform', true),
  ('44444444-4444-4444-8444-444444444444', 'd4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a', 'CI/CD', 'Continuous integration and deployment', true)
ON CONFLICT (id) DO NOTHING;

-- Insert skills for Design
INSERT INTO skills (id, category_id, name, description, is_active) VALUES
  ('55555555-5555-4555-8555-555555555551', 'e5f6a7b8-c9d0-8e9f-2a3b-4c5d6e7f8a9b', 'Figma', 'Collaborative design tool', true),
  ('55555555-5555-4555-8555-555555555552', 'e5f6a7b8-c9d0-8e9f-2a3b-4c5d6e7f8a9b', 'UI/UX Design', 'User interface and experience design', true),
  ('55555555-5555-4555-8555-555555555553', 'e5f6a7b8-c9d0-8e9f-2a3b-4c5d6e7f8a9b', 'Adobe XD', 'Adobe design and prototyping tool', true)
ON CONFLICT (id) DO NOTHING;

-- Insert skills for Blockchain
INSERT INTO skills (id, category_id, name, description, is_active) VALUES
  ('66666666-6666-4666-8666-666666666661', 'f6a7b8c9-d0e1-9f0a-3b4c-5d6e7f8a9b0c', 'Solidity', 'Smart contract programming language', true),
  ('66666666-6666-4666-8666-666666666662', 'f6a7b8c9-d0e1-9f0a-3b4c-5d6e7f8a9b0c', 'Ethereum', 'Blockchain platform for dApps', true),
  ('66666666-6666-4666-8666-666666666663', 'f6a7b8c9-d0e1-9f0a-3b4c-5d6e7f8a9b0c', 'Web3.js', 'Ethereum JavaScript API', true),
  ('66666666-6666-4666-8666-666666666664', 'f6a7b8c9-d0e1-9f0a-3b4c-5d6e7f8a9b0c', 'Hardhat', 'Ethereum development environment', true)
ON CONFLICT (id) DO NOTHING;

-- Verify the data
SELECT 
  sc.name as category,
  COUNT(s.id) as skill_count
FROM skill_categories sc
LEFT JOIN skills s ON s.category_id = sc.id
GROUP BY sc.name
ORDER BY sc.name;
