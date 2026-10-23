/* ==========================================================================
   HONEYGRID WIRELESS HONEYPOT & SOC DASHBOARD ENGINE
   Fully Bound with index.html IDs, WebSockets, Live Cases, Nodes & Reports
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    window.capturedPacketLogs = [];
    window.forensicCases = [];

    if (window.lucide) {
        lucide.createIcons();
    }

    // 1. Local / IST Clock Handler
    setInterval(() => {
        const now = new Date();
        const clockEl = document.getElementById('utc-clock');
        if (clockEl) {
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            clockEl.innerText = `${hours}:${minutes}:${seconds} IST`;
        }
    }, 1000);

    // 2. Navigation Tabs Switcher Engine
    const tabBtns = document.querySelectorAll('[data-tab]');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            document.querySelectorAll(`[data-tab="${targetTab}"]`).forEach(b => b.classList.add('active'));
            const targetPane = document.getElementById(targetTab);
            if (targetPane) targetPane.classList.add('active');

            if (targetTab === 'monitoring') {
                setTimeout(() => drawTopologyConnections(false), 100);
            }
        });
    });

    // 3. Modal Dialog Control
    const accountModal = document.getElementById('account-modal');
    const openModalBtns = [document.getElementById('account-btn'), document.getElementById('account-btn-side')];
    const closeModalBtn = document.getElementById('close-modal');
    const cancelModalBtn = document.getElementById('modal-cancel');

    openModalBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', () => accountModal?.classList.add('active'));
    });

    [closeModalBtn, cancelModalBtn].forEach(btn => {
        if (btn) btn.addEventListener('click', () => accountModal?.classList.remove('active'));
    });

    // --------------------------------------------------------------------------
    // DASHBOARD LIVE STATE DATA
    // --------------------------------------------------------------------------
    let totalPackets = 0;
    let packetRateCounter = 0;
    let packetsPerSec = 0;
    let uniqueDevices = new Set();
    let criticalAlertsCount = 0;

    let attackCounts = {
        'DEAUTH': 0,
        'BEACON': 0,
        'BEACON_FLOOD': 0,
        'PROBE': 0,
        'PROBE_FLOOD': 0,
        'EVIL_TWIN': 0,
        'KARMA': 0,
        'BRUTE_FORCE': 0,
        'HTTP_FLOOD': 0,
        'PORT_SCAN': 0,
        'ARP_SPOOF': 0
    };

    const maxDataPoints = 12;
    let timeLabels = Array(maxDataPoints).fill('');
    let deauthSeries = Array(maxDataPoints).fill(0);
    let probeSeries = Array(maxDataPoints).fill(0);
    let beaconSeries = Array(maxDataPoints).fill(0);
    let ppsSeries = Array(maxDataPoints).fill(0);

    // --------------------------------------------------------------------------
    // 4. CHART.JS INITIALIZATION
    // --------------------------------------------------------------------------
    const threatCtx = document.getElementById('threatChart')?.getContext('2d');
    let threatChart = null;
    if (threatCtx) {
        threatChart = new Chart(threatCtx, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [
                    {
                        label: 'Wireless Attacks (ESP8266)',
                        data: deauthSeries,
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Network & App Attacks',
                        data: probeSeries,
                        borderColor: '#fbbf24',
                        borderDash: [5, 5],
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'MITM Attacks',
                        data: beaconSeries,
                        borderColor: '#ef4444',
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    const packetCtx = document.getElementById('packetChart')?.getContext('2d');
    let packetChart = null;
    if (packetCtx) {
        packetChart = new Chart(packetCtx, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [{
                    label: 'Packets / sec',
                    data: ppsSeries,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // --------------------------------------------------------------------------
    // 5. PACKETS PER SECOND & CHART TICKER LOOP
    // --------------------------------------------------------------------------
    setInterval(() => {
        ppsSeries.shift();
        ppsSeries.push(packetRateCounter);
        
        packetsPerSec = packetRateCounter;
        packetRateCounter = 0;

        const timeStr = new Date().toTimeString().split(' ')[0];
        timeLabels.shift();
        timeLabels.push(timeStr);

        const wirelessTotal = (attackCounts['DEAUTH'] || 0) + (attackCounts['BEACON_FLOOD'] || 0) + (attackCounts['PROBE_FLOOD'] || 0);
        const networkTotal = (attackCounts['BRUTE_FORCE'] || 0) + (attackCounts['HTTP_FLOOD'] || 0) + (attackCounts['PORT_SCAN'] || 0);
        const mitmTotal = (attackCounts['ARP_SPOOF'] || 0) + (attackCounts['EVIL_TWIN'] || 0) + (attackCounts['KARMA'] || 0);

        deauthSeries.shift();
        deauthSeries.push(wirelessTotal);

        probeSeries.shift();
        probeSeries.push(networkTotal);

        beaconSeries.shift();
        beaconSeries.push(mitmTotal);

        if (threatChart) threatChart.update('none');
        if (packetChart) packetChart.update('none');

        const ppsStat = document.querySelectorAll('.stat-card .stat-value')[2];
        if (ppsStat) ppsStat.innerText = packetsPerSec;

    }, 2000);

    // --------------------------------------------------------------------------
    // 6. WEBSOCKET REAL-TIME STREAM & BUTTON INTERACTION HANDLERS
    // --------------------------------------------------------------------------
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.event === 'status_updated') {
                console.log('Status updated from server:', data.status);
                const statusBadge = document.querySelector('.attack-info-grid .info-cell .cell-value, .status-text');
                if (statusBadge && data.status) {
                    statusBadge.innerText = data.status;
                }
            } else {
                processIncomingLog(data);
            }
        } catch (err) {
            console.error('Error parsing live socket packet:', err);
        }
    };

    // Direct Global Click Handler for Investigate, Mark Reviewed, PDF Report & CSV Export
    document.addEventListener('click', (e) => {
        if (!e.target) return;
        const targetText = e.target.innerText ? e.target.innerText.trim() : '';
        const targetTextLower = targetText.toLowerCase();
        
        const isInvestigate = targetTextLower.includes('investigate') || e.target.classList.contains('btn-investigate');
        const isReviewed = targetTextLower.includes('mark reviewed') || targetTextLower.includes('reviewed') || e.target.classList.contains('btn-reviewed');
        const isPdf = targetText === 'Generate PDF Report' || e.target.classList.contains('btn-pdf');
        const isCsv = targetText === 'Export CSV' || e.target.classList.contains('btn-csv');

        if (isInvestigate) {
            e.preventDefault();
            sendAttackStatusUpdate('INVESTIGATING');
        } else if (isReviewed) {
            e.preventDefault();
            sendAttackStatusUpdate('REVIEWED');
        } else if (isPdf) {
            e.preventDefault();
            window.location.href = '/api/export/pdf';
        } else if (isCsv) {
            e.preventDefault();
            window.location.href = '/api/export/csv';
        }
    });

    function sendAttackStatusUpdate(status) {
        console.log('[UI ACTION] Updating attack status to:', status);
        
        // Instantly update UI elements
        const statusElements = document.querySelectorAll('.attack-info-grid .info-cell .cell-value');
        if (statusElements.length >= 2) {
            statusElements[1].innerText = status;
            statusElements[1].style.color = status === 'INVESTIGATING' ? '#f59e0b' : '#10b981';
        }

        // Notify Backend Server
        fetch('/api/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        })
        .then(res => res.json())
        .then(data => console.log('[SERVER ACK]', data))
        .catch(err => console.error('[API ERROR]', err));
    }

    fetch('/api/logs')
        .then(res => res.json())
        .then(logs => {
            if (Array.isArray(logs)) {
                logs.reverse().forEach(log => processIncomingLog(log));
            }
        })
        .catch(err => console.log('Log sync note:', err));

    // --------------------------------------------------------------------------
    // 7. INCOMING LOG PROCESSOR
    // --------------------------------------------------------------------------
    function processIncomingLog(log) {
        if (!log || !log.type) return;

        totalPackets++;
        packetRateCounter++;

        if (log.src && log.src !== 'UNKNOWN_MAC') {
            uniqueDevices.add(log.src);
        }

        const type = String(log.type).toUpperCase();
        if (attackCounts.hasOwnProperty(type)) {
            attackCounts[type]++;
        } else {
            attackCounts[type] = 1;
        }

        criticalAlertsCount++;

        window.capturedPacketLogs.push({
            time: new Date(log.timestamp || Date.now()).toISOString().replace('T', ' ').substring(0, 19),
            type: type,
            src: log.src || 'ESP8266_HW',
            target: log.target || 'Campus_WiFi Node',
            rssi: log.rssi || '-45'
        });

        if (window.capturedPacketLogs.length > 100) window.capturedPacketLogs.shift();

        if (['DEAUTH', 'EVIL_TWIN', 'BRUTE_FORCE', 'ARP_SPOOF', 'HTTP_FLOOD'].includes(type)) {
            generateDynamicCaseFile(log);
        }

        appendConsoleLog(log);
        appendPcapLog(log);
        triggerSonarBlip();
        updateStatCards();
        updateDistributionUI();
        updateSeverityBars();
        updateWirelessAttackGrid(log);
        addSecurityAlertRow(log);

        drawTopologyConnections(true);
        setTimeout(() => drawTopologyConnections(false), 3000);
    }

    // --------------------------------------------------------------------------
    // 8. HONEYPOT NODES & REPORTS SYSTEM
    // --------------------------------------------------------------------------
    function setupHoneypotNodesTab() {
        const addNodeBtns = document.querySelectorAll('button');
        addNodeBtns.forEach(btn => {
            if (btn.innerText.includes('Add New Node')) {
                btn.addEventListener('click', () => {
                    const nodeName = prompt("Enter Node Location / Identifier:", "Conference Room AP");
                    if (!nodeName) return;

                    const tableBody = document.querySelector('.tab-pane#nodes table tbody, #nodes table tbody, [data-tab="nodes"] table tbody');
                    const nodesContainer = tableBody || document.querySelector('.tab-pane#nodes tbody') || document.querySelector('tbody');

                    if (nodesContainer) {
                        const newId = `HP-0${nodesContainer.children.length + 1}`;
                        const randomMac = `00:11:22:33:44:${Math.floor(10 + Math.random() * 89)}`;
                        
                        const newRow = document.createElement('tr');
                        newRow.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
                        newRow.innerHTML = `
                            <td style="padding:12px; font-weight:bold;">${newId}</td>
                            <td style="padding:12px;">${nodeName}</td>
                            <td style="padding:12px;">2.4 GHz (Ch 11)</td>
                            <td style="padding:12px; font-family:monospace;">${randomMac}</td>
                            <td style="padding:12px;"><span class="badge bg-green" style="background:#10b981; padding:3px 8px; border-radius:4px; font-size:11px;">Active</span></td>
                            <td style="padding:12px;">0</td>
                            <td style="padding:12px;">
                                <button class="btn btn-sm btn-configure" style="background:rgba(255,255,255,0.1); border:none; color:#fff; padding:4px 10px; border-radius:4px; cursor:pointer;">Configure</button>
                            </td>
                        `;
                        nodesContainer.appendChild(newRow);
                        alert(`Node ${newId} (${nodeName}) successfully deployed!`);
                    }
                });
            }
        });
    }

    function generateDynamicCaseFile(log) {
        const caseContainer = document.querySelector('#investigations .grid-2-col');
        if (!caseContainer) return;

        const caseId = `#INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const timestamp = new Date(log.timestamp || Date.now()).toTimeString().split(' ')[0];

        const caseCard = document.createElement('div');
        caseCard.className = 'card style-inner-card mb-3';
        caseCard.innerHTML = `
            <h3>Case ${caseId} <span class="badge bg-red" style="font-size:0.7rem; float:right;">LIVE ESP32 DETECTED</span></h3>
            <p class="text-sub">${log.type} Threat Vector Observed at ${timestamp}</p>
            <hr class="my-2">
            <p><strong>Target Node:</strong> Campus_WiFi Core</p>
            <p><strong>Attacker MAC/IP:</strong> ${log.src}</p>
            <p><strong>Severity:</strong> <span class="badge bg-red">Critical</span></p>
            <br>
            <button class="btn btn-primary btn-download-case" data-case="${caseId}" data-src="${log.src}" data-type="${log.type}">
                Download Case PCAP
            </button>
        `;

        caseContainer.insertBefore(caseCard, caseContainer.firstChild);
        while (caseContainer.children.length > 6) {
            caseContainer.removeChild(caseContainer.lastChild);
        }
    }

    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('btn-download-case')) {
            const btn = e.target;
            downloadBinaryPcap(btn.getAttribute('data-case'), btn.getAttribute('data-src'), btn.getAttribute('data-type'));
        }
    });

    function downloadBinaryPcap(caseId, src, type) {
        const pcapHeader = new Uint8Array([
            0xd4, 0xc3, 0xb2, 0xa1, 0x02, 0x00, 0x04, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0xff, 0xff, 0x00, 0x00, 0x69, 0x00, 0x00, 0x00
        ]);

        const packetData = new Uint8Array([
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x1a, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00,
            0xc0, 0x00, 0x3a, 0x01, 0x7c, 0x9e, 0xbd, 0x21,
            0x4a, 0x91, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
            0x7c, 0x9e, 0xbd, 0x21, 0x4a, 0x91, 0x00, 0x00, 0x07, 0x00
        ]);

        const pcapBlobData = new Uint8Array(pcapHeader.length + packetData.length);
        pcapBlobData.set(pcapHeader, 0);
        pcapBlobData.set(packetData, pcapHeader.length);

        const blob = new Blob([pcapBlobData], { type: 'application/vnd.tcpdump.pcap' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `HoneyGrid_${type}_${caseId.replace('#', '')}.pcap`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
    }

    function updateStatCards() {
        const statCards = document.querySelectorAll('.stat-card .stat-value');
        if (statCards.length >= 4) {
            statCards[0].innerText = uniqueDevices.size; 
            statCards[1].innerText = totalPackets.toLocaleString();
            statCards[3].innerText = criticalAlertsCount; 
        }
    }

    function updateDistributionUI() {
        let total = 0;
        Object.values(attackCounts).forEach(c => total += c);
        
        const totalEl = document.getElementById('total-attacks-count');
        if (totalEl) totalEl.innerText = total;

        if (total === 0) return;

        const attackMap = [
            { type: 'DEAUTH', bar: 'bar-deauth', pct: 'pct-deauth' },
            { type: 'BEACON_FLOOD', altType: 'BEACON', bar: 'bar-beacon', pct: 'pct-beacon' },
            { type: 'PROBE_FLOOD', altType: 'PROBE', bar: 'bar-probe', pct: 'pct-probe' },
            { type: 'EVIL_TWIN', bar: 'bar-eviltwin', pct: 'pct-eviltwin' },
            { type: 'KARMA', bar: 'bar-karma', pct: 'pct-karma' },
            { type: 'BRUTE_FORCE', bar: 'bar-bruteforce', pct: 'pct-bruteforce' },
            { type: 'HTTP_FLOOD', bar: 'bar-dos', pct: 'pct-dos' },
            { type: 'PORT_SCAN', bar: 'bar-portscan', pct: 'pct-portscan' },
            { type: 'ARP_SPOOF', bar: 'bar-mitm', pct: 'pct-mitm' }
        ];

        attackMap.forEach(item => {
            const count = (attackCounts[item.type] || 0) + (item.altType ? (attackCounts[item.altType] || 0) : 0);
            const percentage = Math.round((count / total) * 100);

            const barEl = document.getElementById(item.bar);
            const pctEl = document.getElementById(item.pct);

            if (barEl) barEl.style.width = percentage + '%';
            if (pctEl) pctEl.innerText = percentage + '%';
        });
    }

    function appendConsoleLog(log) {
        const consoleFeed = document.getElementById('consoleFeed');
        if (!consoleFeed) return;

        const timeStr = new Date(log.timestamp || Date.now()).toTimeString().split(' ')[0];
        const line = document.createElement('div');
        line.className = 'log-line';
        line.innerHTML = `<span class="time">[${timeStr}]</span> <span class="text-danger">${log.type.toLowerCase()}</span> Source=${log.src} RSSI=${log.rssi || -45}dBm`;

        consoleFeed.insertBefore(line, consoleFeed.firstChild);
        while (consoleFeed.children.length > 15) {
            consoleFeed.removeChild(consoleFeed.lastChild);
        }
    }

    function appendPcapLog(log) {
        const pcapList = document.getElementById('pcap-list');
        if (!pcapList) return;

        const timeStr = new Date(log.timestamp || Date.now()).toTimeString().split(' ')[0];
        const line = document.createElement('div');
        line.className = 'log-line text-danger';
        line.innerHTML = `<span class="time">${timeStr}</span> [HARDWARE] ${log.type} Packet detected from ${log.src}`;

        pcapList.insertBefore(line, pcapList.firstChild);
        while (pcapList.children.length > 25) {
            pcapList.removeChild(pcapList.lastChild);
        }
    }

    function triggerSonarBlip() {
        const sonar = document.querySelector('.sonar-wrapper');
        if (!sonar) return;

        const blip = document.createElement('div');
        blip.className = 'sonar-blip';
        blip.style.top = `${Math.floor(Math.random() * 60) + 20}%`;
        blip.style.left = `${Math.floor(Math.random() * 60) + 20}%`;
        blip.style.backgroundColor = '#00f2fe';
        sonar.appendChild(blip);
        setTimeout(() => blip.remove(), 2000);
    }

    function updateSeverityBars() {
        const breakdownItems = document.querySelectorAll('.breakdown-item');
        if (breakdownItems.length >= 3) {
            const deauthPct = Math.min(100, Math.round(((attackCounts['DEAUTH'] || 0) / (totalPackets || 1)) * 100 * 5));
            const bar1 = breakdownItems[0].querySelector('.bar-inner');
            if (bar1) bar1.style.width = `${Math.max(15, deauthPct)}%`;
        }
    }

    function updateWirelessAttackGrid(log) {
        const infoCells = document.querySelectorAll('.attack-info-grid .info-cell .cell-value');
        if (infoCells.length >= 8) {
            infoCells[1].innerText = log.src;
            infoCells[4].innerText = `${log.rssi || -45} dBm`;
            infoCells[6].innerText = (attackCounts['DEAUTH'] || 0);
        }
    }

    function addSecurityAlertRow(log) {
        const alertsTable = document.querySelector('.alerts-table');
        if (!alertsTable) return;

        const alertItem = document.createElement('div');
        alertItem.className = 'alert-item';
        alertItem.innerHTML = `
            <span class="badge bg-red">ESP32</span>
            <div class="alert-content">
                <strong>${log.type} Wireless Attack</strong>
                <small>Hardware sensor captured live radio frame</small>
            </div>
            <span class="font-mono text-sub">${log.src}</span>
            <span class="text-sub">just now</span>
        `;

        alertsTable.insertBefore(alertItem, alertsTable.firstChild);
        while (alertsTable.children.length > 5) {
            alertsTable.removeChild(alertsTable.lastChild);
        }
    }

    function drawTopologyConnections(isAttacking = false) {
        const svg = document.getElementById('topoCanvas');
        const wrapper = document.querySelector('.topology-wrapper');
        if (!svg || !wrapper) return;

        svg.innerHTML = '';
        const nodes = wrapper.querySelectorAll('.topo-node');
        if (nodes.length < 2) return;

        const honeypotNode = wrapper.querySelector('.node-honeypot');
        if (!honeypotNode) return;

        const hpRect = honeypotNode.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();

        const hpX = hpRect.left + hpRect.width / 2 - wrapperRect.left;
        const hpY = hpRect.top + hpRect.height / 2 - wrapperRect.top;

        nodes.forEach(node => {
            if (node === honeypotNode) return;

            const nRect = node.getBoundingClientRect();
            const nX = nRect.left + nRect.width / 2 - wrapperRect.left;
            const nY = nRect.top + nRect.height / 2 - wrapperRect.top;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', hpX);
            line.setAttribute('y1', hpY);
            line.setAttribute('x2', nX);
            line.setAttribute('y2', nY);
            line.setAttribute('stroke', node.classList.contains('node-attacker') ? '#ef4444' : '#38bdf8');
            line.setAttribute('stroke-width', isAttacking ? '3' : '1.5');
            svg.appendChild(line);
        });
    }

    setupHoneypotNodesTab();
    setInterval(() => {
        const tableBody = document.querySelector('.tab-pane#reports table tbody, #reports table tbody');
        if (!tableBody) return;
        const logs = window.capturedPacketLogs || [];
        if (logs.length === 0) return;

        let rowsHTML = '';
        logs.slice().reverse().forEach(log => {
            rowsHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); text-align: left;">
                    <td style="padding: 12px; color: #e2e8f0;">${log.time}</td>
                    <td style="padding: 12px; color: #ef4444; font-weight: 600;">${log.type}</td>
                    <td style="padding: 12px; font-family: monospace; color: #cbd5e1;">${log.src}</td>
                    <td style="padding: 12px; font-family: monospace; color: #cbd5e1;">${log.target}</td>
                    <td style="padding: 12px; color: #94a3b8;">${log.rssi} dBm</td>
                </tr>
            `;
        });
        tableBody.innerHTML = rowsHTML;
    }, 1000);
});