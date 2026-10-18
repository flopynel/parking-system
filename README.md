# Sistem IoT de Control Acces în Parcare și Recunoaștere a Numerelor de Înmatriculare (LPR)

## 1. Descrierea Proiectului
Proiectul constă în dezvoltarea unui sistem automatizat pentru gestiunea unei parcări cu acces controlat. Sistemul utilizează un nod IoT (ESP32-CAM + senzori de proximitate) pentru a detecta vehiculele la barieră, a fotografia plăcuța de înmatriculare și a transmite imaginea către un server central. 

Serverul identifică numărul de înmatriculare (OCR/LPR), verifică dreptul de acces și disponibilitatea locurilor, comandă deschiderea barierei și actualizează în timp real contorul de mașini prezente, precum și jurnalul cu orele de intrare și de ieșire într-o aplicație web.

## 2. Funcționalități Principale
- **Detecție automată a vehiculului:** Senzorul ultrasonic detectează oprirea mașinii în fața barierei și declanșează captura foto.
- **Recunoașterea numărului de înmatriculare (LPR):** Extragerea automată a textului de pe plăcuță pe serverul backend.
- **Controlul barierei și afișaj local:** Deschiderea barierei (servomotor), semnalizare luminoasă (LED Verde/Roșu) și afișarea numărului/locurilor disponibile pe ecranul OLED 0.91".
- **Contorizarea mașinilor prezente:** Calculul în timp real al gradului de ocupare a parcării și blocarea accesului la atingerea capacității maxime.
- **Jurnal Web (Intrare / Ieșire):** Interfață React.js care afișează în timp real mașinile aflate în parcare, ora exactă de intrare, ora de ieșire, durata staționării și imaginea capturată la barieră.
- **Stocare locală de siguranță (Offline Logging):** Salvarea evenimentelor de acces pe memorie externă USB prin intermediul controlerului FTDI V2DIP1-32.

## 3. Arhitectura Sistemului
- **Nivelul Hardware (Edge IoT):**
  - Modul ESP32-CAM (captură imagine + comunicație Wi-Fi)
  - Senzor ultrasonic HC-SR04 (detecție prezență vehicul la barieră)
  - Servomotor SG90 (acționare barieră acces)
  - Display OLED 0.91 inch I2C (128x32) pentru afișare mesaje și locuri libere
  - Indicatori LED (Verde/Roșu) și Buzzer
  - Modul USB Host FTDI V2DIP1-32 (logare locală a intrărilor/ieșirilor pe stick USB)
- **Nivelul Backend:** Node.js + Express, serviciu procesare OCR/LPR, bază de date pentru evidența sesiunilor de parcare (intrări/ieșiri) și a listei de numere acceptate.
- **Nivelul Frontend:** Aplicație Web React.js pentru monitorizarea live a gradului de ocupare, vizualizarea tabelului de intrări/ieșiri și administrarea bazei de date.

## 4. Planificarea pe Milestones (M0 - M5)

| Milestone | Data | Livrabile și obiective pentru prezentare |
| :--- | :--- | :--- |
| **M0** | **18.10.2026** | Propunerea temei, stabilirea arhitecturii sistemului, alegerea componentelor și inițializarea repository-ului GitHub. |
| **M1** | **01.11.2026** | **Prototip Hardware Local:** Conectarea senzorului ultrasonic, a servomotorului (barieră), a LED-urilor și a ecranului OLED 0.91". Demonstrarea detecției unui vehicul, acționarea barierei și afișarea contorului local pe OLED. |
| **M2** | **08.11.2026** | **Captură Foto & Comunicație Wi-Fi:** Configurarea camerei pe ESP32-CAM. La detecția vehiculului în fața barierei, placa realizează fotografia și o trimite prin HTTP POST către serverul Node.js. |
| **M3** | **15.11.2026** | **Recunoașterea Numărului (LPR) & Logica de Contorizare:** Extragerea numărului de înmatriculare pe server, verificarea dreptului de acces, înregistrarea orei de intrare/ieșire și returnarea comenzii de deschidere a barierei către ESP32. |
| **M4** | **22.11.2026** | **Interfața Web (React Dashboard):** Afișarea în timp real în pagina web a numărului de mașini prezente în parcare, a tabelului cu ora de intrare și ora de ieșire pentru fiecare vehicul, precum și administrarea numerelor autorizate. |
| **M5** | **06.12.2026** | **Integrare Finală pe Machetă & Documentație:** Testarea completă end-to-end cu machete auto (intrare -> incrementare contor -> afișare web -> ieșire -> calcul timp staționare), integrarea logării pe USB (V2DIP1-32) și documentația finală. |
