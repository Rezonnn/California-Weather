// ===== CONFIG: California cities (lat, lon) =====
const CA_CITIES = [
  { name: "San Diego, CA", lat: 32.7157, lon: -117.1611 },
  { name: "Los Angeles, CA", lat: 34.0522, lon: -118.2437 },
  { name: "San Francisco, CA", lat: 37.7749, lon: -122.4194 },
  { name: "San Jose, CA", lat: 37.3382, lon: -121.8863 },
  { name: "Sacramento, CA", lat: 38.5816, lon: -121.4944 },
  { name: "Fresno, CA", lat: 36.7378, lon: -119.7871 },
  { name: "Irvine, CA", lat: 33.6846, lon: -117.8265 },
  { name: "Santa Barbara, CA", lat: 34.4208, lon: -119.6982 },
  { name: "Palm Springs, CA", lat: 33.8303, lon: -116.5453 }
];

// Global state
const state = {
  unit: "C", // "C" or "F"
  city: null,
  weather: null // raw API response
};

// DOM refs
const citySelect = document.getElementById("city-select");
const citySearch = document.getElementById("city-search");
const unitToggle = document.getElementById("unit-toggle");

const currentLocationEl = document.getElementById("current-location");
const currentDescriptionEl = document.getElementById("current-description");
const currentUpdatedEl = document.getElementById("current-updated");
const currentTempEl = document.getElementById("current-temp");
const currentFeelsEl = document.getElementById("current-feels");
const currentHighLowEl = document.getElementById("current-high-low");
const currentHumidityEl = document.getElementById("current-humidity");
const currentWindEl = document.getElementById("current-wind");
const currentUvEl = document.getElementById("current-uv");
const currentSunriseSunsetEl = document.getElementById("current-sunrise-sunset");
const currentIconEl = document.getElementById("current-icon");

const hourlyStripEl = document.getElementById("hourly-strip");
const dailyGridEl = document.getElementById("daily-grid");
const detailsEl = document.getElementById("details");
const errorBarEl = document.getElementById("error-bar");

// ===== Helpers =====
function cToF(c) {
  return c * 9 / 5 + 32;
}

function formatTemp(tempC) {
  if (tempC == null || Number.isNaN(tempC)) return "--";
  const val = state.unit === "C" ? tempC : cToF(tempC);
  return Math.round(val) + "°" + state.unit;
}

function formatSpeed(kmh) {
  if (kmh == null) return "--";
  // API default is km/h; use mph if unit=F to feel more "US"
  if (state.unit === "F") {
    const mph = kmh * 0.621371;
    return Math.round(mph) + " mph";
  }
  return Math.round(kmh) + " km/h";
}

function formatPercent(val) {
  if (val == null) return "--";
  return val + "%";
}

function formatTimeLabel(isoString) {
  const d = new Date(isoString);
  const hours = d.getHours();
  const label = hours === 0
    ? "12 AM"
    : hours < 12
      ? `${hours} AM`
      : hours === 12
        ? "12 PM"
        : `${hours - 12} PM`;
  return label;
}

