-- Initial schema: users, container listings, photos, messaging.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS containers (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  container_number TEXT NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('20ft_standard', '40ft_standard', '40ft_high_cube', '45ft_high_cube', 'lcl_part_load')),
  origin_country TEXT NOT NULL,
  origin_city TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  available_space TEXT,
  departure_date DATE,
  closing_date DATE,
  price_amount NUMERIC(12, 2),
  price_currency TEXT NOT NULL DEFAULT 'USD',
  price_unit TEXT NOT NULL DEFAULT 'flat' CHECK (price_unit IN ('per_kg', 'per_lb', 'per_cbm', 'flat')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing_soon', 'full', 'closed')),
  notes TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  featured_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_containers_owner ON containers(owner_id);
CREATE INDEX IF NOT EXISTS idx_containers_route ON containers(origin_country, origin_city, destination_country, destination_city);
CREATE INDEX IF NOT EXISTS idx_containers_status ON containers(status);

CREATE TABLE IF NOT EXISTS container_photos (
  id SERIAL PRIMARY KEY,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_container_photos_container ON container_photos(container_id);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shipper_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (container_id, shipper_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
