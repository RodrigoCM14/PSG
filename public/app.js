const els = {
  refreshButton: document.querySelector("#refreshButton"),
  botReply: document.querySelector("#botReply"),
  cycleDashboard: document.querySelector("#cycleDashboard"),
  cycleAlerts: document.querySelector("#cycleAlerts"),
  cycleHistory: document.querySelector("#cycleHistory"),
  categoryForm: document.querySelector("#categoryForm"),
  prevCycleButton: document.querySelector("#prevCycleButton"),
  currentCycleButton: document.querySelector("#currentCycleButton"),
  nextCycleButton: document.querySelector("#nextCycleButton"),
  payments: document.querySelector("#payments"),
  monthlyClosures: document.querySelector("#monthlyClosures"),
  expenses: document.querySelector("#expenses"),
  expenseMonthFilter: document.querySelector("#expenseMonthFilter"),
  expensePersonFilter: document.querySelector("#expensePersonFilter"),
  expenseCategoryFilter: document.querySelector("#expenseCategoryFilter"),
  expenseSearchFilter: document.querySelector("#expenseSearchFilter"),
  clearExpenseFilters: document.querySelector("#clearExpenseFilters"),
  cycleSummaryButton: document.querySelector("#cycleSummaryButton"),
  monthlyCloseButton: document.querySelector("#monthlyCloseButton"),
  monthlyClosePanel: document.querySelector("#monthlyClosePanel"),
  expenseSummary: document.querySelector("#expenseSummary"),
  expenseDialog: document.querySelector("#expenseDialog"),
  expenseEditForm: document.querySelector("#expenseEditForm"),
  closeExpenseDialog: document.querySelector("#closeExpenseDialog"),
  cancelExpenseEdit: document.querySelector("#cancelExpenseEdit"),
  closureDialog: document.querySelector("#closureDialog"),
  closeClosureDialog: document.querySelector("#closeClosureDialog"),
  closureDialogTitle: document.querySelector("#closureDialogTitle"),
  closureDialogBody: document.querySelector("#closureDialogBody"),
  cycleSummaryDialog: document.querySelector("#cycleSummaryDialog"),
  closeCycleSummaryDialog: document.querySelector("#closeCycleSummaryDialog"),
  cycleSummaryTitle: document.querySelector("#cycleSummaryTitle"),
  cycleSummaryDialogBody: document.querySelector("#cycleSummaryDialogBody"),
  paymentsDialog: document.querySelector("#paymentsDialog"),
  closePaymentsDialog: document.querySelector("#closePaymentsDialog"),
  paymentsDialogBody: document.querySelector("#paymentsDialogBody"),
  expenseDateInput: document.querySelector("#expenseDateInput"),
  expenseDescriptionInput: document.querySelector("#expenseDescriptionInput"),
  expenseAmountInput: document.querySelector("#expenseAmountInput"),
  expenseCategoryInput: document.querySelector("#expenseCategoryInput"),
  expensePayerInput: document.querySelector("#expensePayerInput"),
  expenseParticipantsInput: document.querySelector("#expenseParticipantsInput"),
  expenseOriginalText: document.querySelector("#expenseOriginalText")
};

let editingExpenseId = null;
let latestPeople = [];
let latestExpenses = [];
let latestPayments = [];
let latestMonthlyClosures = [];
let latestCategories = [];
let latestMonthlyClose = null;
let expensePage = 1;
let expenseSort = { key: "date", direction: "desc" };
const EXPENSES_PER_PAGE = 30;

els.refreshButton.addEventListener("click", refresh);
for (const filter of [els.expenseMonthFilter, els.expensePersonFilter, els.expenseCategoryFilter, els.expenseSearchFilter]) {
  filter.addEventListener("input", () => {
    expensePage = 1;
    renderExpenses(applyExpenseFilters(latestExpenses), latestPeople);
  });
}

els.clearExpenseFilters.addEventListener("click", () => {
  els.expenseMonthFilter.value = "";
  els.expensePersonFilter.value = "";
  els.expenseCategoryFilter.value = "";
  els.expenseSearchFilter.value = "";
  expensePage = 1;
  renderExpenses(latestExpenses, latestPeople);
  els.monthlyClosePanel.hidden = true;
});

els.monthlyCloseButton.addEventListener("click", () => {
  const month = els.expenseMonthFilter.value;
  if (!month) {
    els.botReply.textContent = "Elige un ciclo para generar el cierre.";
    return;
  }
  renderMonthlyClose(month);
});
els.cycleSummaryButton.addEventListener("click", openCycleSummary);
els.prevCycleButton.addEventListener("click", () => shiftSelectedCycle(-1));
els.currentCycleButton.addEventListener("click", () => selectCycle(billingCycleKeyForDate(new Date().toISOString())));
els.nextCycleButton.addEventListener("click", () => shiftSelectedCycle(1));
els.categoryForm.addEventListener("submit", saveCategories);

els.closeExpenseDialog.addEventListener("click", closeExpenseEditor);
els.cancelExpenseEdit.addEventListener("click", closeExpenseEditor);
els.closeClosureDialog.addEventListener("click", closeClosureDetail);
els.closeCycleSummaryDialog.addEventListener("click", closeCycleSummary);
els.closePaymentsDialog.addEventListener("click", closePaymentsHistory);
els.expenseEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editingExpenseId) return;

  const amount = Number(els.expenseAmountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    els.botReply.textContent = "El monto no es valido.";
    return;
  }

  const date = parseInputDate(els.expenseDateInput.value);
  if (!date) {
    els.botReply.textContent = "La fecha no es valida. Usa YYYY-MM-DD.";
    return;
  }

  const participantNames = selectedParticipantNames();
  if (!participantNames.length) {
    els.botReply.textContent = "Selecciona al menos un participante.";
    return;
  }

  const shares = selectedShares();
  if (shares) {
    const totalShares = Object.values(shares).reduce((sum, value) => sum + value, 0);
    if (Math.abs(totalShares - amount) > 0.01) {
      els.botReply.textContent = `Los montos personalizados suman ${money(totalShares)} y deben sumar ${money(amount)}.`;
      return;
    }
  }

  await api(`/api/expenses/${editingExpenseId}`, {
    method: "PATCH",
    body: {
      description: els.expenseDescriptionInput.value.trim(),
      amount,
      date,
      category: normalizeCategory(els.expenseCategoryInput.value),
      payerName: els.expensePayerInput.value,
      participantNames,
      shares
    }
  });
  closeExpenseEditor();
  await refresh();
});

async function refresh() {
  render(await api("/api/state"));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Error de API");
  return payload;
}

function render(state) {
  latestPeople = state.people || [];
  latestExpenses = state.allExpenses || state.recentExpenses || [];
  latestPayments = state.payments || state.recentPayments || [];
  latestMonthlyClosures = state.monthlyClosures || [];
  latestCategories = state.categories || [];
  renderExpenseFilters(latestExpenses, latestPeople);
  renderCategoryForm();
  renderCycleDashboard();
  renderCycleAlerts();
  renderPayments((state.recentPayments || []).slice(0, 5), state.people);
  renderMonthlyClosures(state.monthlyClosures || []);
  renderCycleHistory();
  renderExpenses(applyExpenseFilters(latestExpenses), state.people);
}

