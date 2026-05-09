import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import {
  addShoppingItem,
  addTask,
  addListItem,
  calculateBalances,
  completeList,
  createList,
  createListFromTemplate,
  deleteList,
  createExpense,
  createPayment,
  formatMoney,
  normalizeCategories,
  normalizeLists,
  restoreList,
  saveMonthlyClosure,
  saveListAsTemplate,
  updateCategories,
  updateExpense,
  updateList,
  updateListItem,
  removeListItem,
  updateShoppingItem,
  updateTask,
  voidExpense
} from "./src/domain.js";
import { handleNaturalMessage } from "./src/parser.js";
import { loadState, saveState } from "./src/store.js";
import { enrichMediaInput, loadTmdbConfig } from "./src/tmdb.js";
import { loadLocalEnv } from "./src/env.js";
import { authenticateRequest, loginWithPin } from "./src/auth.js";

const ROOT = resolve(".");
await loadLocalEnv(ROOT);

const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || join(ROOT, "data", "hub.json");
const PUBLIC_DIR = join(ROOT, "public");

let state = await loadState(DATA_FILE);
const tmdbConfig = await loadTmdbConfig(ROOT);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Error inesperado" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pukis Hub escuchando en http://localhost:${PORT}`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/info") {
    sendJson(res, 200, {
      name: "Pukis Hub",
      version: "0.1.0",
      modules: ["expenses", "billing-cycles", "lists", "categories", "exports", "zonina-local", "whatsapp-ready", "discord-preview"]
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const session = loginWithPin(body.pin);
    if (!session) {
      sendJson(res, 401, { error: "PIN incorrecto" });
      return;
    }
    sendJson(res, 200, session);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const user = authenticateRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "Sesion no valida" });
      return;
    }
    sendJson(res, 200, { user });
    return;
  }

  const authUser = authenticateRequest(req);
  if (!authUser) {
    sendJson(res, 401, { error: "Inicia sesion con tu PIN para continuar." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/help") {
    sendJson(res, 200, {
      inbound: { method: "POST", path: "/api/whatsapp/simulate", body: { from: "Rodrigo", text: "Jess pago 80 delivery para ambos" } },
      reminders: { method: "GET", path: "/api/whatsapp/reminders" },
      examples: [
        "Jess pago 80 delivery para ambos",
        "pague 100 cena para ambos dividir 70/30",
        "ayer gaste 45 farmacia no dividir",
        "mi mama pago 120 mercado para nosotros",
        "Jess me pago 50",
        "crea lista Viaje",
        "crea checklist viaje",
        "crea lista Botiquin para 20/05",
        "agrega pasaporte y bloqueador a lista Viaje",
        "agrega cargador urgente a lista viaje",
        "marca pasaporte como listo en lista Viaje",
        "quita bloqueador de lista Viaje",
        "completa lista Viaje",
        "resumen semanal de listas",
        "lista Viaje"
      ]
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/reminders") {
    sendJson(res, 200, buildWhatsappReminders());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    normalizeCategories(state);
    normalizeLists(state);
    sendJson(res, 200, buildViewState());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/lists") {
    const body = await readJson(req);
    const list = createList(state, body);
    await persist();
    sendJson(res, 201, { list });
    return;
  }

  const listPatch = url.pathname.match(/^\/api\/lists\/([^/]+)$/);
  if (req.method === "PATCH" && listPatch) {
    const body = await readJson(req);
    const list = updateList(state, listPatch[1], body);
    await persist();
    sendJson(res, 200, { list });
    return;
  }

  if (req.method === "DELETE" && listPatch) {
    const list = deleteList(state, listPatch[1]);
    await persist();
    sendJson(res, 200, { list });
    return;
  }

  const listRestore = url.pathname.match(/^\/api\/lists\/([^/]+)\/restore$/);
  if (req.method === "POST" && listRestore) {
    const list = restoreList(state, listRestore[1]);
    await persist();
    sendJson(res, 200, { list });
    return;
  }

  const listSaveTemplate = url.pathname.match(/^\/api\/lists\/([^/]+)\/template$/);
  if (req.method === "POST" && listSaveTemplate) {
    const body = await readJson(req);
    const template = saveListAsTemplate(state, listSaveTemplate[1], body.name);
    await persist();
    sendJson(res, 201, { template });
    return;
  }

  const listItemPost = url.pathname.match(/^\/api\/lists\/([^/]+)\/items$/);
  if (req.method === "POST" && listItemPost) {
    const body = await readJson(req);
    const list = normalizeLists(state).find((candidate) => candidate.id === listItemPost[1]);
    const enrichedBody = await requireTmdbForMediaInput(body, list?.category);
    const item = addListItem(state, listItemPost[1], enrichedBody);
    await persist();
    sendJson(res, 201, { item });
    return;
  }

  const listItemPatch = url.pathname.match(/^\/api\/lists\/([^/]+)\/items\/([^/]+)$/);
  if (req.method === "PATCH" && listItemPatch) {
    const body = await readJson(req);
    const item = updateListItem(state, listItemPatch[1], listItemPatch[2], body);
    await persist();
    sendJson(res, 200, { item });
    return;
  }

  if (req.method === "DELETE" && listItemPatch) {
    const item = removeListItem(state, listItemPatch[1], listItemPatch[2]);
    await persist();
    sendJson(res, 200, { item });
    return;
  }

  const listComplete = url.pathname.match(/^\/api\/lists\/([^/]+)\/complete$/);
  if (req.method === "POST" && listComplete) {
    const list = completeList(state, listComplete[1]);
    await persist();
    sendJson(res, 200, { list });
    return;
  }

  const listTemplate = url.pathname.match(/^\/api\/lists\/templates\/([^/]+)$/);
  if (req.method === "POST" && listTemplate) {
    const body = await readJson(req);
    const list = createListFromTemplate(state, listTemplate[1], body);
    await persist();
    sendJson(res, 201, { list });
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/categories") {
    const body = await readJson(req);
    const categories = updateCategories(state, body);
    await persist();
    sendJson(res, 200, { categories });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/expenses") {
    const body = await readJson(req);
    ensureMonthCanChange(body.date || new Date().toISOString());
    const expense = createExpense(state, body);
    await persist();
    sendJson(res, 201, { expense, balances: calculateBalances(state) });
    return;
  }

  const expensePatch = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
  if (req.method === "PATCH" && expensePatch) {
    const body = await readJson(req);
    const current = state.expenses.find((item) => item.id === expensePatch[1]);
    ensureMonthCanChange(body.date || current?.date || new Date().toISOString());
    const expense = updateExpense(state, expensePatch[1], body);
    await persist();
    sendJson(res, 200, { expense, balances: calculateBalances(state) });
    return;
  }

  if (req.method === "DELETE" && expensePatch) {
    const current = state.expenses.find((item) => item.id === expensePatch[1]);
    ensureMonthCanChange(current?.date || new Date().toISOString());
    const expense = voidExpense(state, expensePatch[1]);
    await persist();
    sendJson(res, 200, { expense, balances: calculateBalances(state) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/payments") {
    const body = await readJson(req);
    const payment = createPayment(state, body);
    await persist();
    sendJson(res, 201, { payment, balances: calculateBalances(state) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/monthly-closures") {
    const body = await readJson(req);
    const closure = saveMonthlyClosure(state, body);
    await persist();
    sendJson(res, 201, { closure });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/shopping/items") {
    const body = await readJson(req);
    const item = addShoppingItem(state, body);
    await persist();
    sendJson(res, 201, { item });
    return;
  }

  const shoppingPatch = url.pathname.match(/^\/api\/shopping\/items\/([^/]+)$/);
  if (req.method === "PATCH" && shoppingPatch) {
    const body = await readJson(req);
    const item = updateShoppingItem(state, shoppingPatch[1], body);
    await persist();
    sendJson(res, 200, { item });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJson(req);
    const task = addTask(state, body);
    await persist();
    sendJson(res, 201, { task });
    return;
  }

  const taskPatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (req.method === "PATCH" && taskPatch) {
    const body = await readJson(req);
    const task = updateTask(state, taskPatch[1], body);
    await persist();
    sendJson(res, 200, { task });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/whatsapp/simulate") {
    const body = await readJson(req);
    const result = await processNaturalMessage({ ...body, from: authUser.name });
    await persist();
    sendJson(res, 200, { ...result, state: buildViewState() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/zonina/chat") {
    const body = await readJson(req);
    const result = await processNaturalMessage({ ...body, from: authUser.name });
    await persist();
    sendJson(res, 200, body.includeState ? { ...result, state: buildViewState() } : result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/discord/preview") {
    sendJson(res, 200, buildDiscordPreview());
    return;
  }

  sendJson(res, 404, { error: "Ruta API no encontrada" });
}

function buildViewState() {
  normalizeCategories(state);
  normalizeLists(state);
  return {
    ...state,
    lists: state.lists.filter((item) => !item.deletedAt),
    deletedLists: state.lists.filter((item) => item.deletedAt),
    balances: calculateBalances(state),
    allExpenses: [...state.expenses]
      .filter((item) => !item.voidedAt)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    recentExpenses: [...state.expenses]
      .filter((item) => !item.voidedAt)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10),
    recentPayments: [...state.payments]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5),
    monthlyClosures: [...(state.monthlyClosures || [])]
      .map(enrichMonthlyClosure)
      .sort((a, b) => b.month.localeCompare(a.month)),
    openShoppingItems: state.shoppingItems.filter((item) => !item.checked),
    openTasks: state.tasks.filter((task) => task.status !== "done")
  };
}

function enrichMonthlyClosure(closure) {
  const balances = (closure.balances || []).map((balance) => ({
    ...balance,
    settledAt: closure.status === "reopened" ? null : balance.settledAt || findSettlementDate(closure, balance) || null
  }));
  const status =
    closure.status === "reopened"
      ? "reopened"
      : closure.status === "card_paid" || closure.cardPaidAt
        ? "card_paid"
        : balances.length && balances.every((balance) => balance.settledAt)
          ? "settled"
          : "pending";
  return {
    ...closure,
    status,
    cycleStart: closure.cycleStart || cycleStartForKey(closure.month),
    cycleEnd: closure.cycleEnd || cycleEndForKey(closure.month),
    dueDate: closure.dueDate || cycleDueDateForKey(closure.month),
    cardPaidAt: closure.cardPaidAt || null,
    responsibilities: closure.responsibilities?.length ? closure.responsibilities : calculateClosureResponsibilities(closure.month),
    balances,
    settlements: closure.status === "reopened" ? [] : calculateClosureSettlements(closure, balances)
  };
}

function calculateClosureResponsibilities(month) {
  const peopleById = Object.fromEntries(state.people.map((person) => [person.id, person.name]));
  const totals = new Map();
  for (const expense of state.expenses.filter((item) => !item.voidedAt && billingCycleKeyForDate(item.date) === month)) {
    for (const [personId, share] of Object.entries(expense.shares || {})) {
      const label = peopleById[personId] || personId;
      totals.set(label, (totals.get(label) || 0) + Number(share || 0));
    }
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

function findSettlementDate(closure, balance) {
  return findSettlementPayment(closure, balance)?.createdAt || null;
}

function findSettlementPayment(closure, balance) {
  const peopleById = Object.fromEntries(state.people.map((person) => [person.id, person.name]));
  return state.payments.find((item) => {
    const from = peopleById[item.fromId] || item.fromId;
    const to = peopleById[item.toId] || item.toId;
    const settlementStart = closure.reopenedAt || closure.createdAt;
    const createdAfterClosure = !settlementStart || new Date(item.createdAt).getTime() >= new Date(settlementStart).getTime();
    return (
      createdAfterClosure &&
      from === balance.from &&
      to === balance.to &&
      Math.abs(Number(item.amount || 0) - Number(balance.amount || 0)) < 0.01
    );
  });
}

function calculateClosureSettlements(closure, balances) {
  const peopleById = Object.fromEntries(state.people.map((person) => [person.id, person.name]));
  return balances
    .map((balance) => {
      const payment = findSettlementPayment(closure, balance);
      if (!payment) return null;
      return {
        id: payment.id,
        from: peopleById[payment.fromId] || payment.fromId,
        to: peopleById[payment.toId] || payment.toId,
        amount: payment.amount,
        currency: payment.currency,
        date: payment.date,
        createdAt: payment.createdAt,
        description: payment.description
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function ensureMonthCanChange(date) {
  const month = billingCycleKeyForDate(date);
  const closure = (state.monthlyClosures || []).find((item) => item.month === month);
  if (!closure) return;
  const enriched = enrichMonthlyClosure(closure);
  if (enriched.status === "settled" || enriched.status === "card_paid") {
    throw new Error("No se puede modificar un ciclo con cierre liquidado. Reabre el cierre primero.");
  }
}

function billingCycleKeyForDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const cycleEnd = day <= 10 ? new Date(Date.UTC(year, month, 10)) : new Date(Date.UTC(year, month + 1, 10));
  return `${cycleEnd.getUTCFullYear()}-${String(cycleEnd.getUTCMonth() + 1).padStart(2, "0")}`;
}

function cycleStartForKey(key) {
  const [year, month] = parseCycleKey(key);
  if (!year) return null;
  return new Date(Date.UTC(year, month - 2, 11)).toISOString().slice(0, 10);
}

function cycleEndForKey(key) {
  const [year, month] = parseCycleKey(key);
  if (!year) return null;
  return new Date(Date.UTC(year, month - 1, 10)).toISOString().slice(0, 10);
}

function cycleDueDateForKey(key) {
  const [year, month] = parseCycleKey(key);
  if (!year) return null;
  return new Date(Date.UTC(year, month, 3)).toISOString().slice(0, 10);
}

function parseCycleKey(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return [0, 0];
  return [Number(match[1]), Number(match[2])];
}

function buildDiscordPreview() {
  const closures = [...(state.monthlyClosures || [])].map(enrichMonthlyClosure).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 5);
  const openShopping = state.shoppingItems.filter((item) => !item.checked).slice(0, 10);
  const openTasks = state.tasks.filter((task) => task.status !== "done").slice(0, 10);

  return {
    username: "Pukis Hub",
    embeds: [
      {
        title: "Resumen de casa",
        color: 0x2f855a,
        fields: [
          {
            name: "Ciclos",
            value: closures.length ? closures.map((item) => `${formatCycleLabel(item.month)}: ${formatMoney(item.total)} - ${item.status}`).join("\n") : "Sin ciclos guardados."
          },
          {
            name: "Compras",
            value: openShopping.length ? openShopping.map((item) => `- ${item.name}`).join("\n") : "Sin compras pendientes."
          },
          {
            name: "Pendientes",
            value: openTasks.length ? openTasks.map((item) => `- ${item.title}`).join("\n") : "Sin pendientes abiertos."
          }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function buildWhatsappReminders() {
  const reminders = calculateReminders();
  const message = reminders.length
    ? ["Recordatorios Pukis:", ...reminders.map((item) => `- ${item.title}: ${item.detail} (${item.when})`)].join("\n")
    : "Pukis no tiene recordatorios pendientes.";
  return { reminders, message };
}

function calculateReminders() {
  const reminders = [];
  const currentKey = billingCycleKeyForDate(new Date().toISOString());
  const keys = [...new Set([
    currentKey,
    ...state.expenses.filter((item) => !item.voidedAt).map((item) => billingCycleKeyForDate(item.date)),
    ...(state.monthlyClosures || []).map((item) => item.month)
  ].filter(Boolean))].sort().reverse();

  for (const key of keys.slice(0, 8)) {
    const closure = (state.monthlyClosures || []).map(enrichMonthlyClosure).find((item) => item.month === key);
    const expenses = state.expenses.filter((item) => !item.voidedAt && billingCycleKeyForDate(item.date) === key);
    const daysToClose = daysUntil(cycleEndForKey(key));
    const daysToPay = daysUntil(cycleDueDateForKey(key));

    if (key === currentKey && !closure) {
      reminders.push({
        type: "cierre",
        title: "Ciclo actual sin cerrar",
        detail: `${formatCycleLabel(key)} tiene ${expenses.length} registro(s)`,
        when: formatDaysLeft(daysToClose),
        priority: daysToClose <= 3 ? "alta" : "media"
      });
    }

    if (daysToClose >= 0 && daysToClose <= 3) {
      reminders.push({
        type: "corte",
        title: "Corte de tarjeta Jess cerca",
        detail: `Corta el ${cycleEndForKey(key)}`,
        when: formatDaysLeft(daysToClose),
        priority: "alta"
      });
    }

    if (closure && closure.status !== "card_paid" && closure.status !== "settled") {
      reminders.push({
        type: "liquidacion",
        title: "Liquidaciones pendientes",
        detail: `Revisar ${formatCycleLabel(key)}`,
        when: "Pendiente",
        priority: "alta"
      });
    }

    if (closure && closure.status === "settled" && !closure.cardPaidAt) {
      reminders.push({
        type: "tarjeta",
        title: "Marcar tarjeta Jess pagada",
        detail: `Pago programado ${cycleDueDateForKey(key)}`,
        when: formatDaysLeft(daysToPay),
        priority: daysToPay <= 3 ? "alta" : "media"
      });
    }

    const generalCount = expenses.filter((item) => (item.category || "general") === "general").length;
    if (generalCount) {
      reminders.push({
        type: "revision",
        title: "Gastos en General",
        detail: `${generalCount} registro(s) del ciclo ${formatCycleLabel(key)} necesitan categoria`,
        when: "Antes de cerrar",
        priority: "media"
      });
    }
  }

  return reminders.sort((a, b) => (a.priority === "alta" ? 0 : 1) - (b.priority === "alta" ? 0 : 1));
}

function daysUntil(value) {
  const target = parseLocalDate(value);
  const today = parseLocalDate(new Date().toISOString());
  if (!target || !today) return 0;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function formatDaysLeft(days) {
  if (days === 0) return "hoy";
  if (days > 0) return `${days} dia(s)`;
  return `${Math.abs(days)} dia(s) tarde`;
}

function formatCycleLabel(key) {
  const start = cycleStartForKey(key);
  const end = cycleEndForKey(key);
  if (!start || !end) return key;
  return `${start} a ${end}`;
}

function parseLocalDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatBalances(balances) {
  if (!balances.length) return "Todo estÃ¡ cuadrado por ahora.";
  return balances.map((item) => `${item.from} le debe a ${item.to}: ${formatMoney(item.amount, item.currency)}.`).join("\n");
}

async function persist() {
  await saveState(DATA_FILE, state);
}

async function processNaturalMessage(body) {
  const result = handleNaturalMessage(state, body);
  await enrichNaturalMessageMediaResult(result);
  if (result.intent === "balance") {
    result.data.balances = calculateBalances(state);
    result.reply = formatBalances(result.data.balances);
  }
  return result;
}

async function enrichNaturalMessageMediaResult(result) {
  const list = result?.data?.list;
  const items = result?.data?.items || [];
  if (!list || !items.length) return;
  const skipped = [];
  const visibleItems = [];
  for (const item of items) {
    const enriched = await safelyEnrichMediaInput(item, list.category);
    if (isMediaCategory(list.category) && !enriched.tmdbId) {
      removeListItem(state, list.id, item.id);
      skipped.push(item.title);
      continue;
    }
    updateListItem(state, list.id, item.id, enriched);
    Object.assign(item, enriched);
    visibleItems.push(item);
  }
  result.data.items = visibleItems;
  if (isMediaCategory(list.category) && visibleItems.length) {
    result.reply = `Listo. Agregue a ${list.name}: ${visibleItems.map(formatMediaChatItem).join(", ")}.`;
  }
  if (skipped.length) {
    const message = `No agregue ${skipped.join(", ")} porque no lo encontre en TMDb.`;
    result.reply = visibleItems.length ? `${result.reply}\n${message}` : message;
  }
}

async function safelyEnrichMediaInput(input, category) {
  try {
    return await enrichMediaInput(input, category, tmdbConfig);
  } catch (error) {
    console.warn(`No pude enriquecer con TMDb: ${error.message}`);
    return input;
  }
}

async function requireTmdbForMediaInput(input, category) {
  const enriched = await safelyEnrichMediaInput(input, category);
  if (isMediaCategory(category) && !enriched.tmdbId) {
    throw new Error(`No encontre "${input.title || "ese titulo"}" en TMDb. Ajusta el nombre antes de agregarlo.`);
  }
  return enriched;
}

function isMediaCategory(category) {
  return ["peliculas", "series", "anime"].includes(String(category || "").toLowerCase());
}

function formatMediaChatItem(item) {
  const title = item.originalTitle || item.title;
  const label = item.tmdbUrl ? `[${title}](${item.tmdbUrl})` : title;
  const extras = [];
  if (item.rating) extras.push(`${item.rating}/5`);
  if (item.platform) extras.push(item.platform);
  if (item.year) extras.push(item.year);
  if (item.director) extras.push(item.director);
  if (item.creator) extras.push(item.creator);
  if (!item.director && !item.creator && item.productionCompanies?.length) extras.push(item.productionCompanies[0]);
  if (item.mediaStatus && item.mediaStatus !== "pendiente") extras.push(item.mediaStatus);
  return extras.length ? `${label} (${extras.join(", ")})` : label;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(PUBLIC_DIR, `.${safePath}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Ruta no permitida" });
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { error: "Archivo no encontrado" });
      return;
    }
    throw error;
  }
}

function contentType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };
  return types[extname(filePath)] || "application/octet-stream";
}
