import { api, currentUser, ensureSession, renderSessionBadge } from "./session.js";

const els = {
  messages: document.querySelector("#chatMessages"),
  form: document.querySelector("#chatForm"),
  input: document.querySelector("#chatInput")
};

const examples = [
  "agrega leche y pan a lista Compras",
  "agrega Frieren 5 en Crunchyroll a lista Anime",
  "Jess pago 80 delivery para ambos",
  "lista Peliculas"
];

await ensureSession();
renderSessionBadge(document.querySelector(".chat-head"));
addMessage("bot", `Hola ${currentUser().name}, soy Zonina. Puedo registrar gastos, leer listas y agregar cosas con lenguaje natural.\n\nPrueba: ${examples[0]}`);

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    els.input.value = button.dataset.prompt;
    els.input.focus();
  });
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.input.value.trim();
  if (!text) return;
  els.input.value = "";
  addMessage("user", text);
  const pending = addMessage("bot", "Pensando...");

  try {
    const body = { text };
    const result = await apiWithTimeout("/api/zonina/chat", { method: "POST", body });
    pending.querySelector(".chat-bubble").textContent = result.reply || "Listo.";
  } catch (error) {
    pending.querySelector(".chat-bubble").textContent = `No pude procesarlo: ${error.message}`;
  }
});

function addMessage(kind, text) {
  const row = document.createElement("div");
  row.className = `chat-row ${kind === "user" ? "chat-row-user" : "chat-row-bot"}`;
  row.innerHTML = `
    ${kind === "bot" ? '<img src="/assets/square-logo.png?v=20260508" alt="">' : ""}
    <div class="chat-bubble"></div>
  `;
  row.querySelector(".chat-bubble").textContent = text;
  els.messages.append(row);
  els.messages.scrollTop = els.messages.scrollHeight;
  return row;
}

async function apiWithTimeout(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  try {
    return await api(path, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("La respuesta demoro demasiado. Prueba de nuevo en unos segundos.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
