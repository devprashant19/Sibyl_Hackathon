package sibyl

type Event struct {
	Domain    string
	Type      string
	Payload   map[string]interface{}
	Timestamp int64
}

type PromiseContext interface {
	Timeline(filter func(Event) bool) []Event
	Events() []Event
}

type Promise struct {
	ID          string
	Description string
	Severity    string
	Check       func(ctx PromiseContext) bool
}
