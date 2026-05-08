import assert from "node:assert/strict";
import {
  calculateBalances,
  createExpense,
  createInitialState,
  deleteList,
  createList,
  createPayment,
  addListItem,
  restoreList,
  saveMonthlyClosure,
  saveListAsTemplate,
  updateListItem,
  updateExpense,
  voidExpense
} from "../src/domain.js";
import { handleNaturalMessage } from "../src/parser.js";
import { mergeMediaMetadata } from "../src/tmdb.js";
import { handleZoninaAgentMessage } from "../src/zonina-agent.js";

const tests = [
  {
    name: "split a home expense paid by Rodrigo",
    run() {
      const state = createInitialState();
      createExpense(state, { payerName: "Rodrigo", amount: 80, description: "comida" });
      assert.deepEqual(simplify(calculateBalances(state)), [{ from: "Jess", to: "Rodrigo", amount: 40 }]);
    }
  },
  {
    name: "split a home expense paid by Jess",
    run() {
      const state = createInitialState();
      createExpense(state, { payerName: "Jess", amount: 60, description: "taxi" });
      assert.deepEqual(simplify(calculateBalances(state)), [{ from: "Rodrigo", to: "Jess", amount: 30 }]);
    }
  },
  {
    name: "external payer creates debt from both home members",
    run() {
      const state = createInitialState();
      createExpense(state, { payerName: "Mamá", payerKind: "external", amount: 120, description: "mercado" });
      assert.deepEqual(simplify(calculateBalances(state)), [
        { from: "Rodrigo", to: "Mamá", amount: 60 },
        { from: "Jess", to: "Mamá", amount: 60 }
      ]);
    }
  },
  {
    name: "payment reduces the balance",
    run() {
      const state = createInitialState();
      createExpense(state, { payerName: "Rodrigo", amount: 80, description: "comida" });
      createPayment(state, { fromName: "Jess", toName: "Rodrigo", amount: 15 });
      assert.deepEqual(simplify(calculateBalances(state)), [{ from: "Jess", to: "Rodrigo", amount: 25 }]);
    }
  },
  {
    name: "natural expense from Jess is parsed",
    run() {
      const state = createInitialState();
      const result = handleNaturalMessage(state, { from: "Jess", text: "pagué 60 taxi" });
      assert.equal(result.intent, "expense");
      assert.deepEqual(simplify(calculateBalances(state)), [{ from: "Rodrigo", to: "Jess", amount: 30 }]);
    }
  },
  {
    name: "natural expense can be registered yesterday",
    run() {
      const state = createInitialState("2026-05-07T12:00:00.000Z");
      const result = handleNaturalMessage(
        state,
        { from: "Rodrigo", text: "ayer gaste 40 taxi para nosotros" },
        "2026-05-07T12:00:00.000Z"
      );
      assert.equal(result.intent, "expense");
      assert.equal(result.data.expense.date.slice(0, 10), "2026-05-06");
    }
  },
  {
    name: "natural expense can include an explicit day and month",
    run() {
      const state = createInitialState("2026-05-07T12:00:00.000Z");
      const result = handleNaturalMessage(
        state,
        { from: "Jess", text: "05/05 pague 30 cafe para jess" },
        "2026-05-07T12:00:00.000Z"
      );
      assert.equal(result.intent, "expense");
      assert.equal(result.data.expense.date.slice(0, 10), "2026-05-05");
    }
  },
  {
    name: "shopping parser extracts quantities and categories",
    run() {
      const state = createInitialState();
      const result = handleNaturalMessage(state, { from: "Rodrigo", text: "agrega 2 leches y 1kg arroz" });
      assert.equal(result.intent, "shopping");
      assert.deepEqual(
        result.data.items.map((item) => ({ name: item.name, quantity: item.quantity, category: item.category })),
        [
          { name: "leches", quantity: "2", category: "super" },
          { name: "arroz", quantity: "1kg", category: "super" }
        ]
      );
    }
  },
  {
    name: "shopping parser detects delivery category",
    run() {
      const state = createInitialState();
      const result = handleNaturalMessage(state, { from: "Jess", text: "agrega pizza delivery" });
      assert.equal(result.intent, "shopping");
      assert.equal(result.data.items[0].category, "delivery");
    }
  },
  {
    name: "natural expense understands para ambos and delivery",
    run() {
      const state = createInitialState();
      const result = handleNaturalMessage(state, { from: "Jess", text: "Jess pago 80 delivery para ambos" });
      assert.equal(result.intent, "expense");
      assert.equal(result.data.expense.category, "delivery");
      assert.deepEqual(simplify(calculateBalances(state)), [{ from: "Rodrigo", to: "Jess", amount: 40 }]);
    }
  },
  {
    name: "natural expense supports 70/30 split",
    run() {
      const state = createInitialState();
      const result = handleNaturalMessage(state, { from: "Rodrigo", text: "pague 100 cena para ambos dividir 70/30" });
      assert.equal(result.intent, "expense");
      assert.deepEqual(result.data.expense.shares, { rodrigo: 70, jess: 30 });
    }
  },
  {
    name: "natural external payer is split between Rodrigo and Jess",
    run() {
      const state = createInitialState();
      const result = handleNaturalMessage(state, { from: "Rodrigo", text: "mi mama pago 120 mercado para nosotros" });
      assert.equal(result.intent, "expense");
      assert.deepEqual(simplify(calculateBalances(state)), [
        { from: "Rodrigo", to: "Mama", amount: 60 },
        { from: "Jess", to: "Mama", amount: 60 }
      ]);
    }
  },
  {
    name: "natural expense with external participant includes payer",
    run() {
      const state = createInitialState();
      const result = handleNaturalMessage(state, { from: "Rodrigo", text: "pague 90 cena con Jess y Ana" });
      assert.equal(result.intent, "expense");
      assert.deepEqual(simplify(calculateBalances(state)), [
        { from: "Jess", to: "Rodrigo", amount: 30 },
        { from: "Ana", to: "Rodrigo", amount: 30 }
      ]);
    }
  },
  {
    name: "personal expense does not affect balances",
    run() {
      const state = createInitialState();
      handleNaturalMessage(state, { from: "Rodrigo", text: "gaste 45 medicina no dividir" });
      assert.deepEqual(simplify(calculateBalances(state)), []);
    }
  },
  {
    name: "update and void expenses recalculate balances",
    run() {
      const state = createInitialState();
      const expense = createExpense(state, { payerName: "Rodrigo", amount: 80, description: "comida" });
      updateExpense(state, expense.id, { amount: 100 });
      assert.deepEqual(simplify(calculateBalances(state)), [{ from: "Jess", to: "Rodrigo", amount: 50 }]);
      voidExpense(state, expense.id);
      assert.deepEqual(simplify(calculateBalances(state)), []);
    }
  },
  {
    name: "cyclic debts are simplified away",
    run() {
      const state = createInitialState();
      createExpense(state, { payerName: "Jess", amount: 50, description: "favor", participantNames: ["Rodrigo"] });
      createExpense(state, { payerName: "Papa", amount: 50, description: "favor", participantNames: ["Jess"] });
      createExpense(state, { payerName: "Rodrigo", amount: 50, description: "favor", participantNames: ["Papa"] });
      assert.deepEqual(simplify(calculateBalances(state)), []);
    }
  },
  {
    name: "partial cyclic debts are reduced to the remaining net payment",
    run() {
      const state = createInitialState();
      createExpense(state, { payerName: "Jess", amount: 50, description: "favor", participantNames: ["Rodrigo"] });
      createExpense(state, { payerName: "Papa", amount: 50, description: "favor", participantNames: ["Jess"] });
      createExpense(state, { payerName: "Rodrigo", amount: 20, description: "favor", participantNames: ["Papa"] });
      assert.deepEqual(simplify(calculateBalances(state)), [{ from: "Rodrigo", to: "Papa", amount: 30 }]);
    }
  },
  {
    name: "settling a suggested balance clears it",
    run() {
      const state = createInitialState();
      createExpense(state, { payerName: "Rodrigo", amount: 80, description: "comida" });
      const [balance] = calculateBalances(state);
      createPayment(state, { fromName: balance.from, toName: balance.to, amount: balance.amount });
      assert.deepEqual(simplify(calculateBalances(state)), []);
    }
  },
  {
    name: "editing payer and participants recalculates shares",
    run() {
      const state = createInitialState();
      const expense = createExpense(state, { payerName: "Rodrigo", amount: 90, description: "cena" });
      updateExpense(state, expense.id, { payerName: "Jess", participantNames: ["Rodrigo", "Jess", "Ana"] });
      assert.deepEqual(simplify(calculateBalances(state)), [
        { from: "Rodrigo", to: "Jess", amount: 30 },
        { from: "Ana", to: "Jess", amount: 30 }
      ]);
    }
  },
  {
    name: "custom shares are honored",
    run() {
      const state = createInitialState();
      createExpense(state, {
        payerName: "Rodrigo",
        amount: 100,
        description: "cena",
        participantNames: ["Rodrigo", "Jess", "Ana"],
        shares: { Rodrigo: 20, Jess: 50, Ana: 30 }
      });
      assert.deepEqual(simplify(calculateBalances(state)), [
        { from: "Jess", to: "Rodrigo", amount: 50 },
        { from: "Ana", to: "Rodrigo", amount: 30 }
      ]);
    }
  },
  {
    name: "custom shares must sum to expense amount",
    run() {
      const state = createInitialState();
      assert.throws(
        () =>
          createExpense(state, {
            payerName: "Rodrigo",
            amount: 100,
            description: "cena",
            participantNames: ["Rodrigo", "Jess"],
            shares: { Rodrigo: 20, Jess: 20 }
          }),
        /division personalizada/
      );
    }
  },
  {
    name: "monthly closure can be saved and updated by month",
    run() {
      const state = createInitialState();
      const first = saveMonthlyClosure(state, { month: "2026-05", total: 100, expenseCount: 2 });
      const second = saveMonthlyClosure(state, { month: "2026-05", total: 120, expenseCount: 3 });
      assert.equal(first.id, second.id);
      assert.equal(state.monthlyClosures.length, 1);
      assert.equal(state.monthlyClosures[0].total, 120);
    }
  },
  {
    name: "monthly closure preserves workflow status",
    run() {
      const state = createInitialState();
      const closure = saveMonthlyClosure(state, {
        month: "2026-05",
        total: 100,
        expenseCount: 1,
        status: "reopened",
        reopenedAt: "2026-05-07T12:00:00.000Z"
      });
      assert.equal(closure.status, "reopened");
      assert.equal(closure.reopenedAt, "2026-05-07T12:00:00.000Z");
    }
  },
  {
    name: "monthly closure stores each person's responsibility",
    run() {
      const state = createInitialState();
      saveMonthlyClosure(state, {
        month: "2026-05",
        total: 150,
        expenseCount: 2,
        responsibilities: [
          { label: "Rodrigo", amount: 70 },
          { label: "Jess", amount: 80 }
        ]
      });
      assert.deepEqual(state.monthlyClosures[0].responsibilities, [
        { label: "Rodrigo", amount: 70 },
        { label: "Jess", amount: 80 }
      ]);
    }
  },
  {
    name: "lists can be created and checked",
    run() {
      const state = createInitialState();
      const list = createList(state, { name: "Viaje", category: "wishlist", startDate: "2026-05-08" });
      const item = addListItem(state, list.id, { title: "Comprar bloqueador" });
      updateListItem(state, list.id, item.id, { done: true });
      assert.equal(state.lists[0].name, "Viaje");
      assert.equal(state.lists[0].items[0].done, true);
    }
  },
  {
    name: "lists can be deleted",
    run() {
      const state = createInitialState();
      const list = createList(state, { name: "Temporal" });
      const removed = deleteList(state, list.id, "2026-05-07T12:00:00.000Z");
      assert.equal(removed.name, "Temporal");
      assert.equal(removed.deletedAt, "2026-05-07T12:00:00.000Z");
      assert.equal(state.lists.length, 1);
      restoreList(state, list.id);
      assert.equal(state.lists[0].deletedAt, null);
    }
  },
  {
    name: "media lists store half-star ratings",
    run() {
      const state = createInitialState();
      const list = createList(state, { name: "Peliculas", category: "peliculas" });
      const item = addListItem(state, list.id, { title: "Arrival", rating: 4.3 });
      assert.equal(item.rating, 4.5);
      updateListItem(state, list.id, item.id, { rating: 0.2 });
      assert.equal(state.lists[0].items[0].rating, 1);
    }
  },
  {
    name: "anime lists behave like media lists",
    run() {
      const state = createInitialState();
      const list = createList(state, { name: "Anime", category: "anime" });
      const item = addListItem(state, list.id, { title: "Frieren", rating: 5, mediaStatus: "vista" });
      updateListItem(state, list.id, item.id, { mediaStatus: "vista" });
      assert.equal(state.lists[0].items[0].rating, 5);
      assert.equal(state.lists[0].items[0].done, true);
    }
  },
  {
    name: "lists can be saved as custom templates",
    run() {
      const state = createInitialState();
      const list = createList(state, { name: "Domingo", category: "casa" });
      addListItem(state, list.id, { title: "Limpiar cocina" });
      const template = saveListAsTemplate(state, list.id, "Rutina domingo");
      assert.equal(template.items[0].title, "Limpiar cocina");
    }
  },
  {
    name: "whatsapp can create and add to a list",
    run() {
      const state = createInitialState();
      const created = handleNaturalMessage(state, { from: "Rodrigo", text: "crea lista Viaje" });
      assert.equal(created.intent, "list");
      const added = handleNaturalMessage(state, { from: "Jess", text: "agrega pasaporte y bloqueador a lista Viaje" });
      assert.equal(added.intent, "list");
      assert.deepEqual(state.lists[0].items.map((item) => item.title), ["Pasaporte", "Bloqueador"]);
    }
  },
  {
    name: "whatsapp list aliases and dates work",
    run() {
      const state = createInitialState("2026-05-07T12:00:00.000Z");
      const created = handleNaturalMessage(
        state,
        { from: "Rodrigo", text: "crea lista Viaje Cusco para 20/05 categoria viaje" },
        "2026-05-07T12:00:00.000Z"
      );
      assert.equal(created.data.list.dueDate, "2026-05-20");
      const added = handleNaturalMessage(state, { from: "Jess", text: "agrega pasaporte urgente a lista Cusco" });
      assert.equal(added.data.items[0].priority, "alta");
      assert.equal(state.lists[0].items[0].title, "Pasaporte");
    }
  },
  {
    name: "whatsapp asks to disambiguate similar list names",
    run() {
      const state = createInitialState();
      createList(state, { name: "Viaje Cusco" });
      createList(state, { name: "Viaje Playa" });
      const result = handleNaturalMessage(state, { from: "Rodrigo", text: "agrega bloqueador a lista Viaje" });
      assert.match(result.reply, /varias listas/);
      assert.equal(state.lists[0].items.length, 0);
    }
  },
  {
    name: "whatsapp templates can complete and remove list items",
    run() {
      const state = createInitialState();
      const created = handleNaturalMessage(state, { from: "Rodrigo", text: "crea checklist viaje" });
      assert.equal(created.data.list.items.length, 6);
      handleNaturalMessage(state, { from: "Jess", text: "marca pasaporte como listo en lista Viaje" });
      handleNaturalMessage(state, { from: "Jess", text: "quita dni de lista Viaje" });
      assert.equal(state.lists[0].items.find((item) => item.title === "Pasaporte").done, true);
      assert.ok(state.lists[0].items.find((item) => item.title === "DNI").deletedAt);
      handleNaturalMessage(state, { from: "Rodrigo", text: "completa lista Viaje" });
      assert.equal(state.lists[0].status, "done");
      assert.equal(state.lists[0].items.filter((item) => !item.deletedAt).every((item) => item.done), true);
    }
  },
  {
    name: "whatsapp summarizes active lists",
    run() {
      const state = createInitialState();
      handleNaturalMessage(state, { from: "Rodrigo", text: "crea lista Viaje" });
      handleNaturalMessage(state, { from: "Rodrigo", text: "agrega pasaporte urgente a lista Viaje" });
      const result = handleNaturalMessage(state, { from: "Rodrigo", text: "resumen semanal de listas" });
      assert.match(result.reply, /1 lista/);
      assert.match(result.reply, /Prioridad alta/);
    }
  },
  {
    name: "whatsapp can add rated media to a list",
    run() {
      const state = createInitialState();
      handleNaturalMessage(state, { from: "Rodrigo", text: "crea lista Peliculas" });
      handleNaturalMessage(state, { from: "Jess", text: "agrega Arrival 4.5 en Netflix recomendada por Ana a lista Peliculas" });
      assert.equal(state.lists[0].category, "peliculas");
      assert.equal(state.lists[0].items[0].title, "Arrival");
      assert.equal(state.lists[0].items[0].rating, 4.5);
      assert.equal(state.lists[0].items[0].platform, "Netflix");
      assert.equal(state.lists[0].items[0].recommendedBy, "Ana");
      handleNaturalMessage(state, { from: "Rodrigo", text: "marca Arrival como vista en lista Peliculas" });
      assert.equal(state.lists[0].items[0].mediaStatus, "vista");
      assert.equal(state.lists[0].items[0].done, true);
    }
  },
  {
    name: "whatsapp list reply includes enriched media metadata",
    run() {
      const state = createInitialState();
      const list = createList(state, { name: "Peliculas", category: "peliculas" });
      addListItem(state, list.id, {
        title: "Dune",
        rating: 4.5,
        platform: "Max",
        year: "2021",
        director: "Denis Villeneuve",
        tmdbUrl: "https://www.themoviedb.org/movie/438631"
      });
      const result = handleNaturalMessage(state, { from: "Jess", text: "lista Peliculas" });
      assert.match(result.reply, /Dune \(4.5\/5, Max, 2021, Denis Villeneuve\)/);
      assert.match(result.reply, /themoviedb/);
    }
  },
  {
    name: "tmdb metadata is merged into media items",
    run() {
      const merged = mergeMediaMetadata(
        { title: "Arrival", rating: 4.5 },
        "movie",
        { id: 1, title: "Arrival", release_date: "2016-11-10" },
        {
          id: 1,
          title: "Arrival",
          original_title: "Arrival",
          release_date: "2016-11-10",
          overview: "A linguist works with the military.",
          poster_path: "/poster.jpg",
          production_companies: [{ name: "FilmNation Entertainment" }],
          credits: { crew: [{ job: "Director", name: "Denis Villeneuve" }] }
        }
      );
      assert.equal(merged.year, "2016");
      assert.equal(merged.director, "Denis Villeneuve");
      assert.deepEqual(merged.productionCompanies, ["FilmNation Entertainment"]);
      assert.equal(merged.tmdbType, "movie");
    }
  },
  {
    name: "zonina chat falls back to local parser without OpenAI key",
    async run() {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        const state = createInitialState();
        createList(state, { name: "Compras", category: "compras" });
        const result = await handleZoninaAgentMessage(state, {
          from: "Rodrigo",
          text: "agrega leche y pan a lista Compras"
        });
        assert.equal(result.mode, "parser");
        assert.equal(result.intent, "list");
        assert.equal(state.lists[0].name, "Compras");
        assert.deepEqual(state.lists[0].items.map((item) => item.title), ["Leche", "Pan"]);
      } finally {
        if (originalKey) process.env.OPENAI_API_KEY = originalKey;
      }
    }
  }
];

for (const item of tests) {
  await item.run();
  console.log(`ok - ${item.name}`);
}

console.log(`${tests.length} tests passed`);

function simplify(items) {
  return items.map((item) => ({ from: item.from, to: item.to, amount: item.amount }));
}
