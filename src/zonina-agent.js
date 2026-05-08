import { calculateBalances, formatMoney } from "./domain.js";
import { handleNaturalMessage } from "./parser.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

export async function handleZoninaAgentMessage(state, input, options = {}) {
  const text = String(input.text || "").trim();
  const from = input.from || "Rodrigo";
  if (!text) return { intent: "empty", reply: "Estoy aqui. Escribe un gasto, una lista o una pregunta de casa.", mode: "empty" };

  if (!process.env.OPENAI_API_KEY) {
    return { ...(await runHubCommand(state, { text, from }, options)), mode: "parser" };
  }

  try {
    const response = await runOpenAiAgent(state, { text, from }, options);
    return { intent: "zonina", reply: response, mode: "agent" };
  } catch (error) {
    const fallback = await runHubCommand(state, { text, from }, options);
    return {
      ...fallback,
      mode: "parser-fallback",
      note: `OpenAI no respondio correctamente: ${error.message}`
    };
  }
}

async function runOpenAiAgent(state, input, options) {
  let response = await createResponse({
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    instructions: zoninaInstructions(),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: input.text
          }
        ]
      }
    ],
    tools: zoninaTools(),
    tool_choice: "auto"
  });

  for (let i = 0; i < 4; i += 1) {
    const calls = functionCalls(response);
    if (!calls.length) return outputText(response) || "Listo.";

    const outputs = [];
    for (const call of calls) {
      const result = await executeToolCall(state, call, input, options);
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }

    response = await createResponse({
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      previous_response_id: response.id,
      input: outputs,
      tools: zoninaTools(),
      tool_choice: "auto"
    });
  }

  return outputText(response) || "Listo.";
}

function zoninaInstructions() {
  return [
    "Eres Zonina, la asistente de casa de Rodrigo y Jess dentro de Pukis Hub.",
    "Respondes en espanol, breve, calida y practica.",
    "Tu trabajo es ayudar con gastos, pagos, listas, compras, peliculas, series, anime y balances.",
    "Para cualquier dato del hub o accion que modifique el hub, usa la herramienta process_hub_message.",
    "No inventes saldos, listas ni registros. Si necesitas saber algo, consulta la herramienta.",
    "Si el usuario pide borrar listas, cerrar ciclos o hacer cambios destructivos, pide confirmacion antes de ejecutar.",
    "Cuando uses la herramienta, resume el resultado de forma natural y clara."
  ].join(" ");
}

function zoninaTools() {
  return [
    {
      type: "function",
      name: "process_hub_message",
      description: "Procesa un mensaje natural usando el motor del hub. Sirve para registrar gastos, pagos, agregar o leer listas, consultar balances y resumir listas.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: {
            type: "string",
            description: "Mensaje en lenguaje natural que debe procesar el hub."
          }
        },
        required: ["text"]
      }
    }
  ];
}

async function executeToolCall(state, call, input, options) {
  if (call.name !== "process_hub_message") {
    return { ok: false, error: `Herramienta no soportada: ${call.name}` };
  }

  const args = JSON.parse(call.arguments || "{}");
  const text = String(args.text || input.text || "").trim();
  if (!text) return { ok: false, error: "Mensaje vacio." };
  const result = await runHubCommand(state, { text, from: input.from }, options);
  return {
    ok: true,
    intent: result.intent,
    reply: result.reply
  };
}

async function runHubCommand(state, input, options) {
  const result = handleNaturalMessage(state, { from: input.from || "Rodrigo", text: input.text });
  if (options.enrichNaturalMessageMediaResult) await options.enrichNaturalMessageMediaResult(result);
  if (result.intent === "balance") {
    result.data = result.data || {};
    result.data.balances = calculateBalances(state);
    result.reply = formatBalances(result.data.balances);
  }
  return result;
}

async function createResponse(payload) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `OpenAI respondio ${response.status}`);
  return data;
}

function functionCalls(response) {
  return (response.output || []).filter((item) => item.type === "function_call");
}

function outputText(response) {
  if (response.output_text) return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function formatBalances(balances) {
  if (!balances.length) return "Todo esta cuadrado por ahora.";
  return balances.map((item) => `${item.from} le debe a ${item.to}: ${formatMoney(item.amount, item.currency)}.`).join("\n");
}
