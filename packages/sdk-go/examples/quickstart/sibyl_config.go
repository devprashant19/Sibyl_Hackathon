package main

import (
	"strings"

	"github.com/devprashant19/Sibyl/packages/sdk-go/sibyl"
)

// NoNegativeInventory is not evaluated by anything yet: there is no Go orchestrator. It shows the
// intended shape of a promise over captured events.
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
				// database/sql converts integer arguments to int64 before they reach the driver.
				if newInventory, isInt := args[0].(int64); isInt && newInventory < 0 {
					return false
				}
			}
		}
		return true
	},
}
