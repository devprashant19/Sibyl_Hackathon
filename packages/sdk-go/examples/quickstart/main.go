package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/devprashant19/Sibyl/packages/sdk-go/sibyl"
	"github.com/lib/pq"
)

var db *sql.DB

func init() {
	// 1. Install Sibyl Driver by wrapping the postgres driver
	sql.Register("sibyl-postgres", sibyl.WrapDriver(&pq.Driver{}))
}

type CheckoutRequest struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

func checkoutHandler(w http.ResponseWriter, r *http.Request) {
	if db == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success": true, "remaining": 9}`))
		return
	}

	var req CheckoutRequest
	json.NewDecoder(r.Body).Decode(&req)

	// THE BUG: Time-of-Check to Time-of-Use (TOCTOU)
	// We read, and then write, without a transaction or SELECT ... FOR UPDATE.
	var inventory int
	err := db.QueryRow("SELECT inventory FROM products WHERE id = $1", req.ProductID).Scan(&inventory)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if inventory < req.Quantity {
		http.Error(w, "Out of stock", http.StatusBadRequest)
		return
	}

	newInventory := inventory - req.Quantity
	_, err = db.Exec("UPDATE products SET inventory = $1 WHERE id = $2", newInventory, req.ProductID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"remaining": newInventory,
	})
}

func main() {
	var err error
	db, err = sql.Open("sibyl-postgres", "user=postgres password=password dbname=quickstart sslmode=disable")
	if err != nil {
		log.Println("Warning: Could not connect to Postgres. This is just an example.")
	}

	http.HandleFunc("/api/checkout", checkoutHandler)
	log.Println("Listening on :8080...")
	http.ListenAndServe(":8080", nil)
}
