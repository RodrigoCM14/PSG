import { api, ensureSession, renderSessionBadge } from "./session.js";

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  listReply: document.querySelector("#listReply"),
  listForm: document.querySelector("#listForm"),
  listNameInput: document.querySelector("#listNameInput"),
  listCategoryInput: document.querySelector("#listCategoryInput"),
  listAliasesInput: document.querySelector("#listAliasesInput"),
  listStartInput: document.querySelector("#listStartInput"),
  listDueInput: document.querySelector("#listDueInput"),
  listNotesInput: document.querySelector("#listNotesInput"),
  globalSearchInput: document.querySelector("#globalSearchInput"),
  globalSearchResults: document.querySelector("#globalSearchResults"),
  listFilterInput: document.querySelector("#listFilterInput"),
  listSortInput: document.querySelector("#listSortInput"),
  listsSummary: document.querySelector("#listsSummary"),
  listsBoard: document.querySelector("#listsBoard"),
  deletedListsBoard: document.querySelector("#deletedListsBoard"),
  templateActions: document.querySelector(".template-actions")
};

let lists = [];
let deletedLists = [];
let appState = {};

await ensureSession();
renderSessionBadge(document.querySelector(".topnav"));

els.refreshButton.addEventListener("click", refresh);
els.listForm.addEventListener("submit", createList);
els.globalSearchInput.addEventListener("input", renderSearch);
els.listFilterInput.addEventListener("change", render);
els.listSortInput.addEventListener("change", render);
els.templateActions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-template]");
  if (button) createTemplate(button.dataset.template);
});
refresh();

async function refresh() {
  const state = await api("/api/state");
  appState = state;
  lists = state.lists || [];
  deletedLists = state.deletedLists || [];
  render();
}

async function createList(event) {
  event.preventDefault();
  await api("/api/lists", {
    method: "POST",
    body: {
      name: els.listNameInput.value,
      category: normalize(els.listCategoryInput.value || "general"),
      aliases: splitAliases(els.listAliasesInput.value),
      startDate: els.listStartInput.value,
      dueDate: els.listDueInput.value,
      notes: els.listNotesInput.value
    }
  });
  els.listForm.reset();
  els.listReply.textContent = "Lista creada.";
  await refresh();
}

async function createTemplate(template) {
  await api(`/api/lists/templates/${template}`, {
    method: "POST",
    body: { notes: "Creada desde plantilla" }
  });
  els.listReply.textContent = "Plantilla creada.";
  await refresh();
}

function render() {
  const visibleLists = applyListView(lists);
  const open = lists.filter((list) => list.status !== "done");
  const activeItems = lists.flatMap((list) => (list.items || []).filter((item) => !item.deletedAt));
  const doneItems = activeItems.filter((item) => item.done).length;
  const totalItems = activeItems.length;
  const unratedMedia = lists.flatMap((list) => isMediaList(list) ? (list.items || []).filter((item) => !item.deletedAt && !item.rating) : []).length;

  els.listsSummary.innerHTML = `
    <div class="summary-total">
      <strong>${lists.length} listas</strong>
      <span>${open.length} activas</span>
    </div>
    <div class="summary-chips">
      <span class="summary-chip">Items <strong>${doneItems}/${totalItems}</strong></span>
      <span class="summary-chip">Completadas <strong>${lists.length - open.length}</strong></span>
      <span class="summary-chip">Sin puntaje <strong>${unratedMedia}</strong></span>
    </div>
  `;

  els.listsBoard.innerHTML = visibleLists.length ? visibleLists.map(renderList).join("") : '<div class="empty">No hay listas con ese filtro.</div>';
  els.deletedListsBoard.innerHTML = deletedLists.length ? deletedLists.map(renderDeletedList).join("") : '<div class="empty">No hay listas eliminadas.</div>';
  renderTemplateActions();
  bindActions();
  bindDeletedActions();
  renderSearch();
}

function renderTemplateActions() {
  const defaults = ["viaje", "mudanza", "botiquin", "tramites"];
  const custom = Object.keys(appState.customListTemplates || {});
  els.templateActions.innerHTML = [...defaults, ...custom]
    .map((key) => `<button type="button" data-template="${escapeHtml(key)}">${escapeHtml(titleCase(key))}</button>`)
    .join("");
}

