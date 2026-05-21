// Command continuum-plugin-livetv is the live TV portal plugin entrypoint.
// It serves an IPTV / M3U live TV portal with XMLTV EPG over the Continuum
// plugin gRPC surface.
//
// Phase 1 is bootstrap-only: it embeds the manifest, applies database
// migrations, opens a pgxpool, exposes a single healthz route, and starts
// the gRPC plugin runtime. Later phases wire in capability handlers,
// scheduled tasks, the stream proxy, and the embedded SPA.
package main

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	goruntime "runtime"
	"time"

	"github.com/hashicorp/go-hclog"
	"github.com/jackc/pgx/v5/pgxpool"

	pluginv1 "github.com/ContinuumApp/continuum-plugin-sdk/pkg/pluginproto/continuum/plugin/v1"
	publicmanifest "github.com/ContinuumApp/continuum-plugin-sdk/pkg/pluginsdk/manifest"
	sdkruntime "github.com/ContinuumApp/continuum-plugin-sdk/pkg/pluginsdk/runtime"

	"github.com/ContinuumApp/continuum-plugin-livetv/internal/httproutes"
	"github.com/ContinuumApp/continuum-plugin-livetv/internal/migrate"
	"github.com/ContinuumApp/continuum-plugin-livetv/internal/refresh"
	pluginrt "github.com/ContinuumApp/continuum-plugin-livetv/internal/runtime"
	"github.com/ContinuumApp/continuum-plugin-livetv/internal/scheduler"
	"github.com/ContinuumApp/continuum-plugin-livetv/internal/server"
	"github.com/ContinuumApp/continuum-plugin-livetv/internal/store"
	"github.com/ContinuumApp/continuum-plugin-livetv/internal/streamproxy"
)

//go:embed manifest.json
var manifestRaw []byte

func main() {
	logger := hclog.New(&hclog.LoggerOptions{Name: "continuum-plugin-livetv"})

	manifest, err := loadManifest()
	if err != nil {
		fmt.Fprintf(os.Stderr, "load manifest: %v\n", err)
		os.Exit(1)
	}

	dsn := os.Getenv("PLUGIN_CONFIG_DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "PLUGIN_CONFIG_DATABASE_URL is required")
		os.Exit(1)
	}

	ctx := context.Background()
	if err := migrate.Run(ctx, dsn); err != nil {
		fmt.Fprintf(os.Stderr, "migrate: %v\n", err)
		os.Exit(1)
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "pgxpool: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	st := store.New(pool)

	// Stream-proxy dependency bundle. Phase 7 will replace StaticSettings with
	// a DB-backed snapshot the admin UI can edit at runtime.
	settings := streamproxy.StaticSettings{
		PerUser:     3,
		PerChannel:  5,
		IdleTimeout: 60 * time.Second,
		GuideWindow: 24 * time.Hour,
	}
	streamDeps := &streamproxy.Deps{
		Store:    st,
		Settings: settings,
		Logger:   logger.Named("streamproxy"),
		HTTP:     http.DefaultClient,
	}

	// Build the server package's HTTP handler — single source of truth for the
	// URL map. All routes (user API, admin API, stream-proxy bytes) are
	// mounted here; the httproutes capability bridge wraps it.
	srv := &server.Server{
		Store:    st,
		Stream:   streamDeps,
		Settings: settings,
		Logger:   logger.Named("api"),
	}

	httpSrv := httproutes.NewServer()
	httpSrv.SetHandler(srv.Routes())

	rt := pluginrt.New(manifest)

	// Build the live store + workers and wire them into the scheduler. depsFn
	// is a closure so future Configure calls can swap dependencies underneath
	// the running gRPC server (Phase 7); for now the values are static.
	m3uWorker := &refresh.M3UWorker{Store: st, Client: http.DefaultClient, Logger: logger.Named("m3u")}
	xmltvWorker := &refresh.XMLTVWorker{Store: st, Client: http.DefaultClient, Logger: logger.Named("xmltv")}
	reaper := &scheduler.SettingsReaper{Store: st, Logger: logger.Named("reaper")}
	sched := scheduler.New(func() *scheduler.Deps {
		return &scheduler.Deps{
			Store:  st,
			M3U:    m3uWorker,
			XMLTV:  xmltvWorker,
			Reaper: reaper,
		}
	}, logger)

	sdkruntime.Serve(sdkruntime.ServeConfig{
		Logger: logger,
		Servers: sdkruntime.CapabilityServers{
			Runtime:       rt,
			HttpRoutes:    httpSrv,
			ScheduledTask: sched,
		},
	})
}

// loadManifest parses the embedded manifest.json and replaces the
// __CHECKSUM__ placeholder with the sha256 of the running binary. The
// host verifies this checksum on registration.
func loadManifest() (*pluginv1.PluginManifest, error) {
	manifest, err := publicmanifest.Load(manifestRaw)
	if err != nil {
		return nil, fmt.Errorf("load embedded manifest: %w", err)
	}
	executablePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve executable path: %w", err)
	}
	binaryData, err := os.ReadFile(executablePath)
	if err != nil {
		return nil, fmt.Errorf("read executable %q: %w", executablePath, err)
	}
	checksum := sha256.Sum256(binaryData)
	manifest.Checksum = hex.EncodeToString(checksum[:])
	if len(manifest.GetSupportedPlatforms()) == 0 {
		manifest.SupportedPlatforms = []*pluginv1.SupportedPlatform{
			{Os: goruntime.GOOS, Arch: goruntime.GOARCH},
		}
	}
	return manifest, nil
}
