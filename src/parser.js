import {
  addListItem,
  addShoppingItem,
  addTask,
  completeList,
  createList,
  createListFromTemplate,
  deleteList,
  createExpense,
  createPayment,
  ensurePerson,
  formatMoney,
  LIST_TEMPLATES,
  normalizeText,
  removeListItem,
  restoreList,
  slugify,
  updateListItem
} from "./domain.js";

const MONEY_RE = /(?:s\/\.?|soles?|pen)?\s*(\d+(?:[.,]\d{1,2})?)/i;
const CONNECTOR_RE = /\s*(?:,|\by\b|\be\b|\+)\s*/i;

export function handleNaturalMessage(state, input, now = new Date().toISOString()) {
  const from = input.from || "Rodrigo";
  const raw = String(input.text || "").trim();
  const text = normalizeText(raw);

  if (!text) {
    return { intent: "empty", reply: "Mandame un mensaje con un gasto, compra o pendiente." };
  }

  if (/(cuanto|saldo|debo|debemos|deuda|balance|cuadre)/.test(text)) {
    return { intent: "balance", reply: "Te paso el balance actual.", data: { balances: null } };
  }

  if (isListText(text)) {
    return handleList(state, raw, from, now);
  }

  if (/(compre|comprar|compras|lista|agrega|agregar|falta|faltan)/.test(text) && !isExpenseText(text)) {
    return handleShopping(state, raw, from, now);
  }

  if (/(pendiente|tarea|hacer|recordar|recuerdame|recuérdame|recuérdanos)/.test(raw)) {
    return handleTask(state, raw, from, now);
  }

  if (isPaymentText(text)) {
    return handlePayment(state, raw, from, now);
  }

  if (isExpenseText(text)) {
    return handleExpense(state, raw, from, now);
  }

  return {
    intent: "unknown",
    reply: "No estoy seguro de como clasificar eso. Por ahora entiendo gastos, compras, pendientes y balances."
  };
}

