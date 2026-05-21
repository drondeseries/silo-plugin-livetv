package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Program mirrors the programs table. Credits is populated on read by
// GetProgram but is intentionally left nil/empty by list queries —
// callers that need credits fetch the program individually.
type Program struct {
	ID              string
	XMLTVChannelID  string
	Title           string
	SubTitle        string
	Description     string
	EpisodeNum      string
	Rating          string
	IconURL         string
	Start           time.Time
	Stop            time.Time
	Categories      []string
	SeasonNum       *int
	Episode         *int
	OriginalAirDate *time.Time
	Credits         []Credit
}

// Credit mirrors the program_credits table.
type Credit struct {
	Kind     string
	Name     string
	Position int
}

// ReplaceFutureForChannel atomically deletes future programs for
// xmltvChannelID and inserts the supplied batch. Past programs (stop_utc
// in the past or start_utc < now()) are preserved so historical guide
// queries keep returning their data.
//
// Uses a single transaction with pgx.CopyFrom for the insert.
func (s *Store) ReplaceFutureForChannel(ctx context.Context, xmltvChannelID string, programs []Program) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		DELETE FROM programs
		WHERE xmltv_channel_id = $1 AND start_utc >= now()
	`, xmltvChannelID); err != nil {
		return fmt.Errorf("delete future: %w", err)
	}

	if len(programs) == 0 {
		return tx.Commit(ctx)
	}

	rowsSrc := make([][]any, 0, len(programs))
	for _, p := range programs {
		id := p.ID
		if id == "" {
			id = newULID()
		}
		channelID := p.XMLTVChannelID
		if channelID == "" {
			channelID = xmltvChannelID
		}
		cats := p.Categories
		if cats == nil {
			cats = []string{}
		}
		var oad *time.Time
		if p.OriginalAirDate != nil {
			oad = p.OriginalAirDate
		}
		rowsSrc = append(rowsSrc, []any{
			id, channelID, p.Start, p.Stop, p.Title,
			p.SubTitle, p.Description, p.EpisodeNum,
			p.SeasonNum, p.Episode, cats, p.Rating, p.IconURL, oad,
		})
	}

	if _, err := tx.CopyFrom(ctx,
		pgx.Identifier{"programs"},
		[]string{
			"id", "xmltv_channel_id", "start_utc", "stop_utc", "title",
			"sub_title", "description", "episode_num",
			"season_num", "episode", "categories", "rating", "icon_url",
			"original_air_date",
		},
		pgx.CopyFromRows(rowsSrc),
	); err != nil {
		return fmt.Errorf("copy programs: %w", err)
	}

	return tx.Commit(ctx)
}

// PruneOldPrograms removes programs that ended before cutoff.
func (s *Store) PruneOldPrograms(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM programs WHERE stop_utc < $1`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("prune programs: %w", err)
	}
	return tag.RowsAffected(), nil
}