function renderList(list) {
  const items = sortedItems(list);
  const done = items.filter((item) => item.done).length;
  const isDone = list.status === "done";
  const isMedia = isMediaList(list);
  return `
    <section class="list-card ${isDone ? "settled-row" : ""} ${isMedia ? "media-list-card" : ""}" data-list-id="${escapeHtml(list.id)}">
      <div class="list-card-head">
        <div>
          <span class="category-pill">${escapeHtml(titleCase(list.category || "General"))}</span>
          <h3>${escapeHtml(list.name)}</h3>
          <p>${escapeHtml(dateRange(list))}</p>
          ${(list.aliases || []).length ? `<p class="list-aliases">WhatsApp: ${escapeHtml((list.aliases || []).join(", "))}</p>` : ""}
        </div>
        <div class="list-card-actions">
          <select data-list-status ${isDone ? "disabled" : ""}>
            <option value="open" ${list.status === "open" ? "selected" : ""}>Abierta</option>
            <option value="paused" ${list.status === "paused" ? "selected" : ""}>Pausada</option>
            <option value="done" ${list.status === "done" ? "selected" : ""}>Completada</option>
          </select>
          <button class="icon-danger" type="button" data-delete-list aria-label="Eliminar ${escapeHtml(list.name)}">x</button>
        </div>
      </div>
      ${list.notes ? `<p class="list-notes">${escapeHtml(list.notes)}</p>` : ""}
      <div class="progress-line"><span style="width: ${items.length ? Math.round((done / items.length) * 100) : 0}%"></span></div>
      <div class="list-items">
        ${items.map((item) => `
          <label class="todo-item ${isMedia ? "media-todo-item" : ""}">
            ${isMedia && item.posterPath ? `<img class="media-poster" src="${escapeHtml(item.posterPath)}" alt="">` : ""}
            <input type="checkbox" data-item-id="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} ${isDone ? "disabled" : ""}>
            <span>
              ${escapeHtml(item.title)}
              ${isMedia && mediaByline(item) ? `<em>${escapeHtml(mediaByline(item))}</em>` : ""}
            </span>
            ${isMedia ? renderMediaControls(item, isDone) : `<small class="priority-pill priority-${escapeHtml(item.priority || "normal")}">${escapeHtml(titleCase(item.priority || "normal"))}</small>`}
            ${isDone ? "" : `<button class="icon-danger" type="button" data-delete-item="${escapeHtml(item.id)}" aria-label="Quitar ${escapeHtml(item.title)}">x</button>`}
          </label>
        `).join("")}
      </div>
      <form class="add-item-form ${isMedia ? "media-add-item-form" : ""}" ${isDone ? "hidden" : ""}>
        <input placeholder="${isMedia ? "Titulo" : "Nuevo item"}" required>
        <select aria-label="${isMedia ? "Puntaje" : "Prioridad"}" data-add-meta>
          ${isMedia ? ratingOptions() : `
          <option value="normal">Normal</option>
          <option value="alta">Alta</option>
          <option value="baja">Baja</option>
          `}
        </select>
        ${isMedia ? `
          <input data-add-platform placeholder="Plataforma">
          <input data-add-recommended placeholder="Recomendado por">
          <select data-add-status aria-label="Estado">
            <option value="pendiente">Pendiente</option>
            <option value="viendo">Viendo</option>
            <option value="vista">Vista</option>
            <option value="descartada">Descartada</option>
          </select>
        ` : ""}
        <button type="submit">Agregar</button>
      </form>
      <button class="ghost-button save-template-button" type="button" data-save-template>Guardar como plantilla</button>
    </section>
  `;
}

function renderDeletedList(list) {
  return `
    <section class="list-card settled-row" data-deleted-list-id="${escapeHtml(list.id)}">
      <div class="list-card-head">
        <div>
          <span class="category-pill">${escapeHtml(titleCase(list.category || "General"))}</span>
          <h3>${escapeHtml(list.name)}</h3>
          <p>Eliminada ${escapeHtml(formatDate(list.deletedAt || ""))}</p>
        </div>
        <button type="button" data-restore-list>Restaurar</button>
      </div>
    </section>
  `;
}

