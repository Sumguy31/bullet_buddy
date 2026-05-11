// Database of known Japanese cities and their coordinates
const cityCoordinates = {
    "Tokyo": [35.6812, 139.7671],
    "Ueno": [35.7138, 139.7772],
    "Omiya": [35.9063, 139.6242],
    "Nagano": [36.6431, 138.1887],
    "Toyama": [36.7013, 137.2133],
    "Kanazawa": [36.5780, 136.6481],
    "Tsuruga": [35.6558, 136.0763],
    "Kyoto": [34.9858, 135.7587],
    "Osaka": [34.7024, 135.4959],
    "Shin-osaka": [34.7335, 135.5001],
    "Nagoya": [35.1815, 136.9066],
    "Yokohama": [35.4437, 139.6380],
    "Shin-yokohama": [35.5074, 139.6176],
    "Kobe": [34.6901, 135.1955],
    "Shin-kobe": [34.7066, 135.1951],
    "Okayama": [34.6551, 133.9195],
    "Hiroshima": [34.3853, 132.4553],
    "Fukuoka": [33.5902, 130.4017],
    "Hakata": [33.5902, 130.4017],
    "Sendai": [38.2682, 140.8694],
    "Morioka": [39.7020, 141.1545],
    "Aomori": [40.8222, 140.7474],
    "Shin-aomori": [40.8282, 140.6934],
    "Hakodate": [41.7687, 140.7288],
    "Sapporo": [43.0618, 141.3545],
    "Niigata": [37.9161, 139.0364],
    "Kagoshima": [31.5966, 130.5571],
    "Kumamoto": [32.8031, 130.7079]
};

// Shinkansen Line Definitions for Validation
const shinkansenLines = {
    "Tokaido": {
        trains: ["Nozomi", "Hikari", "Kodama"],
        stations: ["Tokyo", "Shin-yokohama", "Yokohama", "Nagoya", "Kyoto", "Shin-osaka", "Osaka"]
    },
    "Sanyo": {
        trains: ["Nozomi", "Hikari", "Kodama", "Mizuho", "Sakura"],
        stations: ["Shin-osaka", "Osaka", "Shin-kobe", "Kobe", "Okayama", "Hiroshima", "Hakata", "Fukuoka"]
    },
    "Tohoku": {
        trains: ["Hayabusa", "Hayate", "Yamabiko", "Nasuno"],
        stations: ["Tokyo", "Ueno", "Omiya", "Sendai", "Morioka", "Shin-aomori", "Aomori"]
    },
    "Hokuriku": {
        trains: ["Kagayaki", "Hakutaka", "Asama", "Tsurugi"],
        stations: ["Tokyo", "Ueno", "Omiya", "Nagano", "Toyama", "Kanazawa", "Tsuruga"]
    },
    "Joetsu": {
        trains: ["Toki", "Tanigawa"],
        stations: ["Tokyo", "Ueno", "Omiya", "Niigata"]
    },
    "Kyushu": {
        trains: ["Mizuho", "Sakura", "Tsubame"],
        stations: ["Hakata", "Fukuoka", "Kumamoto", "Kagoshima"]
    }
};

// Top speeds (km/h)
const trainSpeeds = {
    "Nozomi": 300, "Hikari": 285, "Kodama": 285,
    "Mizuho": 300, "Sakura": 285, "Tsubame": 260,
    "Hayabusa": 320, "Hayate": 275, "Yamabiko": 275, "Nasuno": 275,
    "Komachi": 320, "Tsubasa": 275,
    "Kagayaki": 260, "Hakutaka": 260, "Asama": 260, "Tsurugi": 260,
    "Toki": 240, "Tanigawa": 240
};

let isMetric = false;
const DEFAULT_SPEED = 240;

// Initialize Map
const map = L.map('map', { zoomControl: false }).setView([36.2048, 138.2529], 5);
L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

let routeLines = [];
let routeMarkers = [];

// Conversion Helpers
const kmToMiles = (km) => km * 0.621371;
const kmhToMph = (kmh) => kmh * 0.621371;

function formatDistance(km) {
    if (isMetric) return `${Math.round(km)} km`;
    return `${Math.round(kmToMiles(km))} mi`;
}

function formatSpeed(kmh) {
    if (isMetric) return `${Math.round(kmh)} km/h`;
    return `${Math.round(kmhToMph(kmh))} mph`;
}

