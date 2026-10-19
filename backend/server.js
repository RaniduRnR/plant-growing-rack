const express = require('express');
const path = require('path');
const app = express();

// Serve the frontend folder (index.html, main.js, models/) to the web
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Put your Blender object names here (can be changed later)
const SENSORS = ['Pump_01', 'Pump_02'];

// Fake data for now. We'll switch to real sensor data later
app.get('/api/status', (req, res) => {
  const data = {};
  SENSORS.forEach((name) => {
    data[name] = Math.round(50 + Math.random() * 50);   // between 50 and 100
  });
  res.json(data);
});

// IoT message feed for the grow light (the hub publishes action results here)
const IOT_MESSAGES_URL = process.env.IOT_MESSAGES_URL
  || 'http://localhost:8000/api/iot/messages/?topic=devices/3417ebc3b479/commands';

// Returns the "result" part of the latest message, e.g.
// { "message_id": "...", "status": "SUCCESS", "action": "LIGHTS_ON", "state": "ON" }
app.get('/api/grow-light', async (req, res) => {
  try {
    const iotRes = await fetch(IOT_MESSAGES_URL);
    if (!iotRes.ok) throw new Error(`IoT API responded ${iotRes.status}`);
    const data = await iotRes.json();

    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (messages.length === 0) return res.json({ message_id: null });

    // Latest message = highest id
    const last = messages.reduce((a, b) => (b.id > a.id ? b : a));
    const result = (last.payload && last.payload.result) || {};

    res.json({
      message_id: last.message_id,
      status: result.status,
      action: result.action,
      state: result.state,
      executed_at: last.payload && last.payload.executed_at,
    });
  } catch (err) {
    console.error('Could not read IoT messages:', err.message);
    res.status(502).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Open http://localhost:3000 in your browser');
});