function handleList(state, raw, from, now) {
  const text = normalizeText(raw);

  if (/resumen\s+(?:semanal\s+)?(?:de\s+)?listas|listas\s+activas|pendientes\s+de\s+listas/.test(text)) {
    return summarizeLists(state);
  }

  const templateMatch = text.match(/^(?:crea|crear|arma)\s+(checklist|plantilla|lista)\s+([a-z0-9\s-]+)$/);
  const templateKey = templateMatch ? slugify(templateMatch[2]) : "";
  const shouldUseTemplate = templateMatch && hasTemplate(templateKey) && (templateMatch[1] !== "lista" || ["mudanza", "botiquin", "tramites"].includes(templateKey));
  if (shouldUseTemplate) {
    const list = createListFromTemplate(state, templateKey, { notes: `Creada por WhatsApp por ${from}` }, now);
    return { intent: "list", reply: `Listo. Cree ${list.name} con ${list.items.length} items.`, data: { list } };
  }

  const createMatch = text.match(/^(?:crea|crear|nueva|nuevo|arma|hacer)\s+(?:una\s+)?lista\s+(.+)$/);
  if (createMatch) {
    const parsed = parseListName(createMatch[1], now);
    const list = createList(state, {
      name: titleCase(parsed.name),
      aliases: parsed.aliases,
      category: parsed.category,
      startDate: parsed.startDate || now.slice(0, 10),
      dueDate: parsed.dueDate,
      notes: `Creada por WhatsApp por ${from}`
    }, now);
    return { intent: "list", reply: `Listo. Cree la lista ${list.name}.`, data: { list } };
  }

  const completeListMatch = text.match(/^(?:completa|termina|finaliza)\s+(?:la\s+)?lista\s+(.+)$/);
  if (completeListMatch) {
    const resolved = resolveList(state, completeListMatch[1]);
    if (resolved.reply) return resolved.reply;
    const list = completeList(state, resolved.list.id, now);
    return { intent: "list", reply: `Listo. Complete la lista ${list.name}.`, data: { list } };
  }

  const deleteListMatch = text.match(/^(?:elimina|eliminar|borra|borrar)\s+(?:la\s+)?lista\s+(.+)$/);
  if (deleteListMatch) {
    const resolved = resolveList(state, deleteListMatch[1]);
    if (resolved.reply) return resolved.reply;
    const list = deleteList(state, resolved.list.id, now);
    return { intent: "list", reply: `Listo. Envie ${list.name} a la papelera.`, data: { list } };
  }

  const restoreListMatch = text.match(/^(?:restaura|restaurar|recupera|recuperar)\s+(?:la\s+)?lista\s+(.+)$/);
  if (restoreListMatch) {
    const resolved = resolveList(state, restoreListMatch[1], { includeDeleted: true });
    if (resolved.reply) return resolved.reply;
    const list = restoreList(state, resolved.list.id, now);
    return { intent: "list", reply: `Listo. Restaure ${list.name}.`, data: { list } };
  }

  const doneMatch = text.match(/^(?:marca|marcar|check|completa|termina)\s+(.+?)\s+(?:como\s+)?(?:listo|lista|hecho|hecha|done)\s+(?:en|de)\s+(?:la\s+)?lista\s+(.+)$/);
  if (doneMatch) {
    const resolved = resolveList(state, doneMatch[2]);
    if (resolved.reply) return resolved.reply;
    const item = findListItem(resolved.list, doneMatch[1]);
    if (!item) return { intent: "list", reply: `No encontre ${titleCase(doneMatch[1])} en ${resolved.list.name}.`, data: { list: resolved.list } };
    updateListItem(state, resolved.list.id, item.id, { done: true, mediaStatus: isMediaList(resolved.list) ? "vista" : undefined }, now);
    return { intent: "list", reply: `Listo. Marque ${item.title} como listo en ${resolved.list.name}.`, data: { list: resolved.list, item } };
  }

  const mediaStatusMatch = text.match(/^(?:marca|marcar|pon)\s+(.+?)\s+(?:como\s+)?(pendiente|viendo|vista|visto|descartada|descartado)\s+(?:en|de)\s+(?:la\s+)?lista\s+(.+)$/);
  if (mediaStatusMatch) {
    const resolved = resolveList(state, mediaStatusMatch[3]);
    if (resolved.reply) return resolved.reply;
    const item = findListItem(resolved.list, mediaStatusMatch[1]);
    if (!item) return { intent: "list", reply: `No encontre ${titleCase(mediaStatusMatch[1])} en ${resolved.list.name}.`, data: { list: resolved.list } };
    updateListItem(state, resolved.list.id, item.id, { mediaStatus: mediaStatusMatch[2] }, now);
    return { intent: "list", reply: `Listo. ${item.title} queda como ${mediaStatusMatch[2]} en ${resolved.list.name}.`, data: { list: resolved.list, item } };
  }

  const removeMatch = text.match(/^(?:quita|quitar|borra|borrar|elimina|eliminar)\s+(.+?)\s+(?:de|en)\s+(?:la\s+)?lista\s+(.+)$/);
  if (removeMatch) {
    const resolved = resolveList(state, removeMatch[2]);
    if (resolved.reply) return resolved.reply;
    const item = findListItem(resolved.list, removeMatch[1]);
    if (!item) return { intent: "list", reply: `No encontre ${titleCase(removeMatch[1])} en ${resolved.list.name}.`, data: { list: resolved.list } };
    removeListItem(state, resolved.list.id, item.id, now);
    return { intent: "list", reply: `Listo. Quite ${item.title} de ${resolved.list.name}.`, data: { list: resolved.list, item } };
  }

  const addMatch = text.match(/^(?:agrega|agregar|anade|añade|mete|pon)\s+(.+?)\s+(?:a|en)\s+(?:la\s+)?lista\s+(.+)$/);
  if (addMatch) {
    const resolved = resolveList(state, addMatch[2]);
    if (resolved.reply) return resolved.reply;
    const items = splitListItems(addMatch[1]);
    const priority = inferPriority(raw);
    const created = items.map((title) => {
      const media = parseMediaItem(title);
      const input = isMediaList(resolved.list)
        ? media
        : { title: titleCase(cleanListItemText(title)), priority };
      return addListItem(state, resolved.list.id, input, now);
    });
    return { intent: "list", reply: `Listo. Agregue a ${resolved.list.name}: ${created.map((item) => item.title).join(", ")}.`, data: { list: resolved.list, items: created } };
  }

  const listMatch = text.match(/^lista\s+(.+)$/);
  if (listMatch) {
    const resolved = resolveList(state, listMatch[1]);
    if (resolved.reply) return resolved.reply;
    const pending = (resolved.list.items || []).filter((item) => !item.done && !item.deletedAt);
    return { intent: "list", reply: pending.length ? `${resolved.list.name}: ${pending.map(formatListItemForReply).join(", ")}.` : `${resolved.list.name} no tiene items pendientes.`, data: { list: resolved.list, items: pending } };
  }

  return { intent: "list", reply: "Para listas prueba: crea lista Viaje o agrega pasaporte a lista Viaje." };
}
function handleExpense(state, raw, from, now) {
  const amount = extractAmount(raw);
  if (!amount) return { intent: "expense", reply: "Me falta el monto del gasto." };

  const payer = inferPayer(raw, from);
  const description = cleanDescription(raw);
  const scope = inferScope(raw, payer.name);
  const participantNames = inferParticipants(raw, from, payer.name, scope);
  const shares = inferCustomShares(raw, amount, participantNames || ["Rodrigo", "Jess"], from);
  const date = inferDate(raw, now);

  const expense = createExpense(
    state,
    {
      payerName: payer.name,
      payerKind: payer.kind,
      participantNames,
      amount,
      description,
      scope,
      category: inferCategory(raw),
      date,
      shares,
      originalText: raw,
      source: "whatsapp"
    },
    now
  );

  const payerPerson = state.people.find((person) => person.id === expense.payerId);
  const participants = expense.participantIds
    .map((id) => state.people.find((person) => person.id === id)?.name || id)
    .join(", ");

  return {
    intent: "expense",
    reply: `Listo. Registre ${formatMoney(expense.amount, expense.currency)} en ${expense.description}, pagado por ${payerPerson.name}. Lo asumen: ${participants}.`,
    data: { expense }
  };
}

