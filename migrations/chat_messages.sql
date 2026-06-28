CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_bot BOOLEAN DEFAULT false,
    model_used VARCHAR(50),
    tokens_used INTEGER,
    session_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);
