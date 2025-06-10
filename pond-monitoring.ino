#ifdef ESP32
  #include <WiFi.h>
  #include <ESPAsyncWebServer.h>
  #include <HTTPClient.h>
#else
  #include <Arduino.h>
  #include <ESP8266WiFi.h>
  #include <Hash.h>
  #include <ESPAsyncTCP.h>
  #include <ESPAsyncWebServer.h>
  #include <ESP8266HTTPClient.h>
#endif
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// OLED Display Configuration
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

const char* FIREBASE_HOST = "https://pond-monitor-d9ca9-default-rtdb.firebaseio.com";
const char* FIREBASE_PATH = "/sensors.json";

const char* ssid = "pond";
const char* password = "123456789";

#define ONE_WIRE_BUS 5
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);


const uint8_t TRIG_PIN = 2;
const uint8_t ECHO_PIN = 4;

// GPS configuration
TinyGPSPlus gps;

// System Configuration
const uint8_t LOW_WATER_THRESHOLD = 30;      // cm
const uint8_t NORMAL_WATER_THRESHOLD = 70;   // cm
const uint16_t MAX_DISTANCE = 400;           // cm

// Display states
enum DisplayState {
  DISPLAY_IP,
  DISPLAY_TEMP,
  DISPLAY_WATER,
  DISPLAY_GPS
};

DisplayState currentDisplay = DISPLAY_IP;

// Sensor data variables
struct SensorData {
  String temperatureC = "--";
  String temperatureF = "--";
  String waterDistance = "--";
  String waterStatus = "Sensor Offline";
  double latitude = 0.0;
  double longitude = 0.0;
  String gpsTime = "--:--:--";
  bool gpsValid = false;
} sensorData;

// Timer variables
unsigned long lastSensorUpdate = 0;
unsigned long lastGPSDisplay = 0;
unsigned long lastFirebaseUpdate = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long ipDisplayStartTime = 0;
const unsigned long SENSOR_INTERVAL = 5000;   
const unsigned long GPS_DISPLAY_INTERVAL = 3000; 
const unsigned long FIREBASE_INTERVAL = 5000; 
const unsigned long DISPLAY_INTERVAL = 3000;  
const unsigned long IP_DISPLAY_DURATION = 10000; 

// Create AsyncWebServer object
AsyncWebServer server(80);

// Function prototypes
String readTemperatureC();
String readTemperatureF();
String readWaterLevel();
String getWaterStatus(uint16_t distance_cm);
uint16_t measureDistance();
void updateGPSData();
void sendToFirebase();
void displaySensorInfo();
void setupWebServer();
String generateHTML();
void updateOLEDDisplay();
void displayIPAddress();
void displayTemperature();
void displayWaterLevel();
void displayGPS();

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600); // GPS module
  
  // Initialize I2C for OLED (SDA=21, SCL=22 on ESP32)
  Wire.begin(21, 22);
  
  // Initialize OLED display
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
  } else {
    Serial.println(F("OLED Display initialized"));
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println(F("Pond Monitor v4.0"));
    display.println(F("Starting..."));
    display.display();
  }
  
  Serial.println();
  Serial.println(F("Pond Monitoring System v4.0"));
  Serial.println(F("Temperature + Water Level + GPS + Firebase + OLED"));
  Serial.println();
  
  // Initialize sensors
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  sensors.begin();

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  // Show connecting status on OLED
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println(F("Connecting to WiFi"));
  display.print(F("SSID: "));
  display.println(ssid);
  display.display();
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    display.print(".");
    display.display();
  }
  Serial.println();
  
  Serial.print("Web server: http://");
  Serial.println(WiFi.localIP());
  Serial.print("Firebase: ");
  Serial.println(FIREBASE_HOST);
  Serial.println();

  // Record when we start displaying IP
  ipDisplayStartTime = millis();
  currentDisplay = DISPLAY_IP;
  displayIPAddress();

  // Initial sensor readings
  sensorData.temperatureC = readTemperatureC();
  sensorData.temperatureF = readTemperatureF();
  sensorData.waterDistance = readWaterLevel();
  
  uint16_t dist = sensorData.waterDistance.toInt();
  sensorData.waterStatus = getWaterStatus(dist);

  // Setup web server routes
  setupWebServer();
  server.begin();
  
  Serial.println("System initialized!");
  Serial.println("Starting data collection...");
  Serial.println();
  
  // Send initial data
  sendToFirebase();
  delay(3000); // Allow GPS to initialize
}

