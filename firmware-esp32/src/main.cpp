#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// --- DEFINIRE PINI ESP32-CAM ---
#define I2C_SDA       14
#define I2C_SCL       15
#define TRIG_COMUN    12  // Pin TRIG comun pentru ambii senzori HC-SR04
#define ECHO_INTRARE  13  // Senzorul 1 (Exterior - langa camera)
#define ECHO_IESIRE   16  // Senzorul 2 (Interior - dupa bariera)
#define SERVO_PIN     2   // Servomotor SG90
#define FLASH_LED     4   // LED-ul alb integrat pe ESP32-CAM

// --- CONFIGURARE OLED 0.91" (128x32) ---
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 32
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

Servo barrierServo;

// --- PARAMETRI PARCARE ---
const int CAPACITATE_MAX = 5;
int masiniPrezente = 0;
const float PRAG_DETECTIE_CM = 8.0;        // Sub 8 cm = masina detectata
const float PRAG_ELIBERARE_CM = 12.0;      // Peste 12 cm = zona eliberata
const unsigned long TIMEOUT_TRANZIT = 8000; // 8 secunde timp maxim de trecere

// Prototipuri functii
float citesteSenzorCm(int echoPin);
void actualizeazaOLED(String rand1, String rand2);
void afiseazaStareParcare();
void asteaptaEliberareSenzori();
void declanseazaCapturaFoto(String tipEveniment);

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_COMUN, OUTPUT);
  pinMode(ECHO_INTRARE, INPUT);
  pinMode(ECHO_IESIRE, INPUT);
  pinMode(FLASH_LED, OUTPUT);
  digitalWrite(FLASH_LED, LOW);

  // Initializare I2C + OLED 0.91"
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("EROARE: Nu gasesc OLED-ul pe I2C (0x3C)!");
    while (true);
  }

  // Initializare Servomotor SG90
  ESP32PWM::allocateTimer(2);
  barrierServo.setPeriodHertz(50);
  barrierServo.attach(SERVO_PIN, 500, 2400);
  barrierServo.write(0); // Bariera inchisa (0 grade)

  actualizeazaOLED("SISTEM PORNIT", "LIBERE: " + String(CAPACITATE_MAX));
  delay(1500);
  afiseazaStareParcare();
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

// Functie dedicata pentru captura foto (la M2 aici vom adauga trimiterea HTTP POST catre Node.js)
void declanseazaCapturaFoto(String tipEveniment) {
  actualizeazaOLED("CAPTURA FOTO...", tipEveniment);
  Serial.println(">>> CAPTURA FOTO LPR [" + tipEveniment + "] <<<");
  
  digitalWrite(FLASH_LED, HIGH);
  delay(80);
  digitalWrite(FLASH_LED, LOW);
  delay(400); // Scurta pauza vizuala pe OLED
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

  Serial.printf("IN: %.1f cm | OUT: %.1f cm | Masini: %d/%d\n", 
                distIntrare, distIesire, masiniPrezente, CAPACITATE_MAX);

  // =========================================================================
  // SECVENTA 1: INTRARE (Senzor 1 + Poza -> Bariera -> Confirmare Senzor 2)
  // =========================================================================
  if (distIntrare < PRAG_DETECTIE_CM) {
    if (masiniPrezente >= CAPACITATE_MAX) {
      actualizeazaOLED("ACCES RESPINS!", "PLIN 5/5!");
      delay(2000);
      asteaptaEliberareSenzori();
      afiseazaStareParcare();
      return;
    }

    // 1. Masina este in fata Senzorului 1 (si a camerei) -> Facem poza de INTRARE
    declanseazaCapturaFoto("LA INTRARE");

    // 2. Ridicam bariera si asteptam sa treaca spre Senzorul 2
    actualizeazaOLED("INTRARE DETECTATA", "AVANSATI->");
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

    // 3. Confirmare intrare pe Senzorul 2
    if (intrareConfirmata) {
      masiniPrezente++;
      actualizeazaOLED("INTRARE OK!", "OCUPAT:" + String(masiniPrezente) + "/" + String(CAPACITATE_MAX));
      Serial.println(">>> INTRARE CONFIRMATA DE SENZORUL 2! <<<");
      asteaptaEliberareSenzori();
    } else {
      actualizeazaOLED("TRANZIT ANULAT", "TIMEOUT!");
      Serial.println(">>> TIMEOUT INTRARE <<<");
      delay(1500);
    }

    barrierServo.write(0);
    afiseazaStareParcare();
  }

  // =========================================================================
  // SECVENTA 2: IESIRE (Senzor 2 -> Bariera -> Confirmare + Poza la Senzor 1)
  // =========================================================================
  else if (distIesire < PRAG_DETECTIE_CM) {
    // 1. Masina se apropie din interior (Senzor 2) -> Ridicam bariera
    actualizeazaOLED("IESIRE DETECTATA", "<-AVANSATI");
    barrierServo.write(90);

    // 2. Asteptam sa treaca de bariera si sa ajunga in dreptul Senzorului 1 (unde e camera)
    unsigned long startTranzit = millis();
    bool iesireConfirmata = false;

    while (millis() - startTranzit < TIMEOUT_TRANZIT) {
      if (citesteSenzorCm(ECHO_INTRARE) < PRAG_DETECTIE_CM) {
        iesireConfirmata = true;
        break;
      }
      delay(50);
    }

    // 3. Cand a ajuns la Senzorul 1, facem poza de IESIRE ca sa stim care masina a plecat
    if (iesireConfirmata) {
      delay(200); // Mic ragaz ca masinuta sa fie incadrata bine in fata camerei
      declanseazaCapturaFoto("LA IESIRE");

      if (masiniPrezente > 0) {
        masiniPrezente--;
      }
      actualizeazaOLED("DRUM BUN!", "LIBER: " + String(CAPACITATE_MAX - masiniPrezente) + "/" + String(CAPACITATE_MAX));
      Serial.println(">>> IESIRE CONFIRMATA SI FOTOGRAFIATA LA SENZORUL 1! <<<");

      asteaptaEliberareSenzori();
    } else {
      actualizeazaOLED("IESIRE ANULATA", "TIMEOUT!");
      Serial.println(">>> TIMEOUT IESIRE <<<");
      delay(1500);
    }

    barrierServo.write(0);
    afiseazaStareParcare();
  }

  delay(80);
}