package server

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/RXWatcher/silo-plugin-livetv/web"
)

// Routes returns the fully composed http.Handler for the plugin. The shape:
//
//	{BasePath}/healthz                              public
//	{BasePath}/channels                              session
//	{BasePath}/channels/{id}                         session
//	{BasePath}/groups                                session
//	{BasePath}/guide                                 session
//	{BasePath}/programs/{id}                         session
//	{BasePath}/programs/search                       session
//	{BasePath}/favorites                             session
//	{BasePath}/favorites/{channel_id}                session
//	{BasePath}/favorites/reorder                     session
//	{BasePath}/recent                                session
//	{BasePath}/channels/{id}/stream                  session (mints session)
//	{BasePath}/stream/{session_id}.ts                token cookie
//	{BasePath}/stream/{session_id}.m3u8              token cookie
//	{BasePath}/stream/{session_id}/segment           token cookie
//	{BasePath}/admin/*                               admin (Phase 7)
//
// The user/admin routes funnel through RequireSession / RequireAdmin so the
// X-Silo-User-Id header is reflected onto request context. The
// stream-byte routes deliberately skip that middleware because they
// authenticate via the opaque session cookie set by CreateSession.
func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	base := s.basePath()

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if strings.HasSuffix(req.URL.Path, "/livetv") {
				target := req.URL.Path + "/"
				if req.URL.RawQuery != "" {
					target = target + "?" + req.URL.RawQuery
				}
				http.Redirect(w, req, target, http.StatusMovedPermanently)
				return
			}
			next.ServeHTTP(w, req)
		})
	})

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})


	r.Route(base, func(api chi.Router) {
		// User-scoped API (RequireSession reflects X-Silo-User-Id).
		api.Group(func(u chi.Router) {
			u.Use(RequireSession)
			u.Get("/channels", s.listChannels)
			u.Get("/channels/{id}", s.getChannel)
			u.Get("/groups", s.listGroups)
			u.Get("/guide", s.guideWindow)
			u.Get("/programs/search", s.searchPrograms)
			u.Get("/programs/{id}", s.getProgram)
			u.Get("/favorites", s.listFavorites)
			u.Post("/favorites/reorder", s.reorderFavorites)
			u.Post("/favorites/{channel_id}", s.addFavorite)
			u.Delete("/favorites/{channel_id}", s.removeFavorite)
			u.Get("/recent", s.listRecent)
			if s.Stream != nil {
				u.Post("/channels/{id}/stream", s.Stream.CreateSession)
			}
		})

		// Stream byte routes: cookie/bearer auth, no session header needed.
		if s.Stream != nil {
			api.Get("/stream/{session_id}.ts", s.Stream.ProxyMPEGTS)
			api.Get("/stream/{session_id}.m3u8", s.Stream.ProxyHLSPlaylist)
			api.Get("/stream/{session_id}/segment", s.Stream.ProxyHLSSegment)
		}

		// Admin subrouter — gated by RequireAdmin. Sub-mounts live in
		// admin_sources.go, admin_channels.go, admin_sessions.go,
		// admin_settings.go so the route table here stays a quick directory
		// rather than a wall of handlers.
		api.Route("/admin", func(adm chi.Router) {
			adm.Use(RequireAdmin)
			s.mountAdminSources(adm)
			s.mountAdminChannels(adm)
			s.mountAdminSessions(adm)
			s.mountAdminSettings(adm)
			adm.Handle("/*", http.StripPrefix(base+"/admin", web.SPAHandler()))
		})


		// Serve static assets and fallback to SPA for any non-API routes.
		api.Handle("/*", http.StripPrefix(base, web.SPAHandler()))
	})


	return r
}