// Validation Logic
function isValidRoute(trainType, from, to) {
    // Basic city normalization
    const nFrom = from.toLowerCase();
    const nTo = to.toLowerCase();

    for (const line in shinkansenLines) {
        const data = shinkansenLines[line];
        if (data.trains.includes(trainType)) {
            const hasFrom = data.stations.some(s => s.toLowerCase() === nFrom);
            const hasTo = data.stations.some(s => s.toLowerCase() === nTo);
            if (hasFrom && hasTo) return true;
        }
    }
    return false;
}

// Generate deterministic times based on train number
function generateTimes(trainNumber) {
    const num = parseInt(trainNumber) || 100;
    const depHour = (num % 12) + 6; // Starts at 6 AM onwards
    const depMin = (num * 7) % 60;

    // Duration based on train number as seed (mock)
    const durationMin = (num % 120) + 45;

    const depTime = `${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`;

    let arrHour = depHour + Math.floor((depMin + durationMin) / 60);
    let arrMin = (depMin + durationMin) % 60;
    const arrTime = `${String(arrHour % 24).padStart(2, '0')}:${String(arrMin).padStart(2, '0')}`;

    return { dep: depTime, arr: arrTime, duration: durationMin };
}

function parseItinerary(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const parsed = [];
    const regex = /([A-Za-z]+)\s+(\d+)?\s*([A-Za-z-]+)\s*(?:->|-|to)\s*([A-Za-z-]+)/i;

    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            const trainType = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
            const trainNumber = match[2] || "0";
            const from = match[3].charAt(0).toUpperCase() + match[3].slice(1).toLowerCase();
            const to = match[4].charAt(0).toUpperCase() + match[4].slice(1).toLowerCase();

            parsed.push({ original: line, trainType, trainNumber, from, to });
        }
    });
    return parsed;
}

async function calculateRoute() {
    const text = document.getElementById('itinerary').value;
    const segments = parseItinerary(text);

    routeLines.forEach(line => map.removeLayer(line));
    routeMarkers.forEach(marker => map.removeLayer(marker));
    routeLines = [];
    routeMarkers = [];

    const listEl = document.getElementById('parsed-list');
    listEl.innerHTML = '';

    if (segments.length === 0) {
        listEl.innerHTML = '<li class="empty-state">No valid routes found.</li>';
        resetStats();
        return;
    }

    let totalKm = 0;
    let totalMinutes = 0;
    let maxSpeedKmh = 0;
    let citiesVisited = new Set();
    let allCoordinates = [];

    for (let index = 0; index < segments.length; index++) {
        const seg = segments[index];
        const li = document.createElement('li');

        const fromCoords = cityCoordinates[seg.from];
        const toCoords = cityCoordinates[seg.to];
        const isValid = isValidRoute(seg.trainType, seg.from, seg.to);

        if (fromCoords && toCoords && isValid) {
            citiesVisited.add(seg.from);
            citiesVisited.add(seg.to);

            const speedKmh = trainSpeeds[seg.trainType] || DEFAULT_SPEED;
            if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;

            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const segmentColor = colors[index % colors.length];
            li.style.borderLeftColor = segmentColor;

            const times = generateTimes(seg.trainNumber);

            try {
                const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromCoords[1]},${fromCoords[0]};${toCoords[1]},${toCoords[0]}?overview=full&geometries=geojson`);
                const data = await response.json();

                if (data.routes && data.routes.length > 0) {
                    const geojsonLayer = L.geoJSON(data.routes[0].geometry, {
                        style: { color: segmentColor, weight: 4, opacity: 0.8 }
                    }).addTo(map);
                    routeLines.push(geojsonLayer);

                    const distKm = data.routes[0].distance / 1000;
                    totalKm += distKm;

                    // Use speed to adjust "mock" duration for stats if it feels more realistic
                    const routeMinutes = (distKm / (speedKmh * 0.7)) * 60;
                    totalMinutes += routeMinutes;

                    li.innerHTML = `
                        <div class="itinerary-main">
                            <div class="itinerary-route">
                                <span class="itinerary-cities">${seg.from} ➔ ${seg.to}</span>
                                <span class="itinerary-train">${seg.trainType} ${seg.trainNumber}</span>
                            </div>
                            <div class="itinerary-times">
                                <span class="time-label">DEP / ARR</span>
                                <span>${times.dep} — ${times.arr}</span>
                            </div>
                        </div>
                        <div class="itinerary-details">
                            <div class="detail-item">
                                <span class="detail-label">Distance</span>
                                <span class="detail-value">${formatDistance(distKm)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Transit Time</span>
                                <span class="detail-value">${Math.floor(routeMinutes / 60)}h ${Math.round(routeMinutes % 60)}m</span>
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                // Fallback
                const polyline = L.polyline([fromCoords, toCoords], { color: segmentColor, weight: 4, dashArray: '8, 8' }).addTo(map);
                routeLines.push(polyline);
            }

            allCoordinates.push(fromCoords, toCoords);
        } else {
            li.style.borderLeftColor = '#ef4444';
            let error = !fromCoords || !toCoords ? "City not found" : "Invalid train line";
            li.innerHTML = `
                <div class="itinerary-main">
                    <div class="itinerary-route">
                        <span class="itinerary-cities">${seg.from} ➔ ${seg.to}</span>
                        <span class="itinerary-train">${seg.trainType} ${seg.trainNumber}</span>
                    </div>
                </div>
                <div style="color: #ef4444; font-size: 11px; margin-top: 4px;">Error: ${error}</div>
            `;
        }
        listEl.appendChild(li);
    }

    if (allCoordinates.length > 0) map.fitBounds(allCoordinates, { padding: [50, 50] });

    updateDashboard(totalKm, totalMinutes, maxSpeedKmh, citiesVisited.size);
}

