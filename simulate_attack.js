/* ==========================================================================
   HONEYGRID SOC DASHBOARD - HARDWARE-LOCKED MULTI-ATTACK SIMULATION SCRIPT
   ========================================================================== */

const http = require('http');
const { SerialPort } = require('serialport');

const SERIAL_PORT_NAME = 'COM7'; // ESP32 Sniffer Port
const BAUD_RATE = 115200;

// All Attack Data Payloads
const attackPayloads = [
    
    { type: 'BRUTE_FORCE', src: '192.168.4.105', rssi: 0 },
    { type: 'HTTP_FLOOD', src: '192.168.4.88', rssi: 0 },
    { type: 'PORT_SCAN', src: '192.168.4.110', rssi: 0 },
    { type: 'ARP_SPOOF', src: '192.168.4.21', rssi: -35 }
];

function sendAttack(attackData) {
    const data = JSON.stringify(attackData);

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/simulate',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, (res) => {
        console.log(`[TRIGGERED]: ${attackData.type} from ${attackData.src}`);
    });

    req.on('error', (error) => {
        console.error('[SIMULATION ERROR]: Server is unreachable. Please ensure node server.js is running!');
    });

    req.write(data);
    req.end();
}

function startSimulationLoop() {
    let index = 0;
    console.log('🚀 ESP32 Hardware Verified! Starting Multi-Attack Simulation Loop...');

    setInterval(() => {
        const currentAttack = attackPayloads[index];
        sendAttack(currentAttack);
        index = (index + 1) % attackPayloads.length;
    }, 2000);
}

// Verify whether the ESP32 serial port is available
const port = new SerialPort({
    path: SERIAL_PORT_NAME,
    baudRate: BAUD_RATE,
    autoOpen: false
});

port.open((err) => {
    if (err) {
        console.log(`❌ [ERROR]: ESP32 device is NOT detected on port ${SERIAL_PORT_NAME}!`);
        console.log(`⚠️ connect your ESP32 hardware to ${SERIAL_PORT_NAME} before starting the simulation.`);
        process.exit(1); // Terminates process if ESP32 hardware is not present
    } else {
        console.log(`✅ [SUCCESS]: ESP32 successfully detected on port ${SERIAL_PORT_NAME}!`);
        port.close(); // Close port so server.js can maintain full access to COM7
        startSimulationLoop();
    }
});