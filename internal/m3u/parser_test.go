package m3u

import (
	"os"
	"strings"
	"testing"
)

func TestParseStandard(t *testing.T) {
	f, err := os.Open("testdata/standard.m3u")
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	defer f.Close()

	entries, err := Parse(f)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("want 2 entries, got %d", len(entries))
	}

	e0 := entries[0]
	if e0.TvgID != "bbc1.uk" {
		t.Errorf("entry 0 tvg-id = %q, want bbc1.uk", e0.TvgID)
	}
	if e0.TvgName != "BBC One" {
		t.Errorf("entry 0 tvg-name = %q, want BBC One", e0.TvgName)
	}
	if e0.TvgLogo != "https://example.com/bbc1.png" {
		t.Errorf("entry 0 tvg-logo = %q", e0.TvgLogo)
	}
	if e0.TvgChno != "101" {
		t.Errorf("entry 0 tvg-chno = %q, want 101", e0.TvgChno)
	}
	if e0.GroupTitle != "UK" {
		t.Errorf("entry 0 group-title = %q, want UK", e0.GroupTitle)
	}
	if e0.Title != "BBC One" {
		t.Errorf("entry 0 title = %q, want BBC One", e0.Title)
	}
	if e0.URL != "http://provider/bbc1.ts" {
		t.Errorf("entry 0 URL = %q", e0.URL)
	}

	e1 := entries[1]
	if e1.TvgID != "bbc2.uk" {
		t.Errorf("entry 1 tvg-id = %q, want bbc2.uk", e1.TvgID)
	}
	if e1.TvgName != "BBC Two" {
		t.Errorf("entry 1 tvg-name = %q, want BBC Two", e1.TvgName)
	}
	if e1.GroupTitle != "UK" {
		t.Errorf("entry 1 group-title = %q, want UK", e1.GroupTitle)
	}
	if e1.URL != "http://provider/bbc2.m3u8" {
		t.Errorf("entry 1 URL = %q", e1.URL)
	}
}

func TestParseQuirks(t *testing.T) {
	f, err := os.Open("testdata/quirks.m3u")
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	defer f.Close()

	entries, err := Parse(f)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("want 3 entries, got %d", len(entries))
	}

	// Entry 0: BOM stripped, no tvg-* attrs, title pulled from the comma tail.
	if entries[0].Title != "Pirate Radio FM" {
		t.Errorf("entry 0 title = %q, want Pirate Radio FM", entries[0].Title)
	}
	if entries[0].TvgName != "Pirate Radio FM" {
		t.Errorf("entry 0 tvg-name fallback = %q, want Pirate Radio FM", entries[0].TvgName)
	}
	if entries[0].URL != "http://provider/pirate.ts" {
		t.Errorf("entry 0 URL = %q", entries[0].URL)
	}

	// Entry 1: Unicode preserved in name + title.
	const ntv = "日本テレビ"
	if entries[1].TvgName != ntv {
		t.Errorf("entry 1 tvg-name = %q, want %q", entries[1].TvgName, ntv)
	}
	if entries[1].Title != ntv {
		t.Errorf("entry 1 title = %q, want %q", entries[1].Title, ntv)
	}
	if entries[1].GroupTitle != "Japan" {
		t.Errorf("entry 1 group-title = %q, want Japan", entries[1].GroupTitle)
	}

	// Entry 2: `=` inside quoted value must not break tokenization.
	if entries[2].TvgID != "weird=channel" {
		t.Errorf("entry 2 tvg-id = %q, want weird=channel", entries[2].TvgID)
	}
	if entries[2].GroupTitle != "A=B" {
		t.Errorf("entry 2 group-title = %q, want A=B", entries[2].GroupTitle)
	}
	if entries[2].Title != "Equals" {
		t.Errorf("entry 2 title = %q, want Equals", entries[2].Title)
	}
}

func TestParseRejectsNonM3U(t *testing.T) {
	_, err := Parse(strings.NewReader("not an m3u"))
	if err == nil {
		t.Fatal("Parse should reject non-M3U input")
	}
}
