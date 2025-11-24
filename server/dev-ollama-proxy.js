import express from 'express';

const app = express();
const PORT = process.env.DEV_PROXY_PORT || 8787;
const CLOUD_VISION_MODEL = 'qwen3-vl:235b-instruct-cloud';
const inMemoryStore = { ollamaKey: '' };

app.use(express.json({ limit: '25mb' }));

const normalizeUrl = (raw = '') => {
  let clean = raw.trim();
  if (!clean) return '';
  clean = clean.replace(/\/api\/?$/i, '').replace(/\/$/, '');
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
};

const resolveBaseUrl = (bodyUrl) => {
  const resolved = normalizeUrl(bodyUrl || process.env.OLLAMA_URL || '');
  if (!resolved) {
    throw new Error('Missing Ollama URL. Provide one in settings or .env.');
  }
  return resolved;
};

const resolveModel = (bodyModel) => {
  return bodyModel?.trim() || process.env.OLLAMA_MODEL || CLOUD_VISION_MODEL;
};

const resolveKey = (bodyKey) => {
  const key = (bodyKey || inMemoryStore.ollamaKey || process.env.OLLAMA_API_KEY || '').trim();
  return key || undefined;
};

const forward = async ({ baseUrl, apiKey, model, prompt, images, stream }) => {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, prompt, images, stream: Boolean(stream) })
  });

  const text = await response.text();
  return { status: response.status, body: text };
};

const handleProxy = async (req, res) => {
  try {
    const baseUrl = resolveBaseUrl(req.body?.url);
    const apiKey = resolveKey(req.body?.key);
    const model = resolveModel(req.body?.model);
    const prompt = req.body?.prompt;
    const images = req.body?.images;

    if (!prompt && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Prompt or images are required.' });
    }

    const upstream = await forward({ baseUrl, apiKey, model, prompt, images, stream: req.body?.stream });
    res.status(upstream.status).set('Content-Type', 'application/json').send(upstream.body || '{}');
  } catch (err) {
    res.status(400).json({ error: err.message || 'Proxy request failed.' });
  }
};

app.post('/api/ollama/generate', handleProxy);

app.post('/api/ollama/test', async (req, res) => {
  try {
    const baseUrl = resolveBaseUrl(req.body?.url);
    const apiKey = resolveKey(req.body?.key);
    const model = resolveModel(req.body?.model);

    const upstream = await forward({
      baseUrl,
      apiKey,
      model,
      prompt: 'Hello',
      images: req.body?.images,
      stream: false,
    });
    res.status(upstream.status).set('Content-Type', 'application/json').send(upstream.body || '{}');
  } catch (err) {
    res.status(400).json({ error: err.message || 'Test request failed.' });
  }
});

app.post('/api/keys/ollama', (req, res) => {
  const key = (req.body?.key || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'API key is required.' });
  }
  inMemoryStore.ollamaKey = key;
  res.json({ success: true, stored: 'local-dev' });
});

app.delete('/api/keys/ollama', (req, res) => {
  inMemoryStore.ollamaKey = '';
  res.json({ success: true });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`Dev Ollama proxy running on http://localhost:${PORT}`);
});
