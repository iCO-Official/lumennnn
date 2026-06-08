-- Table for user profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  age INTEGER,
  gender TEXT,
  height INTEGER,
  weight INTEGER,
  bio TEXT
);

-- Table for routines
CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  title TEXT,
  day_of_week TEXT, -- e.g., 'monday', 'tuesday'
  time TIME,
  enabled BOOLEAN DEFAULT TRUE
);