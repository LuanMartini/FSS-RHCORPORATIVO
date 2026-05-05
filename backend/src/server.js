import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getPool } from './db/client.js';
import { ensureSchema, seedIfEmpty } from './db/schema.js';
import authRoutes from './routes/authRoutes.js';
import rhRoutes from './routes/rhRoutes.js';

const app = express();
const port = Number(process.env.PORT || 3333);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(authRoutes);
app.use('/rh', rhRoutes);

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});

async function main() {
  await getPool();
  await ensureSchema();
  await seedIfEmpty();
  app.listen(port, () => {
    console.log(`API http://localhost:${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
