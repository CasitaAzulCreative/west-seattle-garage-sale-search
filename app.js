const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const clearButton = document.getElementById("clearButton");
const searchButton = document.getElementById("searchButton");
const viewMapButton = document.getElementById("viewMapButton");
const viewTableButton = document.getElementById("viewTableButton");
const viewCardsButton = document.getElementById("viewCardsButton");
const keywordChips = document.getElementById("keywordChips");
const results = document.getElementById("results");
const mapView = document.getElementById("mapView");
const mapStatus = document.getElementById("mapStatus");
const mapCanvas = document.getElementById("mapCanvas");
const tableView = document.getElementById("tableView");
const resultsTableBody = document.getElementById("resultsTableBody");
const resultSummary = document.getElementById("resultSummary");
const salesCount = document.getElementById("salesCount");
const keywordCount = document.getElementById("keywordCount");
const template = document.getElementById("saleCardTemplate");
const tableSortButtons = [...document.querySelectorAll(".table-sort")];

const GEOCODE_CACHE_KEY = "west-seattle-garage-sale-search:geocodes:v1";
const MAP_RESULT_LIMIT = 40;
const DEFAULT_MAP_CENTER = [47.5715, -122.3862];
const DEFAULT_MAP_ZOOM = 12;
const WEST_SEATTLE_VIEWBOX = "-122.435,47.607,-122.320,47.505";

let sales = [];
let activeKeyword = null;
let allKeywords = [];
let viewMode = "cards";
let tableSort = {
  key: "address",
  direction: "asc",
};
let geocodeCache = loadGeocodeCache();
let mapInstance = null;
let markerLayer = null;
let mapRenderToken = 0;

const normalize = (value) => (value || "").toLowerCase().trim();
const toTitleCase = (value) =>
  (value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function loadGeocodeCache() {
  try {
    const raw = window.localStorage.getItem(GEOCODE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Could not load geocode cache.", error);
    return {};
  }
}

function saveGeocodeCache() {
  try {
    window.localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(geocodeCache));
  } catch (error) {
    console.warn("Could not save geocode cache.", error);
  }
}

function hasCoordinates(value) {
  return Boolean(
    value &&
      Number.isFinite(Number(value.lat)) &&
      Number.isFinite(Number(value.lng))
  );
}

function escapeHtml(value) {
  return (value || "").replace(/[&<>"']/g, (character) => {
    const html = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return html[character] || character;
  });
}

function getSaleLabel(sale) {
  return sale.place_name || sale.address || "Garage Sale";
}

function getMapsUrl(sale) {
  const query = sale.address || sale.place_name || "West Seattle garage sale";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query}, Seattle WA`)}`;
}

function getGeocodeCacheKey(sale) {
  return normalize(`${sale.address}|seattle wa`);
}

function scoreSale(sale, query, keyword) {
  let score = 0;

  if (keyword && sale.keywords.includes(keyword)) {
    score += 40;
  }

  if (!query) {
    return score;
  }

  const fields = {
    place: normalize(sale.place_name),
    address: normalize(sale.address),
    description: normalize(sale.description),
    keywords: normalize(sale.keywords_text),
  };

  if (fields.address.includes(query)) score += 16;
  if (fields.place.includes(query)) score += 18;
  if (fields.keywords.includes(query)) score += 20;
  if (fields.description.includes(query)) score += 8;

  return score;
}

function sortSales(items, mode, query, keyword) {
  const scored = items.map((sale) => ({
    sale,
    score: scoreSale(sale, query, keyword),
  }));

  if (mode === "address") {
    scored.sort((a, b) => a.sale.address.localeCompare(b.sale.address));
  } else if (mode === "place") {
    scored.sort((a, b) =>
      (a.sale.place_name || a.sale.address).localeCompare(
        b.sale.place_name || b.sale.address
      )
    );
  } else {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.sale.address.localeCompare(b.sale.address);
    });
  }

  return scored.map((item) => item.sale);
}

function renderKeywordChips(keywordList) {
  keywordChips.innerHTML = "";

  keywordList.forEach((keyword) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `keyword-chip${activeKeyword === keyword ? " is-active" : ""}`;
    button.textContent = toTitleCase(keyword);
    button.addEventListener("click", () => {
      activeKeyword = activeKeyword === keyword ? null : keyword;
      renderKeywordChips(keywordList);
      renderSales();
    });
    keywordChips.appendChild(button);
  });
}

