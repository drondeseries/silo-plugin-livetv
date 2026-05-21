CREATE TABLE channels (
    id text PRIMARY KEY,
    source_m3u_id text NOT NULL REFERENCES m3u_sources(id) ON DELETE CASCADE,
    source_channel_id text NOT NULL,
    display_name text NOT NULL,
    channel_number_src text NOT NULL DEFAULT '',
    channel_number_admin text,
    logo_url text NOT NULL DEFAULT '',
    group_title_src text NOT NULL DEFAULT '',
    group_title_admin text,
    upstream_url text NOT NULL,
    upstream_kind text NOT NULL DEFAULT 'unknown'
        CHECK (upstream_kind IN ('mpegts','hls','unknown')),
    attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled_src boolean NOT NULL DEFAULT true,
    enabled_admin boolean,
    position int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_m3u_id, source_channel_id)
);

CREATE INDEX channels_enabled_group_idx ON channels (coalesce(enabled_admin, enabled_src), group_title_src);
CREATE INDEX channels_name_idx ON channels (lower(display_name) text_pattern_ops);

CREATE TABLE channel_epg_keys (
    channel_id text NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    xmltv_channel_id text NOT NULL,
    auto_linked boolean NOT NULL DEFAULT true,
    PRIMARY KEY (channel_id, xmltv_channel_id)
);

CREATE INDEX channel_epg_keys_xmltv_idx ON channel_epg_keys (xmltv_channel_id);
