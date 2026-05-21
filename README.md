# Live TV Portal for Continuum

`continuum.livetv` is Continuum's user-facing live TV portal. It ingests IPTV
M3U playlists and XMLTV electronic program guides, presents a channel grid and
guide, proxies streams to clients, and tracks per-user favorites and recent
channels.

This plugin is in active development; the surfaces described in the design
spec land incrementally across phases. The current build provides only the
plugin scaffold, the database schema, and a `/healthz` route.

## Features

- M3U source ingestion with periodic refresh.
- XMLTV guide ingestion with periodic refresh.
- Channel grid, favorites, recents, and EPG search.
- Per-user and per-channel concurrency caps and idle-session reaping.
- Stream proxy with scoped grants.

## Architecture

The portal owns its own Postgres schema and serves both a customer-facing
SPA and the admin SPA from a single embedded asset bundle. Stream traffic
flows through a thin proxy that mints scoped grants against the configured
M3U upstream.

## Configuration

| Key | Required | Description |
|---|---|---|
| `database_url` | yes | Postgres DSN using the `livetv` schema. |

Example DSN:

```text
postgres://plugin_livetv:password@postgres:5432/continuum?search_path=livetv&sslmode=disable
```

## Database Setup

```sql
CREATE ROLE plugin_livetv WITH LOGIN PASSWORD '<chosen>';
CREATE SCHEMA livetv AUTHORIZATION plugin_livetv;
GRANT CONNECT ON DATABASE continuum TO plugin_livetv;
```

The plugin applies its migrations at startup.

## HTTP Surface

The full HTTP surface is documented in later phases. Phase 1 exposes only:

| Route | Access | Purpose |
|---|---|---|
| `/healthz` | n/a | Liveness probe (204 No Content). |

## Build And Test

```bash
go test ./...
go build ./...
```
