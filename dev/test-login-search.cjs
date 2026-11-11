const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = path.resolve(__dirname, "../apps/desktop/src/vault/app/vault-v3/nodevault");
function load(filename, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(source, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (id) => dependencies[id] ?? {});
  return exports;
}
const search = load("login-search.ts");
const cipher = {
  id: "one",
  name: "Silver Palace",
  reprompt: 0,
  notes: "Gaming recovery instructions",
  login: {
    username: "o'reilly@duck.com",
    password: "linked-secret",
    uris: [{ uri: "https://first.example/path" }, { uri: "https://silver.example/second" }],
  },
  fields: [
    { type: 0, name: "Team", value: "Blue group" },
    { type: 1, name: "Recovery", value: "hidden-value" },
    { type: 2, name: "Enabled", value: "true" },
    { type: 3, name: "Account", linkedId: 100 },
    { type: 3, name: "Secret", linkedId: 101 },
  ],
};
const item = search.toLoginSearchDocument(cipher);
for (const query of [
  "palace",
  "Silver gaming",
  "second",
  "@USERNAME:DUCK.COM",
  "@username:o'reilly",
  '@note:"recovery instructions"',
  "@website:second",
  '@field#text:"blue group"',
  "@field#hidden:hidden-value",
  "@field#checkbox:true",
  "@field#linked:duck.com",
  "@field#linked:linked-secret",
  "palace @username:duck.com",
  "@note:",
]) {
  assert.ok(search.matchesLoginSearch(item, query), query);
}
for (const query of [
  "duck.com",
  "hidden-value",
  "Blue group",
  "@username:palace",
  "@note:duck.com",
  "@website:gaming",
  "@field#hidden:blue",
  "@field#checkbox:false",
  "@field#unknown:value",
  "@user",
  "@unknown:palace",
  "palace @username:missing",
]) {
  assert.equal(search.matchesLoginSearch(item, query), false, query);
}
const protectedItem = search.toLoginSearchDocument({ ...cipher, reprompt: 1 });
for (const query of [
  "recovery instructions",
  "@note:gaming",
  "@field#hidden:hidden-value",
  "@field#linked:linked-secret",
  "@field#text:blue",
]) {
  assert.equal(search.matchesLoginSearch(protectedItem, query), false, query);
}
assert.equal(protectedItem.notes, "");
assert.ok(protectedItem.fields.every((field) => field.value === ""));
assert.ok(search.matchesLoginSearch({ ...item, displayName: "Alias" }, "alias"));
assert.equal(search.searchSuggestions("ordinary"), null);
assert.equal(search.searchSuggestions("@username:duck"), null);
assert.equal(search.searchSuggestions("@").options.length, 7);
assert.deepEqual(search.searchSuggestions("palace @FiElD#h").options, ["@field#hidden:"]);
assert.deepEqual(search.searchSuggestions("@us").options, ["@username:"]);

// Exercise the actual component's keyboard and insertion methods without a vault or browser.
const { BubbleViewComponent } = load("bubble-view.component.ts", {
  "@angular/core": { Component: () => (target) => target, ChangeDetectionStrategy: { OnPush: 0 } },
  "./login-search": search,
});
function signal(value) {
  const read = () => value;
  read.set = (next) => {
    value = next;
  };
  read.update = (fn) => {
    value = fn(value);
  };
  return read;
}
const view = Object.create(BubbleViewComponent.prototype);
view.searchQuery = signal("palace @us");
view.suggestions = signal(search.searchSuggestions(view.searchQuery()));
view.activeSuggestion = signal(0);
const field = {
  value: view.searchQuery(),
  focus() {},
  setSelectionRange(start, end) {
    this.selection = [start, end];
  },
};
function press(key, extra = {}) {
  const event = {
    key,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {},
    ...extra,
  };
  view.searchKeydown(event, field);
  return event;
}
assert.ok(press("Tab").prevented);
assert.equal(view.searchQuery(), "palace @username:");
assert.deepEqual(field.selection, [17, 17]);
view.searchQuery.set("@");
view.suggestions.set(search.searchSuggestions("@"));
assert.ok(press("ArrowDown").prevented);
assert.equal(view.activeSuggestion(), 1);
assert.ok(press("Enter").prevented);
assert.equal(view.searchQuery(), "@note:");
view.suggestions.set(search.searchSuggestions("@"));
assert.equal(press("Tab", { shiftKey: true }).prevented, undefined);
assert.equal(press("Enter", { isComposing: true }).prevented, undefined);
assert.ok(press("Escape").prevented);
assert.equal(view.suggestions(), null);
assert.equal(press("Enter").prevented, undefined);
// Bitwarden uses a native search input, which rejects selection-range APIs.
field.type = "search";
field.setSelectionRange = () => {
  throw new Error("Native search inputs do not support selection ranges");
};
view.searchQuery.set("@web");
view.suggestions.set(search.searchSuggestions("@web"));
view.activeSuggestion.set(0);
assert.ok(press("Tab").prevented);
assert.equal(view.searchQuery(), "@website:");
console.log("Search matching, protected values, suggestions, and keyboard acceptance passed.");