void loop() {
  // Update GPS data continuously
  updateGPSData();
  
  // Update sensors every 5 seconds
  if (millis() - lastSensorUpdate >= SENSOR_INTERVAL) {
    // Read all sensors
    sensorData.temperatureC = readTemperatureC();
    sensorData.temperatureF = readTemperatureF();
    sensorData.waterDistance = readWaterLevel();
    
    uint16_t dist = sensorData.waterDistance.toInt();
    sensorData.waterStatus = getWaterStatus(dist);
    
    displaySensorInfo();
    sendToFirebase();
    
    lastSensorUpdate = millis();
  }
  
  // Update OLED display
  updateOLEDDisplay();
}

void updateOLEDDisplay() {
  // Check if we're still showing IP address
  if (currentDisplay == DISPLAY_IP) {
    if (millis() - ipDisplayStartTime >= IP_DISPLAY_DURATION) {
      currentDisplay = DISPLAY_TEMP;
      lastDisplayUpdate = millis();
    }
    return; // Don't cycle while showing IP
  }
  
  // Cycle through displays every DISPLAY_INTERVAL
  if (millis() - lastDisplayUpdate >= DISPLAY_INTERVAL) {
    switch (currentDisplay) {
      case DISPLAY_TEMP:
        displayTemperature();
        currentDisplay = DISPLAY_WATER;
        break;
      case DISPLAY_WATER:
        displayWaterLevel();
        currentDisplay = DISPLAY_GPS;
        break;
      case DISPLAY_GPS:
        displayGPS();
        currentDisplay = DISPLAY_TEMP;
        break;
      default:
        currentDisplay = DISPLAY_TEMP;
        break;
    }
    lastDisplayUpdate = millis();
  }
}

void displayIPAddress() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F("=== CONNECTED ==="));
  display.println();
  
  display.setTextSize(1);
  display.print(F("SSID: "));
  display.println(ssid);
  display.println();
  
  // display.print(F("IP Address:"));
  display.setTextSize(1);
  display.setCursor(0, 35);
  display.println(WiFi.localIP());
  
  display.setTextSize(1);
  display.setCursor(0, 56);
  display.print(F("Starting in "));
  display.print((IP_DISPLAY_DURATION - (millis() - ipDisplayStartTime)) / 1000);
  display.print(F("s"));
  
  display.display();
}

void displayTemperature() {
  display.clearDisplay();
  
  // Title
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F("== TEMPERATURE =="));
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  // Temperature in Celsius
  display.setCursor(0, 20);
  display.setTextSize(2);
  display.print(sensorData.temperatureC);
  display.setTextSize(1);
  display.print(F(" C"));
  
  // Temperature in Fahrenheit
  display.setCursor(0, 40);
  display.setTextSize(2);
  display.print(sensorData.temperatureF);
  display.setTextSize(1);
  display.print(F(" F"));
  
  // Add degree symbols
  display.drawCircle(display.getCursorX() - 18, 22, 2, SSD1306_WHITE);
  display.drawCircle(display.getCursorX() - 18, 42, 2, SSD1306_WHITE);
  
  display.display();
}

void displayWaterLevel() {
  display.clearDisplay();
  
  // Title
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F("== WATER LEVEL =="));
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  // Distance
  display.setCursor(0, 20);
  display.print(F("Distance: "));
  display.setTextSize(2);
  display.print(sensorData.waterDistance);
  display.setTextSize(1);
  display.println(F(" cm"));
  
  // Status
  display.setCursor(0, 45);
  display.print(F("Status: "));
  display.setTextSize(1);
  
  // Adjust text size based on status length
  if (sensorData.waterStatus.length() > 10) {
    display.setTextSize(1);
  } else {
    display.setTextSize(2);
  }
  display.print(sensorData.waterStatus);
  
  display.display();
}

void displayGPS() {
  display.clearDisplay();
  
  // Title
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F("=== GPS DATA ==="));
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  if (sensorData.gpsValid) {
    // Latitude
    display.setCursor(0, 15);
    display.print(F("Lat: "));
    display.println(sensorData.latitude, 6);
    
    // Longitude
    display.setCursor(0, 28);
    display.print(F("Lng: "));
    display.println(sensorData.longitude, 6);
    
    // Time
    display.setCursor(0, 45);
    display.print(F("Time: "));
    display.setTextSize(1);
    display.print(sensorData.gpsTime);
    display.print(F(" UTC"));
  } else {
    display.setCursor(20, 25);
    display.setTextSize(2);
    display.println(F("NO FIX"));
    display.setTextSize(1);
    display.setCursor(15, 45);
    display.println(F("Waiting for GPS..."));
  }
  
  display.display();
}

