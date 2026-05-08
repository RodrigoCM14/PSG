export const HOME_PEOPLE = ["Rodrigo", "Jess"];
export const DEFAULT_CATEGORIES = [
  { id: "general", name: "General", color: "#606979" },
  { id: "comida", name: "Comida", color: "#d38c49" },
  { id: "delivery", name: "Delivery", color: "#d9a29a" },
  { id: "casa", name: "Casa", color: "#909a84" },
  { id: "transporte", name: "Transporte", color: "#958c9e" },
  { id: "salud", name: "Salud", color: "#887d7f" }
];
export const DEFAULT_LIST_CATEGORIES = ["general", "viaje", "casa", "wishlist", "tramites", "compras", "salud", "trabajo", "peliculas", "series", "anime"];
export const LIST_TEMPLATES = {
  viaje: ["Pasaporte", "DNI", "Cargadores", "Bloqueador", "Reservas", "Medicinas"],
  mudanza: ["Cajas", "Cinta", "Cambiar direccion", "Coordinar transporte", "Separar documentos"],
  botiquin: ["Paracetamol", "Alcohol", "Curitas", "Termometro", "Antialergico"],
  compras: ["Revisar despensa", "Armar menu", "Comprar basicos"],
  tramites: ["Revisar requisitos", "Agendar cita", "Preparar documentos"]
};

