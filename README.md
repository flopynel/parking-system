# Sistem IoT de Control Acces în Parcare și Recunoaștere a Numerelor de Înmatriculare (LPR)

## 1. Descrierea Proiectului
Proiectul constă în dezvoltarea unui sistem automatizat pentru gestiunea unei parcări cu acces controlat. Sistemul utilizează un nod IoT bazat pe **ESP32-CAM** și **2 senzori ultrasonici (HC-SR04)** pentru a detecta direcția de deplasare a vehiculelor (intrare sau ieșire), a fotografia plăcuța de înmatriculare pe ambele sensuri de tranzit și a transmite imaginea către un server central.

Serverul identifică numărul de înmatriculare (OCR/LPR), verifică dreptul de acces și disponibilitatea locurilor, comandă deschiderea barierei și actualizează în timp real contorul de mașini prezente, precum și jurnalul cu orele de intrare, orele de ieșire și durata staționării într-o aplicație web.

---

## 2. Funcționalități Principale
- **Detecție bidirecțională și confirmare de tranzit (2x HC-SR04):**
  - **Flux Intrare:** Senzorul 1 (Exterior) detectează mașina $\rightarrow$ Captură Foto LPR $\rightarrow$ Deschidere barieră $\rightarrow$ Senzorul 2 (Interior) confirmă pătrunderea în parcare $\rightarrow$ Incrementare contor și închidere barieră.
  - **Flux Ieșire:** Senzorul 2 (Interior) detectează mașina $\rightarrow$ Deschidere barieră $\rightarrow$ Senzorul 1 (Exterior) confirmă ieșirea și declanșează Captura Foto LPR (pentru identificarea mașinii care părăsește parcarea) $\rightarrow$ Decrementare contor și închidere barieră.
  - **Protecție Timeout:** Dacă vehiculul nu finalizează tranzitul prin dreptul celui de-al doilea senzor în 8 secunde, tranzitul este anulat automat și bariera coboară fără a modifica numărul de locuri.
- **Recunoașterea numărului de înmatriculare (LPR):** Extragerea automată a textului de pe plăcuță pe serverul backend.
- **Controlul barierei și afișaj local:** Acționarea barierei prin servomotor SG90, semnalizare luminoasă (Flash LED integrat pentru captură/alertă) și afișarea stării în timp real pe ecranul OLED 0.91" I2C.
- **Contorizarea mașinilor prezente:** Calculul în timp real al gradului de ocupare (ex. 5 locuri) și blocarea automată a accesului la atingerea capacității maxime.
- **Jurnal Web (Intrare / Ieșire):** Interfață React.js care afișează în timp real mașinile aflate în parcare, ora exactă de intrare, ora de ieșire, durata staționării și imaginea capturată la barieră.
- **Stocare locală de siguranță (Offline Logging):** Salvarea evenimentelor de acces pe memorie externă USB prin intermediul controlerului FTDI V2DIP1-32.

---

## 3. Arhitectura Sistemului și Structura Repository-ului

Proiectul este organizat într-o structură **Monorepo**:

- `parking-system/`
  - `firmware-esp32/` — Codul sursă C++ (PlatformIO) pentru ESP32-CAM
  - `backend-node/` — Server REST API & WebSockets (Node.js + Express + MySQL + OCR)
  - `frontend-react/` — Dashboard Web (React + Vite + Tailwind CSS)
  - `README.md` — Documentația proiectului

### Nivelul Hardware (Edge IoT) & Pinout ESP32-CAM
Pentru a optimiza pinii disponibili pe modulul **ESP32-CAM**, cei doi senzori ultrasonici partajează un pin `TRIG` comun (`GPIO 12`) și sunt alimentați la $3.3\text{V}$ pentru compatibilitate logică directă cu intrările GPIO ale microcontrolerului:

| Componentă Hardware | Pin Componentă | Pin ESP32-CAM | Rol / Observații |
| :--- | :--- | :--- | :--- |
| **Display OLED 0.91" (128x32)** | `SDA` / `SCL` | `GPIO 14` / `GPIO 15` | Magistrală I2C software ($3.3\text{V}$) |
| **Senzor Ultrasonic 1 (Intrare)** | `TRIG` / `ECHO` | `GPIO 12` / `GPIO 13` | Detecție vehicul la intrare + confirmare ieșire |
| **Senzor Ultrasonic 2 (Ieșire)** | `TRIG` / `ECHO` | `GPIO 12` / `GPIO 16` | Detecție vehicul la ieșire + confirmare intrare |
| **Servomotor SG90 (Barieră)** | `PWM (Portocaliu)` | `GPIO 2` | Control unghi barieră ($0^\circ$ Închis / $90^\circ$ Deschis) |
| **LED Flash / Status** | `Anod` | `GPIO 4` | Iluminare captură foto LPR (integrat pe placă) |
| **Modul FTDI V2DIP1-32** | `UART` | `U0T` / `U0R` | Stocare locală evenimente pe stick USB |

---

## 4. Planificarea pe Milestones (M0 - M5)

| Milestone | Data | Status | Livrabile și obiective pentru prezentare |
| :--- | :--- | :---: | :--- |
| **M0** | **18.10.2026** | Finalizat | Propunerea temei, stabilirea arhitecturii sistemului, alegerea componentelor și inițializarea repository-ului GitHub. |
| **M1** | **01.11.2026** | Finalizat | **Prototip Hardware Local:** Conectarea celor 2 senzori ultrasonici (intrare/ieșire), a servomotorului SG90 și a ecranului OLED 0.91". Implementarea mașinii de stări pentru tranzit bidirecțional, protecție timeout și afișarea contorului local pe OLED. |
| **M2** | **08.11.2026** | În lucru | **Captură Foto & Comunicație Wi-Fi:** Configurarea camerei OV2640 pe ESP32-CAM și conectarea la internet (Hotspot). La detecția vehiculului (intrare/ieșire), placa realizează fotografia și o trimite prin HTTP POST către serverul din cloud. |
| **M3** | **15.11.2026** | Planificat | **Recunoașterea Numărului (LPR) & Logica de Contorizare:** Extragerea numărului de înmatriculare pe server, verificarea dreptului de acces (Whitelist), înregistrarea orei de intrare/ieșire în baza de date și returnarea deciziei către ESP32. |
| **M4** | **22.11.2026** | Planificat | **Interfața Web (React Dashboard):** Afișarea în timp real în pagina web a gradului de ocupare, a ultimei capturi LPR, a tabelului cu ora de intrare/ieșire și durata staționării, plus administrarea numerelor autorizate. |
| **M5** | **06.12.2026** | Planificat | **Integrare Finală pe Machetă & Documentație:** Testarea completă end-to-end cu machete auto, integrarea logării de siguranță pe USB (V2DIP1-32) și redactarea documentației finale. |