CREATE TABLE fridge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    custom_name VARCHAR(255),
    emoji VARCHAR(10),
    quantity VARCHAR(50),
    unit VARCHAR(20),
    shelf_location VARCHAR(20) DEFAULT 'middle_shelf',
    expiry_date DATE,
    days_until_expiry INTEGER,
    added_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