function formatDayName(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function formatFullDateTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

// Map Open-Meteo weather_code to icon + description
function getWeatherInfo(code) {
  if (code == null) {
    return { icon: "❓", text: "Unknown" };
  }
  if (code === 0) return { icon: "☀️", text: "Clear sky" };
  if ([1, 2].includes(code)) return { icon: "🌤️", text: "Mostly clear" };
  if (code === 3) return { icon: "☁️", text: "Cloudy" };
  if ([45, 48].includes(code)) return { icon: "🌫️", text: "Foggy" };
  if ([51, 53, 55, 56, 57].includes(code))
    return { icon: "🌦️", text: "Drizzle" };
  if ([61, 63, 65, 80, 81, 82].includes(code))
    return { icon: "🌧️", text: "Rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return { icon: "🌨️", text: "Snow" };
  if ([95, 96, 99].includes(code))
    return { icon: "⛈️", text: "Thunderstorm" };
  return { icon: "❓", text: "Unknown" };
}

function showError(message) {
  errorBarEl.textContent = message;
  errorBarEl.classList.remove("hidden");
}

function clearError() {
  errorBarEl.classList.add("hidden");
}

// ===== Fetch weather from Open-Meteo =====
//
// We ask for:
// - current: temperature, feels, humidity, wind, UV, code
// - hourly: temp, feels, code, humidity, precip probability, wind
// - daily: code, max/min temp, sunrise/sunset, precip prob max, UV
//
async function fetchWeatherForCity(city) {
  const { lat, lon } = city;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("timezone", "auto");

  // current
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "wind_speed_10m",
      "uv_index",
      "weather_code"
    ].join(",")
  );

  // hourly
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "wind_speed_10m",
      "precipitation_probability",
      "weather_code"
    ].join(",")
  );

  // daily
  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "sunrise",
      "sunset",
      "uv_index_max",
      "precipitation_probability_max"
    ].join(",")
  );

  // leave units as default: °C, km/h, mm
  try {
    clearError();
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    state.city = city;
    state.weather = data;
    renderAll();
  } catch (err) {
    console.error("Weather API error:", err);
    showError("Could not load weather data. Please try again in a moment.");
  }
}

// ===== Rendering =====
function renderAll() {
  if (!state.weather || !state.city) return;
  renderCurrent();
  renderHourly();
  renderDaily();
  renderDetailsInitial();
}

function renderCurrent() {
  const w = state.weather;
  const c = w.current || {};
  const daily = w.daily || {};

  currentLocationEl.textContent = state.city.name;

  const weatherInfo = getWeatherInfo(c.weather_code);
  currentDescriptionEl.textContent = weatherInfo.text;

  // Updated time: use current.time if provided, else now
  if (c.time) {
    currentUpdatedEl.textContent = `Updated ${formatFullDateTime(c.time)}`;
  } else {
    currentUpdatedEl.textContent = "";
  }

  currentTempEl.textContent =
    c.temperature_2m != null ? Math.round(state.unit === "C" ? c.temperature_2m : cToF(c.temperature_2m)) : "--";

  currentFeelsEl.textContent =
    c.apparent_temperature != null ? formatTemp(c.apparent_temperature) : "--";

  // Take today's high/low from first daily entry if available
  if (
    daily.temperature_2m_max &&
    daily.temperature_2m_min &&
    daily.temperature_2m_max.length > 0
  ) {
    const highC = daily.temperature_2m_max[0];
    const lowC = daily.temperature_2m_min[0];
    currentHighLowEl.textContent = `${formatTemp(highC)} / ${formatTemp(lowC)}`;
  } else {
    currentHighLowEl.textContent = "--";
  }

  currentHumidityEl.textContent =
    c.relative_humidity_2m != null ? formatPercent(c.relative_humidity_2m) : "--";

  currentWindEl.textContent =
    c.wind_speed_10m != null ? formatSpeed(c.wind_speed_10m) : "--";

  currentUvEl.textContent =
    c.uv_index != null ? c.uv_index.toFixed(1) : daily.uv_index_max
      ? daily.uv_index_max[0].toFixed(1)
      : "--";

  // Sunrise / sunset: from first daily entry
  if (daily.sunrise && daily.sunset && daily.sunrise.length > 0) {
    const sunrise = new Date(daily.sunrise[0]).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
    const sunset = new Date(daily.sunset[0]).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
    currentSunriseSunsetEl.textContent = `${sunrise} / ${sunset}`;
  } else {
    currentSunriseSunsetEl.textContent = "--";
  }

  currentIconEl.textContent = weatherInfo.icon;
}