function handlePayment(state, raw, from, now) {
  const amount = extractAmount(raw);
  if (!amount) return { intent: "payment", reply: "Me falta el monto del pago." };

  const text = normalizeText(raw);
  const actor = ensurePerson(state, from, "home");
  const jess = ensurePerson(state, "Jess", "home");
  const rodrigo = ensurePerson(state, "Rodrigo", "home");
  let fromName = actor.name;
  let toName = text.includes("jess") ? jess.name : rodrigo.name;

  if (text.includes("me pago") || text.includes("me abono")) {
    fromName = text.includes("jess") ? jess.name : rodrigo.name;
    toName = actor.name;
  }

  const payment = createPayment(state, { fromName, toName, amount, date: inferDate(raw, now), source: "whatsapp" }, now);
  return {
    intent: "payment",
    reply: `Listo. Registre pago de ${formatMoney(payment.amount, payment.currency)} de ${fromName} a ${toName}.`,
    data: { payment }
  };
}

function handleShopping(state, raw, from, now) {
  const cleaned = raw
    .replace(/^(agrega|agregar|compra|comprar|lista de compras|compras|falta|faltan)\s*/i, "")
    .replace(/\ba compras?\b/i, "")
    .trim();
  const parts = cleaned.split(CONNECTOR_RE).map((item) => item.trim()).filter(Boolean);
  const items = parts.length ? parts : [cleaned];
  const created = items.map((itemText) => {
    const parsed = parseShoppingItem(itemText);
    return addShoppingItem(state, { ...parsed, addedBy: from }, now);
  });

  return {
    intent: "shopping",
    reply: `Listo. Agregue a compras: ${created.map((item) => item.name).join(", ")}.`,
    data: { items: created }
  };
}

