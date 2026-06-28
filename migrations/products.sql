CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    category VARCHAR(100),
    image_url TEXT,
    calories DECIMAL(7,2),
    proteins_g DECIMAL(7,2),
    carbs_g DECIMAL(7,2),
    fats_g DECIMAL(7,2),
    fiber_g DECIMAL(7,2),
    sugar_g DECIMAL(7,2),
    salt_g DECIMAL(7,2),
    source VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
