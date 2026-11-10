const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const source = path.resolve(__dirname, "../apps/desktop/src/vault/app/vault-v3/nodevault");
const engine = fs.readFileSync(path.join(source, "bubble-canvas.js"), "utf8");
const styles = fs
  .readFileSync(path.join(source, "bubble-view.component.scss"), "utf8")
  .replace(/^\/\/.*$/gm, "");
const desktopIconStyle = fs
  .readFileSync(path.resolve(source, "../../../../scss/misc.scss"), "utf8")
  .match(/app-vault-icon > div \{[^}]+\}/)?.[0];
assert.ok(desktopIconStyle, "Expected the desktop vault icon override");
const tempRoot = path.resolve(os.tmpdir());
const temp = fs.mkdtempSync(path.join(tempRoot, "nodevault-canvas-"));

try {
  const file = path.join(temp, "fixture.html");
  fs.writeFileSync(
    file,
    `<!doctype html><style>${styles}\n${desktopIconStyle}</style><div class="nodevault-canvas" id="canvas"
      tabindex="0" style="width:900px;height:600px"></div><script>
    ${engine.replace("export function mountBubbleCanvas", "function mountBubbleCanvas")}
    const canvas = document.getElementById("canvas");
    const chosen = [];
    const frames = new Map();
    let frameId = 0;
    window.requestAnimationFrame = callback => {
      frames.set(++frameId, callback);
      return frameId;
    };
    window.cancelAnimationFrame = id => frames.delete(id);
    const runFrame = time => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(time));
    };
    let mountedIcons = 0;
    let destroyedIcons = 0;
    const view = mountBubbleCanvas(canvas, id => chosen.push(id), (host, serviceHost) => {
      mountedIcons++;
      host.dataset.testHost = serviceHost ?? "";
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "width:24px;height:24px";
      if (serviceHost) {
        const image = document.createElement("img");
        image.width = image.height = 24;
        wrapper.append(image);
      } else {
        const fallback = document.createElement("div");
        fallback.style.cssText = "width:24px;height:24px";
        const glyph = document.createElement("i");
        glyph.style.fontSize = "24px";
        glyph.textContent = "●";
        fallback.append(glyph);
        wrapper.append(fallback);
      }
      host.append(wrapper);
      return () => { destroyedIcons++; };
    });
    const item = (id, folderId, name, serviceHost) => ({ id, folderId, name, serviceHost, itemType: "login" });
    const folders = [{ id: "f", name: "Fictional folder" }];
    const first = item("one", "f", "First login", "example.test");
    const second = item("two", "f", "Second login", "example.test");
    view.setData(folders, [first, second, item("three", null, "Unfiled login")]);
    const select = selector => canvas.querySelector(selector);
    const count = selector => canvas.querySelectorAll(selector).length;
    const login = id => select('[data-id="account:' + id + '"]');
    const pointerDown = (element, x, y) => element.dispatchEvent(new PointerEvent("pointerdown",
      { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
    const pointerMove = (x, y) => window.dispatchEvent(new PointerEvent("pointermove",
      { pointerId: 1, clientX: x, clientY: y }));
    const pointerUp = () => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    const grouped = count(".nodevault-bubble.service .nodevault-bubble.account") === 2;
    const iconHost = id => login(id).querySelector("app-vault-icon");
    const siteIcon = iconHost("one").dataset.testHost === "example.test" &&
      iconHost("one").getAttribute("aria-hidden") === "true" &&
      iconHost("three").dataset.testHost === "";
    pointerDown(login("one"), 40, 40);
    const noPrematureOpen = chosen.length === 0;
    pointerUp();
    const opened = chosen.join(",") === "one";
    view.setSelected("one");
    const selected = login("one").classList.contains("active");
    view.setSelected(null);
    const selectionCleared = !login("one").classList.contains("active");
    login("one").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const keyboardFocus = document.activeElement === login("two");
    const tabOrder = [login("one").tabIndex, login("two").tabIndex];
    const keyboardLabel = login("two").getAttribute("aria-label");
    document.activeElement.click();
    const keyboardOpen = chosen.join(",") === "one,two";
    view.setSearch("Second");
    const dimmed = login("one").classList.contains("dimmed") &&
      !select(".nodevault-bubble.service").classList.contains("dimmed") &&
      select('[data-id="category:unfiled"]').classList.contains("dimmed");
    view.setSearch("");
    pointerDown(login("one"), 40, 40);
    window.dispatchEvent(new PointerEvent("pointermove",
      { pointerId: 1, clientX: 140, clientY: 110 }));
    pointerUp();
    const dragDidNotOpen = chosen.length === 2;
    view.setRounded(true);
    const rounded = count(".nodevault-rounded") === 1;
    const world = select(".nodevault-world");
    const position = el => [parseFloat(el.style.left), parseFloat(el.style.top)];
    const center = el => {
      const { left, top, width, height } = el.getBoundingClientRect();
      return [left + width / 2, top + height / 2];
    };
    const iconIsCentered = (id, selector) => {
      const [nodeX, nodeY] = center(login(id));
      const [iconX, iconY] = center(iconHost(id).querySelector(selector));
      return Math.hypot(nodeX - iconX, nodeY - iconY) < 0.5;
    };
    const roundedIconsCentered = iconIsCentered("one", "img") && iconIsCentered("three", "i");
    view.setRounded(false);
    const circleIconsCentered = iconIsCentered("one", "img") && iconIsCentered("three", "i");
    const collisionKeepsCameraStill = rounded => {
      view.setRounded(rounded);
      const grabbed = login("one");
      const neighbor = login("two");
      const [nx, ny] = position(neighbor);
      const [startX, startY] = center(grabbed);
      const [targetX, targetY] = center(neighbor);
      const transform = world.style.transform;
      pointerDown(grabbed, startX, startY);
      pointerMove(targetX, targetY);
      runFrame(16);
      const [x, y] = position(grabbed);
      const separation = rounded ? Math.max(Math.abs(x - nx), Math.abs(y - ny)) :
        Math.hypot(x - nx, y - ny);
      const minSeparation = (parseFloat(grabbed.style.width) + parseFloat(neighbor.style.width)) / 2;
      pointerUp();
      return {
        cameraStaysPut: world.style.transform === transform,
        separated: separation >= minSeparation,
        neighborStaysPut: position(neighbor).join(",") === [nx, ny].join(","),
        drawerStaysClosed: chosen.length === 2,
      };
    };
    const circleCollision = collisionKeepsCameraStill(false);
    const roundedCollision = collisionKeepsCameraStill(true);
    const rightEdge = canvas.getBoundingClientRect().right;
    const [x, y] = center(login("one"));
    pointerDown(login("one"), x, y);
    pointerMove(rightEdge - 8, y);
    const beforeEdgePan = new DOMMatrix(world.style.transform).m41;
    runFrame(32);
    const firstEdgePan = new DOMMatrix(world.style.transform).m41;
    runFrame(48);
    const secondEdgePan = new DOMMatrix(world.style.transform).m41;
    pointerMove(x, y);
    runFrame(64);
    const edgePan = firstEdgePan < beforeEdgePan && secondEdgePan < firstEdgePan &&
      new DOMMatrix(world.style.transform).m41 === secondEdgePan && frames.size === 0;
    pointerMove(rightEdge - 8, y);
    pointerUp();
    const edgePanStopsOnRelease = frames.size === 0;
    const original = new DOMMatrix(world.style.transform);
    pointerDown(canvas, 10, 10);
    for (const x of [20, 80, 130]) {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: x, clientY: 30 }));
    }
    pointerUp();
    const moved = new DOMMatrix(world.style.transform);
    view.setData(folders, [{ ...first, name: "Updated login" }]);
    const updated = count(".nodevault-bubble.service") === 0 &&
      select('[data-id="account:one"]').title === "Updated login" && count(".nodevault-bubble.account") === 1;
    const largeVault = Array.from({ length: 210 }, (_, i) =>
      item(String(i), i < 200 ? "f" : "pending-folder", "Fictional login " + i,
        i < 200 ? "large.example.test" : undefined));
    view.setRounded(false);
    view.setData(folders, largeVault);
    const largeCircles = count(".nodevault-bubble.account") === 210 &&
      count(".nodevault-bubble.service .nodevault-bubble.account") === 200 &&
      count('[data-id="category:unfiled"] .nodevault-bubble.account') === 10;
    view.setRounded(true);
    const largeRounded = count(".nodevault-rounded .nodevault-bubble.account") === 210;
    view.destroy();
    const result = document.createElement("pre");
    result.id = "result";
    result.textContent = JSON.stringify({ grouped, rounded, noPrematureOpen, opened,
      selected, selectionCleared, keyboardFocus, tabOrder, keyboardLabel, keyboardOpen, dimmed, dragDidNotOpen,
      pan: Math.abs(moved.m41 - original.m41 - 120) < 0.001 &&
        Math.abs(moved.m42 - original.m42 - 20) < 0.001,
      updated, largeCircles, largeRounded, circleCollision, roundedCollision, edgePan,
      edgePanStopsOnRelease, siteIcon, roundedIconsCentered, circleIconsCentered,
      iconsDestroyed: mountedIcons === destroyedIcons,
      cleared: !select(".nodevault-world") });
    document.body.replaceChildren(result);
    </script>`,
  );
  const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const output = execFileSync(
    chrome,
    [
      "--headless",
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-networking",
      "--user-data-dir=" + path.join(temp, "chrome"),
      "--dump-dom",
      pathToFileURL(file).href,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000, stdio: ["ignore", "pipe", "ignore"] },
  );
  const result = JSON.parse(output.match(/<pre id="result">([^<]+)<\/pre>/)?.[1] ?? "null");
  assert.deepEqual(result, {
    grouped: true,
    rounded: true,
    noPrematureOpen: true,
    opened: true,
    selected: true,
    selectionCleared: true,
    keyboardFocus: true,
    tabOrder: [-1, 0],
    keyboardLabel: "Second login, in Fictional folder",
    keyboardOpen: true,
    dimmed: true,
    dragDidNotOpen: true,
    pan: true,
    updated: true,
    largeCircles: true,
    largeRounded: true,
    circleCollision: {
      cameraStaysPut: true,
      separated: true,
      neighborStaysPut: true,
      drawerStaysClosed: true,
    },
    roundedCollision: {
      cameraStaysPut: true,
      separated: true,
      neighborStaysPut: true,
      drawerStaysClosed: true,
    },
    edgePan: true,
    edgePanStopsOnRelease: true,
    siteIcon: true,
    roundedIconsCentered: true,
    circleIconsCentered: true,
    iconsDestroyed: true,
    cleared: true,
  });
  console.log("Bubble canvas passed click, keyboard, drag, search, and 210-login fixture checks.");
} finally {
  assert.equal(path.dirname(temp), tempRoot);
  assert.match(path.basename(temp), /^nodevault-canvas-[A-Za-z0-9]+$/);
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
