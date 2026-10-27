#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// --- DEFINIRE PINI ESP32-CAM ---
#define I2C_SDA       14
#define I2C_SCL       15
#define TRIG_COMUN    12  // Pin TRIG comun pentru ambii senzori HC-SR04
#define ECHO_INTRARE  13  // Senzorul 1 (Inainte de bariera)
#define ECHO_IESIRE   16  // Senzorul 2 (Dupa bariera)
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
const float PRAG_DETECTIE_CM = 7.0; // Distanta sub care consideram masinuta prezenta

// Prototipurile functiilor (necesare in .cpp pentru PlatformIO)
float citesteSenzorCm(int echoPin);
void actualizeazaOLED(String rand1, String rand2);
void afiseazaStareParcare();
void actioneazaBariera();

void setup() {
  Serial.begin(115200);

  // Configurare pini HC-SR04 si LED
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
  // Important: alocare timer LEDC inalta ca sa nu se suprapuna cu camera la M2
  ESP32PWM::allocateTimer(2);
  barrierServo.setPeriodHertz(50);
  barrierServo.attach(SERVO_PIN, 500, 2400);
  barrierServo.write(0); // Bariera inchisa (0 grade)

  actualizeazaOLED("SISTEM PORNIT", "LIBERE: " + String(CAPACITATE_MAX));
  delay(1500);
  afiseazaStareParcare();
}

// Functie universala care citeste oricare din cei 2 senzori folosind TRIG comun
float citesteSenzorCm(int echoPin) {
  digitalWrite(TRIG_COMUN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_COMUN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_COMUN, LOW);

  long durata = pulseIn(echoPin, HIGH, 25000); // Timeout 25ms (~4m)
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

void actioneazaBariera() {
  barrierServo.write(90); // Ridica bariera
  delay(3500);            // Timp de trecere pentru masinuta
  barrierServo.write(0);  // Coboara bariera
}

void loop() {
  float distIntrare = citesteSenzorCm(ECHO_INTRARE);
  delay(30); // Pauza scurta intre senzori pentru a evita interferentele ultrasonice
  float distIesire = citesteSenzorCm(ECHO_IESIRE);

  Serial.printf("IN: %.1f cm | OUT: %.1f cm | Masini in parcare: %d/%d\n", 
                distIntrare, distIesire, masiniPrezente, CAPACITATE_MAX);

  // ==========================================
  // CAZUL 1: MASINA LA INTRARE (Senzor 1)
  // ==========================================
  if (distIntrare < PRAG_DETECTIE_CM) {
    actualizeazaOLED("INTRARE DETECTATA", "VERIFICARE");
    delay(1000); // Confirmare ca masinuta chiar s-a oprit la bariera

    if (citesteSenzorCm(ECHO_INTRARE) < PRAG_DETECTIE_CM) {
      if (masiniPrezente < CAPACITATE_MAX) {
        // Scurt blitz cu LED-ul de pe ESP32-CAM (simulare captura foto LPR pentru M1)
        digitalWrite(FLASH_LED, HIGH);
        delay(80);
        digitalWrite(FLASH_LED, LOW);

        masiniPrezente++;
        actualizeazaOLED("ACCES PERMIS!", "INTRARE...");
        actioneazaBariera();

        // Asteptam ca masinuta sa plece din dreptul ambilor senzori
        while (citesteSenzorCm(ECHO_INTRARE) < 10.0 || citesteSenzorCm(ECHO_IESIRE) < 10.0) {
          delay(100);
        }
      } else {
        // Parcare plina (5/5) -> Nu deschidem bariera!
        actualizeazaOLED("ACCES RESPINS!", "PLIN 5/5!");
        delay(2500);
        while (citesteSenzorCm(ECHO_INTRARE) < 10.0) delay(100);
      }
      afiseazaStareParcare();
    }
  }

  // ==========================================
  // CAZUL 2: MASINA LA IESIRE (Senzor 2)
  // ==========================================
  else if (distIesire < PRAG_DETECTIE_CM) {
    actualizeazaOLED("IESIRE DETECTATA", "ASTEPTATI");
    delay(1000); // Confirmare oprire la iesire

    if (citesteSenzorCm(ECHO_IESIRE) < PRAG_DETECTIE_CM) {
      if (masiniPrezente > 0) {
        masiniPrezente--;
      }
      actualizeazaOLED("DRUM BUN!", "IESIRE...");
      actioneazaBariera();

      // Asteptam ca masinuta sa treaca complet de bariera si de senzorul de intrare
      while (citesteSenzorCm(ECHO_IESIRE) < 10.0 || citesteSenzorCm(ECHO_INTRARE) < 10.0) {
        delay(100);
      }
      afiseazaStareParcare();
    }
  }

  delay(100);
}