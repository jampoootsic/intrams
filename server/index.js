import app from './app.js';

const PORT = Number(process.env.PORT || 3010);

app.listen(PORT, () => {
  console.log(`Events scoring server running at http://localhost:${PORT}`);
});
