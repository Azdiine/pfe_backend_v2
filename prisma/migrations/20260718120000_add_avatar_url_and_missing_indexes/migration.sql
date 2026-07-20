-- avatar_url existed in the live DB but was never captured in a migration
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

-- Missing foreign-key / lookup indexes (Postgres does not index FKs automatically)
CREATE INDEX IF NOT EXISTS "fridge_items_user_id_idx" ON "fridge_items"("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_refresh_token_idx" ON "user_sessions"("refresh_token");
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications"("user_id");
CREATE INDEX IF NOT EXISTS "chat_messages_user_id_session_id_created_at_idx" ON "chat_messages"("user_id", "session_id", "created_at");
CREATE INDEX IF NOT EXISTS "otp_codes_email_idx" ON "otp_codes"("email");
CREATE INDEX IF NOT EXISTS "otp_codes_expires_at_idx" ON "otp_codes"("expires_at");