function updateDashboard(km, min, speed, cities) {
    const valDistance = isMetric ? km : kmToMiles(km);
    const valSpeed = isMetric ? speed : kmhToMph(speed);
    const unitDist = isMetric ? " km" : " mi";
    const unitSpeed = isMetric ? " km/h" : " mph";

    animateValue("val-distance", 0, Math.round(valDistance), 1000, unitDist);
    animateValue("val-speed", 0, Math.round(valSpeed), 1000, unitSpeed);
    animateValue("val-cities", 0, cities, 1000, "");

    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    document.getElementById('val-time').innerText = `${h}h ${m}m`;
}

function resetStats() {
    document.getElementById('val-distance').innerText = isMetric ? '0 km' : '0 mi';
    document.getElementById('val-time').innerText = '0h 0m';
    document.getElementById('val-speed').innerText = isMetric ? '0 km/h' : '0 mph';
    document.getElementById('val-cities').innerText = '0';
    map.setView([36.2048, 138.2529], 5);
}

function animateValue(id, start, end, duration, suffix) {
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentVal = Math.floor(progress * (end - start) + start);
        obj.innerHTML = currentVal + suffix;
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// Unit Toggle Handler
document.getElementById('toggle-units').addEventListener('click', function () {
    isMetric = !isMetric;
    this.classList.toggle('active');
    document.getElementById('unit-metric').classList.toggle('active');
    document.getElementById('unit-imperial').classList.toggle('active');

    // Update labels
    document.getElementById('label-distance').innerText = isMetric ? 'Distance (KM)' : 'Distance (MI)';
    document.getElementById('label-speed').innerText = isMetric ? 'Max Speed (KM/H)' : 'Max Speed (MPH)';

    // Re-run calculation if itinerary exists
    if (document.getElementById('itinerary').value.trim()) {
        calculateRoute();
    }
});

document.getElementById('track-btn').addEventListener('click', () => {
    calculateRoute();
    if (window.innerWidth <= 768) {
        toggleSidebar(false);
    }
});

// Mobile Menu Toggle
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebar-overlay');

function toggleSidebar(show) {
    const isActive = show !== undefined ? show : !sidebar.classList.contains('active');
    sidebar.classList.toggle('active', isActive);
    menuToggle.classList.toggle('active', isActive);
    overlay.classList.toggle('active', isActive);
}

menuToggle.addEventListener('click', () => toggleSidebar());
overlay.addEventListener('click', () => toggleSidebar(false));

// Prefill and Run
document.getElementById('itinerary').value = "Hakutaka 569 Tokyo -> Nagano\nKagayaki 536 Nagano -> Tokyo";
setTimeout(() => {
    calculateRoute();
    map.invalidateSize();
}, 500);

// Ensure map handles container size changes
window.addEventListener('resize', () => {
    map.invalidateSize();
});
