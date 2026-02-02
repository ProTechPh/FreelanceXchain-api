-- Migration: Remove Auto User Creation Trigger
-- Description: Removes the trigger that automatically creates users in public.users
--              when a new user is created in auth.users via OAuth.
--              This allows our backend to control user creation and enforce role selection.
-- Date: 2026-01-21

-- Drop the trigger that auto-creates users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Note: We keep the handle_new_user() function in case we need it later
-- If you want to completely remove it, uncomment the line below:
-- DROP FUNCTION IF EXISTS handle_new_user();

-- Explanation:
-- Previously, when a user signed in with OAuth (Google, GitHub, etc.),
-- Supabase would create a user in auth.users, and our trigger would
-- automatically create a corresponding user in public.users with role='freelancer'.
-- 
-- This prevented our role selection modal from appearing because the user
-- already existed in public.users by the time the frontend checked.
--
-- Now, the flow is:
-- 1. User signs in with OAuth → Created in auth.users only
-- 2. Backend checks public.users → User not found
-- 3. Backend returns 202 (registration required)
-- 4. Frontend shows role selection modal
-- 5. User selects role → Backend creates user in public.users
-- 6. User is logged in with selected role

COMMENT ON FUNCTION handle_new_user IS 'DISABLED: Previously auto-created users in public.users. Now users must explicitly select a role during OAuth registration.';