function parseShoppingItem(value) {
  const raw = String(value || "").trim();
  const quantityMatch = raw.match(/^(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|un|und|paquetes?|bolsas?)?)\s+(.+)$/i);
  const quantity = quantityMatch ? quantityMatch[1].replace(",", ".").trim() : "";
  const name = quantityMatch ? quantityMatch[2].trim() : raw;
  return {
    name,
    quantity,
    category: inferShoppingCategory(name),
    priority: /urgente|hoy|ya/.test(normalizeText(raw)) ? "alta" : "normal"
  };
}

function inferShoppingCategory(value) {
  const text = normalizeText(value);
  if (/(leche|huevo|pan|arroz|pollo|carne|pescado|verdura|fruta|cafe|azucar|aceite|queso|yogurt)/.test(text)) return "super";
  if (/(shampoo|jabon|detergente|papel|limpieza|lejia|lavavajilla)/.test(text)) return "casa";
  if (/(pastilla|medicina|farmacia|alcohol|curita)/.test(text)) return "farmacia";
  if (/(delivery|rappi|pedidosya|pedido|pizza|hamburguesa|sushi|pollo a la brasa|comida rapida)/.test(text)) return "delivery";
  return "general";
}

function handleTask(state, raw, from, now) {
  const title = raw.replace(/^(pendiente|tarea|hacer|recordar|recuerdame|recuérdame|recuérdanos)\s*/i, "").trim();
  const task = addTask(state, { title: title || raw, assignedTo: inferAssignee(raw) }, now);
  return {
    intent: "task",
    reply: `Listo. Agregue pendiente: ${task.title}.`,
    data: { task }
  };
}

function isExpenseText(text) {
  return /(gaste|gasto|pague|pago|pagaron|costo|salio|compre)/.test(text);
}

function oldIsListText(text) {
  if (/lista de compras?/.test(text)) return false;
  return (
    /^(?:crea|crear|nueva|nuevo|arma|hacer)\s+(?:una\s+)?lista\b/.test(text) ||
    /^(?:agrega|agregar|anade|añade|mete|pon)\s+.+\s+(?:a|en)\s+(?:la\s+)?lista\b/.test(text) ||
    /^lista\s+.+/.test(text)
  );
}

function isListText(text) {
  if (/lista de compras?/.test(text)) return false;
  return (
    /resumen\s+(?:semanal\s+)?(?:de\s+)?listas|listas\s+activas|pendientes\s+de\s+listas/.test(text) ||
    /^(?:crea|crear|nueva|nuevo|arma|hacer)\s+(?:una\s+)?lista\b/.test(text) ||
    /^(?:crea|crear|arma)\s+(?:checklist|plantilla)\b/.test(text) ||
    /^(?:agrega|agregar|anade|aÃ±ade|mete|pon)\s+.+\s+(?:a|en)\s+(?:la\s+)?lista\b/.test(text) ||
    /^(?:marca|marcar|check|completa|termina)\s+.+\s+(?:como\s+)?(?:listo|lista|hecho|hecha|done)\s+(?:en|de)\s+(?:la\s+)?lista\b/.test(text) ||
    /^(?:completa|termina|finaliza)\s+(?:la\s+)?lista\b/.test(text) ||
    /^(?:elimina|eliminar|borra|borrar|restaura|restaurar|recupera|recuperar)\s+(?:la\s+)?lista\b/.test(text) ||
    /^(?:marca|marcar|pon)\s+.+\s+(?:como\s+)?(?:pendiente|viendo|vista|visto|descartada|descartado)\s+(?:en|de)\s+(?:la\s+)?lista\b/.test(text) ||
    /^(?:quita|quitar|borra|borrar|elimina|eliminar)\s+.+\s+(?:de|en)\s+(?:la\s+)?lista\b/.test(text) ||
    /^lista\s+.+/.test(text)
  );
}

