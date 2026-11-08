#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "esp_camera.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// =========================================================================
// CONFIGURARE WI-FI SI SERVER
// =========================================================================
const char* WIFI_SSID = "S21 Ultra 5G";
const char* WIFI_PASS = "cristian";
const char* SERVER_URL = "https://parking.hailamasina.ro/api/parking/capture";

// =========================================================================
// PINI CAMERA OV2640 (AI-THINKER ESP32-CAM)
// =========================================================================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// =========================================================================
// PINI PERIFERICE
// =========================================================================
#define I2C_SDA       14
#define I2C_SCL       15
#define TRIG_COMUN    12  
#define ECHO_INTRARE  13  
#define ECHO_IESIRE   3   // GPIO3 (U0RXD). NU folosi GPIO16: e CS-ul PSRAM pe ESP32-CAM!
#define SERVO_PIN     2   
#define FLASH_LED     4   

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 32
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Servo barrierServo;

const int CAPACITATE_MAX = 5;
int masiniPrezente = 0;
const float PRAG_DETECTIE_CM = 8.0;
const float PRAG_ELIBERARE_CM = 12.0;
const unsigned long TIMEOUT_TRANZIT = 8000;
bool cameraOk = false;

bool initCamera();
void conectareWiFi();
float citesteSenzorCm(int echoPin);
void actualizeazaOLED(String rand1, String rand2);
void afiseazaStareParcare();
void asteaptaEliberareSenzori();
bool trimitePozaLaServer(String tipEveniment);

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  // Doar TX (GPIO1) pentru log-uri; RX (GPIO3) e folosit de senzorul de iesire
  Serial.begin(115200, SERIAL_8N1, -1, 1);
  delay(500);

  pinMode(TRIG_COMUN, OUTPUT);
  pinMode(ECHO_INTRARE, INPUT);
  pinMode(ECHO_IESIRE, INPUT);
  pinMode(FLASH_LED, OUTPUT);
  digitalWrite(FLASH_LED, LOW);

  // 1. OLED
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("EROARE: Nu gasesc OLED-ul!");
  }

  actualizeazaOLED("INIT SISTEM", "PORNIRE...");
  delay(1000);

  // 2. Camera OV2640 (Pornita PRIMA, inainte de Wi-Fi, pentru a prinde RAM contiguu)
  cameraOk = initCamera();
  if (!cameraOk) {
    actualizeazaOLED("EROARE CAMERA!", "VERIFICA PANGLICA");
    Serial.println("EROARE CRITICA: Camera OV2640 nu a putut fi initializata!");
  } else {
    actualizeazaOLED("CAMERA OK", "PORNIRE WIFI...");
  }
  delay(1000);

  // 3. Servomotor SG90
  ESP32PWM::allocateTimer(2);
  barrierServo.setPeriodHertz(50);
  barrierServo.attach(SERVO_PIN, 500, 2400);
  barrierServo.write(0);

  // 4. Wi-Fi
  conectareWiFi();
  afiseazaStareParcare();
}

bool initCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000; // Redus la 10MHz pentru stabilitate maxima pe cabluri lungi
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_count = 1;
  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 15;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    // Fara PSRAM, framebuffer-ul trebuie sa incapa in DRAM
    Serial.println("ATENTIE: PSRAM negasit, folosesc rezolutie mica in DRAM");
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 20;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Eroare init camera: 0x%x\n", err);
    return false;
  }
  return true;
}

void conectareWiFi() {
  actualizeazaOLED("WIFI:", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int incercari = 0;
  while (WiFi.status() != WL_CONNECTED && incercari < 30) {
    delay(500);
    Serial.print(".");
    incercari++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Conectat! IP: " + WiFi.localIP().toString());
    actualizeazaOLED("WIFI OK", WiFi.localIP().toString());
    delay(1500);
  } else {
    Serial.println("\nEroare: Nu s-a putut conecta la WiFi.");
    actualizeazaOLED("WIFI EROARE", "VERIFICA HOTSPOT");
    delay(2000);
  }
}

float citesteSenzorCm(int echoPin) {
  digitalWrite(TRIG_COMUN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_COMUN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_COMUN, LOW);

  long durata = pulseIn(echoPin, HIGH, 25000);
  if (durata == 0) return 999.0;
  return durata * 0.0343 / 2.0;
}

void actualizeazaOLED(String rand1, String rand2) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(rand1);
  display.setTextSize(2);
  display.setCursor(0, 14);
  display.println(rand2);
  display.display();
}

