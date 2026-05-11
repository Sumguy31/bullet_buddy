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
    "Nagoya": [35.1815, 136.9066],
    "Yokohama": [35.4437, 139.6380],
    "Kobe": [34.6901, 135.1955],
    "Okayama": [34.6551, 133.9195],
    "Hiroshima": [34.3853, 132.4553],
    "Fukuoka": [33.5902, 130.4017],
    "Hakata": [33.5902, 130.4017],
    "Sendai": [38.2682, 140.8694],
    "Morioka": [39.7020, 141.1545],
    "Aomori": [40.8222, 140.7474],
    "Hakodate": [41.7687, 140.7288],
    "Sapporo": [43.0618, 141.3545],
    "Niigata": [37.9161, 139.0364],
    "Kagoshima": [31.5966, 130.5571],
    "Kumamoto": [32.8031, 130.7079]
};

// Top speeds of Shinkansen types (km/h)
const trainSpeeds = {
    "Nozomi": 300,
    "Hikari": 285,
    "Kodama": 285,
    "Mizuho": 300,
    "Sakura": 285,
    "Tsubame": 260,
    "Hayabusa": 320,
    "Hayate": 275,
    "Yamabiko": 275,
    "Nasuno": 275,
    "Komachi": 320,
    "Tsubasa": 275,
    "Kagayaki": 260,
    "Hakutaka": 260,
    "Asama": 260,
    "Tsurugi": 260,
    "Toki": 240,
    "Tanigawa": 240
};

// Default average speed if not found (km/h)
const DEFAULT_SPEED = 240;

// Initialize Map
const map = L.map('map', {
    zoomControl: false // Move zoom control later if needed
}).setView([36.2048, 138.2529], 5); // Center on Japan

L.control.zoom({
    position: 'topright'
}).addTo(map);

// Add tile layer (using CartoDB Dark Matter for simplified high-contrast look)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

let routeLines = [];
let routeMarkers = [];

// Haversine formula to calculate distance between two coordinates in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;  
    const dLon = (lon2 - lon1) * Math.PI / 180; 
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; 
    return d;
}

// Convert km to miles
function kmToMiles(km) {
    return km * 0.621371;
}

function parseItinerary(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const parsed = [];
    
    // Regex to match "TrainName Number CityA -> CityB" or similar variations
    // Example: Hakutaka 569 Tokyo -> Nagano
    const regex = /([A-Za-z]+)\s*(?:\d+)?\s+([A-Za-z]+)\s*(?:->|-|to)\s*([A-Za-z]+)/i;
    
    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            const trainTypeRaw = match[1];
            const trainType = trainTypeRaw.charAt(0).toUpperCase() + trainTypeRaw.slice(1).toLowerCase();
            
            const fromCityRaw = match[2];
            const toCityRaw = match[3];
            const fromCity = fromCityRaw.charAt(0).toUpperCase() + fromCityRaw.slice(1).toLowerCase();
            const toCity = toCityRaw.charAt(0).toUpperCase() + toCityRaw.slice(1).toLowerCase();
            
            parsed.push({
                original: line,
                trainType: trainType,
                from: fromCity,
                to: toCity
            });
        }
    });
    
    return parsed;
}