String readTemperatureC() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);
  
  if (tempC == -127.00 || tempC == 85.00) {
    Serial.println("Temperature sensor error");
    return "--";
  }
  
  Serial.printf("Temperature: %.2f°C\n", tempC);
  return String(tempC, 2);
}

String readTemperatureF() {
  sensors.requestTemperatures();
  float tempF = sensors.getTempFByIndex(0);
  
  if (int(tempF) == -196 || tempF == 185.00) {
    return "--";
  }
  
  return String(tempF, 2);
}

uint16_t measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  uint32_t duration = pulseIn(ECHO_PIN, HIGH, 30000);
  
  if (duration == 0) return 0;
  return duration * 0.0343 / 2;
}

String readWaterLevel() {
  uint16_t distance_cm = measureDistance();
  
  if (distance_cm > 0 && distance_cm < MAX_DISTANCE) {
    Serial.printf("Water distance: %d cm\n", distance_cm);
    return String(distance_cm);
  }
  
  Serial.println("Ultrasonic sensor offline");
  return "--";
}

String getWaterStatus(uint16_t distance_cm) {
  if (distance_cm == 0 || distance_cm >= MAX_DISTANCE) {
    return "Sensor Offline";
  } else if (distance_cm < LOW_WATER_THRESHOLD) {
    return "HIGH LEVEL";
  } else if (distance_cm >= LOW_WATER_THRESHOLD && distance_cm <= NORMAL_WATER_THRESHOLD) {
    return "NORMAL";
  } else {
    return "LOW LEVEL";
  }
}

void updateGPSData() {
  bool newData = false;
  
  while (Serial2.available() > 0) {
    if (gps.encode(Serial2.read())) {
      newData = true;
    }
  }
  
  if (newData && (millis() - lastGPSDisplay >= GPS_DISPLAY_INTERVAL)) {
    if (gps.location.isValid() && gps.time.isValid()) {
      sensorData.latitude = gps.location.lat();
      sensorData.longitude = gps.location.lng();
      sensorData.gpsValid = true;
      
      // Format GPS time
      char timeBuffer[10];
      sprintf(timeBuffer, "%02d:%02d:%02d", 
              gps.time.hour(), 
              gps.time.minute(), 
              gps.time.second());
      sensorData.gpsTime = String(timeBuffer);
      
      Serial.printf("GPS: %.6f, %.6f | Time: %s\n", 
                   sensorData.latitude, 
                   sensorData.longitude, 
                   sensorData.gpsTime.c_str());
    } else {
      sensorData.gpsValid = false;
      Serial.println("Waiting for GPS fix...");
    }
    
    lastGPSDisplay = millis();
  }
  
  // GPS detection check
  if (millis() > 15000 && gps.charsProcessed() < 10) {
    Serial.println("No GPS detected - check wiring");
    sensorData.gpsValid = false;
  }
}

void sendToFirebase() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(String(FIREBASE_HOST) + FIREBASE_PATH);
  http.addHeader("Content-Type", "application/json");
  
  // Create comprehensive JSON payload
  StaticJsonDocument<400> doc;
  
  // Temperature data
  JsonObject temperature = doc.createNestedObject("temperature");
  temperature["celsius"] = sensorData.temperatureC;
  temperature["fahrenheit"] = sensorData.temperatureF;
  
  // Water level data
  JsonObject waterLevel = doc.createNestedObject("waterLevel");
  waterLevel["distance"] = sensorData.waterDistance;
  waterLevel["status"] = sensorData.waterStatus;
  
  // GPS data
  JsonObject location = doc.createNestedObject("location");
  if (sensorData.gpsValid) {
    location["latitude"] = sensorData.latitude;
    location["longitude"] = sensorData.longitude;
    location["time"] = sensorData.gpsTime;
    location["valid"] = true;
  } else {
    location["latitude"] = 0.0;
    location["longitude"] = 0.0;
    location["time"] = "--:--:--";
    location["valid"] = false;
  }
  
  // Device info
  doc["deviceId"] = "pond-monitor-001";
  doc["location_name"] = "Main Pond";
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Sending to Firebase:");
  Serial.println(jsonString);
  
  int httpResponseCode = http.PUT(jsonString);
  
  if (httpResponseCode == 200) {
    Serial.println("Firebase sync successful");
  } else {
    Serial.printf("Firebase error: %d\n", httpResponseCode);
  }
  
  http.end();
}

