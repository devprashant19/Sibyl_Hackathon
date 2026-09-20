// 1. Install Sibyl globally before any other imports
import { install } from '@sibyl/sdk-node';
install();

import express from 'express';
import { Pool } from 'pg';

const app = express();
app.use(express.json());

// Fake Postgres configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'quickstart',
  password: 'password',
  port: 5432,
});

/**
 * THE BUG: Time-of-Check to Time-of-Use (TOCTOU)
 * We check inventory and then update it in two separate queries,
 * without using a transaction or SELECT ... FOR UPDATE.
 * Under high concurrency, this will oversell!
 */
app.post('/api/checkout', async (req, res) => {
  const { productId, quantity } = req.body;

  try {
    // 1. Read the current inventory
    const result = await pool.query('SELECT inventory FROM products WHERE id = $1', [productId]);
    const inventory = result.rows[0]?.inventory ?? 0;

    if (inventory < quantity) {
      return res.status(400).json({ error: 'Out of stock' });
    }

    // 2. Perform the update (RACE CONDITION LIVES HERE)
    const newInventory = inventory - quantity;
    await pool.query('UPDATE products SET inventory = $1 WHERE id = $2', [newInventory, productId]);

    return res.json({ success: true, remaining: newInventory });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const server = app.listen(3000, () => {
  console.log('Quickstart API running on port 3000');
});