function saleMatches(sale, query, keyword) {
  if (keyword && !sale.keywords.includes(keyword)) {
    return false;
  }

  if (!query) {
    return true;
  }

  const haystack = normalize(
    [sale.place_name, sale.address, sale.description, sale.keywords_text, ...sale.keywords].join(" ")
  );

  return haystack.includes(query);
}

function setViewMode(nextMode) {
  viewMode = nextMode;
  results.classList.toggle("is-hidden", nextMode !== "cards");
  mapView.classList.toggle("is-hidden", nextMode !== "map");
  tableView.classList.toggle("is-hidden", nextMode !== "table");
  viewCardsButton.classList.toggle("is-active", nextMode === "cards");
  viewMapButton.classList.toggle("is-active", nextMode === "map");
  viewTableButton.classList.toggle("is-active", nextMode === "table");

  if (nextMode === "map") {
    window.requestAnimationFrame(() => {
      if (mapInstance) {
        mapInstance.invalidateSize();
      }
    });
  }
}

function getFilteredAndSortedSales() {
  const query = normalize(searchInput.value);
  const sortMode = sortSelect.value;

  const filtered = sales.filter((sale) => saleMatches(sale, query, activeKeyword));
  const ordered = sortSales(filtered, sortMode, query, activeKeyword);

  return { query, ordered };
}

function sortTableRows(items) {
  const sorted = [...items];
  const direction = tableSort.direction === "asc" ? 1 : -1;
  sorted.sort((left, right) => {
    let a = "";
    let b = "";

    if (tableSort.key === "place") {
      a = left.place_name || left.address;
      b = right.place_name || right.address;
    } else if (tableSort.key === "address") {
      a = left.address;
      b = right.address;
    } else if (tableSort.key === "keywords") {
      a = left.keywords_text;
      b = right.keywords_text;
    } else if (tableSort.key === "description") {
      a = left.description;
      b = right.description;
    }

    return a.localeCompare(b) * direction;
  });
  return sorted;
}

function renderTable(ordered) {
  resultsTableBody.innerHTML = "";
  const sortedRows = sortTableRows(ordered);

  tableSortButtons.forEach((button) => {
    const isActive = button.dataset.sortKey === tableSort.key;
    button.classList.toggle("is-active", isActive);
    button.textContent = isActive
      ? `${button.dataset.sortKey === "place" ? "Place Name" : button.dataset.sortKey.charAt(0).toUpperCase() + button.dataset.sortKey.slice(1)} ${tableSort.direction === "asc" ? "↑" : "↓"}`
      : button.dataset.sortKey === "place"
        ? "Place Name"
        : button.dataset.sortKey.charAt(0).toUpperCase() + button.dataset.sortKey.slice(1);
  });

  if (!sortedRows.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="table-empty" colspan="5">No sales matched that search.</td>`;
    resultsTableBody.appendChild(row);
    return;
  }

  sortedRows.forEach((sale) => {
    const row = document.createElement("tr");
    const keywordHtml = sale.keywords
      .map(
        (keyword) =>
          `<button class="sale-keyword keyword-chip${activeKeyword === keyword ? " is-active" : ""}" type="button" data-keyword="${keyword}">${toTitleCase(keyword)}</button>`
      )
      .join("");

    row.innerHTML = `
      <td class="table-place">${sale.place_name || "—"}</td>
      <td class="table-address">${sale.address || "—"}</td>
      <td><div class="table-keywords">${keywordHtml}</div></td>
      <td>${sale.description || "—"}</td>
      <td><a class="table-map-link" target="_blank" rel="noreferrer" href="${getMapsUrl(sale)}">Open map</a></td>
    `;

    row.querySelectorAll("[data-keyword]").forEach((button) => {
      button.addEventListener("click", () => {
        activeKeyword = button.dataset.keyword;
        renderKeywordChips(allKeywords);
        renderSales();
      });
    });

    resultsTableBody.appendChild(row);
  });
}

function ensureMap() {
  if (!window.L) {
    mapStatus.textContent = "The map library did not load. Please try refreshing the page.";
    return false;
  }

  if (!mapInstance) {
    mapInstance = window.L.map(mapCanvas, {
      zoomControl: true,
      scrollWheelZoom: true,
    });

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapInstance);

    markerLayer = window.L.featureGroup().addTo(mapInstance);
    mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
  }

  return true;
}

function fitMapToMarkers() {
  if (!mapInstance || !markerLayer) {
    return;
  }

  const layers = markerLayer.getLayers();
  if (!layers.length) {
    mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
  } else {
    mapInstance.fitBounds(markerLayer.getBounds().pad(0.2), {
      maxZoom: 15,
    });
  }

  window.requestAnimationFrame(() => {
    mapInstance.invalidateSize();
  });
}

function buildMapPopup(sale) {
  const keywordMarkup = sale.keywords
    .map((keyword) => `<span class="map-popup-keyword">${escapeHtml(toTitleCase(keyword))}</span>`)
    .join("");

  return `
    <div class="map-popup">
      <h3 class="map-popup-title">${escapeHtml(getSaleLabel(sale))}</h3>
      <p class="map-popup-address">${escapeHtml(sale.address || "West Seattle")}</p>
      <p class="map-popup-description">${escapeHtml(sale.description || "No description provided.")}</p>
      <div class="map-popup-keywords">${keywordMarkup}</div>
      <a class="map-popup-link" target="_blank" rel="noreferrer" href="${getMapsUrl(sale)}">Open in Google Maps</a>
    </div>
  `;
}

function addMarkerForSale(sale, coordinates) {
  if (!markerLayer || !hasCoordinates(coordinates)) {
    return false;
  }

  window.L.marker([Number(coordinates.lat), Number(coordinates.lng)])
    .bindPopup(buildMapPopup(sale))
    .addTo(markerLayer);

  return true;
}

async function geocodeSale(sale) {
  const cacheKey = getGeocodeCacheKey(sale);
  const cached = geocodeCache[cacheKey];

  if (hasCoordinates(cached)) {
    return cached;
  }

  if (!sale.address) {
    return null;
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", WEST_SEATTLE_VIEWBOX);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("q", `${sale.address}, Seattle, WA`);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoder returned ${response.status}`);
  }

  const results = await response.json();
  const match = results[0];
  if (!match) {
    return null;
  }

  const coordinates = {
    lat: Number(match.lat),
    lng: Number(match.lon),
  };

  if (!hasCoordinates(coordinates)) {
    return null;
  }

  geocodeCache[cacheKey] = coordinates;
  saveGeocodeCache();
  return coordinates;
}

