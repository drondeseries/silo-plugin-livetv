// Package m3u parses M3U playlists with #EXTINF attribute syntax commonly used
// by IPTV providers. The parser is permissive about whitespace and the order of
// key="value" attributes, but rejects input whose first non-empty line is not
// #EXTM3U.
package m3u

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"strings"
)

// Entry is one channel parsed from a playlist.
type Entry struct {
	TvgID      string
	TvgName    string
	TvgLogo    string
	TvgChno    string
	TvgShift   string
	GroupTitle string
	Title      string
	URL        string
	// Attrs holds the full key=value map from the #EXTINF line so future
	// callers can read attributes the typed fields above don't cover.
	Attrs map[string]string
}

// utf8BOM is the byte order mark that some providers prepend to their playlists.
var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// Parse reads an M3U playlist and returns its entries in source order.
func Parse(r io.Reader) ([]Entry, error) {
	br := bufio.NewReader(r)

	// Strip a leading UTF-8 BOM, if present, before we look for #EXTM3U.
	if peek, _ := br.Peek(len(utf8BOM)); len(peek) == len(utf8BOM) {
		if peek[0] == utf8BOM[0] && peek[1] == utf8BOM[1] && peek[2] == utf8BOM[2] {
			_, _ = br.Discard(len(utf8BOM))
		}
	}

	scanner := bufio.NewScanner(br)
	// Allow long playlist lines (URLs + many attrs).
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	var entries []Entry
	var pending *Entry
	headerSeen := false

	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		if !headerSeen {
			if !strings.HasPrefix(trimmed, "#EXTM3U") {
				return nil, errors.New("m3u: missing #EXTM3U header")
			}
			headerSeen = true
			continue
		}

		if strings.HasPrefix(trimmed, "#EXTINF:") {
			e, err := parseExtinf(strings.TrimPrefix(trimmed, "#EXTINF:"))
			if err != nil {
				return nil, err
			}
			pending = &e
			continue
		}

		if strings.HasPrefix(trimmed, "#") {
			// Ignore other directives like #EXTVLCOPT, #EXTGRP, etc.
			continue
		}

		// Non-directive, non-empty line is the URL for the pending entry.
		if pending == nil {
			// Stray URL without an EXTINF; skip silently.
			continue
		}
		pending.URL = trimmed
		entries = append(entries, *pending)
		pending = nil
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("m3u: read: %w", err)
	}

	if !headerSeen {
		return nil, errors.New("m3u: empty input")
	}

	return entries, nil
}

// parseExtinf parses the body of an EXTINF line (everything after #EXTINF:).
// It expects: <duration>[ key="value" ...],<title>
func parseExtinf(body string) (Entry, error) {
	// Title is everything after the final comma.
	commaIdx := strings.LastIndex(body, ",")
	var attrPart, title string
	if commaIdx >= 0 {
		attrPart = body[:commaIdx]
		title = strings.TrimSpace(body[commaIdx+1:])
	} else {
		attrPart = body
	}

	// Skip the leading duration token.
	attrPart = strings.TrimSpace(attrPart)
	if sp := strings.IndexAny(attrPart, " \t"); sp >= 0 {
		attrPart = attrPart[sp+1:]
	} else {
		attrPart = ""
	}

	attrs := parseAttrs(attrPart)

	e := Entry{
		Title:      title,
		Attrs:      attrs,
		TvgID:      attrs["tvg-id"],
		TvgName:    attrs["tvg-name"],
		TvgLogo:    attrs["tvg-logo"],
		TvgChno:    attrs["tvg-chno"],
		TvgShift:   attrs["tvg-shift"],
		GroupTitle: attrs["group-title"],
	}
	if e.TvgName == "" {
		e.TvgName = title
	}
	return e, nil
}

// parseAttrs walks a space-separated list of key="value" pairs. It is tolerant
// of `=` and whitespace inside the quoted value: the closing quote, not
// whitespace or `=`, terminates the value.
func parseAttrs(s string) map[string]string {
	attrs := map[string]string{}
	i := 0
	n := len(s)
	for i < n {
		// Skip whitespace between attrs.
		for i < n && (s[i] == ' ' || s[i] == '\t') {
			i++
		}
		if i >= n {
			break
		}
		// Read key up to '='.
		keyStart := i
		for i < n && s[i] != '=' && s[i] != ' ' && s[i] != '\t' {
			i++
		}
		key := s[keyStart:i]
		if i >= n || s[i] != '=' {
			// Malformed pair; skip to next whitespace.
			for i < n && s[i] != ' ' && s[i] != '\t' {
				i++
			}
			continue
		}
		i++ // consume '='
		if i >= n {
			break
		}
		if s[i] != '"' {
			// Unquoted value: read until whitespace.
			valStart := i
			for i < n && s[i] != ' ' && s[i] != '\t' {
				i++
			}
			if key != "" {
				attrs[key] = s[valStart:i]
			}
			continue
		}
		i++ // consume opening quote
		valStart := i
		for i < n && s[i] != '"' {
			i++
		}
		val := s[valStart:i]
		if i < n {
			i++ // consume closing quote
		}
		if key != "" {
			attrs[key] = val
		}
	}
	return attrs
}
