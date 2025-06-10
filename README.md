# Pond Monitor Pro

A complete IoT pond monitoring system, built with ESP32, Firebase, and modern web technologies. Provides real-time monitoring of water temperature, level, and GPS location with a professional dashboard interface.

🌐 **Live Demo**: https://dashing-sunshine-e07839.netlify.app/

## Features

- **Multi-sensor monitoring**: Temperature (DS18B20), water level (HC-SR04), GPS location (NEO-8M)
- **Real-time dashboard**: Professional web interface with live updates
- **Cloud synchronization**: Firebase Realtime Database integration
- **Mobile responsive**: Works seamlessly on phones, tablets, and desktops
- **Data persistence**: Cached readings survive page refreshes
- **GPS timing**: Precise UTC time synchronization

## Hardware Requirements

- ESP32 development board
- DS18B20 waterproof temperature sensor
- HC-SR04 ultrasonic distance sensor
- NEO-8M GPS module
- 4.7kΩ resistor (for DS18B20)

## Wiring Diagram

```
ESP32 Connections:
├── DS18B20 Temperature Sensor
│   ├── VCC → 3.3V
│   ├── GND → GND
│   └── Data → GPIO 5 (with 4.7kΩ pullup to 3.3V)
├── HC-SR04 Ultrasonic Sensor
│   ├── VCC → 5V
│   ├── GND → GND
│   ├── Trig → GPIO 2
│   └── Echo → GPIO 4
└── NEO-8M GPS Module
    ├── VCC → 3.3V
    ├── GND → GND
    ├── TX → GPIO 16 (Serial2 RX)
    └── RX → GPIO 17 (Serial2 TX)
```

## Installation

### 1. Arduino IDE Setup

Install required libraries through Library Manager:
- `DallasTemperature`
- `OneWire`
- `ESPAsyncWebServer`
- `ArduinoJson`
- `TinyGPSPlus`

### 2. Firebase Configuration

1. Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Realtime Database in test mode
3. Copy your database URL (format: `https://project-id-default-rtdb.firebaseio.com`)

### 3. ESP32 Configuration

Update the following in the ESP32 code:
```cpp
// Network credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Firebase configuration
const char* FIREBASE_HOST = "https://your-project-id-default-rtdb.firebaseio.com";
```

### 4. Web Dashboard Setup

Update `config.js` with your Firebase URL:
```javascript
firebase: {
    databaseURL: 'https://your-project-id-default-rtdb.firebaseio.com',
}
```

## Usage

1. Upload the ESP32 code to your board
2. Open Serial Monitor (115200 baud) to view system status
3. Note the local IP address displayed
4. Access the local dashboard at `http://ESP32_IP_ADDRESS`
5. Deploy the web dashboard files to your hosting platform

## System Architecture

```
Sensors → ESP32 → Firebase → Web Dashboard
   ↓         ↓        ↓           ↓
Readings  Processing Cloud     User Interface
```

The system reads sensor data every 5 seconds, processes it on the ESP32, uploads to Firebase, and displays real-time updates on the web dashboard.

## Dashboard Features

### Main View
- **Water Quality Index**: Calculated from temperature and level readings
- **Environmental Metrics**: Temperature, water level, GPS coordinates, UTC time
- **System Health**: Individual sensor status monitoring

### Monitoring Cards
- **Temperature Trends**: 24-hour historical charts
- **Water Level**: Visual tank display with distance readings
- **GPS Location**: Real-time coordinates and satellite time
- **Alert System**: Configurable notifications and thresholds

## Configuration

### Water Level Thresholds
```cpp
const uint8_t LOW_WATER_THRESHOLD = 30;      // cm
const uint8_t NORMAL_WATER_THRESHOLD = 70;   // cm
```

### Update Intervals
```cpp
const unsigned long SENSOR_INTERVAL = 5000;    // 5 seconds
const unsigned long FIREBASE_INTERVAL = 5000;  // 5 seconds
```

## API Endpoints

The ESP32 provides RESTful endpoints for data access:

- `GET /api/data` - Complete sensor data (JSON)
- `GET /api/temperature/celsius` - Temperature in Celsius
- `GET /api/temperature/fahrenheit` - Temperature in Fahrenheit
- `GET /api/water/distance` - Water distance in cm
- `GET /api/water/status` - Water level status
- `GET /api/gps/latitude` - GPS latitude
- `GET /api/gps/longitude` - GPS longitude
- `GET /api/gps/time` - GPS UTC time

## Troubleshooting

### Common Issues

**Temperature sensor reading -127°C**
- Check wiring connections
- Verify 4.7kΩ pullup resistor is connected
- Ensure sensor is properly powered

**Water level showing "Sensor Offline"**
- Verify HC-SR04 connections
- Check that sensor has clear line of sight to water surface
- Ensure adequate power supply (5V for HC-SR04)

**GPS showing "No Fix"**
- Position GPS module with clear sky view
- Allow 2-3 minutes for initial GPS lock
- Check antenna connection if using external antenna

**Firebase connection errors**
- Verify WiFi credentials
- Check Firebase URL format
- Ensure Firebase database rules allow read/write access

## Contributing

Feel free to submit issues, fork the repository, and create pull requests. Contributions are welcome!

## License

This project is open source and available under the MIT License.