function isPaymentText(text) {
  return /(abone|abono|liquide|liquido|transferi|yapee|plinie|pague)/.test(text) && /(\ba jess\b|\ba rodrigo\b|\ba mi\b|me pago|me abono)/.test(text);
}

function oldParseListName(value) {
  const text = normalizeText(value);
  const categoryMatch = text.match(/\b(?:categoria|cat)\s+([a-z0-9\s-]+)$/);
  const dueMatch = text.match(/\b(?:para|vence|hasta)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/);
  return {
    name: value
      .replace(/\b(?:categoria|cat)\s+.+$/i, "")
      .replace(/\b(?:para|vence|hasta)\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i, "")
      .trim(),
    category: categoryMatch ? normalizeText(categoryMatch[1]).replace(/\s+/g, "-") : "general",
    dueDate: dueMatch ? inferDate(dueMatch[1], new Date().toISOString()).slice(0, 10) : ""
  };
}

function findListByName(state, name) {
  const wanted = normalizeText(name);
  return (state.lists || []).find((list) => normalizeText(list.name) === wanted || normalizeText(list.name).includes(wanted));
}

function splitListItems(value) {
  return String(value || "").split(CONNECTOR_RE).map((item) => item.trim()).filter(Boolean);
}

function parseListName(value, now) {
  const text = normalizeText(value);
  const categoryMatch = text.match(/\b(?:categoria|cat)\s+([a-z0-9\s-]+)$/);
  const dueMatch = text.match(/\b(?:para|vence|hasta)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/);
  const startMatch = text.match(/\b(?:empieza|inicia|desde)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/);
  const cleanedName = String(value || "")
    .replace(/\b(?:categoria|cat)\s+.+$/i, "")
    .replace(/\b(?:para|vence|hasta)\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i, "")
    .replace(/\b(?:empieza|inicia|desde)\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i, "")
    .trim();
  const words = cleanedName.split(/\s+/).filter(Boolean);
  const aliases = [cleanedName, words.length > 1 ? words.at(-1) : ""].filter(Boolean);
  return {
    name: cleanedName,
    aliases,
    category: categoryMatch ? slugify(categoryMatch[1]) : inferListCategory(cleanedName),
    startDate: startMatch ? inferDate(startMatch[1], now).slice(0, 10) : "",
    dueDate: dueMatch ? inferDate(dueMatch[1], now).slice(0, 10) : ""
  };
}

function summarizeLists(state) {
  const active = (state.lists || []).filter((list) => list.status !== "done");
  const pendingItems = active.flatMap((list) => (list.items || [])
    .filter((item) => !item.done && !item.deletedAt)
    .map((item) => ({ list, item })));
  const urgent = pendingItems.filter(({ item }) => item.priority === "alta").slice(0, 5);
  const lines = [`Tienen ${active.length} lista(s) activa(s) y ${pendingItems.length} item(s) pendientes.`];
  if (urgent.length) lines.push(`Prioridad alta: ${urgent.map(({ list, item }) => `${item.title} (${list.name})`).join(", ")}.`);
  return { intent: "list", reply: lines.join(" "), data: { lists: active, pendingItems } };
}

function hasTemplate(value) {
  return Boolean(LIST_TEMPLATES[slugify(value)]);
}

