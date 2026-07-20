const FUEL_COLORS = { e5: "#C98A00", e10: "#0E7C7B", diesel: "#2B2E33" };
const FUEL_LABELS = { e5: "Super E5", e10: "Super E10", diesel: "Diesel" };

let cityChart = null;
let trendChart = null;
let latestData = null;
let historyEntries = [];
let activeFuel = "e5";
let activeRange = "48h";

const RANGE_HOURS = { "48h": 48, "7d": 24 * 7, "all": null };

function filterByRange(entries, range) {
  const hours = RANGE_HOURS[range];
  if (!hours) return entries;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Konnte ${path} nicht laden (${res.status})`);
  return res.json();
}

function formatPrice(price) {
  if (price === null || price === undefined) return "– , – –";
  const [whole, decimals = ""] = price.toFixed(3).split(".");
  const main = decimals.slice(0, 2);
  const last = decimals.slice(2, 3);
  return `${whole},${main}<span class="decimal-last">${last}</span>`;
}

function renderTotems(national) {
  document.querySelectorAll(".totem__price").forEach((el) => {
    const fuel = el.dataset.price;
    el.innerHTML = formatPrice(national ? national[fuel] : null);
  });
}

function renderUpdatedAt(isoString) {
  const el = document.getElementById("updated-at");
  if (!isoString) {
    el.textContent = "noch keine Daten";
    return;
  }
  const date = new Date(isoString);
  const formatted = date.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  el.textContent = `Stand: ${formatted} Uhr`;
}

function renderCityChart(cities, fuel) {
  const rows = cities
    .filter((c) => c[fuel] !== null && c[fuel] !== undefined)
    .sort((a, b) => a[fuel] - b[fuel]);

  const ctx = document.getElementById("city-chart");
  const config = {
    type: "bar",
    data: {
      labels: rows.map((c) => c.name),
      datasets: [
        {
          label: FUEL_LABELS[fuel],
          data: rows.map((c) => c[fuel]),
          backgroundColor: FUEL_COLORS[fuel],
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => `${item.formattedValue} €/L`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "#D8D2C4" },
          ticks: {
            callback: (v) => v.toFixed(2).replace(".", ","),
            font: { family: "IBM Plex Mono" },
          },
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: "Inter" } },
        },
      },
    },
  };

  if (cityChart) {
    cityChart.data = config.data;
    cityChart.update();
  } else {
    cityChart = new Chart(ctx, config);
  }
}

function renderTrendChart(entries, range = "48h") {
  const labelOptions =
    range === "48h"
      ? { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit" }
      : { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };

  const labels = entries.map((e) => new Date(e.timestamp).toLocaleString("de-DE", labelOptions));

  const datasets = Object.keys(FUEL_LABELS).map((fuel) => ({
    label: FUEL_LABELS[fuel],
    data: entries.map((e) => e[fuel]),
    borderColor: FUEL_COLORS[fuel],
    backgroundColor: FUEL_COLORS[fuel],
    tension: 0.25,
    pointRadius: 0,
    borderWidth: 2,
  }));

  const ctx = document.getElementById("trend-chart");
  const config = {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { font: { family: "Inter" } } },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.formattedValue} €/L`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 8, font: { family: "IBM Plex Mono" } },
        },
        y: {
          grid: { color: "#D8D2C4" },
          ticks: {
            callback: (v) => v.toFixed(2).replace(".", ","),
            font: { family: "IBM Plex Mono" },
          },
        },
      },
    },
  };

  if (trendChart) {
    trendChart.data = config.data;
    trendChart.update();
  } else {
    trendChart = new Chart(ctx, config);
  }
}

function setupFuelToggle(cities) {
  document.querySelectorAll('[data-fuel].fuel-toggle__btn').forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".fuel-toggle");
      group.querySelectorAll(".fuel-toggle__btn").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      activeFuel = btn.dataset.fuel;
      renderCityChart(cities, activeFuel);
    });
  });
}

function setupRangeToggle() {
  document.querySelectorAll('[data-range].fuel-toggle__btn').forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".fuel-toggle");
      group.querySelectorAll(".fuel-toggle__btn").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      activeRange = btn.dataset.range;
      renderTrendChart(filterByRange(historyEntries, activeRange), activeRange);
    });
  });
}

async function init() {
  try {
    const [latest, history] = await Promise.all([
      loadJSON("data/latest.json"),
      loadJSON("data/history.json"),
    ]);
    latestData = latest;

    const hasData = latest.updated_at && latest.cities && latest.cities.length > 0;
    document.getElementById("empty-state").hidden = hasData;

    renderUpdatedAt(latest.updated_at);
    renderTotems(latest.national_average);

    if (hasData) {
      renderCityChart(latest.cities, activeFuel);
      setupFuelToggle(latest.cities);
    }

    historyEntries = history.entries || [];
    if (historyEntries.length > 0) {
      renderTrendChart(filterByRange(historyEntries, activeRange), activeRange);
      setupRangeToggle();
    }
  } catch (err) {
    console.error(err);
    document.getElementById("updated-at").textContent = "Fehler beim Laden der Daten";
  }
}

init();
