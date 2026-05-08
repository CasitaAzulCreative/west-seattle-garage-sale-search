const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const clearButton = document.getElementById("clearButton");
const searchButton = document.getElementById("searchButton");
const viewTableButton = document.getElementById("viewTableButton");
const viewCardsButton = document.getElementById("viewCardsButton");
const keywordChips = document.getElementById("keywordChips");
const results = document.getElementById("results");
const tableView = document.getElementById("tableView");
const resultsTableBody = document.getElementById("resultsTableBody");
const resultSummary = document.getElementById("resultSummary");
const salesCount = document.getElementById("salesCount");
const keywordCount = document.getElementById("keywordCount");
const template = document.getElementById("saleCardTemplate");
const tableSortButtons = [...document.querySelectorAll(".table-sort")];

let sales = [];
let activeKeyword = null;
let allKeywords = [];
let viewMode = "cards";
let tableSort = {
  key: "address",
  direction: "asc",
};

const normalize = (value) => (value || "").toLowerCase().trim();
const toTitleCase = (value) =>
  (value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

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
    scored.sort((a, b) => (a.sale.place_name || a.sale.address).localeCompare(b.sale.place_name || b.sale.address));
  } else {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.sale.address.localeCompare(b.sale.address);
    });
  }

  return scored.map((item) => item.sale);
}

function renderKeywordChips(allKeywords) {
  keywordChips.innerHTML = "";

  allKeywords.forEach((keyword) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `keyword-chip${activeKeyword === keyword ? " is-active" : ""}`;
    button.textContent = toTitleCase(keyword);
    button.addEventListener("click", () => {
      activeKeyword = activeKeyword === keyword ? null : keyword;
      renderKeywordChips(allKeywords);
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
    [
      sale.place_name,
      sale.address,
      sale.description,
      sale.keywords_text,
      ...sale.keywords,
    ].join(" ")
  );

  return haystack.includes(query);
}

function setViewMode(nextMode) {
  viewMode = nextMode;
  results.classList.toggle("is-hidden", nextMode !== "cards");
  tableView.classList.toggle("is-hidden", nextMode !== "table");
  viewCardsButton.classList.toggle("is-active", nextMode === "cards");
  viewTableButton.classList.toggle("is-active", nextMode === "table");
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
      <td><a class="table-map-link" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sale.address}, Seattle WA`)}">Open map</a></td>
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

    title.textContent = sale.place_name || sale.address;
    address.textContent = sale.address;
    description.textContent = sale.description;
    mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sale.address}, Seattle WA`)}`;

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
});