function resolveList(state, query, options = {}) {
  const matches = findListMatches(state, query, options);
  if (matches.length === 1) return { list: matches[0] };
  if (!matches.length) {
    return {
      reply: {
        intent: "list",
        reply: `No encontre una lista llamada ${titleCase(query)}. Puedes crearla con: crea lista ${titleCase(query)}.`
      }
    };
  }
  return {
    reply: {
      intent: "list",
      reply: `Encontre varias listas: ${matches.map((list) => list.name).join(", ")}. Escribe el nombre exacto para no mover la incorrecta.`,
      data: { lists: matches }
    }
  };
}

function findListMatches(state, query, options = {}) {
  const wanted = normalizeText(query);
  if (!wanted) return [];
  const ranked = (state.lists || [])
    .filter((list) => options.includeDeleted || !list.deletedAt)
    .map((list) => {
      const names = [list.name, ...(list.aliases || [])].map(normalizeText).filter(Boolean);
      if (names.some((name) => name === wanted)) return { list, score: 0 };
      if (names.some((name) => name.startsWith(wanted))) return { list, score: 1 };
      if (names.some((name) => name.includes(wanted) || wanted.includes(name))) return { list, score: 2 };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);
  const bestScore = ranked[0]?.score;
  return ranked.filter((item) => item.score === bestScore).map((item) => item.list);
}

function findListItem(list, query) {
  const wanted = normalizeText(query);
  return (list.items || [])
    .filter((item) => !item.deletedAt)
    .find((item) => {
      const title = normalizeText(item.title);
      return title === wanted || title.includes(wanted) || wanted.includes(title);
    });
}

function inferListCategory(value) {
  const key = slugify(value);
  if (/(pelicula|peliculas|cine|movie|movies)/.test(key)) return "peliculas";
  if (/(serie|series|temporada)/.test(key)) return "series";
  if (/(anime|manga)/.test(key)) return "anime";
  if (/(viaje|playa|hotel|pasaporte)/.test(key)) return "viaje";
  if (/(casa|mudanza|hogar)/.test(key)) return "casa";
  if (/(compra|super|mercado)/.test(key)) return "compras";
  if (/(tramite|documento)/.test(key)) return "tramites";
  if (/(salud|medicina|botiquin)/.test(key)) return "salud";
  return "general";
}

function isMediaList(list) {
  return ["peliculas", "series", "anime"].includes(slugify(list?.category || ""));
}

function parseMediaItem(value) {
  let raw = String(value || "").trim();
  const ratingMatch = normalizeText(raw).match(/\b([1-5](?:[.,]5)?)\s*(?:estrellas?|stars?)?\b/);
  const rating = ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : null;
  if (ratingMatch) raw = raw.replace(new RegExp(`\\b${escapeRegExp(ratingMatch[1])}\\s*(?:estrellas?|stars?)?\\b`, "i"), " ");

  const platformMatch = normalizeText(raw).match(/\b(?:en|por)\s+(netflix|prime|amazon|disney|hbo|max|star|apple|cine)\b/);
  const platform = platformMatch ? titleCase(platformMatch[1]) : "";
  if (platformMatch) raw = raw.replace(new RegExp(`\\b(?:en|por)\\s+${escapeRegExp(platformMatch[1])}\\b`, "i"), " ");

  const recommendedMatch = raw.match(/\b(?:recomendada?|recomendado|reco)\s+(?:por|de)\s+(.+)$/i);
  const recommendedBy = recommendedMatch ? titleCase(recommendedMatch[1].trim()) : "";
  if (recommendedMatch) raw = raw.replace(recommendedMatch[0], " ");

  const mediaStatus = /viendo/.test(normalizeText(value)) ? "viendo" : /(vista|visto|terminada|terminado)/.test(normalizeText(value)) ? "vista" : "pendiente";
  raw = raw.replace(/\b(pendiente|viendo|vista|visto|terminada|terminado)\b/gi, " ");
  return {
    title: titleCase(raw.replace(/\s+/g, " ").trim()),
    rating,
    platform,
    recommendedBy,
    mediaStatus,
    done: mediaStatus === "vista"
  };
}

function formatListItemForReply(item) {
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferPriority(raw) {
  const text = normalizeText(raw);
  if (/(urgente|prioridad alta|alta prioridad|para hoy|hoy mismo|ya)/.test(text)) return "alta";
  if (/(baja prioridad|prioridad baja|sin apuro|cuando se pueda)/.test(text)) return "baja";
  return "normal";
}

function cleanListItemText(value) {
  return String(value || "")
    .replace(/\b(urgente|prioridad alta|alta prioridad|baja prioridad|prioridad baja|sin apuro|cuando se pueda|normal)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferPayer(raw, fallback) {
  const text = normalizeText(raw);
  if (/(jess|vale)\s+(pago|pague|gasto|compro)/.test(text) || /(pago|pague|gasto|compro)\s+(jess|vale)/.test(text)) {
    return { name: "Jess", kind: "home" };
  }
  if (/rodrigo\s+(pago|pague|gasto|compro)/.test(text) || /(pago|pague|gasto|compro)\s+rodrigo/.test(text)) {
    return { name: "Rodrigo", kind: "home" };
  }
  if (/^(yo|me)\s+/.test(text) || /\b(gaste|pague|compre)\b/.test(text)) {
    return { name: fallback || "Rodrigo", kind: "home" };
  }

  const externalMatch = text.match(/^(.+?)\s+(pago|gasto|compro|puso)\s+/);
  if (externalMatch) {
    const candidate = cleanPersonName(externalMatch[1]);
    if (candidate && !["yo", "me"].includes(normalizeText(candidate))) {
      return { name: titleCase(candidate), kind: "external" };
    }
  }

  return { name: fallback || "Rodrigo", kind: "home" };
}

function inferScope(raw, payerName) {
  const text = normalizeText(raw);
  if (/(no dividir|personal|solo mio|solo mia|solo para mi|para mi nomas|para mi nada mas|solo yo)/.test(text)) return "self";
  if (/(para jess|de jess|solo jess|solo para jess)/.test(text)) return "jess";
  if (/(para rodrigo|de rodrigo|solo rodrigo|solo para rodrigo)/.test(text)) return "rodrigo";
  if (/(para nosotros|casa|ambos|ambas|los dos|mitad|miti|compartido|comun)/.test(text)) return "home";
  if (!["Rodrigo", "Jess"].includes(payerName)) return "home";
  return "home";
}

function inferParticipants(raw, from, payerName, scope) {
  if (scope !== "home") return null;

  const text = normalizeText(raw);
  const match = text.match(/\b(?:con|entre)\s+(.+)$/);
  if (!match) return null;

  const names = match[1]
    .replace(/\b(para nosotros|para la casa|de la casa|mitad|miti)\b/g, "")
    .split(CONNECTOR_RE)
    .map(cleanPersonName)
    .filter(Boolean)
    .map((name) => {
      const normalized = normalizeText(name);
      if (["yo", "mi", "me"].includes(normalized)) return from;
      if (["vale", "jess"].includes(normalized)) return "Jess";
      return titleCase(name);
    });

  if (!names.length) return null;
  if (["Rodrigo", "Jess"].includes(payerName) && !names.some((name) => normalizeText(name) === normalizeText(payerName))) {
    names.unshift(payerName);
  }
  return [...new Set(names)];
}

function inferCustomShares(raw, amount, participantNames, from) {
  const text = normalizeText(raw);
  const percentMatch = text.match(/\b(?:divide|dividir|division|split)\s+(\d{1,3})\s*\/\s*(\d{1,3})\b/);
  if (percentMatch) {
    const first = Number(percentMatch[1]);
    const second = Number(percentMatch[2]);
    if (first + second === 100) {
      const names = normalizeHomePair(participantNames, from);
      return {
        [names[0]]: Math.round(amount * first) / 100,
        [names[1]]: Math.round(amount * second) / 100
      };
    }
  }

  const jessAmount = text.match(/\bjess\s+(\d+(?:[.,]\d{1,2})?)\b/);
  const rodrigoAmount = text.match(/\b(?:rodrigo|yo|mi)\s+(\d+(?:[.,]\d{1,2})?)\b/);
  if (jessAmount || rodrigoAmount) {
    const shares = {};
    if (jessAmount) shares.Jess = Number(jessAmount[1].replace(",", "."));
    if (rodrigoAmount) shares[from || "Rodrigo"] = Number(rodrigoAmount[1].replace(",", "."));
    const total = Object.values(shares).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - amount) <= 0.01) return shares;
  }

  return null;
}

function normalizeHomePair(participantNames, from) {
  const names = participantNames.map((name) => {
    const normalized = normalizeText(name);
    if (["yo", "mi", "me"].includes(normalized)) return from || "Rodrigo";
    if (normalized === "jess" || normalized === "vale") return "Jess";
    if (normalized === "rodrigo") return "Rodrigo";
    return name;
  });
  if (!names.includes("Rodrigo")) names.unshift("Rodrigo");
  if (!names.includes("Jess")) names.push("Jess");
  return ["Rodrigo", "Jess"];
}

function inferAssignee(raw) {
  const text = normalizeText(raw);
  if (text.includes("para jess") || text.includes("jess")) return "Jess";
  if (text.includes("para rodrigo") || text.includes("rodrigo")) return "Rodrigo";
  return null;
}

function inferCategory(raw) {
  const text = normalizeText(raw);
  if (/(delivery|rappi|pedidosya|pedido|pizza|hamburguesa|sushi|pollo a la brasa)/.test(text)) return "delivery";
  if (/(wong|metro|plaza vea|tottus|mercado|super|comida|almuerzo|cena|desayuno)/.test(text)) return "comida";
  if (/(taxi|uber|cabify|bus|tren|gasolina|peaje)/.test(text)) return "transporte";
  if (/(luz|agua|internet|alquiler|mantenimiento)/.test(text)) return "casa";
  if (/(medicina|doctor|clinica|farmacia)/.test(text)) return "salud";
  return "general";
}

function extractAmount(raw) {
  const match = raw.match(MONEY_RE);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function cleanDescription(raw) {
  return raw
    .replace(MONEY_RE, "")
    .replace(/\b(hoy|ayer|anteayer|antes de ayer)\b/gi, " ")
    .replace(/\b(el|del)?\s*\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/gi, " ")
    .replace(/\b(gaste|gasté|gasto|pague|pagué|pago|pagó|costo|costó|salio|salió|compre|compré|en|de|por|para nosotros|para jess|para mi|no dividir|personal)\b/gi, " ")
    .replace(/\b(con|entre)\s+.+$/i, " ")
    .replace(/\s+/g, " ")
    .trim() || "Gasto";
}

function inferDate(raw, now) {
  const text = normalizeText(raw);
  const base = new Date(now);
  if (Number.isNaN(base.getTime())) return now;

  if (text.includes("antes de ayer") || text.includes("anteayer")) {
    base.setDate(base.getDate() - 2);
    return base.toISOString();
  }

  if (text.includes("ayer")) {
    base.setDate(base.getDate() - 1);
    return base.toISOString();
  }

  const match = text.match(/\b(?:el|del)?\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const currentYear = base.getFullYear();
    const year = match[3] ? normalizeYear(Number(match[3])) : currentYear;
    const parsed = new Date(base);
    parsed.setFullYear(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return parsed.toISOString();
    }
  }

  return now;
}

function normalizeYear(value) {
  if (value < 100) return 2000 + value;
  return value;
}

function cleanPersonName(value) {
  return String(value || "")
    .replace(/^(mi|mis|la|el|los|las|un|una)\s+/i, "")
    .replace(/\b(papa|papá|mama|mamá)\b/i, (match) => normalizeText(match) === "papa" ? "Papa" : "Mama")
    .trim();
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
