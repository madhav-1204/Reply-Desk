const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const ollama = require('./ollama');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 1. Health check & status
app.get('/api/status', async (req, res) => {
  try {
    const health = await ollama.checkHealth();
    res.json({
      status: 'ok',
      model: health.model,
      offline: true,
      message: 'Running offline'
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      model: ollama.OLLAMA_MODEL,
      offline: false,
      error: 'Could not reach Ollama. Start it with: ollama serve'
    });
  }
});

// 2. Business profile
app.get('/api/profile', (req, res) => {
  try {
    const profile = db.getProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile', (req, res) => {
  try {
    const updated = db.saveProfile(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Sentiment classification
app.post('/api/sentiment', async (req, res) => {
  try {
    const { reviewText, starRating } = req.body;
    if (!reviewText || !reviewText.trim()) {
      return res.status(400).json({ error: 'Review text is required' });
    }

    const sentiment = await ollama.classifySentiment({
      reviewText,
      starRating: Number(starRating) || null
    });

    res.json({ sentiment });
  } catch (err) {
    console.error('Sentiment route error:', err.message);
    res.status(500).json({ error: 'Could not detect sentiment.' });
  }
});

// 4. Generate reply (supports SSE streaming and JSON fallback)
app.post('/api/generate', async (req, res) => {
  const { reviewText, starRating, sentiment, tone, length, stream = true } = req.body;

  if (!reviewText || !reviewText.trim()) {
    return res.status(400).json({ error: 'Review text is required' });
  }

  const profile = db.getProfile();
  const prompt = ollama.buildReplyPrompt({
    reviewText,
    starRating: Number(starRating) || null,
    sentiment: sentiment || 'neutral',
    tone: tone || 'friendly',
    length: length || 'short',
    profile
  });

  const wantsStream = stream && req.headers.accept?.includes('text/event-stream');

  if (wantsStream) {
    // SSE streaming mode
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const ollamaRes = await fetch(`${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollama.OLLAMA_MODEL,
          prompt,
          stream: true,
          options: { temperature: 0.7 }
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (!ollamaRes.ok) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Could not reach Ollama. Start it with: ollama serve' })}\n\n`);
        return res.end();
      }

      let accumulated = '';
      const reader = ollamaRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        const lines = textChunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              accumulated += parsed.response;
              res.write(`data: ${JSON.stringify({ chunk: parsed.response })}\n\n`);
            }
          } catch (e) {
            // Ignore parse errors on partial stream lines
          }
        }
      }

      // Post-process the final accumulated text
      const finalReply = ollama.postProcessReply(accumulated, profile, length);

      // Save to history
      const historyItem = db.addHistoryItem({
        reviewText,
        starRating: Number(starRating) || null,
        sentiment: sentiment || 'neutral',
        tone: tone || 'friendly',
        length: length || 'short',
        replyText: finalReply
      });

      res.write(`data: ${JSON.stringify({ done: true, fullReply: finalReply, historyItem })}\n\n`);
      res.end();
    } catch (err) {
      console.error('Streaming generation error:', err.message);
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'Could not reach Ollama. Start it with: ollama serve' })}\n\n`);
      res.end();
    }
  } else {
    // Non-streaming fallback
    try {
      const finalReply = await ollama.generateReply({
        reviewText,
        starRating: Number(starRating) || null,
        sentiment: sentiment || 'neutral',
        tone: tone || 'friendly',
        length: length || 'short',
        profile
      });

      const historyItem = db.addHistoryItem({
        reviewText,
        starRating: Number(starRating) || null,
        sentiment: sentiment || 'neutral',
        tone: tone || 'friendly',
        length: length || 'short',
        replyText: finalReply
      });

      res.json({ reply: finalReply, historyItem });
    } catch (err) {
      console.error('Non-streaming generation error:', err.message);
      res.status(503).json({ error: 'Could not reach Ollama. Start it with: ollama serve' });
    }
  }
});

// 5. History endpoints
app.get('/api/history', (req, res) => {
  try {
    const list = db.getHistory(req.query.q);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/history/:id', (req, res) => {
  try {
    const success = db.deleteHistoryItem(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'History item not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Samples endpoint
app.get('/api/samples', (req, res) => {
  try {
    const samplesPath = path.join(__dirname, '..', 'samples', 'reviews.json');
    if (fs.existsSync(samplesPath)) {
      const content = fs.readFileSync(samplesPath, 'utf-8');
      res.json(JSON.parse(content));
    } else {
      res.json([]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback to index.html for SPA-style client routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Reply Desk running locally at http://localhost:${PORT}`);
  console.log(`Ollama model configured: ${ollama.OLLAMA_MODEL}`);
});
