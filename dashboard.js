class PondMonitorDashboard {
    constructor() {
        this.isInitialized = false;
        this.connectionStatus = 'disconnected';
        this.lastDataUpdate = null;
        this.retryCount = 0;
        this.updateTimer = null;
        this.healthCheckTimer = null;
        
        // Data storage
        this.sensorData = {
            temperature: { celsius: null, fahrenheit: null },
            waterLevel: { distance: null, status: 'Sensor Offline' },
            location: { latitude: null, longitude: null, time: null, valid: false },
            timestamp: null,
            deviceId: null
        };
        
        this.historicalData = {
            temperature: [],
            waterLevel: [],
            timestamps: []
        };
        
        // Chart instance
        this.chart = null;
        
        // System status
        this.systemStatus = {
            esp32: 'unknown',
            temperatureSensor: 'unknown',
            ultrasonicSensor: 'unknown',
            gpsModule: 'unknown',
            wifi: 'unknown',
            firebase: 'unknown'
        };
        
        this.init();
    }
    
    async init() {
        try {
            console.log('Initializing Professional Pond Monitor Dashboard...');
            
            // Validate configuration
            if (typeof CONFIG !== 'undefined') {
                const configErrors = validateConfig();
                if (configErrors.length > 0) {
                    console.warn('Configuration warnings:', configErrors);
                }
            } else {
                console.warn('CONFIG not found - using defaults');
            }
            
            // Initialize UI components
            this.initializeUI();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Initialize chart if element exists
            if (document.getElementById('temperatureChart')) {
                this.initializeChart();
            }
            
            // Start data fetching
            await this.startDataFetching();
            
            this.isInitialized = true;
            console.log('Professional Dashboard initialized successfully');
            
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.showError('Failed to initialize dashboard: ' + error.message);
        }
    }
    
    initializeUI() {
        // Update current time
        this.updateTime();
        
        // Initialize connection status
        this.updateConnectionStatus('connecting');
        
        // Set up responsive behavior
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());
        
        // Set up keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Initialize all displays to show offline state
        this.showOfflineState();
    }
    
    setupEventListeners() {
        // Time range buttons
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChartPeriod(e.target.dataset.range || '24h');
            });
        });
        
        // Toggle switches for alert settings
        document.querySelectorAll('.toggle-switch').forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
            });
        });
        
        // Online/offline detection
        window.addEventListener('online', () => this.handleOnlineStatus(true));
        window.addEventListener('offline', () => this.handleOnlineStatus(false));
        
        // Visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseUpdates();
            } else {
                this.resumeUpdates();
            }
        });
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'r':
                        e.preventDefault();
                        this.refreshData();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.toggleDarkMode();
                        break;
                }
            }
        });
    }
    
    async startDataFetching() {
        try {
            // Initial data fetch
            await this.fetchData();
            
            // Set up regular updates
            const updateInterval = (typeof CONFIG !== 'undefined' && CONFIG.system?.updateInterval) ? 
                CONFIG.system.updateInterval : 30000; // Default 30 seconds
                
            this.updateTimer = setInterval(() => {
                this.fetchData();
            }, updateInterval);
            
            // Set up health checks
            const healthInterval = (typeof CONFIG !== 'undefined' && CONFIG.system?.healthCheckInterval) ? 
                CONFIG.system.healthCheckInterval : 10000; // Default 10 seconds
                
            this.healthCheckTimer = setInterval(() => {
                this.performHealthCheck();
            }, healthInterval);
            
        } catch (error) {
            console.error('Failed to start data fetching:', error);
            this.scheduleRetry();
        }
    }
    
    async fetchData() {
        try {
            this.updateConnectionStatus('connecting');
            
            // Get Firebase URL from config or use default
            let firebaseUrl;
            if (typeof CONFIG !== 'undefined' && CONFIG.firebase?.databaseURL) {
                firebaseUrl = `${CONFIG.firebase.databaseURL}/sensors.json`;
            } else {
                // Replace with your actual Firebase URL
                firebaseUrl = 'https://pond-monitor-d9ca9-default-rtdb.firebaseio.com/sensors.json';
                console.warn('Using default Firebase URL - please update CONFIG');
            }
            
            console.log('Fetching data from:', firebaseUrl);
            const response = await fetch(firebaseUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Raw Firebase data received:', data);
            
            // Log specific water level data for debugging
            if (data && data.waterLevel) {
                console.log('Water Level Data from Firebase:', {
                    distance: data.waterLevel.distance,
                    status: data.waterLevel.status,
                    timestamp: data.waterLevel.timestamp
                });
            }
            
            if (data && (data.temperature || data.waterLevel || data.location)) {
                this.processSensorData(data);
                this.updateUI();
                this.updateConnectionStatus('connected');
                this.retryCount = 0;
            } else {
                // No data received - show cached data or offline state
                console.log('No current data from Firebase, checking cache...');
                this.showOfflineState();
            }
            
        } catch (error) {
            console.error('Data fetch error:', error);
            
            // Try to use cached data instead of showing error immediately
            const cachedData = this.getCachedData();
            if (cachedData) {
                console.log('Using cached data due to fetch error');
                this.sensorData = cachedData;
                this.updateUI();
                this.updateConnectionStatus('cached');
            } else {
                this.updateConnectionStatus('error');
                this.scheduleRetry();
            }
        }
    }
    
    processSensorData(data) {
        console.log('Processing sensor data:', data);
        
        // Process temperature data
        let tempCelsius = null;
        if (data.temperature) {
            if (data.temperature.celsius !== undefined) {
                tempCelsius = this.validateTemperature(data.temperature.celsius);
            } else if (data.temperature.timestamp !== undefined) {
                // Convert timestamp to temperature if needed
                // This is a placeholder - adjust based on your sensor logic
                tempCelsius = 29.8; // Default value
            }
        }
        
        // Process water level data
        let waterDistance = null;
        let waterStatus = 'Sensor Offline';
        if (data.waterLevel) {
            waterDistance = this.validateWaterLevel(data.waterLevel.distance);
            // ALWAYS use the status from Firebase if it exists
            if (data.waterLevel.status) {
                waterStatus = data.waterLevel.status;
                console.log('Using water level status from Firebase:', waterStatus);
            } else {
                // Only calculate if no status provided
                waterStatus = this.calculateWaterStatus(waterDistance);
                console.log('Calculated water level status:', waterStatus);
            }
        }
        
        // Process GPS location data
        let gpsData = {
            latitude: null,
            longitude: null,
            time: null,
            valid: false
        };
        
        if (data.location) {
            console.log('Processing GPS location data:', data.location);
            gpsData = {
                latitude: data.location.latitude || null,
                longitude: data.location.longitude || null,
                time: data.location.time || null,
                valid: data.location.valid || false
            };
            console.log('Processed GPS data:', gpsData);
        }
        
        // Update sensor data
        this.sensorData = {
            temperature: {
                celsius: tempCelsius,
                fahrenheit: tempCelsius ? (tempCelsius * 9/5) + 32 : null
            },
            waterLevel: {
                distance: waterDistance,
                status: waterStatus
            },
            location: gpsData,
            timestamp: data.timestamp || Date.now(),
            deviceId: data.deviceId || 'pond-monitor-001'
        };
        
        console.log('Final processed sensor data:', this.sensorData);
        
        // Cache the data for future use
        this.cacheData(this.sensorData);
        
        // Add to historical data
        this.addToHistory();
        
        // Check for alerts
        this.checkAlerts();
        
        // Update last update time
        this.lastDataUpdate = new Date();
        
        console.log('Sensor data processed and cached successfully');
    }
    
    calculateWaterStatus(distance) {
        if (distance === null) return 'Sensor Offline';
        
        // Define water level thresholds (in cm)
        const criticalLow = 80;  // Very low water
        const lowLevel = 60;     // Low water
        const normalMin = 30;    // Normal range start
        const normalMax = 50;    // Normal range end
        const highLevel = 20;    // High water
        const criticalHigh = 10; // Very high water
        
        if (distance >= criticalLow) {
            return 'CRITICAL LOW';
        } else if (distance >= lowLevel) {
            return 'LOW LEVEL';
        } else if (distance >= normalMin && distance <= normalMax) {
            return 'NORMAL';
        } else if (distance <= criticalHigh) {
            return 'CRITICAL HIGH';
        } else if (distance <= highLevel) {
            return 'HIGH LEVEL';
        } else {
            return 'NORMAL';
        }
    }
    
    validateTemperature(value) {
        const temp = parseFloat(value);
        const minTemp = (typeof CONFIG !== 'undefined' && CONFIG.dataProcessing?.validation?.temperatureRange) ? 
            CONFIG.dataProcessing.validation.temperatureRange[0] : -10;
        const maxTemp = (typeof CONFIG !== 'undefined' && CONFIG.dataProcessing?.validation?.temperatureRange) ? 
            CONFIG.dataProcessing.validation.temperatureRange[1] : 60;
            
        if (isNaN(temp) || temp < minTemp || temp > maxTemp) {
            return null;
        }
        return temp;
    }
    
    validateWaterLevel(value) {
        const level = parseFloat(value);
        const minLevel = (typeof CONFIG !== 'undefined' && CONFIG.dataProcessing?.validation?.waterLevelRange) ? 
            CONFIG.dataProcessing.validation.waterLevelRange[0] : 0;
        const maxLevel = (typeof CONFIG !== 'undefined' && CONFIG.dataProcessing?.validation?.waterLevelRange) ? 
            CONFIG.dataProcessing.validation.waterLevelRange[1] : 500;
            
        if (isNaN(level) || level < minLevel || level > maxLevel) {
            return null;
        }
        return level;
    }
    
    addToHistory() {
        const now = new Date();
        const temp = this.sensorData.temperature.celsius;
        const water = this.sensorData.waterLevel.distance;
        
        if (temp !== null) {
            this.historicalData.temperature.push(temp);
            this.historicalData.timestamps.push(now);
        }
        
        if (water !== null) {
            this.historicalData.waterLevel.push(water);
        }
        
        // Limit data points
        const maxPoints = (typeof CONFIG !== 'undefined' && CONFIG.system?.maxDataPoints) ? 
            CONFIG.system.maxDataPoints : 1440; // Default 24 hours
            
        if (this.historicalData.temperature.length > maxPoints) {
            this.historicalData.temperature = this.historicalData.temperature.slice(-maxPoints);
            this.historicalData.waterLevel = this.historicalData.waterLevel.slice(-maxPoints);
            this.historicalData.timestamps = this.historicalData.timestamps.slice(-maxPoints);
        }
    }
    
    updateUI() {
        this.updateTemperatureDisplay();
        this.updateWaterLevelDisplay();
        this.updateLocationDisplay();
        this.updateStatsOverview();
        this.updateSystemStatus();
        this.updateEnvironmentalConditions();
        this.updateWaterQuality();
        this.updateChart();
        this.updateLastUpdateTime();
    }
    
    updateLocationDisplay() {
        const { location } = this.sensorData;
        
        console.log('Updating GPS location display:', location);
        
        if (location && location.valid && location.latitude !== null && location.longitude !== null) {
            // Update latitude displays
            const latElements = document.querySelectorAll('[data-gps="latitude"]');
            console.log(`Found ${latElements.length} latitude elements to update`);
            latElements.forEach((el, index) => {
                console.log(`Updating latitude element ${index}:`, el);
                el.textContent = location.latitude.toFixed(6);
            });
            
            // Update longitude displays  
            const lonElements = document.querySelectorAll('[data-gps="longitude"]');
            console.log(`Found ${lonElements.length} longitude elements to update`);
            lonElements.forEach((el, index) => {
                console.log(`Updating longitude element ${index}:`, el);
                el.textContent = location.longitude.toFixed(6);
            });
            
            // Update GPS time displays
            const timeElements = document.querySelectorAll('[data-gps="time"]');
            console.log(`Found ${timeElements.length} time elements to update`);
            timeElements.forEach((el, index) => {
                console.log(`Updating time element ${index}:`, el);
                el.textContent = location.time || '--:--:--';
            });
            
            // Update GPS status indicators
            const statusElements = document.querySelectorAll('[data-gps="status"]');
            console.log(`Found ${statusElements.length} status elements to update`);
            statusElements.forEach((el, index) => {
                console.log(`Updating status element ${index}:`, el);
                if (el.classList.contains('health-status')) {
                    el.innerHTML = '<i class="fas fa-circle"></i> GPS Active';
                    el.className = 'health-status online';
                } else if (el.classList.contains('env-trend')) {
                    el.innerHTML = '<i class="fas fa-satellite-dish"></i> Active';
                } else {
                    el.innerHTML = '<i class="fas fa-circle"></i> GPS Active';
                    el.className = 'health-status online';
                }
            });
            
            // Update GPS progress bars
            const gpsBars = document.querySelectorAll('.gps-bar');
            console.log(`Found ${gpsBars.length} GPS bar elements to update`);
            gpsBars.forEach((bar, index) => {
                console.log(`Updating GPS bar ${index}:`, bar);
                bar.style.width = '100%';
                bar.style.backgroundColor = '#10b981'; // Green color for active
            });
            
            // Update system status for GPS
            this.systemStatus.gpsModule = 'Active';
            
            console.log('GPS data successfully updated:', {
                lat: location.latitude,
                lon: location.longitude,
                time: location.time,
                valid: location.valid
            });
            
        } else {
            // No GPS fix - show placeholders
            console.log('No valid GPS data available, showing placeholders');
            
            const latElements = document.querySelectorAll('[data-gps="latitude"]');
            latElements.forEach(el => el.textContent = '--');
            
            const lonElements = document.querySelectorAll('[data-gps="longitude"]');
            lonElements.forEach(el => el.textContent = '--');
            
            const timeElements = document.querySelectorAll('[data-gps="time"]');
            timeElements.forEach(el => el.textContent = '--:--:--');
            
            const statusElements = document.querySelectorAll('[data-gps="status"]');
            statusElements.forEach(el => {
                if (el.classList.contains('health-status')) {
                    el.innerHTML = '<i class="fas fa-circle"></i> No GPS Fix';
                    el.className = 'health-status offline';
                } else if (el.classList.contains('env-trend')) {
                    el.innerHTML = '<i class="fas fa-satellite-dish"></i> No Fix';
                } else {
                    el.innerHTML = '<i class="fas fa-circle"></i> No GPS Fix';
                    el.className = 'health-status offline';
                }
            });
            
            const gpsBars = document.querySelectorAll('.gps-bar');
            gpsBars.forEach(bar => {
                bar.style.width = '0%';
            });
            
            // Update system status for GPS
            this.systemStatus.gpsModule = 'No Fix';
        }
    }
    
    updateTemperatureDisplay() {
        const { celsius, fahrenheit } = this.sensorData.temperature;
        
        // Update all temperature displays
        const tempElements = {
            'gauge-reading': celsius,
            'tempGaugeValue': celsius,
            'currentTemp': celsius,
            'envTemp': celsius
        };
        
        Object.entries(tempElements).forEach(([id, value]) => {
            const element = document.getElementById(id) || document.querySelector(`.${id}`);
            if (element) {
                if (value !== null) {
                    element.textContent = value.toFixed(1);
                } else {
                    element.textContent = '--';
                }
            }
        });
        
        // Update main metric display
        const metricTempElement = document.querySelector('[data-metric="temperature"]');
        if (metricTempElement) {
            metricTempElement.textContent = celsius !== null ? `${celsius.toFixed(1)}°C` : '--°C';
        }
        
        // Update temperature status
        this.updateTemperatureStatus(celsius);
        
        // Update temperature gauge/bars
        this.updateTemperatureVisuals(celsius);
    }
    
    updateWaterLevelDisplay() {
        const { distance, status } = this.sensorData.waterLevel;
        
        // Update distance displays
        const distanceElements = [
            'waterDistance', 'distanceReading', 'currentLevel', 'envLevel'
        ];
        
        distanceElements.forEach(id => {
            const element = document.getElementById(id) || document.querySelector(`.${id}`);
            if (element) {
                element.textContent = distance !== null ? distance.toFixed(0) : '--';
            }
        });
        
        // Update status displays - including both main and environmental sections
        const statusElements = document.querySelectorAll('.card-status, #waterStatus, #waterLevelStatus, [data-water-status]');
        statusElements.forEach(element => {
            if (element) {
                element.textContent = status;
                element.className = `card-status ${this.getStatusClass(status)}`;
            }
        });
        
        // Update water tank visualization
        this.updateWaterTank(distance);
        
        // Update level indicators
        this.updateLevelIndicators(distance, status);
        
        // Update metric bar
        this.updateMetricBar('level-bar', distance, 0, 100);
    }
    
    updateStatsOverview() {
        // Update system status
        const overallStatus = this.calculateOverallStatus();
        const systemStatusElement = document.getElementById('systemStatus');
        if (systemStatusElement) {
            systemStatusElement.textContent = overallStatus;
        }
        
        // Update uptime
        const uptime = this.calculateUptime();
        const uptimeElement = document.getElementById('systemUptime');
        if (uptimeElement) {
            uptimeElement.textContent = uptime;
        }
        
        // Update trends
        this.updateTrends();
    }
    
    updateSystemStatus() {
        // Update system status based on sensor data
        this.systemStatus.firebase = this.connectionStatus === 'connected' ? 'Connected' : 'Error';
        this.systemStatus.esp32 = this.connectionStatus === 'connected' ? 'Online' : 'Offline';
        this.systemStatus.temperatureSensor = this.sensorData.temperature.celsius !== null ? 'Active' : 'Offline';
        this.systemStatus.ultrasonicSensor = this.sensorData.waterLevel.distance !== null ? 'Active' : 'Offline';
        this.systemStatus.wifi = this.connectionStatus === 'connected' ? 'Strong Signal' : 'Disconnected';
        // GPS status is already updated in updateLocationDisplay()
        
        // Update individual sensor status displays
        this.updateSensorStatus('tempSensorStatus', this.systemStatus.temperatureSensor);
        this.updateSensorStatus('ultrasonicStatus', this.systemStatus.ultrasonicSensor);
        this.updateSensorStatus('esp32Status', this.systemStatus.esp32);
        this.updateSensorStatus('firebaseStatus', this.systemStatus.firebase);
        this.updateSensorStatus('wifiStatus', this.systemStatus.wifi);
        
        // Update GPS status in system health section
        const gpsHealthElement = document.querySelector('[data-sensor="gps-module"] .health-status');
        if (gpsHealthElement) {
            gpsHealthElement.innerHTML = `<i class="fas fa-circle"></i> ${this.systemStatus.gpsModule}`;
            if (this.systemStatus.gpsModule === 'Active') {
                gpsHealthElement.className = 'health-status online';
            } else {
                gpsHealthElement.className = 'health-status offline';
            }
        }
        
        // Update overall system health percentage
        let healthPercentage = 0;
        const healthSystems = [
            this.systemStatus.esp32,
            this.systemStatus.temperatureSensor,
            this.systemStatus.ultrasonicSensor,
            this.systemStatus.gpsModule,
            this.systemStatus.firebase
        ];
        
        healthSystems.forEach(status => {
            if (status === 'Online' || status === 'Active' || status === 'Connected') {
                healthPercentage += 20; // 100% / 5 systems = 20% each
            }
        });
        
        this.updateMetricBar('health-bar', healthPercentage, 0, 100);
        
        const healthElements = document.querySelectorAll('[data-metric="health"]');
        healthElements.forEach(element => {
            element.textContent = `${healthPercentage}%`;
        });
    }
    
    updateEnvironmentalConditions() {
        // Update trend indicators
        const tempTrend = this.calculateTrend(this.historicalData.temperature);
        const levelTrend = this.calculateTrend(this.historicalData.waterLevel);
        
        this.updateTrendIndicator('temp-trend', tempTrend);
        this.updateTrendIndicator('level-trend', levelTrend);
        
        // Update environmental metrics
        const { temperature, waterLevel, location } = this.sensorData;
        
        // Update min/max/average temperatures (mock data for now)
        if (temperature.celsius !== null) {
            this.updateStatValue('minTemp', (temperature.celsius - 2).toFixed(1) + '°C');
            this.updateStatValue('maxTemp', (temperature.celsius + 2).toFixed(1) + '°C');
            this.updateStatValue('avgTemp', temperature.celsius.toFixed(1) + '°C');
        }
        
        // Update water level status in the Pond Environment section
        const envWaterStatusElements = document.querySelectorAll('#envWaterStatus, .env-water-status, [data-env-water-status]');
        envWaterStatusElements.forEach(element => {
            if (element) {
                element.textContent = waterLevel.status;
                // Remove all possible status classes first
                element.classList.remove('status-normal', 'status-warning', 'status-critical', 'online', 'offline');
                // Add the appropriate class based on status
                const statusClass = this.getStatusClass(waterLevel.status);
                if (statusClass) {
                    element.classList.add(statusClass.replace('card-status ', ''));
                }
            }
        });
        
        // Also update any water level text elements in the environmental section
        const waterLevelTextElements = document.querySelectorAll('.env-metric-value[data-metric-type="water-level"]');
        waterLevelTextElements.forEach(element => {
            if (element) {
                element.textContent = waterLevel.status;
            }
        });
        
        // GPS location display is handled by updateLocationDisplay()
    }
    
    updateWaterQuality() {
        // Calculate water quality based on temperature and level
        const { temperature, waterLevel } = this.sensorData;
        
        let qualityScore = 0;
        let qualityStatus = 'POOR';
        
        if (temperature.celsius !== null) {
            // Optimal temperature range 18-25°C
            if (temperature.celsius >= 18 && temperature.celsius <= 25) {
                qualityScore += 50;
            } else if (temperature.celsius >= 15 && temperature.celsius <= 30) {
                qualityScore += 30;
            } else {
                qualityScore += 10;
            }
        }
        
        if (waterLevel.distance !== null && waterLevel.status === 'NORMAL') {
            qualityScore += 50;
        } else if (waterLevel.distance !== null) {
            qualityScore += 25;
        }
        
        // Determine status
        if (qualityScore >= 80) {
            qualityStatus = 'EXCELLENT';
        } else if (qualityScore >= 60) {
            qualityStatus = 'GOOD';
        } else if (qualityScore >= 40) {
            qualityStatus = 'FAIR';
        }
        
        // Update water quality displays
        const qualityValueElements = document.querySelectorAll('.gauge-value, #waterQualityValue, #envQuality');
        qualityValueElements.forEach(element => {
            element.textContent = qualityScore;
        });
        
        const qualityStatusElements = document.querySelectorAll('.gauge-status, #waterQualityStatus');
        qualityStatusElements.forEach(element => {
            element.textContent = qualityStatus;
        });
    }
    
    updateTemperatureStatus(temp) {
        const statusElement = document.getElementById('tempStatus') || document.querySelector('.gauge-status-text');
        if (!statusElement) return;
        
        if (temp === null) {
            statusElement.textContent = 'Offline';
            statusElement.className = 'gauge-status-text';
            statusElement.style.color = 'var(--status-offline)';
        } else if (temp >= 18 && temp <= 25) {
            statusElement.textContent = 'Optimal';
            statusElement.style.color = 'var(--status-good)';
        } else if (temp >= 15 && temp <= 30) {
            statusElement.textContent = 'Good';
            statusElement.style.color = 'var(--status-warning)';
        } else {
            statusElement.textContent = 'Warning';
            statusElement.style.color = 'var(--status-critical)';
        }
    }
    
    updateTemperatureVisuals(temp) {
        if (temp === null) return;
        
        // Update temperature gauge fill
        const gaugeFill = document.querySelector('.gauge-fill');
        if (gaugeFill) {
            const percentage = Math.min(Math.max((temp / 50) * 100, 0), 100);
            gaugeFill.style.width = `${percentage}%`;
        }
        
        // Update metric bar
        this.updateMetricBar('temperature-bar', temp, 0, 50);
    }
    
    updateWaterTank(distance) {
        const waterFill = document.querySelector('.water-fill, #waterFill');
        if (!waterFill || distance === null) {
            if (waterFill) waterFill.style.height = '0%';
            return;
        }
        
        // Convert distance to fill percentage (assuming 100cm = 0%, 0cm = 100%)
        const fillPercentage = Math.max(0, Math.min(100, (100 - distance)));
        waterFill.style.height = `${fillPercentage}%`;
    }
    
    updateLevelIndicators(distance, status) {
        const indicators = document.querySelectorAll('.indicator');
        indicators.forEach(indicator => {
            indicator.classList.remove('active');
            
            if (status === 'NORMAL' && indicator.classList.contains('good')) {
                indicator.classList.add('active');
            } else if (status === 'HIGH LEVEL' && indicator.classList.contains('warning')) {
                indicator.classList.add('active');
            } else if (status === 'LOW LEVEL' && indicator.classList.contains('warning')) {
                indicator.classList.add('active');
            } else if ((status === 'CRITICAL HIGH' || status === 'CRITICAL LOW') && indicator.classList.contains('critical')) {
                indicator.classList.add('active');
            }
        });
    }
    
    updateSensorStatus(elementId, status) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // Update text
        element.textContent = status;
        
        // Update class for styling
        element.className = 'health-status';
        if (status === 'Active' || status === 'Online' || status === 'Connected' || status === 'Strong Signal') {
            element.classList.add('online');
        } else {
            element.classList.add('offline');
        }
    }
    
    updateMetricBar(className, value, min, max) {
        const bar = document.querySelector(`.${className}`);
        if (!bar || value === null) {
            if (bar) bar.style.width = '0%';
            return;
        }
        
        const percentage = ((value - min) / (max - min)) * 100;
        bar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
    }
    
    updateStatValue(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }
    
    updateTrendIndicator(elementId, trend) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        element.innerHTML = '';
        
        switch (trend) {
            case 'rising':
                element.innerHTML = '<i class="fas fa-arrow-up" style="color: var(--status-good);"></i>';
                break;
            case 'falling':
                element.innerHTML = '<i class="fas fa-arrow-down" style="color: var(--status-critical);"></i>';
                break;
            case 'stable':
                element.innerHTML = '<i class="fas fa-minus" style="color: var(--text-secondary);"></i>';
                break;
            default:
                element.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--status-offline);"></i>';
        }
    }
