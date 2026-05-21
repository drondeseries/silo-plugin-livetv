CREATE TABLE programs (
    id text PRIMARY KEY,
    xmltv_channel_id text NOT NULL,
    start_utc timestamptz NOT NULL,
    stop_utc timestamptz NOT NULL,
    title text NOT NULL,
    sub_title text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    episode_num text NOT NULL DEFAULT '',
    season_num int,
    episode int,
    categories text[] NOT NULL DEFAULT ARRAY[]::text[],
    rating text NOT NULL DEFAULT '',
    icon_url text NOT NULL DEFAULT '',
    original_air_date date
);

CREATE INDEX programs_channel_start_idx ON programs (xmltv_channel_id, start_utc);
CREATE INDEX programs_window_idx ON programs (start_utc, stop_utc);

CREATE TABLE program_credits (
    program_id text NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    kind text NOT NULL
        CHECK (kind IN ('actor','director','writer','presenter','guest','producer','composer','editor')),
    name text NOT NULL,
    position int NOT NULL DEFAULT 0,
    PRIMARY KEY (program_id, kind, name)
);
