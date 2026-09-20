package sibyl

import (
	"net/http"
)

type SibylRoundTripper struct {
	Base http.RoundTripper
}

func NewTransport(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return &SibylRoundTripper{Base: base}
}

func (s *SibylRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	// 1. Check orchestrator for HTTP faults
	// e.g. delay if SLOW_IO, return error if NETWORK_FAILURE, etc.

	// 2. Execute original request
	return s.Base.RoundTrip(req)
}