function renderExpenseFilters(expenses, people) {
  const currentMonth = els.expenseMonthFilter.value;
  const currentPerson = els.expensePersonFilter.value;
  const currentCategory = els.expenseCategoryFilter.value;

  const months = [...new Set(expenses.map((item) => billingCycleKeyForDate(item.date)).filter(Boolean))].sort().reverse();
  els.expenseMonthFilter.innerHTML = '<option value="">Todos</option>';
  for (const month of months) {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = formatCycleLabel(month);
    option.selected = currentMonth === month;
    els.expenseMonthFilter.append(option);
  }

  els.expensePersonFilter.innerHTML = '<option value="">Todas</option>';
  for (const person of people) {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.name;
    option.selected = currentPerson === person.id;
    els.expensePersonFilter.append(option);
  }

  const categories = [...new Set(expenses.map((item) => item.category || "general"))].sort();
  els.expenseCategoryFilter.innerHTML = '<option value="">Todas</option>';
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = categoryName(category);
    option.selected = currentCategory === category;
    els.expenseCategoryFilter.append(option);
  }
}

function renderCategoryForm() {
  const categories = effectiveCategories();
  els.categoryForm.innerHTML = `
    <div class="category-list">
      ${categories.map((category) => `
        <label class="category-edit">
          <input name="name" value="${escapeHtml(category.name)}" aria-label="Nombre categoria">
          <input name="color" type="color" value="${escapeHtml(category.color)}" aria-label="Color categoria">
          <input name="id" type="hidden" value="${escapeHtml(category.id)}">
        </label>
      `).join("")}
    </div>
    <button type="submit">Guardar categorias</button>
  `;
}

async function saveCategories(event) {
  event.preventDefault();
  const rows = [...els.categoryForm.querySelectorAll(".category-edit")];
  const categories = rows.map((row) => ({
    id: row.querySelector('[name="id"]').value,
    name: row.querySelector('[name="name"]').value,
    color: row.querySelector('[name="color"]').value
  }));
  await api("/api/categories", { method: "PATCH", body: { categories } });
  els.botReply.textContent = "Categorias actualizadas.";
  await refresh();
}

