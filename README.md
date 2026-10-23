# 🛡️ HoneyGrid: Smart Wireless Honeypot & Real-Time SOC Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Hardware: ESP32 & ESP8266](https://img.shields.io/badge/Hardware-ESP32%20%7C%20ESP8266-blue.svg)]()
[![Stack: Node.js & WebSockets](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express%20%7C%20WebSockets-green.svg)]()

**HoneyGrid** is a full-stack, hardware-integrated wireless honeypot and Security Operations Center (SOC) dynamic incident response dashboard. The system leverages microcontrollers running in promiscuous mode to capture raw 802.11 management frames, stream threat telemetry over a hardware serial communication pipeline, and visualize live cyber attack vectors in a dynamic hacker-themed web dashboard.

---

## 🌟 Key Features & Supported Threat Vectors

The system parses, analyzes, and visualizes 9 distinct cyber threat vectors in real time:

1. **Deauthentication Flood:** Spoofed 802.11 management frames causing forced client disconnections.
2. **Beacon Flood:** High-density fake Access Point beacons generating rogue SSID network noise.
3. **Probe Request Flood:** High-frequency client discovery probes.
4. **Evil Twin Rogue AP:** Rogue Access Points impersonating legitimate network identities.
5. **Karma AP Spoofing:** Automated Access Point response mechanism hijacking broadcast probe requests.
6. **HTTP / DoS Floods:** Rapid Layer-7 request bursts targeting web server availability.
7. **SSH / Web Brute Force Attempts:** Rapid authentication failure events and credential guessing.
8. **Port Scanning & Reconnaissance:** Network discovery, SYN sweeps, and service enumeration.
9. **ARP Spoofing & MITM Interception:** Gateway address resolution manipulation and Man-In-The-Middle attacks.



## 🏗️ System Architecture & Data Flow
```
[ ESP8266 Attacker / C2 Node ]  -->  📡 [ Live RF Attack Environment ]
                                                │
                                                ▼ (802.11 Promiscuous Capture)
                                     [ ESP32 Sniffer Sensor ]
                                                │
                                                ▼ (USB Serial / COM7 @ 115200)
                                     [ Node.js Backend Server ]
                                                │
                                                ▼ (WebSockets & REST APIs)
                                     [ HoneyGrid SOC Web UI ]
```


🧰 Hardware & Software Requirements
1. Hardware Components
    ESP32 Dev Module: Promiscuous 802.11 wireless sniffer and frame parser.
    ESP8266 NodeMCU: Attack simulation and decoy C2 web panel (http://192.168.4.1).
    USB Data Cable: Fast serial communication bridge for COM port access.

2. Software Stack
    Firmware: Arduino IDE (with ESP32 & ESP8266 Board Managers).
    Backend: Node.js, Express.js, serialport, ws (WebSockets), sqlite3.
    Frontend: HTML5, CSS3 (Matrix Neon Cyber UI), Modern JavaScript (ES6+), Chart.js, Lucide Icons.
    Forensics: Wireshark (for raw binary .pcap analysis).

⚡ Complete Setup & Connection Guide
1. Open Arduino IDE and add board manager URLs in Preferences:

    ESP32 URL: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   
    ESP8266 URL: http://arduino.esp8266.com/stable/package_esp8266com_index.json\

2. Connect ESP32 Dev Module:

    Select Board: ESP32 Dev Module

    Upload Speed: 115200

    Select Port: COM7 (or your device's COM port)

    Upload ESP32_detect.ino firmware.

3. Connect ESP8266 NodeMCU:

    Select Board: NodeMCU 1.0 (ESP-12E Module)

    Upload Speed: 115200

    Select Port: COM7
    
    Upload ESP8266_PhiSiFi.ino attack code.

Step 2: ESP8266 C2 Web Panel Connection
1. Power on the ESP8266 module.
2. Connect your laptop/phone Wi-Fi to SSID: HACKER.
3. Open a web browser and navigate to: http://192.168.4.1
4. Scan Access Points, select a target network, and launch attacks (Deauth, Beacon, Karma, Probe, Evil Twin).


Step 3: SOC Dashboard Server Setup

Clone the repository

    git clone [https://github.com/Jaiminmkw/HoneyGrid-SOC-Honeypot.git]

cd HoneyGrid-SOC-Honeypot

Install backend dependencies

    npm install

Start the SOC Server (Verify SERIAL_PORT_NAME in server.js)

    node server.js

Step 4: Access the Dashboard

Open your browser and navigate to: 

    http://localhost:3000

📊 Reports & PCAP Forensics

    Live Incident Details: Click on any active alert in the dashboard to populate incident metrics, status, and target details.

    Binary PCAP Download: Click "Download Case PCAP" inside the Investigations tab to obtain Wireshark-compatible packet files.

    Executive Reports: Generate live PDF assessment reports or export full CSV event history directly from the Reports tab.

👥 Authors & Acknowledgments

    Jaimin Makwana: SOC System & Hardware engineer 

    Guided by: Prof. Harshita Makwana

    Institution: Silver Oak College of Engineering and Technology, Silver Oak University.

## 📄 License
This project is open-source and available under the [MIT License]