function bindActions() {
  for (const card of els.listsBoard.querySelectorAll("[data-list-id]")) {
    const listId = card.dataset.listId;
    card.querySelector("[data-list-status]").addEventListener("change", async (event) => {
      await api(`/api/lists/${listId}`, { method: "PATCH", body: { status: event.target.value } });
      await refresh();
    });

    card.querySelector(".add-item-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector("input");
      const list = lists.find((candidate) => candidate.id === listId);
      const meta = event.currentTarget.querySelector("[data-add-meta]").value;
      const body = isMediaList(list)
        ? {
            title: input.value,
            rating: meta,
            platform: event.currentTarget.querySelector("[data-add-platform]").value,
            recommendedBy: event.currentTarget.querySelector("[data-add-recommended]").value,
            mediaStatus: event.currentTarget.querySelector("[data-add-status]").value
          }
        : { title: input.value, priority: meta };
      await api(`/api/lists/${listId}/items`, { method: "POST", body });
      event.currentTarget.reset();
      await refresh();
    });

    for (const checkbox of card.querySelectorAll("[data-item-id]")) {
      checkbox.addEventListener("change", async (event) => {
        await api(`/api/lists/${listId}/items/${event.target.dataset.itemId}`, {
          method: "PATCH",
          body: { done: event.target.checked }
        });
        await refresh();
      });
    }

    for (const button of card.querySelectorAll("[data-delete-item]")) {
      button.addEventListener("click", async (event) => {
        await api(`/api/lists/${listId}/items/${event.currentTarget.dataset.deleteItem}`, { method: "DELETE" });
        await refresh();
      });
    }

    for (const select of card.querySelectorAll("[data-rating-item]")) {
      select.addEventListener("change", async (event) => {
        await api(`/api/lists/${listId}/items/${event.currentTarget.dataset.ratingItem}`, {
          method: "PATCH",
          body: { rating: event.currentTarget.value }
        });
        await refresh();
      });
    }

    for (const select of card.querySelectorAll("[data-media-status-item]")) {
      select.addEventListener("change", async (event) => {
        await api(`/api/lists/${listId}/items/${event.currentTarget.dataset.mediaStatusItem}`, {
          method: "PATCH",
          body: { mediaStatus: event.currentTarget.value }
        });
        await refresh();
      });
    }

    card.querySelector("[data-delete-list]").addEventListener("click", async () => {
      const list = lists.find((candidate) => candidate.id === listId);
      if (!confirm(`Eliminar la lista "${list?.name || "seleccionada"}"?`)) return;
      await api(`/api/lists/${listId}`, { method: "DELETE" });
      els.listReply.textContent = "Lista eliminada.";
      await refresh();
    });

    card.querySelector("[data-save-template]").addEventListener("click", async () => {
      const list = lists.find((candidate) => candidate.id === listId);
      const name = prompt("Nombre de la plantilla", list?.name || "");
      if (!name) return;
      await api(`/api/lists/${listId}/template`, { method: "POST", body: { name } });
      els.listReply.textContent = "Plantilla guardada.";
    });
  }
}

function bindDeletedActions() {
  for (const card of els.deletedListsBoard.querySelectorAll("[data-deleted-list-id]")) {
    const listId = card.dataset.deletedListId;
    card.querySelector("[data-restore-list]").addEventListener("click", async () => {
      await api(`/api/lists/${listId}/restore`, { method: "POST" });
      els.listReply.textContent = "Lista restaurada.";
      await refresh();
    });
  }
}

function dateRange(list) {
  const start = list.startDate ? formatDate(list.startDate) : "Sin inicio";
  const due = list.dueDate ? formatDate(list.dueDate) : "Sin fecha limite";
  return `${start} - ${due}`;
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "-");
}

function splitAliases(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function priorityRank(value) {
  return { alta: 0, normal: 1, baja: 2 }[value] ?? 1;
}

function applyListView(source) {
  const filter = els.listFilterInput.value;
  const sort = els.listSortInput.value;
  let output = [...source];
  if (filter === "pending") output = output.filter((list) => sortedItems(list).some((item) => !item.done));
  if (filter === "done") output = output.filter((list) => list.status === "done");
  if (filter === "top-rated") output = output.filter(isMediaList);
  if (filter === "peliculas" || filter === "series" || filter === "anime") output = output.filter((list) => normalize(list.category) === filter);
  if (sort === "rating" || filter === "top-rated") output.sort((a, b) => averageRating(b) - averageRating(a));
  else if (sort === "name") output.sort((a, b) => a.name.localeCompare(b.name));
  else output.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  return output;
}

function sortedItems(list) {
  const items = (list.items || []).filter((item) => !item.deletedAt);
  if (isMediaList(list)) {
    return items.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || String(a.title).localeCompare(String(b.title)));
  }
  return items.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || Number(a.order || 0) - Number(b.order || 0));
}

