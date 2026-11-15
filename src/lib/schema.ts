/** Idempotent schema, applied on first connection. */
export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS circles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  elder_name    text NOT NULL,
  timezone      text NOT NULL,
  language      text NOT NULL DEFAULT 'en',
  passcode_hash text NOT NULL,
  -- Emergency card
  blood_group   text NOT NULL DEFAULT '',
  conditions    text NOT NULL DEFAULT '',
  allergies     text NOT NULL DEFAULT '',
  emergency_contact text NOT NULL DEFAULT '',
  doctor_contact    text NOT NULL DEFAULT '',
  card_token    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  email      text,
  role       text NOT NULL CHECK (role IN ('elder', 'caretaker', 'family')),
  notify     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS members_circle_idx ON members(circle_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         bigserial PRIMARY KEY,
  circle_code text NOT NULL,
  succeeded  boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_code_idx ON login_attempts(circle_code, created_at);

CREATE TABLE IF NOT EXISTS medications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id        uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name             text NOT NULL,
  dosage           text NOT NULL DEFAULT '',
  instructions     text NOT NULL DEFAULT '',
  times            text[] NOT NULL,
  days_of_week     smallint[] NOT NULL DEFAULT '{}',
  start_date       date NOT NULL,
  end_date         date,
  stock            integer,
  refill_threshold integer NOT NULL DEFAULT 5,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medications_circle_idx ON medications(circle_id);

CREATE TABLE IF NOT EXISTS dose_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  scheduled_at  timestamptz NOT NULL,
  status        text NOT NULL CHECK (status IN ('taken', 'skipped')),
  logged_by     text NOT NULL,
  logged_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (medication_id, scheduled_at)
);

CREATE TABLE IF NOT EXISTS appointments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  title      text NOT NULL,
  doctor     text NOT NULL DEFAULT '',
  location   text NOT NULL DEFAULT '',
  starts_at  timestamptz NOT NULL,
  notes      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_circle_idx ON appointments(circle_id, starts_at);

CREATE TABLE IF NOT EXISTS activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  actor      text NOT NULL,
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_circle_idx ON activity(circle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL UNIQUE,
  kind       text NOT NULL,
  recipients text[] NOT NULL,
  subject    text NOT NULL,
  delivered  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_circle_idx ON notifications(circle_id, created_at DESC);
`;
