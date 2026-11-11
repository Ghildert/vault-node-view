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
    `<!doctype html><style>${styles}\n${desktopIconStyle}</style>
    <button class="nodevault-settings-trigger" popovertarget="settings">Settings</button>
    <div class="nodevault-settings" id="settings" popover>Characters before ellipsis</div>
    <div class="nodevault-canvas" id="canvas"
      tabindex="0" style="width:900px;height:600px"></div><script>
    ${engine.replace("export function mountBubbleCanvas", "function mountBubbleCanvas")}
    const canvas = document.getElementById("canvas");
    const settings = document.getElementById("settings");
    const trigger = document.querySelector(".nodevault-settings-trigger");
    const beforePopup = canvas.getBoundingClientRect().top;
    trigger.click();
    const triggerBox = trigger.getBoundingClientRect();
    const popupBox = settings.getBoundingClientRect();
    const settingsPopup = settings.matches(":popover-open") &&
      canvas.getBoundingClientRect().top === beforePopup &&
      popupBox.top > triggerBox.bottom && Math.abs(popupBox.right - triggerBox.right) < 1;
    trigger.click();
    const chosen = [];
    const moves = [];
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
    }, move => moves.push(move));
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
    const pointerUp = (x, y) => window.dispatchEvent(new PointerEvent("pointerup",
      { pointerId: 1, clientX: x, clientY: y }));
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
    view.setSearch("@username:fictional", ["two"]);
    const specifiedSearch = login("one").classList.contains("dimmed") &&
      !login("two").classList.contains("dimmed");
    view.setSearch("@username:missing", []);
    const noSpecifiedMatches = login("one").classList.contains("dimmed") &&
      login("two").classList.contains("dimmed");
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
      const [newX, newY] = position(neighbor);
      const [heldX, heldY] = center(grabbed);
      const separation = rounded ? Math.max(Math.abs(x - newX), Math.abs(y - newY)) :
        Math.hypot(x - newX, y - newY);
      const minSeparation = (parseFloat(grabbed.style.width) + parseFloat(neighbor.style.width)) / 2 + 26;
      pointerUp();
      view.setLabelLength(13);
      const positionsRestored = position(grabbed).join(",") === [x, y].join(",") &&
        position(neighbor).join(",") === [newX, newY].join(",");
      view.setLabelLength(12);
      return {
        cameraStaysPut: world.style.transform === transform,
        separated: separation >= minSeparation - 0.001,
        neighborMoved: newX !== nx || newY !== ny,
        grabbedTakesSpace: Math.hypot(heldX - targetX, heldY - targetY) < 1,
        positionsRestored,
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
    const bounds = canvas.getBoundingClientRect();
    const cursor = { x: 680, y: 170 };
    const wheel = deltaY => canvas.dispatchEvent(new WheelEvent("wheel", {
      clientX: bounds.left + canvas.clientLeft + cursor.x,
      clientY: bounds.top + canvas.clientTop + cursor.y,
      deltaY,
      cancelable: true,
    }));
    const worldPointAtCursor = () => {
      const offset = new DOMPoint(cursor.x - canvas.clientWidth / 2, cursor.y - canvas.clientHeight / 2);
      return offset.matrixTransform(new DOMMatrix(world.style.transform).inverse());
    };
    const anchor = worldPointAtCursor();
    const staysAnchored = () => {
      const point = worldPointAtCursor();
      return Math.hypot(point.x - anchor.x, point.y - anchor.y) < 0.001;
    };
    wheel(-120);
    const zoomedIn = new DOMMatrix(world.style.transform).a > moved.a && staysAnchored();
    const beforeZoomOut = new DOMMatrix(world.style.transform).a;
    wheel(120);
    const zoomedOut = new DOMMatrix(world.style.transform).a < beforeZoomOut && staysAnchored();
    view.setData(folders, [{ ...first, name: "Updated login" }]);
    const updated = count(".nodevault-bubble.service") === 0 &&
      select('[data-id="account:one"]').title === "Updated login" && count(".nodevault-bubble.account") === 1;
    view.setData(folders, [{ ...first, name: "👩‍💻é Long login" }]);
    const label = login("one").querySelector(".account-label");
    view.setLabelLength(2);
    const truncated = label.textContent === "👩‍💻é…" &&
      select(".nodevault-heading").firstChild.data === "Fi…" &&
      login("one").title === "👩‍💻é Long login";
    view.setSearch("Long login");
    view.setLabelLength(80);
    const fullLabel = label.textContent === "👩‍💻é Long login" &&
      !login("one").classList.contains("dimmed");
    view.setSearch("");
    const largeVault = Array.from({ length: 210 }, (_, i) =>
      item(String(i), i < 200 ? "f" : "pending-folder", "Fictional login " + i,
        i < 200 ? "large.example.test" : undefined));
    view.setRounded(false);
    const mixedVault = [...largeVault, item("direct", "f", "Direct login")];
    view.setData(folders, mixedVault);
    const radius = el => parseFloat(el.style.width) / 2;
    const container = select(".nodevault-bubble.service");
    const folder = select('[data-id="category:f"]');
    const within = (parent, rounded) => {
      const nodes = [...parent.children].filter(el => el.matches(".nodevault-bubble"));
      const distance = rounded ? (x, y) => Math.max(Math.abs(x), Math.abs(y)) : Math.hypot;
      return nodes.every((el, i) => {
        const [x, y] = position(el);
        const r = radius(el);
        return distance(x - radius(parent), y - radius(parent)) + r <= radius(parent) - 10 + 0.001 &&
          nodes.slice(0, i).every(other => {
            const [ox, oy] = position(other);
            const gap = el.matches(".account") && other.matches(".account") ? 38 : 16;
            return distance(x - ox, y - oy) >= r + radius(other) + gap - 0.001;
          });
      });
    };
    const largeCircles = count(".nodevault-bubble.account") === 211 &&
      count(".nodevault-bubble.service .nodevault-bubble.account") === 200 &&
      count('[data-id="category:unfiled"] .nodevault-bubble.account') === 10;
    const compact = radius(container) < 800 && radius(folder) < radius(container) + 150 &&
      within(container, false) && within(folder, false);
    view.fit();
    const camera = new DOMMatrix(world.style.transform);
    const fitsLargeVault = [...world.children].every(el => {
      const [x, y] = position(el);
      const center = new DOMPoint(x, y).matrixTransform(camera);
      const scaledRadius = radius(el) * camera.a;
      return Math.abs(center.x) + scaledRadius <= canvas.clientWidth / 2 &&
        Math.abs(center.y) + scaledRadius <= canvas.clientHeight / 2;
    });
    view.setRounded(true);
    const largeRounded = count(".nodevault-rounded .nodevault-bubble.account") === 211 &&
      within(select(".nodevault-bubble.service"), true) &&
      within(select('[data-id="category:f"]'), true);
    view.setData(folders, [first]);
    const shrunk = radius(select('[data-id="category:f"]')) <= 70;
    const mixedFolder = Array.from({ length: 18 }, (_, i) =>
      item("mixed-" + i, "f", "Fictional login " + i,
        i < 3 ? "group-a.example.test" : i < 6 ? "group-b.example.test" : undefined));
    view.setLabelLength(12);
    const compactMixedFolder = rounded => {
      view.setRounded(rounded);
      view.setData(folders, mixedFolder);
      const folder = select('[data-id="category:f"]');
      const groups = [...folder.querySelectorAll(".service")];
      return groups.length === 2 && radius(folder) < 320 && within(folder, rounded) &&
        groups.every(group => radius(group) < 115 && within(group, rounded));
    };
    const compactMixed = compactMixedFolder(false) && compactMixedFolder(true);
    const labelFits = (label, bubble, rounded) => {
      const text = label.getBoundingClientRect();
      const box = bubble.getBoundingClientRect();
      const r = box.width / 2;
      const corner = Math.min(r, 24 * new DOMMatrix(world.style.transform).a);
      return [text.left, text.right].every(x => [text.top, text.bottom].every(y => {
        const dx = Math.abs(x - box.left - r);
        const dy = Math.abs(y - box.top - r);
        if (!rounded) return Math.hypot(dx, dy) <= r;
        return dx <= r && dy <= r &&
          Math.hypot(Math.max(0, dx - r + corner), Math.max(0, dy - r + corner)) <= corner;
      }));
    };
    const verifyLabels = rounded => {
      view.setRounded(rounded);
      view.setLabelLength(4);
      view.setData([{ id: "f", name: "A long folder title that needs extra room" }], [
        { ...first, name: "A long account title that extends well beyond the icon" }, second,
      ]);
      const folder = select('[data-id="category:f"]');
      const initial = radius(folder);
      view.setLabelLength(80);
      view.fit();
      const service = select(".service");
      return radius(folder) > initial &&
        labelFits(folder.querySelector(".nodevault-heading"), folder, rounded) &&
        labelFits(service.querySelector(".nodevault-heading"), service, rounded) &&
        [...service.querySelectorAll(".account-label")].every(label =>
          labelFits(label, service, rounded) && labelFits(label, folder, rounded));
    };
    const labelsStayInside = verifyLabels(false) && verifyLabels(true);
    const moveFolders = [...folders, { id: "target", name: "Destination" }];
    const verifyDrop = rounded => {
      moves.length = 0;
      view.setRounded(rounded);
      view.setLabelLength(12);
      view.setData(moveFolders, [first, second]);
      view.fit();
      const source = select('[data-id="category:f"]');
      const service = select(".service");
      const target = select('[data-id="category:target"]');
      const dragged = rounded ? service : login("one");
      const parent = rounded ? source : service;
      const box = parent.getBoundingClientRect();
      const midY = (box.top + box.bottom) / 2;
      const [targetX, targetY] = center(target);
      pointerDown(dragged, ...center(dragged));
      pointerMove(box.right + 8, midY);
      const heldAtBorder = dragged.parentElement === parent;
      pointerMove(box.right + 24, midY);
      const [snapX, snapY] = center(dragged);
      const detached = dragged.parentElement === world &&
        Math.hypot(snapX - box.right - 24, snapY - midY) < 1;
      pointerMove(targetX, targetY);
      const highlighted = target.classList.contains("nodevault-drop-target");
      pointerUp(targetX, targetY);
      const move = moves[0];
      return heldAtBorder && detached && highlighted && moves.length === 1 &&
        move.folderId === "target" &&
        move.items.map(item => item.id).join(",") === (rounded ? "one,two" : "one") &&
        move.items.every(item => item.folderId === "f") &&
        dragged.parentElement === parent && !target.classList.contains("nodevault-drop-target");
    };
    const accountDrop = verifyDrop(false);
    const groupDrop = verifyDrop(true);
    const group = select(".service");
    const sourceFolder = select('[data-id="category:f"]');
    const box = sourceFolder.getBoundingClientRect();
    const outside = [box.left - 24, (box.top + box.bottom) / 2];
    pointerDown(group, ...center(group));
    pointerMove(...outside);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    pointerUp(...outside);
    const canceledDrop = moves.length === 1 && group.parentElement === sourceFolder &&
      !group.classList.contains("nodevault-detached");
    const verifyJump = rounded => {
      moves.length = 0;
      view.setRounded(rounded);
      view.setLabelLength(80);
      view.setData([{ id: "jump", name: "W".repeat(60) }], [
        { ...first, id: "jump-one", folderId: "jump" },
        { ...second, id: "jump-two", folderId: "jump" },
        item("jump-direct", "jump", "Direct"),
      ]);
      view.fit();
      const folder = select('[data-id="category:jump"]');
      const obstacle = select(".service");
      const account = login("jump-direct");
      const positionAtStart = position(account);
      const [startX, startY] = center(account);
      const [groupX, groupY] = center(obstacle);
      const dx = groupX - startX;
      const dy = groupY - startY;
      const length = Math.hypot(dx, dy);
      const ux = dx / length;
      const uy = dy / length;
      const edge = obstacle.getBoundingClientRect().width / 2;
      const point = distance => [groupX + ux * distance, groupY + uy * distance];
      const beyondEdge = edge / (rounded ? Math.max(Math.abs(ux), Math.abs(uy)) : 1);
      const near = point(beyondEdge + 4);
      const far = point(beyondEdge + 65);
      pointerDown(account, startX, startY);
      pointerMove(groupX, groupY);
      const preview = select(".nodevault-drag-ghost");
      const [ghostX, ghostY] = center(preview);
      const ghostShown = preview.inert && getComputedStyle(preview).filter === "grayscale(1)" &&
        account.classList.contains("nodevault-ghost-origin") &&
        Math.hypot(ghostX - groupX, ghostY - groupY) < 1;
      pointerUp(groupX, groupY);
      const releasedSafely = !select(".nodevault-drag-ghost") &&
        !account.classList.contains("nodevault-ghost-origin") &&
        position(account).join(",") === positionAtStart.join(",") && moves.length === 0;
      pointerDown(account, startX, startY);
      pointerMove(...near);
      const heldThroughMargin = Boolean(select(".nodevault-drag-ghost"));
      const [blockedX, blockedY] = center(account);
      const blocked = (blockedX - groupX) * ux + (blockedY - groupY) * uy < 0;
      pointerMove(...far);
      const [landingX, landingY] = center(account);
      const jumped = Math.hypot(landingX - far[0], landingY - far[1]) < 1 &&
        !select(".nodevault-drag-ghost") && !account.classList.contains("nodevault-ghost-origin");
      pointerUp(...far);
      return ghostShown && releasedSafely && heldThroughMargin && blocked && jumped &&
        account.parentElement === folder && moves.length === 0;
    };
    const groupJump = verifyJump(false) && verifyJump(true);
    view.destroy();
    const result = document.createElement("pre");
    result.id = "result";
    result.textContent = JSON.stringify({ grouped, rounded, noPrematureOpen, opened,
      selected, selectionCleared, keyboardFocus, tabOrder, keyboardLabel, keyboardOpen, dimmed, specifiedSearch, noSpecifiedMatches, dragDidNotOpen,
      pan: Math.abs(moved.m41 - original.m41 - 120) < 0.001 &&
        Math.abs(moved.m42 - original.m42 - 20) < 0.001,
      updated, zoomedIn, zoomedOut, truncated, fullLabel, largeCircles, compact, fitsLargeVault,
      largeRounded, shrunk, compactMixed, labelsStayInside, accountDrop, groupDrop, canceledDrop, groupJump,
      settingsPopup, circleCollision, roundedCollision, edgePan,
      edgePanStopsOnRelease, siteIcon, roundedIconsCentered, circleIconsCentered,
      iconsDestroyed: mountedIcons === destroyedIcons,
      cleared: !select(".nodevault-world") });
    document.body.replaceChildren(result);
    </script>`,
  );
  const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const electronRunner = path.join(temp, "electron-runner.cjs");
  fs.writeFileSync(
    electronRunner,
    `
    const { app, BrowserWindow } = require("electron");
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("force-prefers-reduced-motion");
    app.setPath("userData", ${JSON.stringify(path.join(temp, "electron-profile"))});
    app.whenReady().then(async () => {
      const window = new BrowserWindow({ show: false, width: 1200, height: 900 });
      await window.loadFile(${JSON.stringify(file)});
      process.stdout.write(await window.webContents.executeJavaScript("document.documentElement.outerHTML"));
      app.quit();
    }).catch(error => { console.error(error); app.exit(1); });
  `,
  );
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  const output = fs.existsSync(chrome)
    ? execFileSync(
        chrome,
        [
          "--headless",
          "--no-first-run",
          "--disable-extensions",
          "--disable-background-networking",
          "--force-prefers-reduced-motion",
          "--user-data-dir=" + path.join(temp, "chrome"),
          "--dump-dom",
          pathToFileURL(file).href,
        ],
        {
          encoding: "utf8",
          windowsHide: true,
          timeout: 30000,
          stdio: ["ignore", "pipe", "ignore"],
        },
      )
    : execFileSync(require("electron"), [electronRunner], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
        stdio: ["ignore", "pipe", "ignore"],
        env: electronEnv,
      });
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
    specifiedSearch: true,
    noSpecifiedMatches: true,
    dragDidNotOpen: true,
    pan: true,
    updated: true,
    zoomedIn: true,
    zoomedOut: true,
    truncated: true,
    fullLabel: true,
    largeCircles: true,
    compact: true,
    fitsLargeVault: true,
    largeRounded: true,
    shrunk: true,
    compactMixed: true,
    labelsStayInside: true,
    accountDrop: true,
    groupDrop: true,
    canceledDrop: true,
    groupJump: true,
    settingsPopup: true,
    circleCollision: {
      cameraStaysPut: true,
      separated: true,
      neighborMoved: true,
      grabbedTakesSpace: true,
      positionsRestored: true,
      drawerStaysClosed: true,
    },
    roundedCollision: {
      cameraStaysPut: true,
      separated: true,
      neighborMoved: true,
      grabbedTakesSpace: true,
      positionsRestored: true,
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
  console.log("Bubble canvas passed interaction, label, and 211-login layout checks.");
} finally {
  assert.equal(path.dirname(temp), tempRoot);
  assert.match(path.basename(temp), /^nodevault-canvas-[A-Za-z0-9]+$/);
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