void displaySensorInfo() {
  Serial.println("=== Sensor Status ===");
  Serial.printf("Temp: %s°C / %s°F\n", 
               sensorData.temperatureC.c_str(), 
               sensorData.temperatureF.c_str());
  Serial.printf("Water: %s cm (%s)\n", 
               sensorData.waterDistance.c_str(), 
               sensorData.waterStatus.c_str());
  
  if (sensorData.gpsValid) {
    Serial.printf("GPS: %.6f, %.6f\n", 
                 sensorData.latitude, 
                 sensorData.longitude);
    Serial.printf("Time: %s UTC\n", sensorData.gpsTime.c_str());
  } else {
    Serial.println("GPS: No fix");
  }
  
  Serial.println("========================\n");
}

void setupWebServer() {
  // Main page
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    String html = generateHTML();
    request->send(200, "text/html", html);
  });
  
  // API endpoints
  server.on("/api/temperature/celsius", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/plain", sensorData.temperatureC);
  });
  
  server.on("/api/temperature/fahrenheit", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/plain", sensorData.temperatureF);
  });
  
  server.on("/api/water/distance", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/plain", sensorData.waterDistance);
  });
  
  server.on("/api/water/status", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/plain", sensorData.waterStatus);
  });
  
  server.on("/api/gps/latitude", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/plain", sensorData.gpsValid ? String(sensorData.latitude, 6) : "--");
  });
  
  server.on("/api/gps/longitude", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/plain", sensorData.gpsValid ? String(sensorData.longitude, 6) : "--");
  });
  
  server.on("/api/gps/time", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/plain", sensorData.gpsTime);
  });
  
  // Full data JSON endpoint
  server.on("/api/data", HTTP_GET, [](AsyncWebServerRequest *request){
    StaticJsonDocument<300> doc;
    
    doc["temperature"]["celsius"] = sensorData.temperatureC;
    doc["temperature"]["fahrenheit"] = sensorData.temperatureF;
    doc["waterLevel"]["distance"] = sensorData.waterDistance;
    doc["waterLevel"]["status"] = sensorData.waterStatus;
    doc["location"]["latitude"] = sensorData.gpsValid ? sensorData.latitude : 0.0;
    doc["location"]["longitude"] = sensorData.gpsValid ? sensorData.longitude : 0.0;
    doc["location"]["time"] = sensorData.gpsTime;
    doc["location"]["valid"] = sensorData.gpsValid;
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    request->send(200, "application/json", jsonString);
  });
}

