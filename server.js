/* ==========================================================================
   HONEYGRID WIRELESS HONEYPOT & SOC DASHBOARD BACKEND SERVER
   ========================================================================== */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;

app.use(express.static(__dirname));
app.use(express.json());

// Serve Dashboard Main UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Database Initialization (SQLite)
const db = new sqlite3.Database('./soc_attacks.db', (err) => {
    if (!err) console.log('[DATABASE] Connected to SQLite database: soc_attacks.db');
});

db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    src TEXT,
    rssi INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// API Endpoint: Get Last 100 Logs
app.get('/api/logs', (req, res) => {
    db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 100", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API Endpoint: Update Attack Status (Investigated / Reviewed)
app.post('/api/update-status', (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    console.log(`[SOC STATUS UPDATE] Attack status changed to: ${status}`);

    // Broadcast status change to all connected WebSocket dashboard clients
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'status_updated', status }));
        }
    });

    res.json({ success: true, status });
});

// API Endpoint: Export PDF Report
app.get('/api/export/pdf', (req, res) => {
    db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 50", [], (err, rows) => {
        if (err) return res.status(500).send('Database error');
        
        let htmlContent = `
            <html>
            <head>
                <title>HoneyGrid SOC Executive Compliance Report</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                    h1 { color: #00d2ff; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 12px; }
                    th { background-color: #1a1a2e; color: #fff; }
                </style>
            </head>
            <body>
                <h1>HoneyGrid Wireless & Network Incident Report</h1>
                <p>Generated on: ${new Date().toLocaleString()}</p>
                <table>
                    <tr><th>Timestamp</th><th>Event Type</th><th>Source MAC/IP</th><th>RSSI / Status</th></tr>
        `;
        
        rows.forEach(row => {
            htmlContent += `<tr><td>${row.timestamp}</td><td><b>${row.type}</b></td><td>${row.src}</td><td>${row.rssi} dBm</td></tr>`;
        });

        htmlContent += `</table></body></html>`;
        
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', 'attachment; filename=HoneyGrid_SOC_Report.html');
        res.send(htmlContent);
    });
});

// API Endpoint: Export CSV Report
app.get('/api/export/csv', (req, res) => {
    db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 100", [], (err, rows) => {
        if (err) return res.status(500).send('Database error');
        
        let csvContent = "ID,Timestamp,Event Type,Source MAC,RSSI\n";
        rows.forEach(row => {
            csvContent += `${row.id},${row.timestamp},${row.type},${row.src},${row.rssi}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=HoneyGrid_SOC_Report.csv');
        res.send(csvContent);
    });
});

// Function: Save Log to DB and Broadcast to WebSocket Clients
function saveAndBroadcastLog(type, src, rssi) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    db.run("INSERT INTO logs (type, src, rssi, timestamp) VALUES (?, ?, ?, ?)",
        [type, src, rssi, timestamp],
        function (err) {
            if (err) return;

            const logEntry = {
                id: this.lastID,
                type: type,
                src: src,
                rssi: rssi,
                timestamp: timestamp
            };

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(logEntry));
                }
            });
        }
    );
}

// Cooldown Lock Object
const alertCooldown = {};
const SERIAL_PORT_NAME = 'COM7'; 

// --------------------------------------------------------------------------
// Multi-Attack Parsing Logic (Reads pure serial data from ESP8266)
// --------------------------------------------------------------------------
function processIncomingSignal(rawLine) {
    const line = rawLine.toString().trim();
    if (!line) return;

    let attackType = null;
    const upperLine = line.toUpperCase();

    if (upperLine.includes('DEAUTH')) attackType = 'DEAUTH';
    else if (upperLine.includes('BEACON')) attackType = 'BEACON_FLOOD';
    else if (upperLine.includes('PROBE')) attackType = 'PROBE_FLOOD';
    else if (upperLine.includes('EVIL_TWIN')) attackType = 'EVIL_TWIN';
    else if (upperLine.includes('KARMA')) attackType = 'KARMA_ATTACK';
    else if (upperLine.includes('BRUTE_FORCE')) attackType = 'BRUTE_FORCE';
    else if (upperLine.includes('HTTP_FLOOD') || upperLine.includes('DOS')) attackType = 'HTTP_FLOOD';
    else if (upperLine.includes('PORT_SCAN')) attackType = 'PORT_SCAN';
    else if (upperLine.includes('ARP_SPOOF') || upperLine.includes('MITM')) attackType = 'ARP_SPOOF';

    if (attackType) {
        const macMatch = line.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/) || line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        const rssiMatch = line.match(/(-?\d+)\s*dBm?/i);

        const mac = macMatch ? macMatch[0] : 'ESP8266_SENSOR';
        const rssi = rssiMatch ? parseInt(rssiMatch[1]) : -45;

        const key = `${attackType}_${mac}`;
        const globalLockKey = `LOCK_${mac}`;
        const now = Date.now();

        if (!alertCooldown[key] && (!alertCooldown[globalLockKey] || (now - alertCooldown[globalLockKey]) > 1000)) {
            alertCooldown[key] = now;
            alertCooldown[globalLockKey] = now;

            console.log(`🚨 [HARDWARE ATTACK CAPTURED]: Type = ${attackType} | Source = ${mac} | RSSI = ${rssi}`);
            saveAndBroadcastLog(attackType, mac, rssi);

            setTimeout(() => {
                delete alertCooldown[key];
            }, 1000);
        }
    }
}

// --------------------------------------------------------------------------
// Serial Port Listener (ESP8266 connection on COM7)
// --------------------------------------------------------------------------
try {
    const port = new SerialPort({
        path: SERIAL_PORT_NAME,
        baudRate: 115200,
        autoOpen: false
    });

    port.open((err) => {
        if (err) {
            console.log(`[SERIAL NOTICE] Port ${SERIAL_PORT_NAME} not connected.`);
            return;
        }
        console.log(`[SERIAL] Connected to Hardware on ${SERIAL_PORT_NAME}`);
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', (data) => processIncomingSignal(data));

    port.on('error', (err) => {
        console.log('[SERIAL ERROR]', err.message);
    });
} catch (err) {
    console.log('[SERIAL INIT NOTE]', err.message);
}

// --------------------------------------------------------------------------
// Web Simulation Endpoint (Triggered by simulate_attack.js)
// --------------------------------------------------------------------------
app.post('/api/simulate', (req, res) => {
    const { type, src, rssi } = req.body;
    if (!type) return res.status(400).json({ error: 'Attack type is required' });

    saveAndBroadcastLog(type, src || '192.168.4.21', rssi || -50);
    res.json({ status: 'Triggered', type });
});

// WebSocket Connection Management
wss.on('connection', (ws) => {
    console.log('[WEBSOCKET] SOC Dashboard client connected');
});

// Start Server
server.listen(PORT, () => {
    console.log(`[SERVER] SOC Dashboard live at http://localhost:${PORT}`);
});