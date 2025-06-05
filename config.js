// Configuration file for Pond Monitoring Dashboard
// Replace these values with your actual Firebase configuration

const CONFIG = {
    // Firebase Configuration
    firebase: {
        // Replace with your Firebase Realtime Database URL
        databaseURL: 'https://pond-monitor-d9ca9-default-rtdb.firebaseio.com',
        
        // API endpoints
        endpoints: {
            sensors: '/sensors.json',
            history: '/history.json',
            alerts: '/alerts.json'
        }
    },
    
    // System Configuration
    system: {
        // Update intervals (in milliseconds)
        updateInterval: 30000,      // 30 seconds - main data refresh
        chartUpdateInterval: 60000, // 1 minute - chart data refresh
        healthCheckInterval: 10000, // 10 seconds - connection status
        
        // Retry settings
        maxRetries: 3,
        retryDelay: 5000,
        
        // Data retention
        maxDataPoints: 1440,        // 24 hours of minute-by-minute data
        chartDataPoints: 24         // Points to show on chart
    },
    
    // Sensor Thresholds
    thresholds: {
        temperature: {
            min: 0,                 // Minimum safe temperature (°C)
            max: 50,                // Maximum safe temperature (°C)
            optimal: {
                min: 18,            // Optimal range minimum (°C)
                max: 25             // Optimal range maximum (°C)
            }
        },
        waterLevel: {
            low: 70,                // Low water level threshold (cm)
            normal: 30,             // Normal water level threshold (cm)
            high: 10,               // High water level threshold (cm)
            critical: 5             // Critical water level threshold (cm)
        }
    },
    
    // Alert Configuration
    alerts: {
        enabled: true,
        types: {
            temperatureHigh: {
                enabled: true,
                threshold: 35,       // °C
                message: 'Temperature is too high!'
            },
            temperatureLow: {
                enabled: true,
                threshold: 5,        // °C
                message: 'Temperature is too low!'
            },
            waterLevelLow: {
                enabled: true,
                threshold: 80,       // cm
                message: 'Water level is critically low!'
            },
            waterLevelHigh: {
                enabled: true,
                threshold: 15,       // cm
                message: 'Water level is too high!'
            },
            sensorOffline: {
                enabled: true,
                timeout: 300000,     // 5 minutes
                message: 'Sensor appears to be offline!'
            }
        }
    },
    
    // UI Configuration
    ui: {
        theme: 'auto',              // 'light', 'dark', or 'auto'
        animations: true,
        showAdvancedMetrics: false,
        defaultTimeRange: '24h',    // '1h', '24h', '7d', '30d'
        
        // Chart colors
        colors: {
            temperature: '#ef4444',
            waterLevel: '#06b6d4',
            background: '#f8fafc',
            success: '#10b981',
            warning: '#f59e0b',
            danger: '#ef4444'
        }
    },
    
    // Device Information
    device: {
        name: 'Pond Monitor Pro',
        version: '3.0.0',
        location: 'Main Pond - Garden',
        timezone: 'UTC',
        
        // Sensor specifications
        sensors: {
            temperature: {
                model: 'DS18B20',
                accuracy: '±0.5°C',
                range: '-55°C to +125°C'
            },
            waterLevel: {
                model: 'HC-SR04',
                accuracy: '±3mm',
                range: '2cm to 400cm'
            }
        }
    },
    
    // Data Processing
    dataProcessing: {
        smoothing: {
            enabled: true,
            windowSize: 5           // Number of readings to average
        },
        validation: {
            enabled: true,
            temperatureRange: [-10, 60],    // Valid temperature range (°C)
            waterLevelRange: [0, 500]       // Valid water level range (cm)
        }
    },
    
    // Advanced Features
    features: {
        predictiveAnalytics: false,
        weatherIntegration: false,
        emailNotifications: false,
        dataExport: true,
        remoteControl: false
    },
    
    // API Configuration for external services
    external: {
        weather: {
            enabled: false,
            apiKey: '',             // OpenWeatherMap API key
            updateInterval: 1800000 // 30 minutes
        },
        notifications: {
            email: {
                enabled: false,
                service: 'gmail',   // or 'smtp'
                from: '',
                to: []
            },
            webhook: {
                enabled: false,
                url: '',
                secret: ''
            }
        }
    }
};

// Validation function
function validateConfig() {
    const errors = [];
    
    // Check Firebase URL
    if (!CONFIG.firebase.databaseURL || CONFIG.firebase.databaseURL.includes('YOUR-PROJECT-ID')) {
        errors.push('Firebase database URL not configured');
    }
    
    // Check thresholds
    if (CONFIG.thresholds.temperature.min >= CONFIG.thresholds.temperature.max) {
        errors.push('Invalid temperature thresholds');
    }
    
    if (CONFIG.thresholds.waterLevel.high >= CONFIG.thresholds.waterLevel.low) {
        errors.push('Invalid water level thresholds');
    }
    
    // Check update intervals
    if (CONFIG.system.updateInterval < 1000) {
        errors.push('Update interval too short (minimum 1 second)');
    }
    
    return errors;
}

// Environment detection
const ENVIRONMENT = {
    isDevelopment: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    isProduction: window.location.protocol === 'https:',
    isMobile: window.innerWidth <= 768,
    hasTouch: 'ontouchstart' in window,
    supportsWebGL: !!window.WebGLRenderingContext,
    supportsLocalStorage: typeof(Storage) !== 'undefined'
};

// Feature detection and polyfills
const CAPABILITIES = {
    fetch: typeof fetch !== 'undefined',
    websockets: typeof WebSocket !== 'undefined',
    notifications: 'Notification' in window,
    geolocation: 'geolocation' in navigator,
    battery: 'getBattery' in navigator,
    online: 'onLine' in navigator
};

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, ENVIRONMENT, CAPABILITIES, validateConfig };
} else {
    window.CONFIG = CONFIG;
    window.ENVIRONMENT = ENVIRONMENT;
    window.CAPABILITIES = CAPABILITIES;
    window.validateConfig = validateConfig;
}

// Development mode warnings
if (ENVIRONMENT.isDevelopment) {
    console.group('🔧 Pond Monitor Configuration');
    console.log('Environment:', ENVIRONMENT);
    console.log('Capabilities:', CAPABILITIES);
    
    const configErrors = validateConfig();
    if (configErrors.length > 0) {
        console.warn('Configuration errors:', configErrors);
    } else {
        console.log('✅ Configuration validated successfully');
    }
    console.groupEnd();
}