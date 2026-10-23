#include <WiFi.h>
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "esp_netif.h"

// DEAUTHER.NET SPECIFIC BURST THRESHOLDS (Window = 1.2 Seconds)
#define EVAL_WINDOW_MS 1200     
#define DEAUTH_FLOOD_LIMIT 1    // Normal Deauth flood send rates
#define BEACON_FLOOD_LIMIT 5    // High threshold to filter real router beacons (~10/s)
#define PROBE_FLOOD_LIMIT 2     // High threshold to filter normal mobile probes

struct MacTracker {
  String mac;
  int deauthCount;
  int beaconCount;
  int probeCount;
  unsigned long windowStart;
};

#define MAX_TRACKERS 50
MacTracker trackers[MAX_TRACKERS];

String macToString(const uint8_t* mac) {
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(macStr);
}

void processPacket(uint8_t type, String mac, int8_t rssi) {
  unsigned long now = millis();
  int idx = -1;

  for (int i = 0; i < MAX_TRACKERS; i++) {
    if (trackers[i].mac == mac) {
      idx = i;
      break;
    }
  }

  if (idx == -1) {
    for (int i = 0; i < MAX_TRACKERS; i++) {
      if (trackers[i].mac == "" || (now - trackers[i].windowStart > EVAL_WINDOW_MS)) {
        idx = i;
        trackers[idx].mac = mac;
        trackers[idx].deauthCount = 0;
        trackers[idx].beaconCount = 0;
        trackers[idx].probeCount = 0;
        trackers[idx].windowStart = now;
        break;
      }
    }
  }

  if (idx == -1) return;

  if (now - trackers[idx].windowStart > EVAL_WINDOW_MS) {
    trackers[idx].deauthCount = 0;
    trackers[idx].beaconCount = 0;
    trackers[idx].probeCount = 0;
    trackers[idx].windowStart = now;
  }

  if (type == 1) trackers[idx].deauthCount++;
  else if (type == 2) trackers[idx].beaconCount++;
  else if (type == 3) trackers[idx].probeCount++;

  // TRIGGER LOGIC - Strictly triggers only the active attack and resets noise
  if (type == 1 && trackers[idx].deauthCount >= DEAUTH_FLOOD_LIMIT) {
    Serial.printf("[DEAUTH] MAC: %s RSSI: %d\n", mac.c_str(), rssi);
    trackers[idx].deauthCount = 0;
    trackers[idx].beaconCount = 0;
    trackers[idx].probeCount = 0;
  } 
  else if (type == 2 && trackers[idx].beaconCount >= BEACON_FLOOD_LIMIT) {
    Serial.printf("[BEACON_FLOOD] MAC: %s RSSI: %d\n", mac.c_str(), rssi);
    trackers[idx].beaconCount = 0;
    trackers[idx].deauthCount = 0;
    trackers[idx].probeCount = 0;
  } 
  else if (type == 3 && trackers[idx].probeCount >= PROBE_FLOOD_LIMIT) {
    Serial.printf("[PROBE_FLOOD] MAC: %s RSSI: %d\n", mac.c_str(), rssi);
    trackers[idx].probeCount = 0;
    trackers[idx].deauthCount = 0;
    trackers[idx].beaconCount = 0;
  }
}

void sniffer_callback(void* buf, wifi_promiscuous_pkt_type_t type) {
  wifi_promiscuous_pkt_t *pkt = (wifi_promiscuous_pkt_t*)buf;
  uint8_t *payload = pkt->payload;
  int8_t rssi = pkt->rx_ctrl.rssi;

  uint8_t frameControl = payload[0];
  uint8_t frameType = (frameControl & 0x0C) >> 2;    
  uint8_t frameSubtype = (frameControl & 0xF0) >> 4; 

  if (frameType == 0) { // Management Frames
    String srcMac = macToString(&payload[10]);

    if (frameSubtype == 12 || frameSubtype == 10) { // Deauth / Disassociation
      processPacket(1, srcMac, rssi);
    } else if (frameSubtype == 8) { // Beacon
      processPacket(2, srcMac, rssi);
    } else if (frameSubtype == 4) { // Probe Request
      processPacket(3, srcMac, rssi);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  for (int i = 0; i < MAX_TRACKERS; i++) trackers[i].mac = "";

  esp_err_t ret = nvs_flash_init();
  if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    nvs_flash_init();
  }
  
  ESP_ERROR_CHECK(esp_netif_init());
  
  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));
  ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_NULL));
  ESP_ERROR_CHECK(esp_wifi_start());

  ESP_ERROR_CHECK(esp_wifi_set_promiscuous(true));
  ESP_ERROR_CHECK(esp_wifi_set_promiscuous_rx_cb(&sniffer_callback));

  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  Serial.println("[ESP32] Deauther.net Attack Detector Active.");
}

void loop() {
  static uint8_t currentChannel = 1;
  static unsigned long lastChannelChange = 0;

  // Channel hop speed optimized to catch bursts; expanded loop range to 13
  if (millis() - lastChannelChange > 120) { 
    lastChannelChange = millis();
    currentChannel++;
    if (currentChannel > 13) currentChannel = 1;
    esp_wifi_set_channel(currentChannel, WIFI_SECOND_CHAN_NONE);
  }
}