function getMapStatusText({ mappedCount, visibleCount, totalCount, overflowCount, loadingCount }) {
  const shownLabel =
    overflowCount > 0
      ? `Showing the first ${visibleCount} of ${totalCount} matching sales on the map.`
      : `Showing ${visibleCount} matching sale${visibleCount === 1 ? "" : "s"} on the map.`;

  if (loadingCount > 0) {
    return `${shownLabel} Loading ${loadingCount} more pin${loadingCount === 1 ? "" : "s"}...`;
  }

  const missingCount = visibleCount - mappedCount;
  if (missingCount > 0) {
    return `${shownLabel} ${mappedCount} pin${mappedCount === 1 ? "" : "s"} ready. ${missingCount} address${missingCount === 1 ? "" : "es"} could not be placed automatically.`;
  }

  return `${shownLabel} ${mappedCount} pin${mappedCount === 1 ? "" : "s"} ready.`;
}

async function renderMap(ordered) {
  const renderToken = ++mapRenderToken;

  if (!ensureMap()) {
    return;
  }

  markerLayer.clearLayers();

  const mappableSales = ordered.filter((sale) => Boolean(sale.address));
  if (!mappableSales.length) {
    mapStatus.textContent = ordered.length
      ? "These matching sales do not have addresses to place on the map."
      : "No sales matched that search.";
    fitMapToMarkers();
    return;
  }

  const visibleSales = mappableSales.slice(0, MAP_RESULT_LIMIT);
  const overflowCount = Math.max(0, mappableSales.length - visibleSales.length);
  const pendingSales = [];
  let mappedCount = 0;

  visibleSales.forEach((sale) => {
    const cached = geocodeCache[getGeocodeCacheKey(sale)];
    if (hasCoordinates(cached) && addMarkerForSale(sale, cached)) {
      mappedCount += 1;
    } else {
      pendingSales.push(sale);
    }
  });

  fitMapToMarkers();
  mapStatus.textContent = getMapStatusText({
    mappedCount,
    visibleCount: visibleSales.length,
    totalCount: mappableSales.length,
    overflowCount,
    loadingCount: pendingSales.length,
  });

  let processedPending = 0;
  for (const sale of pendingSales) {
    if (renderToken !== mapRenderToken) {
      return;
    }

    try {
      const coordinates = await geocodeSale(sale);
      if (renderToken !== mapRenderToken) {
        return;
      }

      if (coordinates && addMarkerForSale(sale, coordinates)) {
        mappedCount += 1;
        fitMapToMarkers();
      }
    } catch (error) {
      console.warn(`Could not geocode ${sale.address}.`, error);
    }

    processedPending += 1;
    const loadingCount = Math.max(0, pendingSales.length - processedPending);
    mapStatus.textContent = getMapStatusText({
      mappedCount,
      visibleCount: visibleSales.length,
      totalCount: mappableSales.length,
      overflowCount,
      loadingCount,
    });
  }
}