String generateHTML() {
  String html = R"rawliteral(
<!DOCTYPE HTML>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pond Monitoring</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 30px;
    }
    .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
    .header p { font-size: 1.1rem; opacity: 0.9; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .card {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 15px;
      padding: 25px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: transform 0.3s ease;
    }
    .card:hover { transform: translateY(-5px); }
    .card-header {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      font-size: 1.2rem;
      font-weight: 600;
      color: #2c3e50;
    }
    .card-header i {
      margin-right: 10px;
      font-size: 1.4rem;
    }
    .temp-icon { color: #e74c3c; }
    .water-icon { color: #3498db; }
    .gps-icon { color: #2ecc71; }
    .metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 0;
      border-bottom: 1px solid #ecf0f1;
    }
    .metric:last-child { border-bottom: none; }
    .metric-label {
      font-weight: 500;
      color: #34495e;
    }
    .metric-value {
      font-size: 1.4rem;
      font-weight: 700;
      color: #2c3e50;
    }
    .status-normal { color: #27ae60; }
    .status-warning { color: #f39c12; }
    .status-critical { color: #e74c3c; }
    .status-offline { color: #95a5a6; }
    .update-info {
      text-align: center;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 10px;
      padding: 15px;
      margin-top: 20px;
    }
    .pro-link {
      display: inline-block;
      background: #2c3e50;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 10px;
      transition: background 0.3s ease;
    }
    .pro-link:hover { background: #34495e; }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
      .header h1 { font-size: 2rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><i class="fas fa-water"></i> Pond Monitor Pro</h1>
      <p>Complete Environmental Monitoring System</p>
    </div>
    
    <div class="grid">
      <!-- Temperature Card -->
      <div class="card">
        <div class="card-header">
          <i class="fas fa-thermometer-half temp-icon"></i>
          Temperature Monitoring
        </div>
        <div class="metric">
          <span class="metric-label">Celsius</span>
          <span class="metric-value" id="tempC">)rawliteral" + sensorData.temperatureC + R"rawliteral(°C</span>
        </div>
        <div class="metric">
          <span class="metric-label">Fahrenheit</span>
          <span class="metric-value" id="tempF">)rawliteral" + sensorData.temperatureF + R"rawliteral(°F</span>
        </div>
      </div>
      
      <!-- Water Level Card -->
      <div class="card">
        <div class="card-header">
          <i class="fas fa-water water-icon"></i>
          Water Level Monitoring
        </div>
        <div class="metric">
          <span class="metric-label">Distance to Surface</span>
          <span class="metric-value" id="waterDist">)rawliteral" + sensorData.waterDistance + R"rawliteral( cm</span>
        </div>
        <div class="metric">
          <span class="metric-label">Status</span>
          <span class="metric-value status-normal" id="waterStatus">)rawliteral" + sensorData.waterStatus + R"rawliteral(</span>
        </div>
      </div>
      
      <!-- GPS Card -->
      <div class="card">
        <div class="card-header">
          <i class="fas fa-map-marker-alt gps-icon"></i>
          GPS Location & Time
        </div>
        <div class="metric">
          <span class="metric-label">Latitude</span>
          <span class="metric-value" id="gpsLat">)rawliteral" + (sensorData.gpsValid ? String(sensorData.latitude, 6) : "--") + R"rawliteral(</span>
        </div>
        <div class="metric">
          <span class="metric-label">Longitude</span>
          <span class="metric-value" id="gpsLng">)rawliteral" + (sensorData.gpsValid ? String(sensorData.longitude, 6) : "--") + R"rawliteral(</span>
        </div>
        <div class="metric">
          <span class="metric-label">GPS Time (UTC)</span>
          <span class="metric-value" id="gpsTime">)rawliteral" + sensorData.gpsTime + R"rawliteral(</span>
        </div>
      </div>
    </div>
    
    <div class="update-info">
      <p><strong>System Status:</strong> All sensors monitoring every 5 seconds</p>
      <p><strong>Firebase Sync:</strong> Real-time data streaming</p>
      <a href="/api/data" class="pro-link">
        <i class="fas fa-download"></i> View JSON Data
      </a>
    </div>
  </div>

  <script>
    // Auto-refresh data every 10 seconds
    setInterval(function() {
      fetch('/api/data')
        .then(response => response.json())
        .then(data => {
          document.getElementById('tempC').textContent = data.temperature.celsius + '°C';
          document.getElementById('tempF').textContent = data.temperature.fahrenheit + '°F';
          document.getElementById('waterDist').textContent = data.waterLevel.distance + ' cm';
          document.getElementById('waterStatus').textContent = data.waterLevel.status;
          
          if (data.location.valid) {
            document.getElementById('gpsLat').textContent = data.location.latitude.toFixed(6);
            document.getElementById('gpsLng').textContent = data.location.longitude.toFixed(6);
            document.getElementById('gpsTime').textContent = data.location.time;
          } else {
            document.getElementById('gpsLat').textContent = '--';
            document.getElementById('gpsLng').textContent = '--';
            document.getElementById('gpsTime').textContent = '--:--:--';
          }
          
          // Update water status color
          const statusElement = document.getElementById('waterStatus');
          statusElement.className = 'metric-value';
          if (data.waterLevel.status === 'NORMAL') {
            statusElement.classList.add('status-normal');
          } else if (data.waterLevel.status === 'LOW LEVEL') {
            statusElement.classList.add('status-warning');
          } else if (data.waterLevel.status === 'HIGH LEVEL') {
            statusElement.classList.add('status-critical');
          } else {
            statusElement.classList.add('status-offline');
          }
        })
        .catch(error => console.log('Update error:', error));
    }, 10000);
  </script>
</body>
</html>
)rawliteral";
  
  return html;
}