void afiseazaStareParcare() {
  int libere = CAPACITATE_MAX - masiniPrezente;
  String statusSus = (libere > 0) ? "PARCARE DISPONIBILA" : "PARCARE COMPLETA!";
  String statusJos = "LIBER: " + String(libere) + "/" + String(CAPACITATE_MAX);
  actualizeazaOLED(statusSus, statusJos);
}

bool trimitePozaLaServer(String tipEveniment) {
  actualizeazaOLED("CAPTURA FOTO...", tipEveniment);
  digitalWrite(FLASH_LED, HIGH);
  delay(100);

  camera_fb_t * fb = NULL;
  if (cameraOk) {
    fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
    fb = esp_camera_fb_get();
  }

  digitalWrite(FLASH_LED, LOW);

  if (!fb) {
    Serial.println("Eroare cadru camera!");
    return true; 
  }

  if (WiFi.status() == WL_CONNECTED) {
    actualizeazaOLED("TRIMITERE...", String(fb->len / 1024) + " KB");
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    String url = String(SERVER_URL) + "?type=" + tipEveniment;
    if (http.begin(client, url)) {
      http.addHeader("Content-Type", "image/jpeg");
      http.addHeader("X-Event-Type", tipEveniment);

      int httpCode = http.POST(fb->buf, fb->len);
      Serial.printf("HTTP POST Status: %d\n", httpCode);
      if (httpCode > 0) {
        String raspuns = http.getString();
        Serial.println("Raspuns: " + raspuns);
      }
      http.end();
    }
  }

  esp_camera_fb_return(fb);
  return true;
}

void asteaptaEliberareSenzori() {
  while (citesteSenzorCm(ECHO_INTRARE) < PRAG_ELIBERARE_CM || 
         citesteSenzorCm(ECHO_IESIRE) < PRAG_ELIBERARE_CM) {
    delay(100);
  }
  delay(400);
}

void loop() {
  float distIntrare = citesteSenzorCm(ECHO_INTRARE);
  delay(30);
  float distIesire = citesteSenzorCm(ECHO_IESIRE);

  if (distIntrare < PRAG_DETECTIE_CM) {
    if (masiniPrezente >= CAPACITATE_MAX) {
      actualizeazaOLED("ACCES RESPINS!", "PLIN 5/5!");
      delay(2000);
      asteaptaEliberareSenzori();
      afiseazaStareParcare();
      return;
    }

    trimitePozaLaServer("ENTRY");
    actualizeazaOLED("INTRARE OK", "AVANSATI->");
    barrierServo.write(90);

    unsigned long startTranzit = millis();
    bool intrareConfirmata = false;

    while (millis() - startTranzit < TIMEOUT_TRANZIT) {
      if (citesteSenzorCm(ECHO_IESIRE) < PRAG_DETECTIE_CM) {
        intrareConfirmata = true;
        break;
      }
      delay(50);
    }

    if (intrareConfirmata) {
      masiniPrezente++;
      asteaptaEliberareSenzori();
    }
    barrierServo.write(0);
    afiseazaStareParcare();
  }
  else if (distIesire < PRAG_DETECTIE_CM) {
    actualizeazaOLED("IESIRE...", "<-AVANSATI");
    barrierServo.write(90);

    unsigned long startTranzit = millis();
    bool iesireConfirmata = false;

    while (millis() - startTranzit < TIMEOUT_TRANZIT) {
      if (citesteSenzorCm(ECHO_INTRARE) < PRAG_DETECTIE_CM) {
        iesireConfirmata = true;
        break;
      }
      delay(50);
    }

    if (iesireConfirmata) {
      delay(200);
      trimitePozaLaServer("EXIT");
      if (masiniPrezente > 0) masiniPrezente--;
      asteaptaEliberareSenzori();
    }
    barrierServo.write(0);
    afiseazaStareParcare();
  }

  delay(80);
}