function renderSales() {
  const { query, ordered } = getFilteredAndSortedSales();

  results.innerHTML = "";

  if (!ordered.length) {
    results.innerHTML = `
      <div class="empty-state">
        No sales matched that search. Try a different keyword, address, or clear the current filter.
      </div>
    `;
    resultSummary.textContent = "0 matching sales";
    renderTable([]);
    if (viewMode === "map") {
      renderMap([]);
    }
    return;
  }

  ordered.forEach((sale) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".sale-card");
    const title = fragment.querySelector(".sale-title");
    const address = fragment.querySelector(".sale-address");
    const description = fragment.querySelector(".sale-description");
    const mapLink = fragment.querySelector(".map-link");
    const keywordWrap = fragment.querySelector(".sale-keywords");

    title.textContent = getSaleLabel(sale);
    address.textContent = sale.address || "West Seattle";
    description.textContent = sale.description;
    mapLink.href = getMapsUrl(sale);

    sale.keywords.forEach((keyword) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "sale-keyword keyword-chip";
      if (activeKeyword === keyword) {
        pill.classList.add("is-active");
      }
      pill.textContent = toTitleCase(keyword);
      pill.addEventListener("click", () => {
        activeKeyword = keyword;
        renderKeywordChips(allKeywords);
        renderSales();
      });
      keywordWrap.appendChild(pill);
    });

    results.appendChild(card);
  });

  const searchLabel = query ? ` for "${searchInput.value.trim()}"` : "";
  const keywordLabel = activeKeyword ? ` in ${toTitleCase(activeKeyword)}` : "";
  resultSummary.textContent = `${ordered.length} matching sales${searchLabel}${keywordLabel}`;
  renderTable(ordered);

  if (viewMode === "map") {
    renderMap(ordered);
  }
}

async function init() {
  const payload = window.GARAGE_SALES_DATA;
  if (!payload) {
    throw new Error("Sale data was not loaded.");
  }

  sales = payload.sales.filter((sale) => !sale.keywords.includes("canceled"));
  allKeywords = payload.keywords
    .map((item) => item.keyword)
    .filter((keyword) => keyword !== "canceled");

  salesCount.textContent = String(sales.length);
  keywordCount.textContent = String(allKeywords.length);

  renderKeywordChips(allKeywords);
  setViewMode("cards");
  renderSales();

  searchInput.addEventListener("input", renderSales);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      renderSales();
    }
  });
  searchButton.addEventListener("click", renderSales);
  viewMapButton.addEventListener("click", () => {
    setViewMode("map");
    renderSales();
  });
  viewTableButton.addEventListener("click", () => {
    setViewMode("table");
    renderSales();
  });
  viewCardsButton.addEventListener("click", () => {
    setViewMode("cards");
    renderSales();
  });
  sortSelect.addEventListener("change", renderSales);
  tableSortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextKey = button.dataset.sortKey;
      if (tableSort.key === nextKey) {
        tableSort.direction = tableSort.direction === "asc" ? "desc" : "asc";
      } else {
        tableSort.key = nextKey;
        tableSort.direction = "asc";
      }
      renderSales();
    });
  });
  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    sortSelect.value = "relevance";
    activeKeyword = null;
    renderKeywordChips(allKeywords);
    tableSort = { key: "address", direction: "asc" };
    renderSales();
  });
}

init().catch((error) => {
  console.error(error);
  resultSummary.textContent = "Could not load sale data.";
  results.innerHTML = `
    <div class="empty-state">
      Something went wrong loading the sale list.
    </div>
  `;
  mapStatus.textContent = "The map could not be loaded.";
});
