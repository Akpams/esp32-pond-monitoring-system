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
            waterStatus = data.waterLevel.status || 'Unknown';
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
        this.updateLocationDisplay(); // Now properly defined
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
        
        // Update status displays
        const statusElements = document.querySelectorAll('.card-status, #waterStatus, #waterLevelStatus');
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
            } else if (status !== 'NORMAL' && status !== 'Sensor Offline' && indicator.classList.contains('warning')) {
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
    
    updateTrends() {
        // Update temperature trend
        const tempTrend = this.calculateTrend(this.historicalData.temperature);
        const tempTrendElement = document.querySelector('.env-trend');
        if (tempTrendElement && this.sensorData.temperature.celsius !== null) {
            const change = '+0.3°C'; // This would be calculated from actual trend
            switch (tempTrend) {
                case 'rising':
                    tempTrendElement.innerHTML = '<i class="fas fa-arrow-up"></i> ' + change;
                    tempTrendElement.className = 'env-trend up';
                    break;
                case 'falling':
                    tempTrendElement.innerHTML = '<i class="fas fa-arrow-down"></i> ' + change;
                    tempTrendElement.className = 'env-trend down';
                    break;
                default:
                    tempTrendElement.innerHTML = '<i class="fas fa-minus"></i> Stable';
                    tempTrendElement.className = 'env-trend stable';
            }
        }
    }
    
    showOfflineState() {
        console.log('Showing offline state - no sensor data available');
        
        // Reset sensor data to null values
        this.sensorData = {
            temperature: { celsius: null, fahrenheit: null },
            waterLevel: { distance: null, status: 'Sensor Offline' },
            location: { latitude: null, longitude: null, time: null, valid: false },
            timestamp: null,
            deviceId: null
        };
        
        // Update UI to reflect offline state
        this.updateTemperatureDisplay();
        this.updateWaterLevelDisplay();
        this.updateLocationDisplay();
        this.updateSystemStatus();
        this.updateWaterQuality();
        
        // Update connection status
        this.updateConnectionStatus('offline');
    }
    
    calculateOverallStatus() {
        const { temperature, waterLevel, location } = this.sensorData;
        
        let activeComponents = 0;
        let totalComponents = 3;
        
        if (temperature.celsius !== null) activeComponents++;
        if (waterLevel.distance !== null) activeComponents++;
        if (location.valid && location.latitude !== null) activeComponents++;
        
        if (activeComponents === 0) {
            return 'Offline';
        } else if (activeComponents === totalComponents) {
            return 'Online';
        } else {
            return 'Partial';
        }
    }
    
    calculateUptime() {
        // Mock uptime calculation - in real implementation, this would come from the device
        if (this.connectionStatus !== 'connected') {
            return '0h';
        }
        
        const uptimeHours = Math.floor(Math.random() * 72) + 1;
        if (uptimeHours < 24) {
            return `${uptimeHours}h`;
        } else {
            const days = Math.floor(uptimeHours / 24);
            const hours = uptimeHours % 24;
            return `${days}d ${hours}h`;
        }
    }
    
    calculateTrend(data) {
        if (data.length < 2) return 'stable';
        
        const recent = data.slice(-5); // Last 5 readings
        if (recent.length < 2) return 'stable';
        
        const avg1 = recent.slice(0, Math.floor(recent.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(recent.length / 2);
        const avg2 = recent.slice(Math.floor(recent.length / 2)).reduce((a, b) => a + b, 0) / (recent.length - Math.floor(recent.length / 2));
        
        const difference = avg2 - avg1;
        if (Math.abs(difference) < 0.5) return 'stable';
        return difference > 0 ? 'rising' : 'falling';
    }
    
    getStatusClass(status) {
        switch (status.toLowerCase()) {
            case 'normal': return 'status-normal';
            case 'low level': return 'status-warning';
            case 'high level': return 'status-critical';
            case 'sensor offline': return 'status-critical';
            default: return 'status-critical';
        }
    }
    
    initializeChart() {
        const ctx = document.getElementById('temperatureChart');
        if (!ctx) return;
        
        const colors = (typeof CONFIG !== 'undefined' && CONFIG.ui?.colors) ? CONFIG.ui.colors : {
            temperature: '#ef4444',
            waterLevel: '#06b6d4'
        };
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: [],
                        borderColor: colors.temperature,
                        backgroundColor: colors.temperature + '20',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'Water Distance (cm)',
                        data: [],
                        borderColor: colors.waterLevel,
                        backgroundColor: colors.waterLevel + '20',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#333',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: true
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            maxTicksLimit: 8,
                            color: '#b4bcd0'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: '#b4bcd0'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#b4bcd0'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Water Distance (cm)',
                            color: '#b4bcd0'
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            color: '#b4bcd0'
                        }
                    }
                },
                animation: {
                    duration: 750
                }
            }
        });
    }
    
    updateChart() {
        if (!this.chart || this.historicalData.timestamps.length === 0) return;
        
        const maxPoints = (typeof CONFIG !== 'undefined' && CONFIG.system?.chartDataPoints) ? 
            CONFIG.system.chartDataPoints : 24;
            
        const tempData = this.historicalData.temperature.slice(-maxPoints);
        const waterData = this.historicalData.waterLevel.slice(-maxPoints);
        const timestamps = this.historicalData.timestamps.slice(-maxPoints);
        
        // Format labels
        const labels = timestamps.map(timestamp => {
            return new Date(timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        });
        
        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = tempData;
        this.chart.data.datasets[1].data = waterData;
        
        this.chart.update('none');
    }
    
    updateChartPeriod(period) {
        console.log(`Updating chart period to: ${period}`);
        // Implementation would depend on how historical data is stored
        // For now, just update the existing chart
        this.updateChart();
    }
    
    checkAlerts() {
        if (typeof CONFIG === 'undefined' || !CONFIG.alerts?.enabled) return;
        
        const alerts = [];
        const { temperature, waterLevel } = this.sensorData;
        
        // Temperature alerts
        if (temperature.celsius !== null) {
            const temp = temperature.celsius;
            if (CONFIG.alerts.types.temperatureHigh?.enabled && temp > CONFIG.alerts.types.temperatureHigh.threshold) {
                alerts.push({
                    type: 'temperature-high',
                    message: CONFIG.alerts.types.temperatureHigh.message,
                    severity: 'critical'
                });
            }
            if (CONFIG.alerts.types.temperatureLow?.enabled && temp < CONFIG.alerts.types.temperatureLow.threshold) {
                alerts.push({
                    type: 'temperature-low',
                    message: CONFIG.alerts.types.temperatureLow.message,
                    severity: 'warning'
                });
            }
        }
        
        // Water level alerts
        if (waterLevel.distance !== null) {
            const distance = waterLevel.distance;
            if (CONFIG.alerts.types.waterLevelLow?.enabled && distance > CONFIG.alerts.types.waterLevelLow.threshold) {
                alerts.push({
                    type: 'water-level-low',
                    message: CONFIG.alerts.types.waterLevelLow.message,
                    severity: 'critical'
                });
            }
            if (CONFIG.alerts.types.waterLevelHigh?.enabled && distance < CONFIG.alerts.types.waterLevelHigh.threshold) {
                alerts.push({
                    type: 'water-level-high',
                    message: CONFIG.alerts.types.waterLevelHigh.message,
                    severity: 'warning'
                });
            }
        }
        
        // Show alerts
        if (alerts.length > 0) {
            this.showAlert(alerts[0]); // Show the first alert
        }
    }
    
    showAlert(alert) {
        const banner = document.getElementById('alertBanner');
        const message = document.getElementById('alertMessage');
        
        if (banner && message) {
            message.textContent = alert.message;
            banner.className = `alert-banner alert-${alert.severity}`;
            banner.classList.remove('hidden');
            
            // Auto-hide after 10 seconds
            setTimeout(() => {
                this.closeAlert();
            }, 10000);
        }
        
        // Also update alert list
        this.updateAlertList(alert);
    }
    
    updateAlertList(newAlert) {
        const alertList = document.getElementById('alertList');
        if (!alertList) return;
        
        // Create new alert item
        const alertItem = document.createElement('div');
        alertItem.className = `alert-item ${newAlert.severity}`;
        alertItem.innerHTML = `
            <div class="alert-icon">
                <i class="fas fa-${newAlert.severity === 'critical' ? 'exclamation-triangle' : 'info-circle'}"></i>
            </div>
            <div class="alert-content">
                <div class="alert-title">${newAlert.type.replace('-', ' ').toUpperCase()}</div>
                <div class="alert-message">${newAlert.message}</div>
                <div class="alert-time">Just now</div>
            </div>
        `;
        
        // Add to top of list
        alertList.insertBefore(alertItem, alertList.firstChild);
        
        // Limit to 5 alerts
        const alertItems = alertList.querySelectorAll('.alert-item');
        if (alertItems.length > 5) {
            alertList.removeChild(alertItems[alertItems.length - 1]);
        }
        
        // Update alert badge
        const alertBadge = document.getElementById('alertBadge');
        if (alertBadge) {
            const criticalAlerts = alertList.querySelectorAll('.alert-item.critical').length;
            const badgeCount = alertBadge.querySelector('.badge-count');
            if (badgeCount) {
                badgeCount.textContent = criticalAlerts;
            }
        }
    }
    
    closeAlert() {
        const banner = document.getElementById('alertBanner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }
    
    updateConnectionStatus(status) {
        this.connectionStatus = status;
        const dot = document.querySelector('.connection-dot, #connectionDot');
        const text = document.querySelector('#connectionText') || dot?.nextElementSibling;
        
        if (!dot || !text) return;
        
        dot.className = 'connection-dot';
        
        switch (status) {
            case 'connected':
                dot.style.background = '#10b981'; // Green
                text.textContent = 'Connected';
                break;
            case 'connecting':
                dot.style.background = '#f59e0b'; // Yellow
                text.textContent = 'Connecting...';
                break;
            case 'cached':
                dot.style.background = '#f59e0b'; // Yellow
                text.textContent = 'Using Cached Data';
                break;
            case 'offline':
                dot.style.background = '#6b7280'; // Gray
                text.textContent = 'Offline';
                break;
            case 'error':
                dot.style.background = '#ef4444'; // Red
                text.textContent = 'Connection Error';
                break;
        }
    }
    
    updateLastUpdateTime() {
        const lastUpdateElements = document.querySelectorAll('#lastUpdate, .last-update');
        if (this.lastDataUpdate) {
            const now = new Date();
            const diffMinutes = Math.floor((now - this.lastDataUpdate) / (1000 * 60));
            
            let updateText;
            if (diffMinutes < 1) {
                updateText = 'Last updated: Just now';
            } else if (diffMinutes === 1) {
                updateText = 'Last updated: 1 min ago';
            } else {
                updateText = `Last updated: ${diffMinutes} min ago`;
            }
            
            lastUpdateElements.forEach(element => {
                element.textContent = updateText;
            });
        }
    }
    
    updateTime() {
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            let timeString;
            
            // Use GPS time if available, otherwise use local time
            if (this.sensorData.location && this.sensorData.location.valid && this.sensorData.location.time) {
                timeString = this.sensorData.location.time + ' UTC';
            } else {
                const now = new Date();
                timeString = now.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    timeZoneName: 'short'
                });
            }
            
            timeElement.textContent = timeString;
        }
        
        // Schedule next update
        setTimeout(() => this.updateTime(), 1000);
    }
    
    performHealthCheck() {
        // Check if data is stale
        if (this.lastDataUpdate) {
            const timeSinceUpdate = Date.now() - this.lastDataUpdate.getTime();
            const timeout = (typeof CONFIG !== 'undefined' && CONFIG.alerts?.types?.sensorOffline?.timeout) ? 
                CONFIG.alerts.types.sensorOffline.timeout : 300000; // Default 5 minutes
                
            if (timeSinceUpdate > timeout) {
                this.showAlert({
                    type: 'sensor-offline',
                    message: 'Sensor appears to be offline!',
                    severity: 'critical'
                });
            }
        }
        
        // Check individual sensor health
        this.checkSensorHealth();
    }
    
    checkSensorHealth() {
        const now = Date.now();
        const { temperature, waterLevel, location } = this.sensorData;
        
        // Temperature sensor health
        const tempSensorElement = document.querySelector('[data-sensor="temperature-sensor"] .health-status');
        if (tempSensorElement) {
            if (temperature.celsius !== null) {
                tempSensorElement.innerHTML = '<i class="fas fa-circle"></i> Active';
                tempSensorElement.className = 'health-status online';
            } else {
                tempSensorElement.innerHTML = '<i class="fas fa-circle"></i> Offline';
                tempSensorElement.className = 'health-status offline';
            }
        }
        
        // Ultrasonic sensor health
        const ultrasonicElement = document.querySelector('[data-sensor="ultrasonic-sensor"] .health-status');
        if (ultrasonicElement) {
            if (waterLevel.distance !== null) {
                ultrasonicElement.innerHTML = '<i class="fas fa-circle"></i> Active';
                ultrasonicElement.className = 'health-status online';
            } else {
                ultrasonicElement.innerHTML = '<i class="fas fa-circle"></i> Offline';
                ultrasonicElement.className = 'health-status offline';
            }
        }
        
        // GPS module health
        const gpsElement = document.querySelector('[data-sensor="gps-module"] .health-status');
        if (gpsElement) {
            if (location.valid && location.latitude !== null) {
                gpsElement.innerHTML = '<i class="fas fa-circle"></i> GPS Fix';
                gpsElement.className = 'health-status online';
            } else {
                gpsElement.innerHTML = '<i class="fas fa-circle"></i> No GPS Fix';
                gpsElement.className = 'health-status offline';
            }
        }
        
        // WiFi connection health
        const wifiElement = document.querySelector('[data-sensor="wifi-connection"] .health-status');
        if (wifiElement) {
            if (this.connectionStatus === 'connected') {
                wifiElement.innerHTML = '<i class="fas fa-circle"></i> Strong Signal';
                wifiElement.className = 'health-status online';
            } else {
                wifiElement.innerHTML = '<i class="fas fa-circle"></i> Disconnected';
                wifiElement.className = 'health-status offline';
            }
        }
        
        // Firebase sync health
        const firebaseElement = document.querySelector('[data-sensor="firebase-sync"] .health-status');
        if (firebaseElement) {
            if (this.connectionStatus === 'connected') {
                firebaseElement.innerHTML = '<i class="fas fa-circle"></i> Synchronized';
                firebaseElement.className = 'health-status online';
            } else {
                firebaseElement.innerHTML = '<i class="fas fa-circle"></i> Sync Error';
                firebaseElement.className = 'health-status offline';
            }
        }
    }
    
    scheduleRetry() {
        const maxRetries = (typeof CONFIG !== 'undefined' && CONFIG.system?.maxRetries) ? 
            CONFIG.system.maxRetries : 5;
        const retryDelay = (typeof CONFIG !== 'undefined' && CONFIG.system?.retryDelay) ? 
            CONFIG.system.retryDelay : 5000;
            
        if (this.retryCount < maxRetries) {
            this.retryCount++;
            setTimeout(() => {
                console.log(`Retrying connection (${this.retryCount}/${maxRetries})`);
                this.fetchData();
            }, retryDelay);
        } else {
            console.error('Max retries reached. Stopping automatic retries.');
            this.updateConnectionStatus('error');
            this.showOfflineState();
        }
    }
    
    refreshData() {
        console.log('Manual refresh triggered');
        this.retryCount = 0;
        this.fetchData();
    }
    
    showError(message) {
        console.error('Dashboard Error:', message);
        // Could implement a toast notification system here
        
        // For now, update connection status
        this.updateConnectionStatus('error');
    }
    
    handleOnlineStatus(isOnline) {
        if (isOnline) {
            console.log('Back online - resuming updates');
            this.resumeUpdates();
        } else {
            console.log('Gone offline - pausing updates');
            this.pauseUpdates();
        }
    }
    
    pauseUpdates() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
    
    resumeUpdates() {
        if (!this.updateTimer) {
            this.startDataFetching();
        }
    }
    
    handleResize() {
        // Update chart if it exists
        if (this.chart) {
            this.chart.resize();
        }
        
        // Update mobile-specific UI elements
        const isMobile = window.innerWidth <= 768;
        document.body.classList.toggle('mobile', isMobile);
    }
    
    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        }
    }
    
    // Export data functionality
    exportData() {
        const data = {
            currentData: this.sensorData,
            historicalData: this.historicalData,
            systemStatus: this.systemStatus,
            exportTime: new Date().toISOString(),
            deviceInfo: {
                name: 'Pond Monitor Pro',
                version: '3.0.0',
                location: 'Main Pond - Garden'
            }
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pond-monitor-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Data caching methods
    cacheData(data) {
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('pondMonitorData', JSON.stringify({
                    ...data,
                    cacheTime: Date.now()
                }));
                console.log('Data cached successfully');
            } catch (error) {
                console.warn('Failed to cache data:', error);
            }
        }
    }
    
    getCachedData() {
        if (typeof localStorage !== 'undefined') {
            try {
                const cached = localStorage.getItem('pondMonitorData');
                if (cached) {
                    const data = JSON.parse(cached);
                    const cacheAge = Date.now() - (data.cacheTime || 0);
                    
                    // Use cached data if it's less than 1 hour old
                    if (cacheAge < 3600000) { // 1 hour = 3600000ms
                        console.log(`Found cached data (${Math.round(cacheAge / 60000)} minutes old)`);
                        return data;
                    } else {
                        console.log('Cached data too old, ignoring');
                        localStorage.removeItem('pondMonitorData');
                    }
                }
            } catch (error) {
                console.warn('Failed to retrieve cached data:', error);
            }
        }
        return null;
    }
    
    // Manual GPS test function for debugging
    testGPSUpdate() {
        console.log('Testing GPS update with sample data...');
        const testData = {
            location: {
                latitude: 9.261336833,
                longitude: 7.378359667,
                time: "13:33:45",
                valid: true
            }
        };
        
        this.processSensorData(testData);
        this.updateLocationDisplay();
        console.log('GPS test completed');
    }
    
    // Debug function to log all GPS elements
    debugGPSElements() {
        console.log('Debugging GPS elements...');
        
        const selectors = [
            '[data-gps="latitude"]',
            '[data-gps="longitude"]', 
            '[data-gps="time"]',
            '[data-gps="status"]',
            '.gps-bar'
        ];
        
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            console.log(`${selector}: Found ${elements.length} elements`);
            elements.forEach((el, index) => {
                console.log(`  Element ${index}:`, el, 'Current text:', el.textContent);
            });
        });
    }
    
    destroy() {
        if (this.updateTimer) clearInterval(this.updateTimer);
        if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
        if (this.chart) this.chart.destroy();
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('online', this.handleOnlineStatus);
        window.removeEventListener('offline', this.handleOnlineStatus);
        
        console.log('Dashboard cleanup completed');
    }
}

// Global functions
window.closeAlert = function() {
    if (window.dashboard) {
        window.dashboard.closeAlert();
    }
};

window.refreshDashboard = function() {
    if (window.dashboard) {
        window.dashboard.refreshData();
    }
};

window.exportData = function() {
    if (window.dashboard) {
        window.dashboard.exportData();
    }
};

// Debug functions for testing GPS
window.testGPS = function() {
    if (window.dashboard) {
        window.dashboard.testGPSUpdate();
    }
};

window.debugGPS = function() {
    if (window.dashboard) {
        window.dashboard.debugGPSElements();
    }
};

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check for saved dark mode preference
    if (typeof localStorage !== 'undefined' && localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }
    
    // Initialize the dashboard
    window.dashboard = new PondMonitorDashboard();
    
    console.log('Professional Pond Dashboard Ready');
    console.log('Debug commands available: testGPS(), debugGPS(), refreshDashboard()');
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboard) {
        window.dashboard.destroy();
    }
});

// Service Worker registration (for PWA functionality)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registered successfully');
            })
            .catch(error => {
                console.log('Service Worker registration failed');
            });
    });
}