// GuideWindow returns the programs overlapping [start, end) for any channel
// in channelIDs. Keys in the returned map are channel ids (NOT xmltv ids),
// reached via channel_epg_keys.
func (s *Store) GuideWindow(ctx context.Context, channelIDs []string, start, end time.Time) (map[string][]Program, error) {
	out := make(map[string][]Program, len(channelIDs))
	if len(channelIDs) == 0 {
		return out, nil
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT k.channel_id, p.id, p.xmltv_channel_id, p.start_utc, p.stop_utc,
		       p.title, p.sub_title, p.description, p.episode_num,
		       p.season_num, p.episode, p.categories, p.rating, p.icon_url,
		       p.original_air_date
		FROM channel_epg_keys k
		JOIN programs p ON p.xmltv_channel_id = k.xmltv_channel_id
		WHERE k.channel_id = ANY($1::text[])
		  AND p.stop_utc > $2
		  AND p.start_utc < $3
		ORDER BY k.channel_id, p.start_utc ASC
	`, channelIDs, start, end)
	if err != nil {
		return nil, fmt.Errorf("guide window: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			cid string
			p   Program
		)
		if err := rows.Scan(&cid, &p.ID, &p.XMLTVChannelID, &p.Start, &p.Stop,
			&p.Title, &p.SubTitle, &p.Description, &p.EpisodeNum,
			&p.SeasonNum, &p.Episode, &p.Categories, &p.Rating, &p.IconURL,
			&p.OriginalAirDate); err != nil {
			return nil, fmt.Errorf("scan guide row: %w", err)
		}
		out[cid] = append(out[cid], p)
	}
	return out, rows.Err()
}

// GetProgram returns a program with its credits in original Position order.
func (s *Store) GetProgram(ctx context.Context, id string) (Program, error) {
	row := s.Pool.QueryRow(ctx, `
		SELECT id, xmltv_channel_id, start_utc, stop_utc, title, sub_title,
		       description, episode_num, season_num, episode, categories,
		       rating, icon_url, original_air_date
		FROM programs WHERE id = $1
	`, id)
	var p Program
	if err := row.Scan(&p.ID, &p.XMLTVChannelID, &p.Start, &p.Stop, &p.Title,
		&p.SubTitle, &p.Description, &p.EpisodeNum, &p.SeasonNum, &p.Episode,
		&p.Categories, &p.Rating, &p.IconURL, &p.OriginalAirDate); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Program{}, ErrNotFound
		}
		return Program{}, fmt.Errorf("get program: %w", err)
	}

	credRows, err := s.Pool.Query(ctx, `
		SELECT kind, name, position FROM program_credits
		WHERE program_id = $1
		ORDER BY position ASC, kind ASC, name ASC
	`, id)
	if err != nil {
		return Program{}, fmt.Errorf("get credits: %w", err)
	}
	defer credRows.Close()
	for credRows.Next() {
		var c Credit
		if err := credRows.Scan(&c.Kind, &c.Name, &c.Position); err != nil {
			return Program{}, fmt.Errorf("scan credit: %w", err)
		}
		p.Credits = append(p.Credits, c)
	}
	if err := credRows.Err(); err != nil {
		return Program{}, err
	}
	return p, nil
}

// InsertCredits writes the credits batch for a program. Used by the EPG
// refresher when ingesting program rows produced by xmltv.Parse.
func (s *Store) InsertCredits(ctx context.Context, programID string, credits []Credit) error {
	if len(credits) == 0 {
		return nil
	}
	rowsSrc := make([][]any, 0, len(credits))
	for _, c := range credits {
		rowsSrc = append(rowsSrc, []any{programID, c.Kind, c.Name, c.Position})
	}
	if _, err := s.Pool.CopyFrom(ctx,
		pgx.Identifier{"program_credits"},
		[]string{"program_id", "kind", "name", "position"},
		pgx.CopyFromRows(rowsSrc),
	); err != nil {
		return fmt.Errorf("insert credits: %w", err)
	}
	return nil
}

// SearchPrograms does a case-insensitive substring search on title,
// description, and sub_title across the window [from, to). Results are
// ordered by start_utc ascending. limit is hard-capped at 500.
func (s *Store) SearchPrograms(ctx context.Context, q string, from, to time.Time, limit int) ([]Program, error) {
	if limit <= 0 || limit > 500 {
		limit = 500
	}
	needle := "%" + strings.ToLower(q) + "%"
	rows, err := s.Pool.Query(ctx, `
		SELECT id, xmltv_channel_id, start_utc, stop_utc, title, sub_title,
		       description, episode_num, season_num, episode, categories,
		       rating, icon_url, original_air_date
		FROM programs
		WHERE start_utc >= $1 AND start_utc < $2
		  AND (lower(title) LIKE $3
		       OR lower(description) LIKE $3
		       OR lower(sub_title) LIKE $3)
		ORDER BY start_utc ASC
		LIMIT $4
	`, from, to, needle, limit)
	if err != nil {
		return nil, fmt.Errorf("search programs: %w", err)
	}
	defer rows.Close()
	var out []Program
	for rows.Next() {
		var p Program
		if err := rows.Scan(&p.ID, &p.XMLTVChannelID, &p.Start, &p.Stop,
			&p.Title, &p.SubTitle, &p.Description, &p.EpisodeNum,
			&p.SeasonNum, &p.Episode, &p.Categories, &p.Rating, &p.IconURL,
			&p.OriginalAirDate); err != nil {
			return nil, fmt.Errorf("scan program: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
