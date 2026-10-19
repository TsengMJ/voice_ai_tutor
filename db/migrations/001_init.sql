create table learners (
  id uuid primary key,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table scenarios (
  id text primary key,
  title text not null,
  level text not null,
  goals jsonb not null,
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  learner_id uuid not null references learners (id),
  scenario_id text not null references scenarios (id),
  language text not null,
  timezone text not null,
  local_day date not null,
  status text not null check (status in ('active', 'ended')),
  mode text not null check (mode in ('voice', 'text')),
  started_at timestamptz not null,
  ended_at timestamptz,
  voice_ms integer not null default 0,
  text_ms integer not null default 0,
  turn_count integer not null default 0,
  goals_completed text[] not null default '{}',
  avg_latency_ms integer,
  summary jsonb,
  updated_at timestamptz not null default now()
);

create index sessions_learner_started_idx on sessions (learner_id, started_at desc);
create index sessions_learner_day_idx on sessions (learner_id, local_day);

create table turns (
  session_id uuid not null references sessions (id) on delete cascade,
  seq integer not null,
  id text not null,
  role text not null check (role in ('learner', 'tutor')),
  modality text not null check (modality in ('voice', 'text')),
  text text not null,
  interrupted boolean not null default false,
  created_at timestamptz not null,
  primary key (session_id, seq)
);

create table corrections (
  id text primary key,
  session_id uuid not null references sessions (id) on delete cascade,
  learner_id uuid not null references learners (id),
  category text not null,
  original text not null,
  corrected text not null,
  explanation text not null,
  created_at timestamptz not null
);

create index corrections_learner_category_idx on corrections (learner_id, category);
create index corrections_session_idx on corrections (session_id);

create table daily_stats (
  learner_id uuid not null references learners (id),
  day date not null,
  sessions integer not null default 0,
  practice_ms bigint not null default 0,
  voice_ms bigint not null default 0,
  text_ms bigint not null default 0,
  turns integer not null default 0,
  goals integer not null default 0,
  corrections integer not null default 0,
  primary key (learner_id, day)
);