function applyExpenseFilters(expenses) {
  const month = els.expenseMonthFilter.value;
  const personId = els.expensePersonFilter.value;
  const category = els.expenseCategoryFilter.value;
  const search = normalize(els.expenseSearchFilter.value);

  return expenses.filter((expense) => {
    if (month && billingCycleKeyForDate(expense.date) !== month) return false;
    if (personId && expense.payerId !== personId && !(expense.participantIds || []).includes(personId)) return false;
    if (category && (expense.category || "general") !== category) return false;
    if (search) {
      const haystack = normalize(`${expense.description || ""} ${expense.originalText || ""}`);
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function selectCycle(key) {
  els.expenseMonthFilter.value = key;
  expensePage = 1;
  renderMonthlyClose(key);
  renderExpenses(applyExpenseFilters(latestExpenses), latestPeople);
}

function shiftSelectedCycle(offset) {
  const current = els.expenseMonthFilter.value || billingCycleKeyForDate(new Date().toISOString());
  const [year, month] = parseCycleKey(current);
  if (!year) return;
  const target = new Date(Date.UTC(year, month - 1 + offset, 10));
  selectCycle(`${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`);
}

function renderCycleDashboard() {
  const key = billingCycleKeyForDate(new Date().toISOString());
  const metrics = buildCycleMetrics(key);
  const closure = closureForMonth(key);
  const daysToClose = daysUntil(cycleEndForKey(key));
  const daysToPay = daysUntil(cycleDueDateForKey(key));

  els.cycleDashboard.innerHTML = `
    <article class="cycle-hero">
      <div class="cycle-hero-main">
        <span class="summary-label">Ciclo actual</span>
        <h2>${escapeHtml(formatCycleLabel(key))}</h2>
        <div class="cycle-status-row">
          <span class="status-pill ${closureStatusClass(closure)}">${escapeHtml(closureStatusLabel(closure))}</span>
          <span>${escapeHtml(formatDueDate(cycleDueDateForKey(key)))} pago tarjeta Jess</span>
        </div>
      </div>
      <div class="metric-grid">
        <div><span class="summary-label">Acumulado</span><strong>${escapeHtml(money(metrics.total))}</strong></div>
        <div><span class="summary-label">Registros</span><strong>${escapeHtml(String(metrics.expenseCount))}</strong></div>
        <div><span class="summary-label">Corte</span><strong>${escapeHtml(formatDaysLeft(daysToClose))}</strong></div>
        <div><span class="summary-label">Pago</span><strong>${escapeHtml(formatDaysLeft(daysToPay))}</strong></div>
      </div>
    </article>
    <article class="cycle-panel">
      <div class="panel-head">
        <h2>Detalle por persona</h2>
        <button class="secondary-button" type="button" id="selectCurrentCycleButton">Ver ciclo</button>
      </div>
      ${renderPersonCycleTable(metrics.people)}
    </article>
  `;

  document.querySelector("#selectCurrentCycleButton")?.addEventListener("click", () => {
    els.expenseMonthFilter.value = key;
    expensePage = 1;
    renderMonthlyClose(key);
    renderExpenses(applyExpenseFilters(latestExpenses), latestPeople);
  });
}

function renderCycleAlerts() {
  const key = billingCycleKeyForDate(new Date().toISOString());
  const closure = closureForMonth(key);
  const alerts = [];
  const daysToClose = daysUntil(cycleEndForKey(key));
  const daysToPay = daysUntil(cycleDueDateForKey(key));

  if (!closure) alerts.push(`Ciclo actual sin cerrar: ${formatCycleLabel(key)}.`);
  if (daysToClose >= 0 && daysToClose <= 3) alerts.push(`El corte de la tarjeta de Jess es ${formatDueDate(cycleEndForKey(key))}.`);
  if (closure && !isClosureFullySettled(closure)) alerts.push("Hay liquidaciones pendientes en el ciclo actual.");
  if (closure && isClosureFullySettled(closure) && !isClosureCardPaid(closure) && daysToPay >= 0) alerts.push(`La tarjeta de Jess vence el ${formatDueDate(cycleDueDateForKey(key))}.`);
  if (closure && isClosureCardPaid(closure)) alerts.push("Ciclo actual completamente pagado.");

  els.cycleAlerts.innerHTML = alerts.map((item) => `<div class="alert-item">${escapeHtml(item)}</div>`).join("");
}

function renderCycleHistory() {
  const keys = [...new Set([...latestExpenses.map((item) => billingCycleKeyForDate(item.date)), ...latestMonthlyClosures.map((item) => item.month)].filter(Boolean))]
    .sort()
    .reverse();

  if (!keys.length) {
    els.cycleHistory.innerHTML = '<div class="empty">Sin ciclos todavia.</div>';
    return;
  }

  const rows = keys.map((key) => {
    const metrics = buildCycleMetrics(key);
    const closure = closureForMonth(key);
    const topCategory = metrics.categories[0]?.label ? `${titleCase(metrics.categories[0].label)} (${money(metrics.categories[0].amount)})` : "Sin categoria";
    return `
      <tr class="${isClosureFullySettled(closure) ? "settled-row" : ""}">
        <td>${escapeHtml(formatCycleLabel(key))}</td>
        <td>${escapeHtml(closureStatusLabel(closure))}</td>
        <td>${escapeHtml(formatDueDate(cycleDueDateForKey(key)))}</td>
        <td>${escapeHtml(String(metrics.expenseCount))}</td>
        <td>${escapeHtml(topCategory)}</td>
        <td class="amount-col">${escapeHtml(money(metrics.total))}</td>
      </tr>
    `;
  }).join("");

  els.cycleHistory.innerHTML = `
    <table class="records-table detail-table">
      <thead>
        <tr>
          <th>Ciclo</th>
          <th>Estado</th>
          <th>Pago tarjeta</th>
          <th>Registros</th>
          <th>Categoria principal</th>
          <th class="amount-col">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderPayments(items, people) {
  const byId = Object.fromEntries(people.map((person) => [person.id, person.name]));
  els.payments.innerHTML = "";
  if (!items.length) {
    els.payments.append(empty("Sin pagos registrados."));
    return;
  }

  for (const item of items) {
    const from = byId[item.fromId] || item.fromId;
    const to = byId[item.toId] || item.toId;
    const node = row(`${from} pago a ${to}`, `${money(item.amount, item.currency)} Â· ${formatDate(item.date)}`);
    node.classList.add("settled-row");
    els.payments.append(node);
  }
  if (latestPayments.length > 0) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = `Ver historial (${latestPayments.length})`;
    button.addEventListener("click", openPaymentsHistory);
    els.payments.append(button);
  }
}

function openPaymentsHistory() {
  els.paymentsDialogBody.innerHTML = renderPaymentsHistoryTable(latestPayments);
  els.paymentsDialog.showModal();
}

function closePaymentsHistory() {
  els.paymentsDialog.close();
}

function openCycleSummary() {
  const month = els.expenseMonthFilter.value || billingCycleKeyForDate(new Date().toISOString());
  const expenses = latestExpenses.filter((expense) => billingCycleKeyForDate(expense.date) === month);
  const categories = groupTotals(expenses, (item) => item.category || "general");
  const total = categories.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  els.cycleSummaryTitle.textContent = formatCycleLabel(month);
  if (!categories.length) {
    els.cycleSummaryDialogBody.innerHTML = '<div class="empty">Sin gastos registrados en este ciclo.</div>';
    els.cycleSummaryDialog.showModal();
    return;
  }

  const chart = buildCategoryPie(categories, total);
  els.cycleSummaryDialogBody.innerHTML = `
    <div class="cycle-summary-layout">
      <div class="cycle-pie" style="background: ${escapeHtml(chart.gradient)};">
        <span>${escapeHtml(money(total))}</span>
      </div>
      <div class="cycle-summary-list">
        ${categories.map((item) => {
          const category = categoryConfig(item.label);
          const percent = total ? Math.round((Number(item.amount || 0) / total) * 100) : 0;
          return `
            <div class="cycle-summary-row">
              <span class="category-dot" style="--category-color: ${escapeHtml(category.color)}"></span>
              <strong>${escapeHtml(category.name)}</strong>
              <small>${escapeHtml(String(percent))}%</small>
              <span>${escapeHtml(money(item.amount))}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
  els.cycleSummaryDialog.showModal();
}

function closeCycleSummary() {
  els.cycleSummaryDialog.close();
}

function buildCategoryPie(categories, total) {
  let cursor = 0;
  const segments = categories.map((item) => {
    const category = categoryConfig(item.label);
    const amount = Number(item.amount || 0);
    const start = cursor;
    const end = total ? cursor + (amount / total) * 360 : cursor;
    cursor = end;
    return `${category.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
  });
  return { gradient: `conic-gradient(${segments.join(", ")})` };
}

function renderPaymentsHistoryTable(items) {
  if (!items.length) return '<div class="empty">Sin pagos registrados.</div>';
  const rows = [...items]
    .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())
    .map((item) => {
      const from = personName(item.fromId);
      const to = personName(item.toId);
      return `
        <tr class="settled-row">
          <td>${escapeHtml(formatDate(item.date || item.createdAt))}</td>
          <td>${escapeHtml(from)} a ${escapeHtml(to)}</td>
          <td>${escapeHtml(item.description || "Pago")}</td>
          <td class="amount-col">${escapeHtml(money(item.amount, item.currency))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-wrap">
      <table class="records-table detail-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Pago</th>
            <th>Descripcion</th>
            <th class="amount-col">Monto</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderMonthlyClosures(items) {
  els.monthlyClosures.innerHTML = "";
  if (!items.length) {
    els.monthlyClosures.append(empty("Sin cierres guardados."));
    return;
  }

  for (const item of items.slice(0, 6)) {
    const node = row(formatCycleLabel(item.month), monthlyClosureDetail(item));
    if (isClosureFullySettled(item)) node.classList.add("settled-row");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Ver detalle";
    button.addEventListener("click", () => openClosureDetail(item.id));
    node.append(button);
    els.monthlyClosures.append(node);
  }
}

function monthlyClosureDetail(item) {
  const pending = closurePendingAmount(item);
  const status = closureStatusLabel(item);
  const responsibilities = (item.responsibilities || [])
    .map((person) => `${person.label}: ${money(person.amount)}`)
    .join(" Â· ");
  return responsibilities
    ? `${item.expenseCount} registros Â· ${money(item.total)} Â· ${status} Â· ${responsibilities}`
    : `${item.expenseCount} registros Â· ${money(item.total)} Â· ${status}`;
}

function closureForMonth(month) {
  return latestMonthlyClosures.find((item) => item.month === month);
}

function isClosureFullySettled(closure) {
  return Boolean(closure) && closure.status !== "reopened" && (closure.balances || []).length > 0 && closurePendingAmount(closure) <= 0.009;
}

function isMonthLocked(month) {
  return isClosureFullySettled(closureForMonth(month));
}

function isMonthClosedButEditable(month) {
  const closure = closureForMonth(month);
  return Boolean(closure) && !isClosureFullySettled(closure);
}

function closureStatusLabel(closure) {
  if (!closure) return "Abierto";
  if (closure.status === "reopened") return "Reabierto";
  if (isClosureCardPaid(closure)) return "Pagado tarjeta";
  if (isClosureFullySettled(closure)) return "Liquidado";
  return "Cerrado";
}

function closureStatusClass(closure) {
  if (!closure) return "status-open";
  if (closure.status === "reopened") return "status-open";
  if (isClosureCardPaid(closure)) return "status-paid";
  if (isClosureFullySettled(closure)) return "status-settled";
  return "status-pending";
}

function isClosureCardPaid(closure) {
  return closure?.status === "card_paid" || Boolean(closure?.cardPaidAt);
}

function openClosureDetail(id) {
  const closure = latestMonthlyClosures.find((item) => item.id === id);
  if (!closure) return;
  const pending = closurePendingAmount(closure);
  const paid = Math.max(0, closureBalanceTotal(closure) - pending);

  els.closureDialogTitle.textContent = formatCycleLabel(closure.month);
  els.closureDialogBody.innerHTML = `
    <div class="detail-toolbar">
      <span class="status-pill ${closureStatusClass(closure)}">${escapeHtml(closureStatusLabel(closure))}</span>
      ${
        isClosureFullySettled(closure)
          ? '<button id="reopenClosureButton" class="secondary-button" type="button">Reabrir cierre</button>'
          : ""
      }
      ${
        isClosureFullySettled(closure) && !isClosureCardPaid(closure)
          ? '<button id="markCardPaidButton" type="button">Marcar tarjeta pagada</button>'
          : ""
      }
    </div>
    <div class="detail-summary">
      <div><span class="summary-label">Total</span><strong>${escapeHtml(money(closure.total))}</strong></div>
      <div><span class="summary-label">Registros</span><strong>${escapeHtml(String(closure.expenseCount || 0))}</strong></div>
      <div><span class="summary-label">Pago tarjeta Jess</span><strong>${escapeHtml(formatDueDate(closure.dueDate || cycleDueDateForKey(closure.month)))}</strong></div>
      <div><span class="summary-label">Estado tarjeta</span><strong>${escapeHtml(isClosureCardPaid(closure) ? "Pagada" : "Pendiente")}</strong></div>
      <div><span class="summary-label">Pendiente por liquidar</span><strong>${escapeHtml(money(pending))}</strong></div>
      <div><span class="summary-label">Liquidado</span><strong>${escapeHtml(money(paid))}</strong></div>
    </div>
    <section>
      <h3>Flujo de cierre</h3>
      ${renderClosureChecklist(closure)}
    </section>
    <section>
      <h3>Debe pagar cada uno</h3>
      ${renderResponsibilityTable(closure)}
    </section>
    <section>
      <h3>Liquidaciones del cierre</h3>
      ${renderClosureBalancesTable(closure)}
    </section>
    <section>
      <h3>Historial de liquidaciones</h3>
      ${renderSettlementHistory(closure)}
    </section>
    <section class="summary-groups">
      <div>
        <span class="summary-label">Categorias</span>
        <div class="summary-chips">${renderSummaryChips(closure.categories || [])}</div>
      </div>
      <div>
        <span class="summary-label">Pagadores</span>
        <div class="summary-chips">${renderSummaryChips(closure.payers || [])}</div>
      </div>
    </section>
  `;

  for (const button of els.closureDialogBody.querySelectorAll("[data-settle-balance]")) {
    const index = Number(button.dataset.settleBalance);
    button.addEventListener("click", () => settleClosureBalance(id, index));
  }
  document.querySelector("#reopenClosureButton")?.addEventListener("click", () => reopenClosure(id));
  document.querySelector("#markCardPaidButton")?.addEventListener("click", () => markClosureCardPaid(id));

  if (!els.closureDialog.open) {
    els.closureDialog.showModal();
  }
}

function closeClosureDetail() {
  els.closureDialog.close();
}

function closureBalanceTotal(closure) {
  return (closure.balances || []).reduce((sum, balance) => sum + Number(balance.amount || 0), 0);
}

function closurePendingAmount(closure) {
  return (closure.balances || [])
    .filter((balance) => !balance.settledAt)
    .reduce((sum, balance) => sum + Number(balance.amount || 0), 0);
}

function renderResponsibilityTable(closure) {
  const responsibilities = closure.responsibilities || [];
  if (!responsibilities.length) return '<div class="empty">Este cierre no tiene detalle por persona.</div>';

  const rows = responsibilities
    .map(
      (person) => `
        <tr>
          <td>${escapeHtml(person.label)}</td>
          <td class="amount-col">${escapeHtml(money(person.amount))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div class="table-wrap">
      <table class="records-table detail-table">
        <thead>
          <tr>
            <th>Persona</th>
            <th class="amount-col">Debe pagar</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderClosureBalancesTable(closure) {
  const balances = closure.balances || [];
  if (!balances.length) return '<div class="empty">Todo cuadrado en este cierre.</div>';

  const rows = balances
    .map((balance, index) => `
      <tr class="${balance.settledAt ? "settled-row" : ""}">
        <td>${escapeHtml(balance.from)}</td>
        <td>${escapeHtml(balance.to)}</td>
        <td class="amount-col">${escapeHtml(money(balance.amount, balance.currency))}</td>
        <td>${balance.settledAt ? '<span class="summary-empty">Liquidado</span>' : `<button type="button" data-settle-balance="${index}">Liquidar</button>`}</td>
      </tr>
    `)
    .join("");

  return `
    <div class="table-wrap">
      <table class="records-table detail-table">
        <thead>
          <tr>
            <th>De</th>
            <th>Para</th>
            <th class="amount-col">Monto</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderSettlementHistory(closure) {
  const settlements = closure.settlements || findClosureSettlements(closure);
  if (!settlements.length) return '<div class="empty">Sin liquidaciones registradas para este cierre.</div>';

  const rows = settlements
    .map(
      (item) => `
        <tr class="settled-row">
          <td>${escapeHtml(formatDate(item.date || item.createdAt))}</td>
          <td>${escapeHtml(item.from)} a ${escapeHtml(item.to)}</td>
          <td class="amount-col">${escapeHtml(money(item.amount, item.currency))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div class="table-wrap">
      <table class="records-table detail-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Pago</th>
            <th class="amount-col">Monto</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function findClosureSettlements(closure) {
  const balances = closure.balances || [];
  return latestPayments
    .map((payment) => {
      const from = personName(payment.fromId);
      const to = personName(payment.toId);
      const match = balances.find((balance) => {
        return (
          balance.settledAt &&
          balance.from === from &&
          balance.to === to &&
          Math.abs(Number(balance.amount || 0) - Number(payment.amount || 0)) < 0.01
        );
      });
      return match ? { ...payment, from, to } : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
}

async function settleClosureBalance(closureId, index) {
  const closure = latestMonthlyClosures.find((item) => item.id === closureId);
  const balance = closure?.balances?.[index];
  if (!closure || !balance || balance.settledAt) return;
  if (!confirm(`Registrar pago de ${balance.from} a ${balance.to} por ${money(balance.amount, balance.currency)}?`)) return;

  await createClosurePayment(closure, balance);
  balance.settledAt = new Date().toISOString();
  markClosureStatus(closure);
  await saveClosureSnapshot(closure);
  els.botReply.textContent = `Pago registrado para el cierre ${formatCycleLabel(closure.month)}.`;
  await refresh();
  openClosureDetail(closureId);
}

async function reopenClosure(closureId) {
  const closure = latestMonthlyClosures.find((item) => item.id === closureId);
  if (!closure) return;
  if (!confirm(`Reabrir el cierre ${formatCycleLabel(closure.month)}? Los pagos registrados quedan en el historial, pero los gastos del ciclo vuelven a poder editarse.`)) return;

  const reopened = {
    ...closure,
    status: "reopened",
    cardPaidAt: null,
    reopenedAt: new Date().toISOString(),
    balances: (closure.balances || []).map((balance) => ({ ...balance, settledAt: null }))
  };
  await saveClosureSnapshot(reopened);
  els.botReply.textContent = `Cierre reabierto para ${formatCycleLabel(closure.month)}.`;
  await refresh();
  openClosureDetail(closureId);
}

async function markClosureCardPaid(closureId) {
  const closure = latestMonthlyClosures.find((item) => item.id === closureId);
  if (!closure || !isClosureFullySettled(closure)) return;
  if (!confirm(`Marcar como pagada la tarjeta de Jess para ${formatCycleLabel(closure.month)}?`)) return;

  await saveClosureSnapshot({
    ...closure,
    status: "card_paid",
    cardPaidAt: new Date().toISOString()
  });
  els.botReply.textContent = `Tarjeta de Jess marcada como pagada para ${formatCycleLabel(closure.month)}.`;
  await refresh();
  openClosureDetail(closureId);
}

async function createClosurePayment(closure, balance) {
  await api("/api/payments", {
    method: "POST",
    body: {
      fromName: balance.from,
      toName: balance.to,
      amount: balance.amount,
      currency: balance.currency || "PEN",
      description: `Liquidacion cierre ${formatCycleLabel(closure.month)}: ${balance.from} a ${balance.to}`
    }
  });
}

async function saveClosureSnapshot(closure) {
  await api("/api/monthly-closures", { method: "POST", body: closure });
}

function renderExpenses(items, people) {
  const byId = Object.fromEntries(people.map((person) => [person.id, person.name]));
  els.expenses.innerHTML = "";
  renderExpenseSummary(items);
  if (!items.length) {
    els.expenses.append(empty("Todavia no hay gastos."));
    return;
  }

  const table = document.createElement("table");
  table.className = "records-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>${renderExpenseSortButton("date", "Fecha")}</th>
        <th>Descripcion</th>
        <th>Categoria</th>
        <th>Pago</th>
        <th class="amount-col">${renderExpenseSortButton("amount", "Monto")}</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  const sortedItems = sortExpenses(items);
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / EXPENSES_PER_PAGE));
  if (expensePage > totalPages) expensePage = totalPages;
  const pageItems = sortedItems.slice((expensePage - 1) * EXPENSES_PER_PAGE, expensePage * EXPENSES_PER_PAGE);

  table.querySelectorAll("[data-sort-expenses]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sortExpenses;
      expenseSort = {
        key,
        direction: expenseSort.key === key && expenseSort.direction === "desc" ? "asc" : "desc"
      };
      expensePage = 1;
      renderExpenses(applyExpenseFilters(latestExpenses), latestPeople);
    });
  });

  for (const item of pageItems) {
    const month = billingCycleKeyForDate(item.date);
    const locked = isMonthLocked(month);
    const tr = document.createElement("tr");
    if (locked) tr.classList.add("settled-row");
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(item.date))}</td>
      <td><strong>${escapeHtml(item.description)}</strong></td>
      <td>${renderCategoryBadge(item.category || "general")}</td>
      <td>${escapeHtml(byId[item.payerId] || item.payerId)}</td>
      <td class="amount-col">${escapeHtml(money(item.amount, item.currency))}</td>
      <td></td>
    `;
    const actions = document.createElement("div");
    actions.className = "actions";

    if (locked) {
      const lockedLabel = document.createElement("span");
      lockedLabel.className = "summary-empty";
      lockedLabel.textContent = "Cierre liquidado";
      actions.append(lockedLabel);
    } else {
      const editButton = document.createElement("button");
      editButton.textContent = "Editar";
      editButton.addEventListener("click", () => openExpenseEditor(item));

      const voidButton = document.createElement("button");
      voidButton.textContent = "Anular";
      voidButton.className = "danger";
      voidButton.addEventListener("click", async () => {
        if (isMonthClosedButEditable(month) && !confirm(`Este ciclo ya tiene un cierre guardado. Si anulas este gasto, recalcula o guarda el cierre nuevamente. Continuar?`)) return;
        if (!confirm(`Anular gasto: ${item.description}?`)) return;
        await api(`/api/expenses/${item.id}`, { method: "DELETE" });
        await refresh();
      });

      actions.append(editButton, voidButton);
    }
    tr.lastElementChild.append(actions);
    tbody.append(tr);
  }

  els.expenses.append(table);
  els.expenses.append(renderExpensePagination(items.length, totalPages));
}

function renderClosureChecklist(closure) {
  const saved = Boolean(closure);
  const hasExpenses = Number(closure?.expenseCount || 0) > 0;
  const settled = isClosureFullySettled(closure);
  const paid = isClosureCardPaid(closure);
  const items = [
    ["Revisar gastos del ciclo", hasExpenses],
    ["Guardar cierre", saved],
    ["Liquidar saldos entre personas", settled],
    ["Marcar tarjeta de Jess pagada", paid]
  ];
  return `<ol class="checklist">${items.map(([label, done]) => `<li class="${done ? "done" : ""}">${escapeHtml(label)}</li>`).join("")}</ol>`;
}

function renderExpenseSortButton(key, label) {
  const active = expenseSort.key === key;
  const marker = !active ? "" : expenseSort.direction === "desc" ? " Desc" : " Asc";
  const directionLabel = active && expenseSort.direction === "desc" ? "mayor a menor" : "menor a mayor";
  return `<button type="button" class="sort-button${active ? " active" : ""}" data-sort-expenses="${key}" aria-label="Ordenar ${label} de ${directionLabel}">${label}${marker}</button>`;
}

function sortExpenses(items) {
  const direction = expenseSort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = expenseSort.key === "amount" ? Number(a.amount || 0) : new Date(a.date || 0).getTime();
    const right = expenseSort.key === "amount" ? Number(b.amount || 0) : new Date(b.date || 0).getTime();
    if (left === right) return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    return (left - right) * direction;
  });
}

function renderExpenseSummary(items) {
  const byId = Object.fromEntries(latestPeople.map((person) => [person.id, person.name]));
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categories = groupTotals(items, (item) => item.category || "general");
  const payers = groupTotals(items, (item) => byId[item.payerId] || item.payerId);

  els.expenseSummary.innerHTML = `
    <div class="summary-total">
      <strong>${items.length} registros</strong>
      <span>${money(total)}</span>
    </div>
    <div class="summary-groups">
      <div>
        <span class="summary-label">Por categoria</span>
        <div class="summary-chips">${renderSummaryChips(categories)}</div>
      </div>
      <div>
        <span class="summary-label">Por pagador</span>
        <div class="summary-chips">${renderSummaryChips(payers)}</div>
      </div>
    </div>
  `;
}

function renderExpensePagination(totalItems, totalPages) {
  const node = document.createElement("div");
  node.className = "pagination";
  const start = totalItems ? (expensePage - 1) * EXPENSES_PER_PAGE + 1 : 0;
  const end = Math.min(totalItems, expensePage * EXPENSES_PER_PAGE);

  const label = document.createElement("span");
  label.textContent = `${start}-${end} de ${totalItems} Â· ${EXPENSES_PER_PAGE} por pagina`;

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "secondary-button";
  prev.textContent = "Anterior";
  prev.disabled = expensePage <= 1;
  prev.addEventListener("click", () => {
    expensePage = Math.max(1, expensePage - 1);
    renderExpenses(applyExpenseFilters(latestExpenses), latestPeople);
  });

  const next = document.createElement("button");
  next.type = "button";
  next.className = "secondary-button";
  next.textContent = "Siguiente";
  next.disabled = expensePage >= totalPages;
  next.addEventListener("click", () => {
    expensePage = Math.min(totalPages, expensePage + 1);
    renderExpenses(applyExpenseFilters(latestExpenses), latestPeople);
  });

  node.append(label, prev, next);
  return node;
}

function renderMonthlyClose(month) {
  const monthExpenses = latestExpenses.filter((expense) => billingCycleKeyForDate(expense.date) === month);
  const byId = Object.fromEntries(latestPeople.map((person) => [person.id, person.name]));
  const total = monthExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categories = groupTotals(monthExpenses, (item) => item.category || "general");
  const payers = groupTotals(monthExpenses, (item) => byId[item.payerId] || item.payerId);
  const responsibilities = groupShareTotals(monthExpenses, byId);
  const savedClosure = closureForMonth(month);
  const review = reviewCycle(month, monthExpenses);
  const locked = isClosureFullySettled(savedClosure);
  const balances = mergeBalanceSettlements(simplifyExpenses(monthExpenses, byId), savedClosure?.balances || []);
  latestMonthlyClose = {
    month,
    total,
    expenseCount: monthExpenses.length,
    categories,
    payers,
    responsibilities,
    balances,
    cycleStart: cycleStartForKey(month),
    cycleEnd: cycleEndForKey(month),
    dueDate: cycleDueDateForKey(month),
    status: savedClosure?.status || "pending",
    cardPaidAt: savedClosure?.cardPaidAt || null,
    reopenedAt: savedClosure?.reopenedAt || null
  };

  els.monthlyClosePanel.hidden = false;
  els.monthlyClosePanel.innerHTML = `
    <div class="close-head">
      <div>
        <span class="summary-label">Cierre de ciclo</span>
        <strong>${escapeHtml(formatCycleLabel(month))}</strong>
      </div>
      <span>${escapeHtml(money(total))}</span>
    </div>
    <div class="summary-groups">
      <div>
        <span class="summary-label">Pago tarjeta Jess</span>
        <div class="summary-chips"><span class="summary-chip">${escapeHtml(formatDueDate(cycleDueDateForKey(month)))}</span></div>
      </div>
    </div>
    <div class="close-actions">
      <span class="status-pill ${closureStatusClass(savedClosure)}">${escapeHtml(closureStatusLabel(savedClosure))}</span>
      ${
        locked
          ? '<span class="summary-empty">Cierre liquidado - solo lectura</span>'
          : `<button id="saveMonthlyCloseButton" type="button">${savedClosure ? "Actualizar cierre" : "Guardar cierre"}</button>`
      }
      ${savedClosure ? '<button id="openSavedCloseButton" class="secondary-button" type="button">Ver cierre</button>' : ""}
      <button id="copyCloseSummaryButton" class="secondary-button" type="button">Copiar resumen</button>
      <button id="downloadCloseCsvButton" class="secondary-button" type="button">CSV</button>
    </div>
    <div>
      <span class="summary-label">Revision antes de cerrar</span>
      ${renderCycleReview(review)}
    </div>
    <ol class="checklist">
      <li class="done">Revisar gastos del ciclo</li>
      <li class="${savedClosure ? "done" : ""}">Guardar cierre</li>
      <li class="${isClosureFullySettled(savedClosure) ? "done" : ""}">Liquidar saldos entre personas</li>
      <li class="${isClosureCardPaid(savedClosure) ? "done" : ""}">Marcar tarjeta de Jess pagada</li>
    </ol>
    <div class="summary-groups">
      <div>
        <span class="summary-label">Categorias</span>
        <div class="summary-chips">${renderSummaryChips(categories)}</div>
      </div>
      <div>
        <span class="summary-label">Pagadores</span>
        <div class="summary-chips">${renderSummaryChips(payers)}</div>
      </div>
      <div>
        <span class="summary-label">Debe pagar cada uno</span>
        ${renderPersonCycleTable(buildCycleMetrics(month).people)}
      </div>
      <div>
        <span class="summary-label">Liquidaciones del ciclo</span>
        ${renderMonthlyCloseBalancesTable(balances)}
      </div>
    </div>
  `;
  document.querySelector("#saveMonthlyCloseButton")?.addEventListener("click", saveMonthlyClose);
  document.querySelector("#openSavedCloseButton")?.addEventListener("click", () => openClosureDetail(savedClosure.id));
  document.querySelector("#copyCloseSummaryButton")?.addEventListener("click", copyCurrentCloseSummary);
  document.querySelector("#downloadCloseCsvButton")?.addEventListener("click", downloadCurrentCloseCsv);
  for (const button of els.monthlyClosePanel.querySelectorAll("[data-settle-month-balance]")) {
    const index = Number(button.dataset.settleMonthBalance);
    button.addEventListener("click", () => settleMonthlyCloseBalance(index));
  }
}

async function saveMonthlyClose() {
  if (!latestMonthlyClose) return;
  const review = reviewCycle(latestMonthlyClose.month, latestExpenses.filter((expense) => billingCycleKeyForDate(expense.date) === latestMonthlyClose.month));
  if (review.warnings.length && !confirm(`Hay ${review.warnings.length} observacion(es) antes de cerrar. Guardar igual?`)) return;
  await api("/api/monthly-closures", { method: "POST", body: { ...latestMonthlyClose, status: "pending" } });
  els.botReply.textContent = `Cierre guardado para ${formatCycleLabel(latestMonthlyClose.month)}.`;
  await refresh();
}

function renderCycleReview(review) {
  const items = [...review.ok, ...review.warnings];
  if (!items.length) return '<div class="empty">Sin datos para revisar.</div>';
  return `<ul class="review-list">${items.map((item) => `<li class="${item.kind}">${escapeHtml(item.text)}</li>`).join("")}</ul>`;
}

function reviewCycle(key, expenses) {
  const warnings = [];
  const ok = [];
  if (!expenses.length) warnings.push({ kind: "warning", text: "No hay gastos en este ciclo." });
  const generalCount = expenses.filter((item) => (item.category || "general") === "general").length;
  if (generalCount) warnings.push({ kind: "warning", text: `${generalCount} gasto(s) siguen en categoria General.` });
  const missingOriginal = expenses.filter((item) => !item.originalText).length;
  if (missingOriginal) warnings.push({ kind: "warning", text: `${missingOriginal} gasto(s) no tienen mensaje original.` });
  const noParticipants = expenses.filter((item) => !(item.participantIds || []).length).length;
  if (noParticipants) warnings.push({ kind: "warning", text: `${noParticipants} gasto(s) no tienen participantes.` });
  if (!warnings.length) ok.push({ kind: "ok", text: "Revision lista: categorias, mensajes y participantes se ven bien." });
  ok.push({ kind: "ok", text: `Ciclo ${formatCycleLabel(key)} vence el ${formatDueDate(cycleDueDateForKey(key))}.` });
  return { ok, warnings };
}

async function copyCurrentCloseSummary() {
  if (!latestMonthlyClose) return;
  const text = buildCloseSummary(latestMonthlyClose);
  try {
    await navigator.clipboard.writeText(text);
    els.botReply.textContent = "Resumen copiado.";
  } catch {
    els.botReply.textContent = text;
  }
}

function downloadCurrentCloseCsv() {
  if (!latestMonthlyClose) return;
  const rows = [["Ciclo", "Total", "Registros"], [formatCycleLabel(latestMonthlyClose.month), latestMonthlyClose.total, latestMonthlyClose.expenseCount]];
  rows.push([], ["Persona", "Debe pagar"]);
  for (const item of latestMonthlyClose.responsibilities || []) rows.push([item.label, item.amount]);
  rows.push([], ["De", "Para", "Monto"]);
  for (const item of latestMonthlyClose.balances || []) rows.push([item.from, item.to, item.amount]);
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  link.download = `pukis-${latestMonthlyClose.month}.csv`;
  link.click();
}

function buildCloseSummary(closure) {
  const lines = [
    `Pukis - cierre ${formatCycleLabel(closure.month)}`,
    `Total: ${money(closure.total)}`,
    `Pago tarjeta Jess: ${formatDueDate(closure.dueDate || cycleDueDateForKey(closure.month))}`,
    `Registros: ${closure.expenseCount}`,
    "",
    "Debe pagar cada uno:"
  ];
  for (const item of closure.responsibilities || []) lines.push(`- ${item.label}: ${money(item.amount)}`);
  lines.push("", "Liquidaciones:");
  if (!(closure.balances || []).length) lines.push("- Todo cuadrado.");
  for (const item of closure.balances || []) lines.push(`- ${item.from} -> ${item.to}: ${money(item.amount, item.currency)}`);
  return lines.join("\n");
}

function renderMonthlyCloseBalancesTable(balances) {
  if (!balances.length) return '<div class="empty">Todo cuadrado en este ciclo.</div>';

  const rows = balances
    .map((balance, index) => `
      <tr class="${balance.settledAt ? "settled-row" : ""}">
        <td>${escapeHtml(balance.from)}</td>
        <td>${escapeHtml(balance.to)}</td>
        <td class="amount-col">${escapeHtml(money(balance.amount, balance.currency))}</td>
        <td>${balance.settledAt ? '<span class="summary-empty">Liquidado</span>' : `<button type="button" data-settle-month-balance="${index}">Liquidar</button>`}</td>
      </tr>
    `)
    .join("");

  return `
    <div class="table-wrap">
      <table class="records-table detail-table">
        <thead>
          <tr>
            <th>De</th>
            <th>Para</th>
            <th class="amount-col">Monto</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildCycleMetrics(key) {
  const expenses = latestExpenses.filter((expense) => billingCycleKeyForDate(expense.date) === key);
  const byId = Object.fromEntries(latestPeople.map((person) => [person.id, person.name]));
  const people = new Map();
  const ensure = (id) => {
    const label = byId[id] || id;
    if (!people.has(label)) people.set(label, { label, consumed: 0, paid: 0, net: 0 });
    return people.get(label);
  };

  for (const expense of expenses) {
    ensure(expense.payerId).paid += Number(expense.amount || 0);
    for (const [personId, share] of Object.entries(expense.shares || {})) {
      ensure(personId).consumed += Number(share || 0);
    }
  }

  for (const person of people.values()) {
    person.consumed = roundMoney(person.consumed);
    person.paid = roundMoney(person.paid);
    person.net = roundMoney(person.paid - person.consumed);
  }

  return {
    key,
    expenses,
    expenseCount: expenses.length,
    total: roundMoney(expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)),
    categories: groupTotals(expenses, (item) => item.category || "general"),
    people: [...people.values()].sort((a, b) => b.consumed - a.consumed)
  };
}

function renderPersonCycleTable(items) {
  if (!items.length) return '<div class="empty">Sin gastos en este ciclo.</div>';
  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.label)}</td>
      <td class="amount-col">${escapeHtml(money(item.consumed))}</td>
      <td class="amount-col">${escapeHtml(money(item.paid))}</td>
      <td class="amount-col">${escapeHtml(item.net >= 0 ? `+${money(item.net)}` : money(item.net))}</td>
    </tr>
  `).join("");
  return `
    <div class="table-wrap">
      <table class="records-table detail-table">
        <thead>
          <tr>
            <th>Persona</th>
            <th class="amount-col">Consumio</th>
            <th class="amount-col">Pago</th>
            <th class="amount-col">Balance</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function mergeBalanceSettlements(currentBalances, savedBalances) {
  return currentBalances.map((balance) => {
    const saved = savedBalances.find((item) => {
      return item.from === balance.from && item.to === balance.to && Math.abs(Number(item.amount || 0) - Number(balance.amount || 0)) < 0.01;
    });
    return saved?.settledAt ? { ...balance, settledAt: saved.settledAt } : balance;
  });
}

async function settleMonthlyCloseBalance(index) {
  const balance = latestMonthlyClose?.balances?.[index];
  if (!latestMonthlyClose || !balance || balance.settledAt) return;
  if (!confirm(`Registrar pago de ${balance.from} a ${balance.to} por ${money(balance.amount, balance.currency)}?`)) return;

  await createClosurePayment(latestMonthlyClose, balance);
  balance.settledAt = new Date().toISOString();
  markClosureStatus(latestMonthlyClose);
  await saveClosureSnapshot(latestMonthlyClose);
  els.botReply.textContent = `Pago registrado para el cierre ${formatCycleLabel(latestMonthlyClose.month)}.`;
  await refresh();
  renderMonthlyClose(latestMonthlyClose.month);
}

function markClosureStatus(closure) {
  closure.status = isClosureFullySettled({ ...closure, status: "pending" }) ? "settled" : "pending";
}

function simplifyExpenses(expenses, byId) {
  const positions = new Map();
  const move = (fromId, toId, amount) => {
    const rounded = Math.round(Number(amount || 0) * 100) / 100;
    if (!rounded || fromId === toId) return;
    positions.set(fromId, Math.round(((positions.get(fromId) || 0) - rounded) * 100) / 100);
    positions.set(toId, Math.round(((positions.get(toId) || 0) + rounded) * 100) / 100);
  };

  for (const expense of expenses) {
    for (const [personId, share] of Object.entries(expense.shares || {})) {
      move(personId, expense.payerId, share);
    }
  }

  const debtors = [];
  const creditors = [];
  for (const [personId, balance] of positions.entries()) {
    if (balance < -0.009) debtors.push({ personId, amount: Math.abs(balance) });
    if (balance > 0.009) creditors.push({ personId, amount: balance });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const result = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.round(Math.min(debtor.amount, creditor.amount) * 100) / 100;
    if (amount > 0.009) {
      result.push({ from: byId[debtor.personId] || debtor.personId, to: byId[creditor.personId] || creditor.personId, amount });
    }
    debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;
    if (debtor.amount <= 0.009) debtorIndex += 1;
    if (creditor.amount <= 0.009) creditorIndex += 1;
  }
  return result;
}

function renderBalanceChips(items) {
  if (!items.length) return '<span class="summary-empty">Todo cuadrado</span>';
  return items
    .map((item) => `<span class="summary-chip">${escapeHtml(item.from)} -> ${escapeHtml(item.to)} <strong>${escapeHtml(money(item.amount))}</strong></span>`)
    .join("");
}

function formatMonth(value) {
  const date = new Date(`${value}-01T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(date);
}

function billingCycleKeyForDate(value) {
  const date = parseLocalDate(value);
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const cycleEnd = day <= 10 ? new Date(Date.UTC(year, month, 10)) : new Date(Date.UTC(year, month + 1, 10));
  return `${cycleEnd.getUTCFullYear()}-${String(cycleEnd.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysUntil(value) {
  const target = parseLocalDate(value);
  if (!target) return 0;
  const today = parseLocalDate(new Date().toISOString());
  if (!today) return 0;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function formatDaysLeft(days) {
  if (days === 0) return "Hoy";
  if (days > 0) return `${days} dias`;
  return `${Math.abs(days)} dias tarde`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function cycleStartForKey(key) {
  const [year, month] = parseCycleKey(key);
  if (!year) return null;
  return isoDate(new Date(Date.UTC(year, month - 2, 11)));
}

function cycleEndForKey(key) {
  const [year, month] = parseCycleKey(key);
  if (!year) return null;
  return isoDate(new Date(Date.UTC(year, month - 1, 10)));
}

function cycleDueDateForKey(key) {
  const [year, month] = parseCycleKey(key);
  if (!year) return null;
  return isoDate(new Date(Date.UTC(year, month, 3)));
}

function formatCycleLabel(key) {
  const start = cycleStartForKey(key);
  const end = cycleEndForKey(key);
  if (!start || !end) return key;
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatDueDate(value) {
  if (!value) return "Sin fecha";
  return formatShortDate(value);
}

function parseCycleKey(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return [0, 0];
  return [Number(match[1]), Number(match[2])];
}

function parseLocalDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function groupTotals(items, keyFn) {
  const totals = new Map();
  for (const item of items) {
    const key = keyFn(item) || "Sin dato";
    totals.set(key, (totals.get(key) || 0) + Number(item.amount || 0));
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function groupShareTotals(items, byId) {
  const totals = new Map();
  for (const item of items) {
    for (const [personId, share] of Object.entries(item.shares || {})) {
      const label = byId[personId] || personId;
      totals.set(label, (totals.get(label) || 0) + Number(share || 0));
    }
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function renderSummaryChips(items) {
  if (!items.length) return '<span class="summary-empty">Sin registros</span>';
  return items
    .map((item) => `<span class="summary-chip">${escapeHtml(categoryName(item.label))} <strong>${escapeHtml(money(item.amount))}</strong></span>`)
    .join("");
}

function effectiveCategories() {
  const fallback = [
    { id: "general", name: "General", color: "#606979" },
    { id: "comida", name: "Comida", color: "#d38c49" },
    { id: "delivery", name: "Delivery", color: "#d9a29a" },
    { id: "casa", name: "Casa", color: "#909a84" },
    { id: "transporte", name: "Transporte", color: "#958c9e" },
    { id: "salud", name: "Salud", color: "#887d7f" }
  ];
  const merged = new Map(fallback.map((item) => [item.id, item]));
  for (const item of latestCategories || []) merged.set(item.id, item);
  return [...merged.values()];
}

function categoryConfig(id) {
  return effectiveCategories().find((item) => item.id === id) || { id, name: titleCase(id), color: "#606979" };
}

function categoryName(id) {
  return categoryConfig(id).name || titleCase(id);
}

function renderCategoryBadge(id) {
  const category = categoryConfig(id);
  return `<span class="category-pill" style="--category-color: ${escapeHtml(category.color)}">${escapeHtml(category.name)}</span>`;
}

function personName(id) {
  return latestPeople.find((person) => person.id === id)?.name || id;
}

function titleCase(value) {
  return String(value || "")
    .split(/(\s+|-)/)
    .map((part) => (/^\s+$|-$/.test(part) || !part ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join("");
}

function normalizeCategory(value) {
  return normalize(value || "general").replace(/\s+/g, " ") || "general";
}

function openExpenseEditor(item) {
  const month = billingCycleKeyForDate(item.date);
  if (isMonthLocked(month)) {
    els.botReply.textContent = `No se puede editar un registro del ciclo ${formatCycleLabel(month)} porque el cierre ya esta liquidado.`;
    return;
  }
  if (isMonthClosedButEditable(month) && !confirm(`Este ciclo ya tiene un cierre guardado. Si editas este gasto, recalcula o guarda el cierre nuevamente. Continuar?`)) {
    return;
  }

  editingExpenseId = item.id;
  els.expenseDateInput.value = isoDateInput(item.date);
  els.expenseDescriptionInput.value = item.description || "";
  els.expenseAmountInput.value = String(item.amount || "");
  els.expenseCategoryInput.value = titleCase(item.category || "general");
  renderPayerOptions(item);
  renderParticipantOptions(item);
  els.expenseOriginalText.textContent = originalTextFor(item);
  els.expenseDialog.showModal();
}

function closeExpenseEditor() {
  editingExpenseId = null;
  els.expenseDialog.close();
}

function originalTextFor(item) {
  if (item.originalText) return item.originalText;
  if (item.source === "whatsapp") return "Este registro viene de WhatsApp, pero fue creado antes de guardar el mensaje original.";
  return "Este registro fue creado manualmente o antes de guardar el mensaje original.";
}

function renderPayerOptions(item) {
  els.expensePayerInput.innerHTML = "";
  for (const person of latestPeople) {
    const option = document.createElement("option");
    option.value = person.name;
    option.textContent = person.name;
    option.selected = person.id === item.payerId;
    els.expensePayerInput.append(option);
  }
}

function renderParticipantOptions(item) {
  const selected = new Set(item.participantIds || []);
  els.expenseParticipantsInput.innerHTML = "";
  for (const person of latestPeople) {
    const label = document.createElement("label");
    label.className = "check-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = person.name;
    input.checked = selected.has(person.id);

    const name = document.createElement("span");
    name.textContent = person.name;

    const share = document.createElement("input");
    share.type = "number";
    share.min = "0";
    share.step = "0.01";
    share.className = "share-input";
    share.placeholder = "igual";
    share.value = item.shares?.[person.id] === undefined ? "" : String(item.shares[person.id]);
    share.disabled = !input.checked;

    input.addEventListener("change", () => {
      share.disabled = !input.checked;
      if (!input.checked) share.value = "";
    });

    label.append(input, name, share);
    els.expenseParticipantsInput.append(label);
  }
}

function selectedParticipantNames() {
  return [...els.expenseParticipantsInput.querySelectorAll("input:checked")].map((input) => input.value);
}

function selectedShares() {
  const selected = [...els.expenseParticipantsInput.querySelectorAll(".check-option")].filter((label) => {
    return label.querySelector('input[type="checkbox"]').checked;
  });
  const filled = selected.filter((label) => label.querySelector(".share-input").value.trim() !== "");
  if (!filled.length) return null;
  if (filled.length !== selected.length) return {};

  return Object.fromEntries(
    selected.map((label) => {
      const checkbox = label.querySelector('input[type="checkbox"]');
      const share = Number(label.querySelector(".share-input").value);
      return [checkbox.value, Number.isFinite(share) ? share : 0];
    })
  );
}

function row(title, detail) {
  const node = document.createElement("div");
  node.className = "row";
  const text = document.createElement("div");
  text.innerHTML = `<strong>${escapeHtml(title)}</strong><br><small>${escapeHtml(detail)}</small>`;
  node.append(text);
  return node;
}

function empty(text) {
  const node = document.createElement("div");
  node.className = "empty";
  node.textContent = text;
  return node;
}

function money(value, currency = "PEN") {
  return `${currency === "PEN" ? "S/" : currency} ${Number(value).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function isoDateInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseInputDate(value) {
  const trimmed = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

refresh().catch((error) => {
  els.botReply.textContent = error.message;
});
