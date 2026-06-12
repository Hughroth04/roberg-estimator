const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app = express();
app.use(express.json());

// Open CORS — restrict once connection is confirmed working
app.use(cors());

// HCP API key stored securely as environment variable — never in the browser
const HCP_API_KEY = process.env.HCP_API_KEY;
const HCP_BASE    = 'https://api.housecallpro.com';

// ── Health check / keep-alive endpoint ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Search for existing customer by name/email/phone ──
app.get('/api/customers/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Missing query param q' });

    const r = await fetch(`${HCP_BASE}/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`, {
      headers: { Authorization: `Token ${HCP_API_KEY}` }
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create a new customer ──
app.post('/api/customers', async (req, res) => {
  try {
    const r = await fetch(`${HCP_BASE}/customers`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${HCP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create estimate + options + line items in one call ──
app.post('/api/create-estimate', async (req, res) => {
  try {
    const { customer_id, panels } = req.body;

    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
    if (!panels || !panels.length) return res.status(400).json({ error: 'panels array is required' });

    // 1. Create the estimate
    const estRes = await fetch(`${HCP_BASE}/estimates`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${HCP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ customer_id })
    });
    const estimate = await estRes.json();
    if (!estRes.ok) return res.status(estRes.status).json({ error: 'Failed to create estimate', detail: estimate });

    const estimateId = estimate.id;

    // 2. Create one estimate option
    const optRes = await fetch(`${HCP_BASE}/estimates/${estimateId}/options`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${HCP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Concrete Lifting' })
    });
    const option = await optRes.json();
    if (!optRes.ok) return res.status(optRes.status).json({ error: 'Failed to create estimate option', detail: option });

    const optionId = option.id;

    // 3. Add each panel as a line item
    const lineItemResults = [];
    for (const panel of panels) {
      const liRes = await fetch(`${HCP_BASE}/estimates/${estimateId}/options/${optionId}/line_items`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${HCP_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name:        panel.name,
          description: panel.description,
          unit_price:  panel.sale,
          unit_cost:   panel.cost,
          quantity:    1
        })
      });
      const liData = await liRes.json();
      lineItemResults.push({ panel: panel.name, ok: liRes.ok, data: liData });
    }

    res.json({
      success: true,
      estimate_id: estimateId,
      option_id: optionId,
      line_items: lineItemResults,
      hcp_url: `https://pro.housecallpro.com/pro/estimates/${estimateId}`
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ro-Berg HCP proxy running on port ${PORT}`));