function renderHourly() {
  hourlyStripEl.innerHTML = "";
  const w = state.weather;
  if (!w.hourly || !w.hourly.time) {
    hourlyStripEl.textContent = "No hourly data.";
    return;
  }

  const { time, temperature_2m, apparent_temperature, weather_code, relative_humidity_2m, wind_speed_10m, precipitation_probability } =
    w.hourly;

  const now = Date.now();

  // Take next ~24 hours from current time
  const cards = [];
  for (let i = 0; i < time.length; i++) {
    const t = new Date(time[i]).getTime();
    if (t < now) continue;
    cards.push(i);
    if (cards.length >= 24) break;
  }
  if (cards.length === 0) {
    hourlyStripEl.textContent = "No upcoming hourly data.";
    return;
  }

  cards.forEach((idx, i) => {
    const card = document.createElement("div");
    card.className = "hour-card";
    if (i === 0) card.classList.add("active");
    card.dataset.index = idx;

    const info = getWeatherInfo(weather_code ? weather_code[idx] : null);

    const timeEl = document.createElement("div");
    timeEl.className = "hour-card-time";
    timeEl.textContent = formatTimeLabel(time[idx]);

    const iconEl = document.createElement("div");
    iconEl.className = "hour-card-icon";
    iconEl.textContent = info.icon;

    const tempEl = document.createElement("div");
    tempEl.className = "hour-card-temp";
    const tC = temperature_2m ? temperature_2m[idx] : null;
    tempEl.textContent = formatTemp(tC);

    card.appendChild(timeEl);
    card.appendChild(iconEl);
    card.appendChild(tempEl);

    card.addEventListener("click", () => {
      document
        .querySelectorAll(".hour-card")
        .forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      renderHourlyDetails(idx);
    });

    hourlyStripEl.appendChild(card);
  });

  // Show first card details initially
  renderHourlyDetails(cards[0]);
}

function renderHourlyDetails(idx) {
  const h = state.weather.hourly;
  const info = getWeatherInfo(h.weather_code ? h.weather_code[idx] : null);
  const timeLabel = formatFullDateTime(h.time[idx]);
  const temp = h.temperature_2m ? formatTemp(h.temperature_2m[idx]) : "--";
  const feels = h.apparent_temperature
    ? formatTemp(h.apparent_temperature[idx])
    : "--";
  const humidity = h.relative_humidity_2m
    ? formatPercent(h.relative_humidity_2m[idx])
    : "--";
  const wind = h.wind_speed_10m ? formatSpeed(h.wind_speed_10m[idx]) : "--";
  const precipProb =
    h.precipitation_probability && h.precipitation_probability[idx] != null
      ? formatPercent(h.precipitation_probability[idx])
      : "--";

  detailsEl.innerHTML = `
    <p><strong>Hourly details</strong></p>
    <p>${timeLabel}</p>
    <p>${info.icon} <strong>${info.text}</strong></p>
    <p>Temperature: <strong>${temp}</strong> &nbsp;·&nbsp; Feels like: <strong>${feels}</strong></p>
    <p>Humidity: <strong>${humidity}</strong> &nbsp;·&nbsp; Wind: <strong>${wind}</strong> &nbsp;·&nbsp; Precipitation chance: <strong>${precipProb}</strong></p>
  `;
}

function renderDaily() {
  dailyGridEl.innerHTML = "";
  const d = state.weather.daily;
  if (!d || !d.time) {
    dailyGridEl.textContent = "No daily data.";
    return;
  }

  for (let i = 0; i < d.time.length && i < 7; i++) {
    const card = document.createElement("div");
    card.className = "day-card";
    card.dataset.index = i;

    const info = getWeatherInfo(d.weather_code ? d.weather_code[i] : null);

    const main = document.createElement("div");
    main.className = "day-card-main";

    const iconEl = document.createElement("div");
    iconEl.className = "day-icon";
    iconEl.textContent = info.icon;

    const textBlock = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "day-name";
    nameEl.textContent = i === 0 ? "Today" : formatDayName(d.time[i]);

    const descEl = document.createElement("div");
    descEl.className = "day-desc";
    descEl.textContent = info.text;

    textBlock.appendChild(nameEl);
    textBlock.appendChild(descEl);

    main.appendChild(iconEl);
    main.appendChild(textBlock);

    const temps = document.createElement("div");
    temps.className = "day-temps";
    const highC = d.temperature_2m_max ? d.temperature_2m_max[i] : null;
    const lowC = d.temperature_2m_min ? d.temperature_2m_min[i] : null;
    const highEl = document.createElement("span");
    highEl.className = "high";
    highEl.textContent = highC != null ? formatTemp(highC) : "--";
    const lowEl = document.createElement("span");
    lowEl.className = "low";
    lowEl.textContent = lowC != null ? formatTemp(lowC) : "--";
    temps.appendChild(highEl);
    temps.appendChild(lowEl);

    const extra = document.createElement("div");
    extra.className = "day-extra";
    const precip = d.precipitation_probability_max
      ? d.precipitation_probability_max[i]
      : null;
    const uv = d.uv_index_max ? d.uv_index_max[i] : null;
    extra.textContent = `Rain: ${
      precip != null ? precip + "%" : "--"
    } · UV: ${uv != null ? uv.toFixed(1) : "--"}`;

    card.appendChild(main);
    card.appendChild(temps);
    card.appendChild(extra);

    card.addEventListener("click", () => {
      renderDailyDetails(i);
    });

    dailyGridEl.appendChild(card);
  }
}