document.getElementById('track-btn').addEventListener('click', async () => {
    const text = document.getElementById('itinerary').value;
    const segments = parseItinerary(text);
    
    // Clear previous map layers
    routeLines.forEach(line => map.removeLayer(line));
    routeMarkers.forEach(marker => map.removeLayer(marker));
    routeLines = [];
    routeMarkers = [];
    
    const listEl = document.getElementById('parsed-list');
    listEl.innerHTML = '';
    
    if (segments.length === 0) {
        listEl.innerHTML = '<li class="empty-state">No valid routes found. Try format: "Hakutaka Tokyo -> Nagano"</li>';
        resetStats();
        return;
    }

    let totalKm = 0;
    let totalHours = 0;
    let topSpeedKmh = 0;
    let citiesVisited = new Set();
    let allCoordinates = [];

    // Use a regular loop to support async/await for route fetching
    for (let index = 0; index < segments.length; index++) {
        const seg = segments[index];
        // Add to list
        const li = document.createElement('li');
        li.innerHTML = `<strong>${seg.trainType}</strong><span>${seg.from} ➔ ${seg.to}</span>`;
        listEl.appendChild(li);

        const fromCoords = cityCoordinates[seg.from];
        const toCoords = cityCoordinates[seg.to];

        if (fromCoords && toCoords) {
            citiesVisited.add(seg.from);
            citiesVisited.add(seg.to);

            // Speed & Time
            const speedKmh = trainSpeeds[seg.trainType] || DEFAULT_SPEED;
            if (speedKmh > topSpeedKmh) {
                topSpeedKmh = speedKmh;
            }
            
            // Average speed is roughly 65% of top speed due to stops, acceleration, routing
            const avgSpeedKmh = speedKmh * 0.65;

            // Draw on map
            // Use different colors for different segments to make them pop
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const segmentColor = colors[index % colors.length];
            
            // Color code the parsed itinerary list item
            li.style.borderLeftColor = segmentColor;
            
            const latlngs = [fromCoords, toCoords];
            
            try {
                // Fetch route from OSRM to get realistic curved routing across Japan
                // Note: While this uses driving directions as a proxy, roads and railways in Japan heavily parallel each other
                const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromCoords[1]},${fromCoords[0]};${toCoords[1]},${toCoords[0]}?overview=full&geometries=geojson`);
                const data = await response.json();
                
                if (data.routes && data.routes.length > 0) {
                    const geojsonLayer = L.geoJSON(data.routes[0].geometry, {
                        style: {
                            color: segmentColor,
                            weight: 4,
                            opacity: 0.8
                        }
                    }).addTo(map);
                    routeLines.push(geojsonLayer);
                    
                    // Use actual path distance in km
                    const actualDistKm = data.routes[0].distance / 1000;
                    totalKm += actualDistKm;
                    totalHours += (actualDistKm / avgSpeedKmh);
                } else {
                    throw new Error("No route found");
                }
            } catch (e) {
                // Fallback to straight line and haversine distance if routing API fails
                const distKm = calculateDistance(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
                const actualDistKm = distKm * 1.25;
                totalKm += actualDistKm;
                totalHours += (actualDistKm / avgSpeedKmh);

                const polyline = L.polyline(latlngs, {
                    color: segmentColor, 
                    weight: 4, 
                    opacity: 0.8,
                    dashArray: '8, 8',
                    lineJoin: 'round'
                }).addTo(map);
                routeLines.push(polyline);
            }
            
            allCoordinates.push(fromCoords);
            allCoordinates.push(toCoords);
        } else {
            li.style.borderLeftColor = '#ef4444';
            let errorMsg = [];
            if (!fromCoords) errorMsg.push(seg.from);
            if (!toCoords) errorMsg.push(seg.to);
            li.innerHTML += `<span style="color: #ef4444; font-size: 12px; margin-top: 4px;">City not found: ${errorMsg.join(', ')}</span>`;
        }
    }

    // Add markers for all visited cities
    citiesVisited.forEach(city => {
        const coords = cityCoordinates[city];
        if (coords) {
            const marker = L.circleMarker(coords, {
                radius: 6,
                fillColor: "#f8fafc",
                color: "#0f172a",
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            }).bindPopup(`<b style="color: #0f172a; font-family: Inter, sans-serif;">${city}</b>`).addTo(map);
            routeMarkers.push(marker);
        }
    });

    // Fit map bounds with padding
    if (allCoordinates.length > 0) {
        map.fitBounds(allCoordinates, { padding: [50, 50] });
    }

    // Update Stats
    const totalMiles = kmToMiles(totalKm);
    const topSpeedMph = kmToMiles(topSpeedKmh);
    
    animateValue("val-distance", 0, Math.round(totalMiles), 1000, " mi");
    animateValue("val-speed", 0, Math.round(topSpeedMph), 1000, " mph");
    animateValue("val-cities", 0, citiesVisited.size, 1000, "");
    
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);
    document.getElementById('val-time').innerText = `${hours}h ${minutes}m`;
});

function resetStats() {
    document.getElementById('val-distance').innerText = '0 mi';
    document.getElementById('val-time').innerText = '0h 0m';
    document.getElementById('val-speed').innerText = '0 mph';
    document.getElementById('val-cities').innerText = '0';
    map.setView([36.2048, 138.2529], 5);
}

// Simple number animation function
function animateValue(id, start, end, duration, suffix) {
    if (start === end) return;
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Easing out cubic
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentVal = Math.floor(easeProgress * (end - start) + start);
        obj.innerHTML = currentVal + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end + suffix;
        }
    };
    window.requestAnimationFrame(step);
}

// Prefill example
document.getElementById('itinerary').value = "Hakutaka 569 Tokyo -> Nagano\nKagayaki 536 Nagano -> Tokyo";
// Trigger click to show default state after map initializes
setTimeout(() => {
    document.getElementById('track-btn').click();
}, 500);
