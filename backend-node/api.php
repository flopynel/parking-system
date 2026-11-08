<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Api-Key, X-Event-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// "cv 54-flo" -> "CV54FLO", pentru comparatii intre numere scrise diferit
function normalizePlate($plate) {
    return preg_replace('/[^A-Z0-9]/', '', strtoupper((string)$plate));
}

// 3725 secunde -> "1h 02m"
function formatDuration($seconds) {
    $seconds = max(0, (int)$seconds);
    $h = intdiv($seconds, 3600);
    $m = intdiv($seconds % 3600, 60);
    return $h > 0 ? sprintf("%dh %02dm", $h, $m) : sprintf("%dm", max(1, $m));
}

$dataFile = __DIR__ . '/parking_data.json';
$uploadsDir = __DIR__ . '/uploads';
if (!is_dir($uploadsDir)) mkdir($uploadsDir, 0755, true);

// Initializare date implicite daca fisierul nu exista
if (!file_exists($dataFile)) {
    $initialData = [
        "esp32Online" => true,
        "lastSeen" => time(),
        "occupiedSpots" => 0,
        "maxCapacity" => 5,
        "barrierState" => "CLOSED",
        "sensor1Active" => false,
        "sensor2Active" => false,
        "stats" => ["entriesToday" => 0, "exitsToday" => 0, "avgStayMinutes" => 15, "rejectedToday" => 0],
        "lastCapture" => [
            "imageUrl" => "/uploads/last_capture.jpg",
            "plate" => "ASTEPTARE...",
            "eventType" => "ENTRY",
            "timestamp" => date("c"),
            "confidence" => 0.0,
            "standardRo" => false
        ],
        "activeSpots" => [],
        "sessions" => [],
        "whitelist" => [
            ["plate" => "CV 10 PRO", "owner" => "Soare Florin", "phone" => "0700000000"],
            ["plate" => "BV 25 XYZ", "owner" => "Test Auto 1", "phone" => "0700000001"]
        ]
    ];
    file_put_contents($dataFile, json_encode($initialData, JSON_PRETTY_PRINT));
}

$data = json_decode(file_get_contents($dataFile), true);
$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// 1. GET /api/parking/status
if ($route === 'status' && $method === 'GET') {
    $data['esp32Online'] = (time() - ($data['lastSeen'] ?? 0)) < 120;
    echo json_encode($data);
    exit;
}