function renderDailyDetails(idx) {
  const d = state.weather.daily;
  const info = getWeatherInfo(d.weather_code ? d.weather_code[idx] : null);
  const dateLabel = new Date(d.time[idx]).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  const high = d.temperature_2m_max ? formatTemp(d.temperature_2m_max[idx]) : "--";
  const low = d.temperature_2m_min ? formatTemp(d.temperature_2m_min[idx]) : "--";
  const precip = d.precipitation_probability_max
    ? formatPercent(d.precipitation_probability_max[idx])
    : "--";
  const uv = d.uv_index_max ? d.uv_index_max[idx].toFixed(1) : "--";

  let sunrise = "--";
  let sunset = "--";
  if (d.sunrise && d.sunset) {
    sunrise = new Date(d.sunrise[idx]).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
    sunset = new Date(d.sunset[idx]).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  detailsEl.innerHTML = `
    <p><strong>Daily outlook</strong></p>
    <p>${dateLabel}</p>
    <p>${info.icon} <strong>${info.text}</strong></p>
    <p>High: <strong>${high}</strong> · Low: <strong>${low}</strong></p>
    <p>Chance of precipitation: <strong>${precip}</strong> · UV max: <strong>${uv}</strong></p>
    <p>Sunrise: <strong>${sunrise}</strong> · Sunset: <strong>${sunset}</strong></p>
  `;
}

function renderDetailsInitial() {
  detailsEl.textContent =
    "Tap or click on an hour or a day to explore detailed weather for that time.";
}

// ===== City dropdown + search =====
function populateCitySelect(filterText = "") {
  const text = filterText.toLowerCase();
  citySelect.innerHTML = "";

  CA_CITIES.filter(c => c.name.toLowerCase().includes(text)).forEach(city => {
    const opt = document.createElement("option");
    opt.value = city.name;
    opt.textContent = city.name;
    citySelect.appendChild(opt);
  });

  // If current city not in filtered list, fallback to first
  if (citySelect.options.length > 0) {
    const selected = [...CA_CITIES].find(
      c => c.name === state.city?.name
    );
    if (
      selected &&
      [...citySelect.options].some(o => o.value === selected.name)
    ) {
      citySelect.value = selected.name;
    } else {
      citySelect.value = citySelect.options[0].value;
    }
  }
}

// ===== Event listeners =====
citySearch.addEventListener("input", () => {
  populateCitySelect(citySearch.value);
  const selectedCity = CA_CITIES.find(c => c.name === citySelect.value);
  if (selectedCity) {
    fetchWeatherForCity(selectedCity);
  }
});

citySelect.addEventListener("change", () => {
  const selectedCity = CA_CITIES.find(c => c.name === citySelect.value);
  if (selectedCity) {
    fetchWeatherForCity(selectedCity);
  }
});

unitToggle.addEventListener("click", () => {
  state.unit = state.unit === "C" ? "F" : "C";
  unitToggle.textContent = "°" + state.unit;
  if (state.weather) {
    renderAll(); // re-render with new units
  }
});

// ===== Initial load =====
(function init() {
  // Default city: San Diego
  state.city = CA_CITIES[0];
  populateCitySelect();
  unitToggle.textContent = "°" + state.unit;
  fetchWeatherForCity(state.city);
})();
