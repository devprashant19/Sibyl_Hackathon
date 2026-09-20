package sibyl

import (
	"context"
	"database/sql/driver"
	"time"
	"fmt"
)

// Driver is a wrapper around a database/sql/driver.Driver
// It allows us to intercept connections, queries, and executions.
type Driver struct {
	Base driver.Driver
}

func WrapDriver(base driver.Driver) *Driver {
	return &Driver{Base: base}
}

func (d *Driver) Open(name string) (driver.Conn, error) {
	conn, err := d.Base.Open(name)
	if err != nil {
		return nil, err
	}
	return &Conn{Base: conn}, nil
}

type Conn struct {
	Base driver.Conn
}

func (c *Conn) Prepare(query string) (driver.Stmt, error) {
	stmt, err := c.Base.Prepare(query)
	if err != nil {
		return nil, err
	}
	return &Stmt{Base: stmt, Query: query}, nil
}

func (c *Conn) Close() error { return c.Base.Close() }
func (c *Conn) Begin() (driver.Tx, error) { return c.Base.Begin() }

type Stmt struct {
	Base  driver.Stmt
	Query string
}

func (s *Stmt) Close() error { return s.Base.Close() }
func (s *Stmt) NumInput() int { return s.Base.NumInput() }

func (s *Stmt) Exec(args []driver.Value) (driver.Result, error) {
	// For demonstration: Weak heuristic to simulate SLOW_IO on UPDATE
	// In reality, we consult the Sibyl Orchestrator here
	if len(s.Query) > 15 && s.Query[:15] == "UPDATE products" {
		fmt.Println("[Sibyl] Injecting SLOW_IO fault on UPDATE...")
		time.Sleep(150 * time.Millisecond) // Should use VirtualClock
	}
	return s.Base.Exec(args)
}

func (s *Stmt) Query(args []driver.Value) (driver.Rows, error) {
	return s.Base.Query(args)
}

// Additional interface implementations (ExecerContext, QueryerContext, etc.) would be required for a full driver.
