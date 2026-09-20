package sibyl

import (
	"database/sql/driver"
)

// BeforeExec, when set, is called before every statement executed through a wrapped driver. It
// may block (to inject latency) or return an error (to inject a failure), which is returned from
// Exec instead of running the statement. It is nil by default: the wrapper injects nothing on its
// own. There is no Go orchestrator yet; tests set this hook themselves.
var BeforeExec func(query string, args []driver.Value) error

// Driver is a wrapper around a database/sql/driver.Driver.
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
	return &Stmt{Base: stmt, SQL: query}, nil
}

func (c *Conn) Close() error { return c.Base.Close() }

func (c *Conn) Begin() (driver.Tx, error) { return c.Base.Begin() }

type Stmt struct {
	Base driver.Stmt
	// SQL is the statement text. (Named SQL, not Query: Stmt also has a Query method.)
	SQL string
}

func (s *Stmt) Close() error  { return s.Base.Close() }
func (s *Stmt) NumInput() int { return s.Base.NumInput() }

func (s *Stmt) Exec(args []driver.Value) (driver.Result, error) {
	if hook := BeforeExec; hook != nil {
		if err := hook(s.SQL, args); err != nil {
			return nil, err
		}
	}
	return s.Base.Exec(args)
}

func (s *Stmt) Query(args []driver.Value) (driver.Rows, error) {
	return s.Base.Query(args)
}

// Additional interface implementations (ExecerContext, QueryerContext, etc.) would be required for a full driver.
