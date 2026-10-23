require('dotenv/config');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const catalogRoutes = require('./routes/catalog.routes');

const app = express();
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());
app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.use('/api', authRoutes);
app.use('/api', catalogRoutes);

app.listen(port, host, () => {
  console.log(`Server listening at http://${host}:${port}`);
}).on('error', (error) => {
  console.error(error);
  process.exit(1);
});
