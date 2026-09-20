package quickstart

import (
	"strings"

	"github.com/devprashant19/Sibyl/packages/sdk-go/sibyl"
)

var NoNegativeInventory = sibyl.Promise{
	ID:          "no-negative-inventory",
	Severity:    "CRITICAL",
	Description: "Inventory must never drop below 0",
	Check: func(ctx sibyl.PromiseContext) bool {
		updates := ctx.Timeline(func(e sibyl.Event) bool {
			query, ok := e.Payload["query"].(string)
			return ok && strings.Contains(query, "UPDATE products")
		})

		for _, u := range updates {
			args, ok := u.Payload["args"].([]interface{})
			if ok && len(args) > 0 {
				if newInventory, isInt := args[0].(int); isInt && newInventory < 0 {
					return false
				}
			}
		}
		return true
	},
}
