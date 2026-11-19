const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function browserModel() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id))
      elements.set(id, {
        id,
        value: "",
        textContent: "",
        hidden: false,
        disabled: false,
        dataset: {},
        attributes: {},
        handlers: {},
        addEventListener(name, handler) {
          this.handlers[name] = handler;
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        getAttribute(name) {
          return this.attributes[name];
        },
        focus() {
          this.focused = true;
        },
        checkValidity() {
          return true;
        },
      });
    return elements.get(id);
  }
  element("lab-case-select").value = "session";
  for (const [id, value] of Object.entries({
    "capacity-users": "3000",
    "capacity-plays": "20",
    "capacity-bytes": "500",
    "capacity-peak": "10",
    "capacity-window": "10",
  }))
    element(id).value = value;
  const tabs = ["live", "model", "architecture"].map((name) => {
    const button = element("lab-tab-" + name);
    button.dataset.labTab = name;
    button.attributes["aria-controls"] = "lab-panel-" + name;
    return button;
  });
  const inspect = [
    "session",
    "ranking",
    "counter",
    "history",
    "queue",
    "playlists",
  ].map((name) => {
    const button = element("inspect-" + name);
    button.dataset.inspectCase = name;
    return button;
  });
  const document = {
    getElementById: element,
    querySelectorAll: (selector) =>
      selector === "[data-lab-tab]"
        ? tabs
        : selector === "[data-inspect-case]"
          ? inspect
          : [],
  };
  const context = vm.createContext({ document });
  for (const file of ["project.js", "lab.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../public/js", file), "utf8"),
      context,
    );
  context.CEUBLab.init(() => {});
  return { lab: context.CEUBLab, element, tabs, inspect };
}
function response(userId, path) {
  if (path === "/api/health") return { redis: "connected" };
  if (path.includes("/session/"))
    return { active: true, nome_musica: "Perfil " + userId, ttl: 7200 };
  if (path.includes("/rankings/"))
    return { key: "ranking:global:diario:2026-11-13", tracks: [] };
  if (path.includes("/track-plays/")) return { totalPlays: 0 };
  if (path.includes("/history/")) return { entries: [] };
  if (path.includes("/queue/")) return { items: [] };
  if (path.includes("/playlists/")) return [];
  throw new Error("Unexpected API route");
}

test("a slow response from the previous profile cannot replace the current inspection", async () => {
  const { lab, element } = browserModel();
  let release;
  const pending = new Promise((resolve) => (release = resolve));
  const previous = lab.load(async (path) => {
    await pending;
    return response("1", path);
  }, "1");
  await lab.load(async (path) => response("2", path), "2");
  release();
  await previous;
  assert.equal(element("lab-model-key").textContent, "sessao:usuario:2");
  assert.match(element("redis-demo-session").textContent, /Perfil 2/);
  assert.equal(element("lab-refresh").disabled, false);
  assert.match(
    element("lab-authors").textContent,
    /Arthur Araujo.*Guilherme Leony.*Luan Jywago/,
  );
});

test("service errors replace old results and leave retry available", async () => {
  const { lab, element } = browserModel();
  await lab.load(async (path) => response("1", path), "1");
  await lab.load(async () => null, "1");
  assert.match(element("lab-mode").textContent, /indisponível/);
  assert.match(
    element("redis-demo-session").textContent,
    /Serviço indisponível/,
  );
  assert(!element("redis-demo-session").textContent.includes("Perfil 1"));
  assert.equal(element("lab-refresh").disabled, false);
});

test("laboratory sections support keyboard navigation and case-to-model inspection", () => {
  const { element, tabs, inspect } = browserModel();
  let prevented = false;
  tabs[0].handlers.keydown({
    key: "ArrowRight",
    preventDefault() {
      prevented = true;
    },
  });
  assert(prevented);
  assert.equal(element("lab-panel-live").hidden, true);
  assert.equal(element("lab-panel-model").hidden, false);
  assert.equal(tabs[1].focused, true);
  inspect
    .find((button) => button.dataset.inspectCase === "history")
    .handlers.click();
  assert.equal(element("lab-case-select").value, "history");
  assert.equal(element("lab-model-key").textContent, "historico:usuario:1");
  assert.equal(element("capacity-events").textContent, "60.000");
});
