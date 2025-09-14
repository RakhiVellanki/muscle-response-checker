// EMG Sampler 
#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsServer.h>
#include <esp_timer.h>  // robust high-res periodic timer

//USER SETTINGS ----------------
const int   ADC_PIN       = 34;       // Use an ADC1 pin: 36/39/34/35/32/33
const float FS            = 2000.0f;  // Sample rate (Hz)
const bool  USE_NOTCH     = true;     // 60 Hz notch
const float NOTCH_F0      = 60.0f;    // 60 Hz (use 50 in many regions)
const float NOTCH_Q       = 30.0f;    // Higher = narrower notch
const float HPF_FC        = 20.0f;    // 20 Hz high-pass
const size_t WIN_SAMPLES  = 500;      // 250 ms window at 2 kHz
const float ADC_REF_V     = 3.3f;     // ESP32 supply (approx)

// Wi-Fi SoftAP
const char* AP_SSID = "ESP32-EMG";
const char* AP_PASS = "emg12345";   

// Fixed-point scaling 
const float   SCALE_F = 10000.0f;     // 0.1 mV per LSB if units are volts
const int16_t SCALE_Q = (int16_t)SCALE_F;

//Timer
esp_timer_handle_t emg_timer = nullptr;
volatile uint32_t sampleTicks = 0;    // ticks produced by timer callback

float hp_y1 = 0.0f, hp_x1 = 0.0f;    

struct Biquad {
  float b0, b1, b2, a1, a2;
  float z1 = 0.0f, z2 = 0.0f;
  inline float process(float x) {
    float y = b0*x + z1;
    z1 = b1*x - a1*y + z2;
    z2 = b2*x - a2*y;
    return y;
  }
} notch;

//Window buffers
int16_t win_i16[WIN_SAMPLES];
size_t  collected = 0;

//Websocket server
WebSocketsServer wsServer(81);      
volatile bool wsConnected = false;
uint8_t wsClientNum = 0;

// =EMG1 header
struct __attribute__((packed)) FrameHeader {
  uint32_t magic;     
  uint16_t n_samples;  
  uint16_t fs_hz;      
  int16_t  scale_q;   
  uint32_t seq;         
};
uint32_t seq = 0;

//Heartbeat counters
uint32_t framesSent = 0;
uint32_t lastPrintMs = 0;

void designNotch(Biquad &biq, float fs, float f0, float Q) {
  float w0 = 2.0f * PI * f0 / fs;
  float cw = cosf(w0), sw = sinf(w0);
  float alpha = sw / (2.0f * Q);

  float b0 = 1.0f;
  float b1 = -2.0f * cw;
  float b2 = 1.0f;
  float a0 = 1.0f + alpha;
  float a1 = -2.0f * cw;
  float a2 = 1.0f - alpha;

  biq.b0 = b0 / a0;
  biq.b1 = b1 / a0;
  biq.b2 = b2 / a0;
  biq.a1 = a1 / a0;
  biq.a2 = a2 / a0;
  biq.z1 = biq.z2 = 0.0f;
}

//20 Hz high-pass
inline float hpf20(float x) {
  static bool inited = false;
  static float alpha = 0.0f;
  if (!inited) {
    alpha = expf(-2.0f * PI * HPF_FC / FS);
    inited = true;
  }
  float y = alpha * (hp_y1 + x - hp_x1);
  hp_y1 = y;
  hp_x1 = x;
  return y;
}

IRAM_ATTR void emg_timer_cb(void* /*arg*/) { sampleTicks++; }

void onWsEvent(uint8_t num, WStype_t type, uint8_t * /*payload*/, size_t /*length*/) {
  switch (type) {
    case WStype_CONNECTED:
      wsConnected = true; wsClientNum = num;
      break;
    case WStype_DISCONNECTED:
      if (num == wsClientNum) wsConnected = false;
      break;
    default: break;
  }
}

void wifi_ws_setup() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  delay(150);
  IPAddress ip = WiFi.softAPIP();
  Serial.print("AP SSID: "); Serial.println(AP_SSID);
  Serial.print("AP IP:   "); Serial.println(ip); 

  wsServer.begin();
  wsServer.onEvent(onWsEvent);
}

void send_window_ws(const int16_t* data, size_t n) {
  if (!wsConnected) return;

  FrameHeader hdr;
  hdr.magic     = 0x31474D45;
  hdr.n_samples = (uint16_t)n;
  hdr.fs_hz     = (uint16_t)FS;
  hdr.scale_q   = (SCALE_Q == 0 ? 1024 : SCALE_Q);
  hdr.seq       = seq++;

  const size_t HDR = sizeof(hdr);
  const size_t BYTES = HDR + n * sizeof(int16_t);

  static uint8_t frame[sizeof(FrameHeader) + WIN_SAMPLES * 2];
  memcpy(frame, &hdr, HDR);
  memcpy(frame + HDR, data, n * sizeof(int16_t));

  wsServer.sendBIN(wsClientNum, frame, BYTES);
  framesSent++;
}

void setup() {
  Serial.begin(115200);
  delay(200);

  analogReadResolution(12);                    
  analogSetPinAttenuation(ADC_PIN, ADC_11db); 

  if (USE_NOTCH) designNotch(notch, FS, NOTCH_F0, NOTCH_Q);


  wifi_ws_setup();

  const uint64_t period_us = (uint64_t) llround(1e6 / FS);
  const esp_timer_create_args_t targs = {
    .callback = &emg_timer_cb,
    .arg = nullptr,
    .dispatch_method = ESP_TIMER_TASK,
    .name = "emg_fs"
  };
  esp_timer_create(&targs, &emg_timer);
  esp_timer_start_periodic(emg_timer, period_us);
}

void loop() {
  wsServer.loop();

  while (sampleTicks > 0) {
    noInterrupts(); sampleTicks--; interrupts();

    // ---- Sample
    uint16_t adc = analogRead(ADC_PIN);
    float v = (adc / 4095.0f) * ADC_REF_V;
    float y = v - (ADC_REF_V * 0.5f);

    //Filters
    y = hpf20(y);
    if (USE_NOTCH) y = notch.process(y);

    float sflt = y * SCALE_F;
    if (sflt >  32767.0f) sflt =  32767.0f;
    if (sflt < -32768.0f) sflt = -32768.0f;
    win_i16[collected] = (int16_t)sflt;

    collected++;
    if (collected >= WIN_SAMPLES) {
      send_window_ws(win_i16, WIN_SAMPLES);
      collected = 0;
    }
  }
#endif

  uint32_t nowMs = millis();
  if (nowMs - lastPrintMs >= 1000) {
    lastPrintMs = nowMs;
    Serial.printf("seq=%lu frames=%lu wsConnected=%d\n",
                  (unsigned long)seq,
                  (unsigned long)framesSent,
                  (int)wsConnected);
    framesSent = 0;
  }
}
