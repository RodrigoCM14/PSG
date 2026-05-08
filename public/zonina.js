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

addMessage("bot", `Hola, soy Zonina. Puedo registrar gastos, leer listas y agregar cosas con lenguaje natural.\n\nPrueba: ${examples[0]}`);

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
    const result = await api("/api/zonina/chat", {
      method: "POST",
      body: { from: "Rodrigo", text }
    });
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
