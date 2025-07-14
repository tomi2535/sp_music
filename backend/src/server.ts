import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { Request, Response } from 'express';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('YouTube Playlist Player backend is running!');
});

app.get('/api/playlists', (req: Request, res: Response) => {
  const csvPath = path.join(__dirname, '../sample_playlist.csv');
  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: 'sample_playlist.csv not found' });
  }
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
  res.json(records);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); 