function averageRating(list) {
  const ratings = (list.items || []).filter((item) => !item.deletedAt && item.rating).map((item) => Number(item.rating));
  return ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
}

function isMediaList(list) {
  return ["peliculas", "series", "anime"].includes(normalize(list?.category || ""));
}

function renderMediaControls(item, disabled) {
  const rating = normalizeRating(item.rating);
  return `
    <span class="star-rating" aria-label="Puntaje ${rating || "sin puntaje"}">${starsFor(rating)}</span>
    <select class="rating-select" data-rating-item="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""} aria-label="Puntaje de ${escapeHtml(item.title)}">
      ${ratingOptions(rating)}
    </select>
    <small class="media-chip">${escapeHtml(item.platform || "Sin plataforma")}</small>
    <small class="media-chip">${escapeHtml(item.recommendedBy ? `Reco: ${item.recommendedBy}` : "Sin reco")}</small>
    <select class="media-status-select" data-media-status-item="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""} aria-label="Estado de ${escapeHtml(item.title)}">
      ${["pendiente", "viendo", "vista", "descartada"].map((value) => `<option value="${value}" ${value === (item.mediaStatus || "pendiente") ? "selected" : ""}>${escapeHtml(titleCase(value))}</option>`).join("")}
    </select>
  `;
}

function mediaByline(item) {
  const people = item.director || item.creator || (item.productionCompanies || [])[0] || "";
  return [item.year, people].filter(Boolean).join(" - ");
}

function ratingOptions(selected = "") {
  const values = ["", ...Array.from({ length: 9 }, (_, index) => String(1 + index * 0.5))];
  return values.map((value) => {
    const label = value ? `${value} estrellas` : "Sin puntaje";
    return `<option value="${escapeHtml(value)}" ${String(selected) === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function normalizeRating(value) {
  if (value === undefined || value === null || value === "") return "";
  const rating = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(rating)) return "";
  return String(Math.min(5, Math.max(1, rating)));
}

function starsFor(value) {
  const rating = Number(normalizeRating(value));
  if (!rating) return "Sin puntaje";
  let output = "";
  for (let star = 1; star <= 5; star += 1) {
    if (rating >= star) output += "★";
    else if (rating >= star - 0.5) output += "⯪";
    else output += "☆";
  }
  return output;
}

function renderSearch() {
  const query = normalize(els.globalSearchInput.value);
  if (!query) {
    els.globalSearchResults.innerHTML = '<div class="empty">Busca en gastos, listas y cierres.</div>';
    return;
  }
  const results = [];
  for (const expense of appState.allExpenses || []) {
    if (normalize(`${expense.description} ${expense.category} ${expense.amount}`).includes(query)) {
      results.push(`Gasto: ${escapeHtml(expense.description)} - S/ ${Number(expense.amount || 0).toFixed(2)}`);
    }
  }
  for (const list of [...lists, ...deletedLists]) {
    if (normalize(`${list.name} ${list.category} ${(list.items || []).map((item) => item.title).join(" ")}`).includes(query)) {
      results.push(`Lista: ${escapeHtml(list.name)}${list.deletedAt ? " (papelera)" : ""}`);
    }
  }
  for (const closure of appState.monthlyClosures || []) {
    if (normalize(`${closure.month} ${closure.status} ${closure.total}`).includes(query)) {
      results.push(`Cierre: ${escapeHtml(closure.month)} - S/ ${Number(closure.total || 0).toFixed(2)}`);
    }
  }
  els.globalSearchResults.innerHTML = results.length ? results.slice(0, 8).map((item) => `<div class="search-result">${item}</div>`).join("") : '<div class="empty">Sin resultados.</div>';
}

function titleCase(value) {
  return String(value || "").split(/(\s+|-)/).map((part) => (/^\s+$|-$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