// 2. POST /api/parking/capture (Primeste poza de la ESP32-CAM)
if ($route === 'capture' && $method === 'POST') {
    $eventType = $_SERVER['HTTP_X_EVENT_TYPE'] ?? ($_GET['type'] ?? 'ENTRY');
    $rawImage = file_get_contents('php://input');
    $imagePath = $uploadsDir . '/last_capture.jpg';

    if ($rawImage && strlen($rawImage) > 100) {
        file_put_contents($imagePath, $rawImage);
        $historyImg = '/uploads/cap_' . time() . '.jpg';
        file_put_contents(__DIR__ . $historyImg, $rawImage);
    } else {
        $historyImg = '/uploads/last_capture.jpg';
    }

    $data['lastSeen'] = time();
    $data['esp32Online'] = true;

    // Publicam poza IMEDIAT (inainte de OCR, care dureaza ~1s), ca dashboard-ul sa o afiseze
    // cu "SE CITESTE..." la urmatorul poll. Numarul real apare cand termina OCR-ul.
    $data['lastCapture'] = [
        "imageUrl" => "/uploads/last_capture.jpg?t=" . time(),
        "plate" => "SE CITESTE...",
        "eventType" => $eventType,
        "timestamp" => date("c"),
        "confidence" => 0.0,
        "standardRo" => false
    ];
    file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT));

    // =========================================================================
    // APEL EXTERN OCR (Exemplu cu OCR.space API gratuit / sau poti pune endpoint-ul tau de pe RapidAPI)
    // =========================================================================
    $detectedPlate = "NECUNOSCUT";
    $confidence = 0.0;
    $isStandardRomanian = false;

    $apiKeyOcr = 'helloworld'; // Poti folosi 'helloworld' pentru test sau iti pui cheia ta gratuita de pe ocr.space / RapidAPI
    $postFields = [
        'apikey' => $apiKeyOcr,
        'language' => 'eng',
        // ATENTIE: valorile trebuie trimise ca STRING-uri. PHP cURL transforma false in "" si true in "1",
        // iar OCR.space respinge cererea cu "Value for parameter ... is invalid".
        'isOverlayRequired' => 'false',
        'scale' => 'true',
        'detectOrientation' => 'true',
        'filetype' => 'JPG',
        'OCREngine' => '2' // Engine 2 este excelent pentru recunoaștere text/numere
    ];

    // Adaugam fisierul imagine pentru upload cURL
    if (file_exists($imagePath)) {
        $postFields['file'] = new CURLFile($imagePath, 'image/jpeg', 'last_capture.jpg');

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, 'https://api.ocr.space/parse/image');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);

        $response = curl_exec($ch);
        if ($response === false) {
            error_log('[OCR] cURL error: ' . curl_error($ch));
        }
        curl_close($ch);

        if ($response) {
            $resultJson = json_decode($response, true);
            if (!empty($resultJson['IsErroredOnProcessing'])) {
                error_log('[OCR] OCR.space error: ' . json_encode($resultJson['ErrorMessage'] ?? $resultJson));
            }
            if (isset($resultJson['ParsedResults'][0]['ParsedText'])) {
                $rawText = strtoupper($resultJson['ParsedResults'][0]['ParsedText']);
                $cleanText = preg_replace('/[^A-Z0-9]/', ' ', $rawText);
                $cleanText = trim(preg_replace('/\s+/', ' ', $cleanText));

                // Validare standard românesc prin Regex (ex: CV 10 PRO, B 123 ABC, etc.)
                // Fiecare pattern are grupuri, ca numarul sa fie salvat mereu in format standard
                // cu spatii ("CV54FLO" si "CV 54 FLO" devin amandoua "CV 54 FLO").
                $judete = 'AB|AR|AG|BC|BH|BN|BT|BV|BR|BZ|CS|CL|CJ|CT|CV|DB|DJ|GL|GR|GJ|HR|HD|IL|IS|IF|MM|MH|MS|NT|OT|PH|SM|SJ|SB|SV|TR|TM|TL|VS|VL|VN';
                $romanianPatterns = [
                    '/\b(B)\s*(\d{2,3})\s*([A-Z]{3})\b/',
                    '/\b(' . $judete . ')\s*(\d{2})\s*([A-Z]{3})\b/',
                    '/\b(MAI)\s*(\d{3,5})\b/',
                    '/\b(CD|TC)\s*(\d{3})\s*(\d{2})\b/'
                ];

                foreach ($romanianPatterns as $pattern) {
                    if (preg_match($pattern, $cleanText, $matches)) {
                        $detectedPlate = implode(' ', array_slice($matches, 1));
                        $isStandardRomanian = true;
                        $confidence = 95.0;
                        break;
                    }
                }

                // Daca nu s-a gasit un numar valid, NU folosim tot textul citit (ar contine si alte
                // inscriptii din imagine). Ramane "NECUNOSCUT", iar textul brut ajunge doar in log.
                if (!$isStandardRomanian) {
                    error_log('[OCR] Niciun numar RO valid in textul citit: "' . $cleanText . '"');
                }
            }
        }
    }

    // Verificam daca numarul recunoscut se afla in Whitelist
    $isAuthorized = false;
    foreach ($data['whitelist'] as $item) {
        if (normalizePlate($item['plate']) === normalizePlate($detectedPlate)) {
            $isAuthorized = true;
            break;
        }
    }

    // =========================================================================
    // LOGICA DE ACCES ȘI CONTORIZARE BARIERĂ
    // =========================================================================
    if ($eventType === 'ENTRY') {
        if ($data['occupiedSpots'] < $data['maxCapacity']) {
            $data['occupiedSpots']++;
            $data['stats']['entriesToday']++;
            $data['barrierState'] = "OPEN";

            array_unshift($data['sessions'], [
                "id" => uniqid(),
                "plate" => $detectedPlate,
                "photoUrl" => $historyImg,
                "accessType" => $isAuthorized ? "Autorizat Whitelist" : ($isStandardRomanian ? "Vizitator (RO Valid)" : "Neverificat"),
                "entryTime" => date("d.m.Y, H:i:s"),
                "entryTs" => time(),
                "exitTime" => "—",
                "duration" => "În parcare",
                "status" => "În Parcare"
            ]);
        } else {
            $eventType = "REJECTED";
            $data['stats']['rejectedToday']++;
        }
    } elseif ($eventType === 'EXIT') {
        if ($data['occupiedSpots'] > 0) {
            $data['occupiedSpots']--;
        }
        $data['stats']['exitsToday']++;
        $data['barrierState'] = "OPEN";

        // 1) Cautam sesiunea deschisa cu ACELASI numar ca cel citit la iesire.
        $exitIdx = null;
        if ($detectedPlate !== "NECUNOSCUT") {
            foreach ($data['sessions'] as $i => $sess) {
                if ($sess['status'] === "În Parcare" && normalizePlate($sess['plate']) === normalizePlate($detectedPlate)) {
                    $exitIdx = $i;
                    break;
                }
            }
        }

        // 2) Daca numarul nu a fost citit sau nu are sesiune deschisa, inchidem cea mai VECHE
        //    sesiune deschisa (sesiunile noi sunt adaugate la inceput, deci cautam de la final),
        //    ca numarul de locuri ocupate sa ramana sincronizat cu lista. Sesiunea e marcata.
        $exitMatched = $exitIdx !== null;
        if (!$exitMatched) {
            for ($i = count($data['sessions']) - 1; $i >= 0; $i--) {
                if ($data['sessions'][$i]['status'] === "În Parcare") {
                    $exitIdx = $i;
                    break;
                }
            }
        }

        if ($exitIdx !== null) {
            $sess = &$data['sessions'][$exitIdx];
            $sess['exitTime'] = date("d.m.Y, H:i:s");
            $sess['status'] = "Ieșit";
            $sess['duration'] = isset($sess['entryTs']) ? formatDuration(time() - $sess['entryTs']) : "—";
            if (!$exitMatched) {
                $sess['exitNote'] = "Ieșire fără potrivire număr (citit: " . $detectedPlate . ")";
            }
            // Daca OCR-ul nu a citit nimic la iesire, afisam numarul sesiunii inchise
            if ($detectedPlate === "NECUNOSCUT") {
                $detectedPlate = $sess['plate'];
            }
            unset($sess);
        }
    }

    $data['lastCapture'] = [
        "imageUrl" => "/uploads/last_capture.jpg?t=" . time(),
        "plate" => $detectedPlate,
        "eventType" => $eventType,
        // ISO 8601 (ex: 2026-11-07T20:31:35+02:00). Formatul "d.m.Y" era citit de browser ca LUNA.ZI
        "timestamp" => date("c"),
        "confidence" => $confidence,
        "standardRo" => $isStandardRomanian
    ];

    file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT));

    echo json_encode([
        "allow" => ($eventType !== "REJECTED"),
        "plate" => $detectedPlate,
        "standardRo" => $isStandardRomanian,
        "freeSpots" => $data['maxCapacity'] - $data['occupiedSpots']
    ]);
    exit;
}

// 3. RUTA ACTIONARE BARIERA DIN WEB
if ($route === 'barrier' && $method === 'POST') {
    $data['barrierState'] = ($data['barrierState'] === 'OPEN') ? 'CLOSED' : 'OPEN';
    file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT));
    echo json_encode(["success" => true, "barrierState" => $data['barrierState']]);
    exit;
}

echo json_encode(["status" => "API Smart Parking Activ (OCR Extern)"]);