export function createInitialState(now = new Date().toISOString()) {
  const people = [
    { id: "rodrigo", name: "Rodrigo", kind: "home", aliases: ["yo", "me", "mi", "rodrigo"] },
    { id: "jess", name: "Jess", kind: "home", aliases: ["jess", "vale", "novia"] }
  ];

  return {
    meta: {
      version: 1,
      createdAt: now,
      updatedAt: now
    },
    people,
    expenses: [],
    payments: [],
    shoppingItems: [],
    tasks: [],
    lists: [],
    customListTemplates: {},
    monthlyClosures: [],
    categories: [...DEFAULT_CATEGORIES]
  };
}

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function formatMoney(value, currency = "PEN") {
  const symbol = currency === "PEN" ? "S/" : currency;
  return `${symbol} ${money(value).toFixed(2)}`;
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function findPerson(state, nameOrAlias) {
  const wanted = normalizeText(nameOrAlias);
  return state.people.find((person) => {
    return normalizeText(person.name) === wanted || person.aliases.some((alias) => normalizeText(alias) === wanted);
  });
}

export function ensurePerson(state, name, kind = "external") {
  const existing = findPerson(state, name);
  if (existing) return existing;

  const base = slugify(name) || "persona";
  let id = base;
  let suffix = 2;
  while (state.people.some((person) => person.id === id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  const person = {
    id,
    name: String(name).trim(),
    kind,
    aliases: [String(name).trim()]
  };
  state.people.push(person);
  return person;
}

export function getHomePeople(state) {
  return HOME_PEOPLE.map((name) => ensurePerson(state, name, "home"));
}

export function inferActor(state, actorName) {
  if (!actorName) return ensurePerson(state, "Rodrigo", "home");
  return ensurePerson(state, actorName, HOME_PEOPLE.includes(actorName) ? "home" : "external");
}

export function createExpense(state, input, now = new Date().toISOString()) {
  const payer = ensurePerson(state, input.payerName || input.payer || "Rodrigo", input.payerKind || "home");
  const currency = input.currency || "PEN";
  const amount = money(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto del gasto debe ser mayor a cero.");
  }

  const participants = resolveParticipants(state, input, payer);
  const shares = buildShares(participants, amount, input.shares);
  const expense = {
    id: newId("exp"),
    description: input.description || "Gasto",
    amount,
    currency,
    date: input.date || now,
    category: input.category || "general",
    payerId: payer.id,
    participantIds: participants.map((person) => person.id),
    shares,
    source: input.source || "manual",
    notes: input.notes || "",
    originalText: input.originalText || "",
    createdAt: now,
    updatedAt: now,
    voidedAt: null
  };

  state.expenses.push(expense);
  touch(state, now);
  return expense;
}

export function updateExpense(state, id, input, now = new Date().toISOString()) {
  const expense = state.expenses.find((candidate) => candidate.id === id);
  if (!expense) throw new Error("No encontre ese gasto.");
  if (expense.voidedAt) throw new Error("Ese gasto esta anulado.");

  const nextAmount = input.amount === undefined ? expense.amount : money(input.amount);
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw new Error("El monto del gasto debe ser mayor a cero.");
  }

  const nextDescription = input.description === undefined ? expense.description : String(input.description || "").trim();
  if (!nextDescription) throw new Error("El gasto necesita descripcion.");

  let payer = state.people.find((person) => person.id === expense.payerId);
  if (input.payerName || input.payer) {
    payer = ensurePerson(state, input.payerName || input.payer, input.payerKind || payer?.kind || "external");
  }

  let participants = expense.participantIds.map((personId) => state.people.find((person) => person.id === personId)).filter(Boolean);
  if (input.scope || input.participantNames || input.shares || input.amount !== undefined || input.payerName || input.payer) {
    participants = resolveParticipants(state, input, payer);
  }

  Object.assign(expense, {
    amount: nextAmount,
    description: nextDescription,
    currency: input.currency || expense.currency,
    category: input.category || expense.category,
    notes: input.notes === undefined ? expense.notes : String(input.notes || ""),
    originalText: input.originalText === undefined ? expense.originalText || "" : String(input.originalText || ""),
    date: input.date || expense.date,
    payerId: payer.id,
    participantIds: participants.map((person) => person.id),
    shares: buildShares(participants, nextAmount, input.shares),
    updatedAt: now
  });
  touch(state, now);
  return expense;
}

export function voidExpense(state, id, now = new Date().toISOString()) {
  const expense = state.expenses.find((candidate) => candidate.id === id);
  if (!expense) throw new Error("No encontre ese gasto.");
  expense.voidedAt = now;
  expense.updatedAt = now;
  touch(state, now);
  return expense;
}

export function createPayment(state, input, now = new Date().toISOString()) {
  const from = ensurePerson(state, input.fromName || input.from || "Rodrigo");
  const to = ensurePerson(state, input.toName || input.to || "Jess");
  const amount = money(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto del pago debe ser mayor a cero.");
  }

  const payment = {
    id: newId("pay"),
    fromId: from.id,
    toId: to.id,
    amount,
    currency: input.currency || "PEN",
    date: input.date || now,
    description: input.description || "Pago",
    source: input.source || "manual",
    createdAt: now
  };

  state.payments.push(payment);
  touch(state, now);
  return payment;
}

export function normalizeCategories(state) {
  state.categories = Array.isArray(state.categories) ? state.categories : [];
  const existing = new Set(state.categories.map((item) => item.id));
  for (const category of DEFAULT_CATEGORIES) {
    if (!existing.has(category.id)) state.categories.push({ ...category });
  }
  return state.categories;
}

export function updateCategories(state, input, now = new Date().toISOString()) {
  const incoming = Array.isArray(input.categories) ? input.categories : [];
  state.categories = incoming
    .map((item) => {
      const id = slugify(item.id || item.name);
      if (!id) return null;
      return {
        id,
        name: String(item.name || id).trim(),
        color: /^#[0-9a-f]{6}$/i.test(String(item.color || "")) ? item.color : "#606979"
      };
    })
    .filter(Boolean);
  normalizeCategories(state);
  touch(state, now);
  return state.categories;
}

function resolveParticipants(state, input, payer) {
  if (Array.isArray(input.participantNames) && input.participantNames.length > 0) {
    return input.participantNames.map((name) => ensurePerson(state, name));
  }

  if (input.scope === "self") return [payer];
  if (input.scope === "jess") return [ensurePerson(state, "Jess", "home")];
  if (input.scope === "rodrigo") return [ensurePerson(state, "Rodrigo", "home")];
  if (input.scope === "home" || payer.kind === "external") return getHomePeople(state);

  return getHomePeople(state);
}

function buildShares(participants, amount, explicitShares) {
  if (!participants.length) {
    throw new Error("El gasto necesita al menos un participante.");
  }

  if (explicitShares && typeof explicitShares === "object") {
    const shares = Object.fromEntries(
      participants.map((person) => [person.id, money(explicitShares[person.name] ?? explicitShares[person.id] ?? 0)])
    );
    const total = money(Object.values(shares).reduce((sum, value) => sum + value, 0));
    if (Math.abs(total - amount) > 0.01) {
      throw new Error("La division personalizada debe sumar el monto total del gasto.");
    }
    return shares;
  }

  const base = Math.floor((amount * 100) / participants.length);
  let remaining = Math.round(amount * 100) - base * participants.length;
  return Object.fromEntries(
    participants.map((person) => {
      const cents = base + (remaining > 0 ? 1 : 0);
      remaining -= 1;
      return [person.id, cents / 100];
    })
  );
}

export function calculateBalances(state, currency = "PEN") {
  const positions = new Map();
  const move = (fromId, toId, amount) => {
    const rounded = money(amount);
    if (!rounded || fromId === toId) return;
    positions.set(fromId, money((positions.get(fromId) || 0) - rounded));
    positions.set(toId, money((positions.get(toId) || 0) + rounded));
  };

  for (const expense of state.expenses.filter((item) => !item.voidedAt && item.currency === currency)) {
    for (const [personId, share] of Object.entries(expense.shares)) {
      move(personId, expense.payerId, share);
    }
  }

  for (const payment of state.payments.filter((item) => item.currency === currency)) {
    move(payment.toId, payment.fromId, payment.amount);
  }

  const debtors = [];
  const creditors = [];
  for (const [personId, balance] of positions.entries()) {
    const rounded = money(balance);
    if (rounded < -0.009) debtors.push({ personId, amount: money(Math.abs(rounded)) });
    if (rounded > 0.009) creditors.push({ personId, amount: rounded });
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const simplified = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = money(Math.min(debtor.amount, creditor.amount));
    if (amount > 0.009) {
      simplified.push({
        fromId: debtor.personId,
        toId: creditor.personId,
        from: state.people.find((person) => person.id === debtor.personId)?.name || debtor.personId,
        to: state.people.find((person) => person.id === creditor.personId)?.name || creditor.personId,
        amount,
        currency
      });
    }

    debtor.amount = money(debtor.amount - amount);
    creditor.amount = money(creditor.amount - amount);
    if (debtor.amount <= 0.009) debtorIndex += 1;
    if (creditor.amount <= 0.009) creditorIndex += 1;
  }

  return simplified.sort((a, b) => b.amount - a.amount);
}

export function addShoppingItem(state, input, now = new Date().toISOString()) {
  const item = {
    id: newId("shop"),
    name: String(input.name || "").trim(),
    quantity: input.quantity || "",
    category: input.category || "general",
    priority: input.priority || "normal",
    addedById: ensurePerson(state, input.addedBy || "Rodrigo", "home").id,
    checked: false,
    createdAt: now,
    updatedAt: now
  };
  if (!item.name) throw new Error("El item de compras necesita nombre.");
  state.shoppingItems.push(item);
  touch(state, now);
  return item;
}

export function updateShoppingItem(state, id, patch, now = new Date().toISOString()) {
  const item = state.shoppingItems.find((candidate) => candidate.id === id);
  if (!item) throw new Error("No encontre ese item de compras.");
  Object.assign(item, patch, { updatedAt: now });
  touch(state, now);
  return item;
}

export function addTask(state, input, now = new Date().toISOString()) {
  const task = {
    id: newId("task"),
    title: String(input.title || "").trim(),
    assignedToId: input.assignedTo ? ensurePerson(state, input.assignedTo).id : null,
    dueDate: input.dueDate || null,
    status: "open",
    createdAt: now,
    updatedAt: now
  };
  if (!task.title) throw new Error("El pendiente necesita titulo.");
  state.tasks.push(task);
  touch(state, now);
  return task;
}

export function updateTask(state, id, patch, now = new Date().toISOString()) {
  const task = state.tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error("No encontre ese pendiente.");
  Object.assign(task, patch, { updatedAt: now });
  touch(state, now);
  return task;
}

export function normalizeLists(state) {
  state.lists = Array.isArray(state.lists) ? state.lists : [];
  for (const list of state.lists) {
    list.aliases = normalizeListAliases(list.aliases, list.name);
    list.category = list.category || "general";
    list.status = list.status || "open";
    list.deletedAt = list.deletedAt || null;
    list.startDate = list.startDate || list.createdAt?.slice(0, 10) || "";
    list.dueDate = list.dueDate || "";
    list.items = Array.isArray(list.items) ? list.items : [];
    list.items.forEach((item, index) => {
      item.priority = normalizePriority(item.priority);
      item.rating = normalizeRating(item.rating);
      item.platform = item.platform || "";
      item.recommendedBy = item.recommendedBy || "";
      item.mediaStatus = normalizeMediaStatus(item.mediaStatus || (item.done ? "vista" : "pendiente"));
      item.tmdbId = item.tmdbId || null;
      item.tmdbType = item.tmdbType || "";
      item.originalTitle = item.originalTitle || "";
      item.year = item.year || "";
      item.director = item.director || "";
      item.creator = item.creator || "";
      item.productionCompanies = Array.isArray(item.productionCompanies) ? item.productionCompanies : [];
      item.overview = item.overview || "";
      item.posterPath = item.posterPath || "";
      item.tmdbUrl = item.tmdbUrl || "";
      item.order = Number.isFinite(Number(item.order)) ? Number(item.order) : index;
      item.done = Boolean(item.done);
      item.deletedAt = item.deletedAt || null;
    });
    list.items.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }
  return state.lists;
}

export function createList(state, input, now = new Date().toISOString()) {
  normalizeLists(state);
  const name = String(input.name || "").trim();
  const list = {
    id: newId("list"),
    name,
    aliases: normalizeListAliases(input.aliases, name),
    category: input.category || "general",
    startDate: input.startDate || now.slice(0, 10),
    dueDate: input.dueDate || "",
    status: input.status || "open",
    notes: input.notes || "",
    items: [],
    createdAt: now,
    updatedAt: now
  };
  if (!list.name) throw new Error("La lista necesita nombre.");
  state.lists.push(list);
  touch(state, now);
  return list;
}

export function updateList(state, id, patch, now = new Date().toISOString()) {
  const list = normalizeLists(state).find((candidate) => candidate.id === id);
  if (!list) throw new Error("No encontre esa lista.");
  Object.assign(list, {
    name: patch.name === undefined ? list.name : String(patch.name || "").trim(),
    aliases: patch.aliases === undefined ? list.aliases || [] : normalizeListAliases(patch.aliases, patch.name || list.name),
    category: patch.category === undefined ? list.category : patch.category || "general",
    startDate: patch.startDate === undefined ? list.startDate : patch.startDate || "",
    dueDate: patch.dueDate === undefined ? list.dueDate : patch.dueDate || "",
    status: patch.status === undefined ? list.status : patch.status || "open",
    notes: patch.notes === undefined ? list.notes : String(patch.notes || ""),
    updatedAt: now
  });
  if (!list.name) throw new Error("La lista necesita nombre.");
  touch(state, now);
  return list;
}

export function deleteList(state, id, now = new Date().toISOString()) {
  const list = normalizeLists(state).find((candidate) => candidate.id === id);
  if (!list) throw new Error("No encontre esa lista.");
  list.deletedAt = now;
  list.updatedAt = now;
  touch(state, now);
  return list;
}

export function restoreList(state, id, now = new Date().toISOString()) {
  const list = normalizeLists(state).find((candidate) => candidate.id === id);
  if (!list) throw new Error("No encontre esa lista.");
  list.deletedAt = null;
  list.updatedAt = now;
  touch(state, now);
  return list;
}

export function addListItem(state, listId, input, now = new Date().toISOString()) {
  const list = normalizeLists(state).find((candidate) => candidate.id === listId);
  if (!list) throw new Error("No encontre esa lista.");
  const item = {
    id: newId("li"),
    title: String(input.title || "").trim(),
    priority: normalizePriority(input.priority),
    rating: normalizeRating(input.rating),
    platform: String(input.platform || "").trim(),
    recommendedBy: String(input.recommendedBy || "").trim(),
    mediaStatus: normalizeMediaStatus(input.mediaStatus),
    tmdbId: input.tmdbId || null,
    tmdbType: input.tmdbType || "",
    originalTitle: input.originalTitle || "",
    year: input.year || "",
    director: input.director || "",
    creator: input.creator || "",
    productionCompanies: Array.isArray(input.productionCompanies) ? input.productionCompanies : [],
    overview: input.overview || "",
    posterPath: input.posterPath || "",
    tmdbUrl: input.tmdbUrl || "",
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : (list.items || []).length,
    done: input.done === undefined ? false : Boolean(input.done),
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  };
  if (!item.title) throw new Error("El item necesita nombre.");
  list.items = Array.isArray(list.items) ? list.items : [];
  list.items.push(item);
  list.updatedAt = now;
  touch(state, now);
  return item;
}

export function updateListItem(state, listId, itemId, patch, now = new Date().toISOString()) {
  const list = normalizeLists(state).find((candidate) => candidate.id === listId);
  if (!list) throw new Error("No encontre esa lista.");
  const item = (list.items || []).find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("No encontre ese item.");
  Object.assign(item, {
    title: patch.title === undefined ? item.title : String(patch.title || "").trim(),
    priority: patch.priority === undefined ? item.priority || "normal" : normalizePriority(patch.priority),
    rating: patch.rating === undefined ? normalizeRating(item.rating) : normalizeRating(patch.rating),
    platform: patch.platform === undefined ? item.platform || "" : String(patch.platform || "").trim(),
    recommendedBy: patch.recommendedBy === undefined ? item.recommendedBy || "" : String(patch.recommendedBy || "").trim(),
    mediaStatus: patch.mediaStatus === undefined ? normalizeMediaStatus(item.mediaStatus) : normalizeMediaStatus(patch.mediaStatus),
    tmdbId: patch.tmdbId === undefined ? item.tmdbId || null : patch.tmdbId || null,
    tmdbType: patch.tmdbType === undefined ? item.tmdbType || "" : patch.tmdbType || "",
    originalTitle: patch.originalTitle === undefined ? item.originalTitle || "" : patch.originalTitle || "",
    year: patch.year === undefined ? item.year || "" : patch.year || "",
    director: patch.director === undefined ? item.director || "" : patch.director || "",
    creator: patch.creator === undefined ? item.creator || "" : patch.creator || "",
    productionCompanies: patch.productionCompanies === undefined ? item.productionCompanies || [] : Array.isArray(patch.productionCompanies) ? patch.productionCompanies : [],
    overview: patch.overview === undefined ? item.overview || "" : patch.overview || "",
    posterPath: patch.posterPath === undefined ? item.posterPath || "" : patch.posterPath || "",
    tmdbUrl: patch.tmdbUrl === undefined ? item.tmdbUrl || "" : patch.tmdbUrl || "",
    order: patch.order === undefined ? item.order || 0 : Number(patch.order || 0),
    done: patch.done === undefined ? item.done : Boolean(patch.done),
    deletedAt: patch.deletedAt === undefined ? item.deletedAt || null : patch.deletedAt,
    updatedAt: now
  });
  if (!item.title) throw new Error("El item necesita nombre.");
  if (isMediaCategory(list.category)) {
    if (["vista", "descartada"].includes(item.mediaStatus)) item.done = true;
    if (item.mediaStatus === "pendiente" || item.mediaStatus === "viendo") item.done = false;
  }
  list.updatedAt = now;
  touch(state, now);
  return item;
}

export function removeListItem(state, listId, itemId, now = new Date().toISOString()) {
  return updateListItem(state, listId, itemId, { deletedAt: now }, now);
}

export function completeList(state, listId, now = new Date().toISOString()) {
  const list = normalizeLists(state).find((candidate) => candidate.id === listId);
  if (!list) throw new Error("No encontre esa lista.");
  for (const item of list.items || []) {
    if (!item.deletedAt) {
      item.done = true;
      item.updatedAt = now;
    }
  }
  list.status = "done";
  list.updatedAt = now;
  touch(state, now);
  return list;
}

export function createListFromTemplate(state, templateName, input = {}, now = new Date().toISOString()) {
  const key = slugify(templateName);
  const custom = state.customListTemplates?.[key];
  const items = custom?.items || LIST_TEMPLATES[key];
  if (!items) throw new Error("No encontre esa plantilla.");
  const list = createList(state, { name: input.name || custom?.name || titleFromSlug(key), category: input.category || custom?.category || key, aliases: [key], startDate: input.startDate, dueDate: input.dueDate, notes: input.notes }, now);
  for (const item of items) addListItem(state, list.id, typeof item === "string" ? { title: item } : item, now);
  return list;
}

export function saveListAsTemplate(state, listId, templateName, now = new Date().toISOString()) {
  const list = normalizeLists(state).find((candidate) => candidate.id === listId);
  if (!list) throw new Error("No encontre esa lista.");
  const key = slugify(templateName || list.name);
  if (!key) throw new Error("La plantilla necesita nombre.");
  state.customListTemplates = state.customListTemplates || {};
  state.customListTemplates[key] = {
    name: String(templateName || list.name).trim(),
    category: list.category || "general",
    items: (list.items || []).filter((item) => !item.deletedAt).map((item) => ({
      title: item.title,
      priority: item.priority,
      rating: item.rating,
      platform: item.platform,
      recommendedBy: item.recommendedBy,
      mediaStatus: item.mediaStatus
    })),
    createdAt: now,
    updatedAt: now
  };
  touch(state, now);
  return state.customListTemplates[key];
}

function normalizeListAliases(value, name) {
  const aliases = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set([name, ...aliases].map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizePriority(value) {
  const normalized = normalizeText(value || "normal");
  if (["alta", "high", "urgente"].includes(normalized)) return "alta";
  if (["baja", "low"].includes(normalized)) return "baja";
  return "normal";
}

function normalizeRating(value) {
  if (value === undefined || value === null || value === "") return null;
  const rating = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(rating)) return null;
  return Math.min(5, Math.max(1, rating));
}

function normalizeMediaStatus(value) {
  const normalized = normalizeText(value || "pendiente");
  if (["viendo", "en-progreso", "en progreso"].includes(normalized)) return "viendo";
  if (["vista", "visto", "terminada", "terminado", "done"].includes(normalized)) return "vista";
  if (["descartada", "descartado", "descartar"].includes(normalized)) return "descartada";
  return "pendiente";
}

function isMediaCategory(value) {
  return ["peliculas", "series", "anime"].includes(slugify(value || ""));
}

function titleFromSlug(value) {
  return String(value || "").split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function saveMonthlyClosure(state, input, now = new Date().toISOString()) {
  const month = String(input.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("El cierre necesita un ciclo en formato YYYY-MM.");
  }

  const existing = (state.monthlyClosures || []).find((closure) => closure.month === month);
  const closure = {
    id: existing?.id || newId("close"),
    month,
    total: money(input.total || 0),
    expenseCount: Number(input.expenseCount || 0),
    categories: input.categories || [],
    payers: input.payers || [],
    responsibilities: input.responsibilities || [],
    balances: input.balances || [],
    cycleStart: input.cycleStart || existing?.cycleStart || null,
    cycleEnd: input.cycleEnd || existing?.cycleEnd || null,
    dueDate: input.dueDate || existing?.dueDate || null,
    cardPaidAt: input.cardPaidAt === undefined ? existing?.cardPaidAt || null : input.cardPaidAt,
    status: input.status || existing?.status || "pending",
    reopenedAt: input.reopenedAt === undefined ? existing?.reopenedAt || null : input.reopenedAt,
    notes: input.notes || "",
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  state.monthlyClosures = state.monthlyClosures || [];
  if (existing) {
    Object.assign(existing, closure);
    touch(state, now);
    return existing;
  }

  state.monthlyClosures.push(closure);
  touch(state, now);
  return closure;
}

function touch(state, now) {
  state.meta.updatedAt = now;
}
