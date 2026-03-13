-- Migration: Add user custom skills and skill suggestions tables
-- This migration adds support for users to create custom skills and suggest them for global taxonomy

-- User custom skills table
CREATE TABLE IF NOT EXISTS user_custom_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    years_of_experience INTEGER NOT NULL CHECK (years_of_experience >= 0 AND years_of_experience <= 50),
    category_name VARCHAR(100),
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    suggested_for_global BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT user_custom_skills_name_length CHECK (LENGTH(TRIM(name)) >= 2),
    CONSTRAINT user_custom_skills_description_length CHECK (LENGTH(TRIM(description)) >= 10),
    CONSTRAINT user_custom_skills_unique_per_user UNIQUE (user_id, LOWER(name))
);

-- Skill suggestions table
CREATE TABLE IF NOT EXISTS skill_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill_name VARCHAR(100) NOT NULL,
    skill_description TEXT NOT NULL,
    category_name VARCHAR(100),
    suggested_by VARCHAR(255) NOT NULL,
    times_requested INTEGER NOT NULL DEFAULT 1 CHECK (times_requested > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT skill_suggestions_name_length CHECK (LENGTH(TRIM(skill_name)) >= 2),
    CONSTRAINT skill_suggestions_description_length CHECK (LENGTH(TRIM(skill_description)) >= 10),
    CONSTRAINT skill_suggestions_unique_name UNIQUE (LOWER(skill_name))
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_custom_skills_user_id ON user_custom_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_skills_name ON user_custom_skills(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_user_custom_skills_category ON user_custom_skills(category_name) WHERE category_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_custom_skills_approved ON user_custom_skills(is_approved);
CREATE INDEX IF NOT EXISTS idx_user_custom_skills_suggested ON user_custom_skills(suggested_for_global) WHERE suggested_for_global = TRUE;

CREATE INDEX IF NOT EXISTS idx_skill_suggestions_status ON skill_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_skill_suggestions_times_requested ON skill_suggestions(times_requested DESC);
CREATE INDEX IF NOT EXISTS idx_skill_suggestions_skill_name ON skill_suggestions(LOWER(skill_name));

-- Updated at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_user_custom_skills_updated_at 
    BEFORE UPDATE ON user_custom_skills 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_skill_suggestions_updated_at 
    BEFORE UPDATE ON skill_suggestions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) policies
ALTER TABLE user_custom_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own custom skills
CREATE POLICY "Users can view their own custom skills" ON user_custom_skills
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom skills" ON user_custom_skills
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom skills" ON user_custom_skills
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom skills" ON user_custom_skills
    FOR DELETE USING (auth.uid() = user_id);

-- Skill suggestions policies
CREATE POLICY "Users can view all skill suggestions" ON skill_suggestions
    FOR SELECT USING (true);

CREATE POLICY "Users can insert skill suggestions" ON skill_suggestions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only admins can update skill suggestion status
CREATE POLICY "Admins can update skill suggestions" ON skill_suggestions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Function to increment skill suggestion count
CREATE OR REPLACE FUNCTION increment_skill_suggestion_count(suggestion_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE skill_suggestions 
    SET times_requested = times_requested + 1,
        updated_at = NOW()
    WHERE id = suggestion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON user_custom_skills TO authenticated;
GRANT ALL ON skill_suggestions TO authenticated;
GRANT EXECUTE ON FUNCTION increment_skill_suggestion_count(UUID) TO authenticated;