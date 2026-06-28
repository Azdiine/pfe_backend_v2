CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100),
    birth_date DATE,
    gender VARCHAR(20),
    weight_kg DECIMAL(5,2),
    height_cm DECIMAL(5,2),
    goal VARCHAR(50),
    activity_level VARCHAR(50),
    diet_type VARCHAR(50),
    allergies TEXT[],
    health_conditions TEXT[],
    cuisine_prefs TEXT[],
    target_calories INTEGER,
    target_weight_kg DECIMAL(5,2),
    onboarding_done BOOLEAN DEFAULT false
);