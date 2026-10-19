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

app.listen(3000, () => {
  console.log('Open http://localhost:3000 in your browser');
});