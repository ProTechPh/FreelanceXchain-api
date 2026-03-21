-- Fix the notify_email_on_notification function to handle missing configuration
-- The function was trying to use current_setting() which requires the parameters to be set
-- We'll modify it to use environment variables from Supabase Vault or make it optional

CREATE OR REPLACE FUNCTION public.notify_email_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  request_id bigint;
  payload jsonb;
  supabase_url text;
  service_role_key text;
BEGIN
  -- Try to get configuration, but don't fail if not set
  BEGIN
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.supabase_service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    -- Configuration not set, skip email notification
    RAISE NOTICE 'Supabase configuration not set, skipping email notification for notification %', NEW.id;
    RETURN NEW;
  END;

  -- Only proceed if configuration is available
  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE NOTICE 'Supabase configuration incomplete, skipping email notification for notification %', NEW.id;
    RETURN NEW;
  END IF;

  -- Build payload for Edge Function
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW)
  );

  -- Make async HTTP request to Edge Function
  BEGIN
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/send-notification-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := payload
    ) INTO request_id;

    RAISE NOTICE 'Notification email trigger fired for notification %', NEW.id;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to send notification email for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
