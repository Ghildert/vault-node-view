// NodeVault's nested bubble geometry, adapted from the V7 prototype.
const UNFILED_CATEGORY_ID = "category:unfiled";
const categoryIdFor = (folderId) =>
  folderId === null ? UNFILED_CATEGORY_ID : "category:" + folderId;
const accountIdFor = (itemId) => "account:" + itemId;
function groupVault(folders, items, serviceFor) {
  const categories = new Map(
    folders.map(({ id, name }) => [
      id,
      { id: categoryIdFor(id), folderId: id, name, count: 0, services: new Map() },
    ]),
  );
  for (const item of items) {
    if (item.itemType !== "login") continue;
    const folderId = categories.has(item.folderId) ? item.folderId : null;
    if (folderId === null && !categories.has(null)) {
      categories.set(null, {
        id: UNFILED_CATEGORY_ID,
        folderId: null,
        name: "Unfiled",
        count: 0,
        services: new Map(),
      });
    }
    const category = categories.get(folderId);
    const service = serviceFor(item.id);
    // Items without overrides stay separate until a grouping rule is available.
    const serviceId = service?.id ?? accountIdFor(item.id);
    if (!category.services.has(serviceId)) {
      category.services.set(serviceId, {
        id: "service:" + category.id + ":" + serviceId,
        name: service?.name ?? item.name,
        accounts: [],
      });
    }
    category.services
      .get(serviceId)
      .accounts.push({ id: accountIdFor(item.id), itemId: item.id, name: item.name });
    category.count++;
  }
  return [...categories.values()];
}
export function mountBubbleCanvas(canvas, openItem, renderIcon) {
  const world = document.createElement("div");
  world.className = "nodevault-world";
  canvas.append(world);
  const abort = new AbortController();
  const addCanvasListener = (target, name, listener, options = {}) =>
    target.addEventListener(name, listener, { ...options, signal: abort.signal });
  const positions = new Map(),
    nodes = new Map(),
    elements = new Map();
  const destroyIcons = [];
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const GAP = 16,
    INNER = 16,
    LOGIN_RADIUS = 26,
    MIN_ZOOM = 0.3,
    MAX_ZOOM = 3;
  const EDGE_PAN_ZONE = 36;
  const EDGE_PAN_SPEED = 480;
  let rounded = false,
    zoom = 0.78,
    pan = { x: 0, y: 0 },
    selected = null,
    focusId = null,
    visibleLogins = [],
    drag = null,
    spacePan = false,
    search = "";
  let edgePanFrame = null;
  let lastEdgePanTime = null;
  let folders = [],
    itemSummaries = [];
  let itemById = new Map();
  function displayService(itemId) {
    const host = itemById.get(itemId)?.serviceHost;
    return host ? { id: "host:" + encodeURIComponent(host), name: host } : undefined;
  }
  function groupRadius(k) {
    if (rounded) {
      const cols = Math.ceil(Math.sqrt(k)),
        rows = Math.ceil(k / cols);
      return Math.max(
        92,
        Math.max((cols - 1) * 34 + LOGIN_RADIUS + INNER, (rows - 1) * 34 + LOGIN_RADIUS + 30),
      );
    }
    return 60 + 34 / Math.sin(Math.PI / k);
  }
  function seededAccountPosition(i, k) {
    if (rounded) {
      const cols = Math.ceil(Math.sqrt(k)),
        rows = Math.ceil(k / cols);
      return {
        x: ((i % cols) - (cols - 1) / 2) * 68,
        y: (Math.floor(i / cols) - (rows - 1) / 2) * 68 + 12,
      };
    }
    const ring = groupRadius(k) - 60;
    const t = Math.PI / 2 + (i * 2 * Math.PI) / k;
    return { x: Math.cos(t) * ring, y: Math.sin(t) * ring + 8 };
  }
  function headingClearance(parent) {
    return parent.type === "category" ? 62 : 42;
  }
  function inside(parent, node, pad = INNER) {
    // In addition to physical containment, reserve the top caption area so
    // nested bubbles cannot cover their parent category/service heading.
    if (node.y - node.r < -parent.r + headingClearance(parent) - 0.0001) return false;
    if (rounded)
      return (
        Math.abs(node.x) + node.r + pad <= parent.r && Math.abs(node.y) + node.r + pad <= parent.r
      );
    return Math.hypot(node.x, node.y) + node.r + pad <= parent.r + 0.0001;
  }
  function separated(a, b, gap = GAP) {
    const dx = Math.abs(a.x - b.x),
      dy = Math.abs(a.y - b.y),
      limit = a.r + b.r + gap;
    if (rounded) return dx >= limit - 0.0001 || dy >= limit - 0.0001;
    return Math.hypot(dx, dy) >= limit - 0.0001;
  }
  function goodLayout(parent, children) {
    return children.every(
      (n, i) => inside(parent, n) && children.slice(0, i).every((m) => separated(n, m)),
    );
  }
  function* placementCandidates(parent, n) {
    const extent = parent.r - n.r - INNER;
    yield { x: 0, y: parent.type === "service" ? 12 : 18 };
    for (let ring = 1; ring <= 26; ring++) {
      const r = (extent * ring) / 26;
      const samples = Math.max(16, Math.ceil(r * 0.8));
      for (let j = 0; j < samples; j++) {
        const a = (2 * Math.PI * j) / samples + 0.3;
        yield { x: r * Math.cos(a), y: r * Math.sin(a) };
      }
    }
  }
  function pack(parent, children) {
    if (!children.length) return;
    if (goodLayout(parent, children)) return;
    const sorted = [...children].sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
    for (let attempt = 0; attempt < 75; attempt++) {
      const placed = [];
      let failed = false;
      for (const n of sorted) {
        let found = null;
        // Respect a previously saved position when it still fits the new group.
        const saved = { x: n.x, y: n.y, r: n.r };
        if (inside(parent, saved) && placed.every((m) => separated(saved, m))) found = saved;
        if (!found) {
          for (const p of placementCandidates(parent, n)) {
            const probe = { ...p, r: n.r };
            if (inside(parent, probe) && placed.every((m) => separated(probe, m))) {
              found = probe;
              break;
            }
          }
        }
        if (!found) {
          failed = true;
          break;
        }
        n.x = found.x;
        n.y = found.y;
        placed.push(n);
      }
      if (!failed && goodLayout(parent, children)) return;
      parent.r += 18; // Grow the container rather than allowing overlaps or escape.
    }
    throw new Error("Unable to fit child bubbles inside their container");
  }
  function preventCategoryOverlap() {
    const groups = categoryNodes();
    for (let iter = 0; iter < 30; iter++) {
      let changed = false;
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++) {
          const a = groups[i],
            b = groups[j];
          if (separated(a, b, 22)) continue;
          let dx = b.x - a.x,
            dy = b.y - a.y,
            d = Math.hypot(dx, dy);
          if (d < 0.01) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          if (rounded) {
            const overlapX = a.r + b.r + 22 - Math.abs(dx),
              overlapY = a.r + b.r + 22 - Math.abs(dy);
            if (overlapX < overlapY) {
              const push = overlapX / 2 + 0.1;
              a.x -= Math.sign(dx) * push;
              b.x += Math.sign(dx) * push;
            } else {
              const push = overlapY / 2 + 0.1;
              a.y -= Math.sign(dy) * push;
              b.y += Math.sign(dy) * push;
            }
          } else {
            const push = (a.r + b.r + 22 - d) / 2 + 0.1;
            a.x -= (dx / d) * push;
            a.y -= (dy / d) * push;
            b.x += (dx / d) * push;
            b.y += (dy / d) * push;
          }
          changed = true;
        }
      if (!changed) break;
    }
  }
  function categoryNodes() {
    return [...nodes.values()].filter((n) => n.type === "category");
  }
  function rememberPosition(n) {
    positions.set(n.id, { parent: n.parent, x: n.x, y: n.y, r: n.r });
  }
  function savedPosition(id, parent) {
    const saved = positions.get(id);
    return saved?.parent === parent ? saved : undefined;
  }
  function build() {
    const items = itemSummaries;
    const categories = groupVault(folders, items, displayService);
    nodes.clear();
    for (const c of categories) {
      const saved = savedPosition(c.id, null);
      const parent = {
        id: c.id,
        name: c.name,
        count: c.count,
        type: "category",
        parent: null,
      };
      nodes.set(c.id, parent);
      const children = [];
      for (const service of c.services.values()) {
        const count = service.accounts.length;
        let container = parent;
        if (count > 1) {
          const saved = savedPosition(service.id, c.id);
          const radius = groupRadius(count);
          container = {
            id: service.id,
            name: service.name,
            count,
            type: "service",
            parent: c.id,
            r: Math.max(radius, saved?.r ?? 0),
            x: saved?.x ?? 0,
            y: saved?.y ?? 0,
          };
          nodes.set(container.id, container);
          children.push(container);
        }
        const accounts = service.accounts.map((account, i) => {
          const saved = savedPosition(account.id, container.id);
          const seed = count > 1 ? seededAccountPosition(i, count) : { x: 0, y: 16 };
          const n = {
            ...account,
            type: "account",
            parent: container.id,
            r: LOGIN_RADIUS,
            x: saved?.x ?? seed.x,
            y: saved?.y ?? seed.y,
          };
          nodes.set(n.id, n);
          return n;
        });
        if (container === parent) children.push(...accounts);
        else pack(container, accounts);
      }
      const largest = children.reduce((radius, child) => Math.max(radius, child.r), 0);
      const spacing = 1.7 * largest;
      parent.r = children.length
        ? Math.ceil(spacing * Math.sqrt(children.length + 0.5) + largest + 46)
        : 62;
      // Seed new units around the folder center and let pack enforce containment.
      children.forEach((child, i) => {
        if (savedPosition(child.id, parent.id) || children.length === 1) return;
        const distance = spacing * Math.sqrt(i + 0.5);
        child.x = Math.cos(2.399 * i) * distance;
        child.y = Math.sin(2.399 * i) * distance + 16;
      });
      pack(parent, children);
      const position = saved ?? placeNewCategory(parent.r);
      parent.x = position.x;
      parent.y = position.y;
    }
    preventCategoryOverlap();
    for (const node of nodes.values()) rememberPosition(node);
    draw();
  }
  function keepInside(n, target, parent) {
    if (!parent) return target;
    const max = Math.max(0, parent.r - n.r - INNER);
    const minY = Math.min(max, -parent.r + headingClearance(parent) + n.r);
    if (rounded)
      return { x: clamp(target.x, -max, max), y: clamp(target.y, Math.max(-max, minY), max) };
    // Preserve the circular constraint and the title's protected top zone.
    const d = Math.hypot(target.x, target.y);
    const p = d > max ? { x: (target.x * max) / d, y: (target.y * max) / d } : { ...target };
    if (p.y < minY) {
      p.y = minY;
      const maxX = Math.sqrt(Math.max(0, max * max - p.y * p.y));
      p.x = clamp(p.x, -maxX, maxX);
    }
    return p;
  }
  // Continuous collision resolution is based on the moving bubble's *current*
  // contact geometry, not where the pointer happens to be on the opposite side.
  // Dragging uses successive pointer deltas, so collisions do not build up a
  // snap-back force toward the cursor.
  function sweepCircle(p, v, other, limit) {
    const rx = p.x - other.x,
      ry = p.y - other.y;
    const a = v.x * v.x + v.y * v.y;
    if (a < 1e-12) return null;
    const d = rx * v.x + ry * v.y;
    const c = rx * rx + ry * ry - limit * limit;
    // Already touching: only block movement *into* the object.
    // Preserve the normal from the actual current contact position.
    if (c <= 1e-4) {
      if (d >= -1e-8) return null;
      const length = Math.hypot(rx, ry) || 1;
      return { t: 0, nx: rx / length, ny: ry / length };
    }
    if (d >= 0) return null; // separating motion cannot create a new collision
    const discriminant = d * d - a * c;
    if (discriminant < 0) return null;
    const t = (-d - Math.sqrt(discriminant)) / a;
    if (t < 0 || t > 1) return null;
    const hx = rx + v.x * t,
      hy = ry + v.y * t;
    const length = Math.hypot(hx, hy) || 1;
    return { t, nx: hx / length, ny: hy / length };
  }
  function sweepBox(p, v, other, extent) {
    // Swept point against the obstacle's expanded AABB (Minkowski sum).
    // The contact face supplies a stable axis normal, avoiding side-flipping.
    let entry = -Infinity,
      exit = Infinity,
      nx = 0,
      ny = 0;
    for (const axis of ["x", "y"]) {
      const speed = v[axis],
        offset = p[axis] - other[axis];
      if (Math.abs(speed) < 1e-10) {
        if (Math.abs(offset) >= extent) return null;
        continue;
      }
      const t0 = (-extent - offset) / speed,
        t1 = (extent - offset) / speed;
      const near = Math.min(t0, t1),
        far = Math.max(t0, t1);
      if (near > entry) {
        entry = near;
        nx = axis === "x" ? (speed > 0 ? -1 : 1) : 0;
        ny = axis === "y" ? (speed > 0 ? -1 : 1) : 0;
      }
      exit = Math.min(exit, far);
    }
    if (entry > exit || exit < 0 || entry > 1 || entry < -1e-6) return null;
    return { t: Math.max(0, entry), nx, ny };
  }
  function move(n, dx, dy) {
    if (Math.hypot(dx, dy) < 1e-8) return;
    const parent = nodes.get(n.parent);
    const siblings = [...nodes.values()].filter((x) => x.parent === n.parent && x.id !== n.id);
    // Sweep even for a large single pointer event so fast drags cannot teleport
    // through a bubble. Fixed-sized pieces also make corner handling consistent.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
    const increment = { x: dx / steps, y: dy / steps };
    let current = { x: n.x, y: n.y };
    for (let i = 0; i < steps; i++) {
      const before = { ...current };
      let remaining = { ...increment };
      for (let pass = 0; pass < 8; pass++) {
        const bounded = keepInside(
          n,
          { x: current.x + remaining.x, y: current.y + remaining.y },
          parent,
        );
        remaining = { x: bounded.x - current.x, y: bounded.y - current.y };
        if (Math.hypot(remaining.x, remaining.y) < 1e-7) break;
        let first = null;
        for (const s of siblings) {
          const limit = n.r + s.r + (n.type === "category" ? 22 : GAP);
          const hit = rounded
            ? sweepBox(current, remaining, s, limit)
            : sweepCircle(current, remaining, s, limit);
          if (hit && (!first || hit.t < first.t)) first = hit;
        }
        if (!first) {
          current = bounded;
          break;
        }
        // Advance *to* contact along the actual path. Never push the node to
        // the cursor's side of the obstacle or select a normal from that cursor.
        current = { x: current.x + remaining.x * first.t, y: current.y + remaining.y * first.t };
        const rest = { x: remaining.x * (1 - first.t), y: remaining.y * (1 - first.t) };
        const inward = rest.x * first.nx + rest.y * first.ny;
        if (inward < 0) {
          rest.x -= inward * first.nx;
          rest.y -= inward * first.ny;
        }
        if (Math.hypot(rest.x, rest.y) < 1e-7) break;
        remaining = rest; // keep only the tangent component at the contact point
      }
      if (
        !siblings.every((s) =>
          separated({ ...n, ...current }, s, n.type === "category" ? 22 : GAP),
        ) ||
        (parent && !inside(parent, { ...n, ...current }))
      )
        current = before;
    }
    n.x = current.x;
    n.y = current.y;
    rememberPosition(n);
  }
  function placeNewCategory(radius) {
    // Find a location outside every existing category without repositioning
    // them. The viewport can be fitted afterward to reveal the new container.
    const all = categoryNodes().filter((category) => category.x !== undefined);
    if (!all.length) return { x: 0, y: 0 };
    const cx = all.reduce((s, c) => s + c.x, 0) / all.length;
    const cy = all.reduce((s, c) => s + c.y, 0) / all.length;
    const maxDist = Math.max(...all.map((c) => Math.hypot(c.x - cx, c.y - cy) + c.r));
    for (let ring = maxDist + radius + 45; ring < maxDist + radius + 5500; ring += 45) {
      for (let i = 0; i < 36; i++) {
        const theta = (i / 36) * 2 * Math.PI;
        const p = { x: cx + Math.cos(theta) * ring, y: cy + Math.sin(theta) * ring };
        const probe = { ...p, r: radius };
        if (all.every((c) => separated(probe, c, 24))) return p;
      }
    }
    return { x: cx + maxDist + radius + 100, y: cy };
  }
  function fitGraph(animate = false) {
    const all = categoryNodes();
    if (!all.length) return;
    const left = Math.min(...all.map((c) => c.x - c.r)),
      right = Math.max(...all.map((c) => c.x + c.r));
    const top = Math.min(...all.map((c) => c.y - c.r)),
      bottom = Math.max(...all.map((c) => c.y + c.r));
    const w = Math.max(1, canvas.clientWidth - 80),
      h = Math.max(1, canvas.clientHeight - 130);
    zoom = clamp(Math.min(w / (right - left), h / (bottom - top)), MIN_ZOOM, 1.3);
    pan = { x: (-(left + right) / 2) * zoom, y: (-(top + bottom) / 2) * zoom };
    updateViewport(animate);
  }
  function moveBubble(node, dx, dy) {
    move(node, dx / zoom, dy / zoom);
    const el = elements.get(node.id);
    const parentRadius = nodes.get(node.parent)?.r ?? 0;
    el.style.left = node.x + parentRadius + "px";
    el.style.top = node.y + parentRadius + "px";
  }
  function edgePanSpeed(position, min, max) {
    const zone = Math.min(EDGE_PAN_ZONE, (max - min) / 2);
    if (zone <= 0) return 0;
    const fromStart = clamp((min + zone - position) / zone, 0, 1);
    const fromEnd = clamp((position - max + zone) / zone, 0, 1);
    return (fromStart - fromEnd) * EDGE_PAN_SPEED;
  }
  function stopEdgePan() {
    if (edgePanFrame != null) cancelAnimationFrame(edgePanFrame);
    edgePanFrame = null;
    lastEdgePanTime = null;
  }
  function panAtEdge(time) {
    edgePanFrame = null;
    if (drag?.type !== "node" || !drag.moved) return;
    const node = nodes.get(drag.id);
    if (!node) return;
    const { left, right, top, bottom } = drag.bounds;
    const speedX = edgePanSpeed(drag.lastX, left, right);
    const speedY = edgePanSpeed(drag.lastY, top, bottom);
    if (!speedX && !speedY) {
      lastEdgePanTime = null;
      return;
    }
    const seconds = Math.min(32, time - (lastEdgePanTime ?? time - 16)) / 1000;
    lastEdgePanTime = time;
    const dx = speedX * seconds;
    const dy = speedY * seconds;
    // Move the node against the camera travel when its layout constraints allow it.
    moveBubble(node, -dx, -dy);
    pan.x += dx;
    pan.y += dy;
    updateViewport();
    edgePanFrame = requestAnimationFrame(panAtEdge);
  }
  addCanvasListener(canvas, "pointerdown", (e) => {
    if ((e.button !== 0 && e.button !== 1) || drag) return;
    e.preventDefault();
    const hit = e.button === 0 && !spacePan ? e.target.closest(".nodevault-bubble") : null;
    if (hit) {
      const n = nodes.get(hit.dataset.id);
      if (!n) return;
      // Start from the camera as displayed if a zoom or Fit is still animating.
      if (world.classList.contains("nodevault-camera-transition")) {
        const current = new DOMMatrixReadOnly(getComputedStyle(world).transform);
        pan = { x: current.m41, y: current.m42 };
        zoom = current.a;
        updateViewport();
      }
      drag = {
        type: "node",
        id: n.id,
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
        bounds: canvas.getBoundingClientRect(),
      };
    } else {
      drag = { type: "pan", pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    }
    if (hit?.matches("button:not(.dimmed)")) {
      setTabStop(hit);
      hit.focus({ preventScroll: true });
    } else {
      canvas.focus({ preventScroll: true });
    }
    if (canvas.isConnected) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* Window listeners also handle uncaptured drags. */
      }
    }
  });
  addCanvasListener(
    window,
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      let dx = e.clientX - drag.lastX,
        dy = e.clientY - drag.lastY;
      if (drag.type === "node") {
        const { left, right, top, bottom } = drag.bounds;
        // Limit viewport travel to the canvas even if pointer capture continues outside it.
        dx = clamp(e.clientX, left, right) - clamp(drag.lastX, left, right);
        dy = clamp(e.clientY, top, bottom) - clamp(drag.lastY, top, bottom);
        if (!drag.moved) {
          if (Math.hypot(e.clientX - drag.lastX, e.clientY - drag.lastY) <= 3) return;
          drag.moved = true;
        }
      }
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      if (drag.type === "pan") {
        pan.x += dx;
        pan.y += dy;
        updateViewport();
      } else {
        const n = nodes.get(drag.id);
        if (!n) return;
        moveBubble(n, dx, dy);
        if (edgePanFrame == null) edgePanFrame = requestAnimationFrame(panAtEdge);
      }
    },
    { capture: true },
  );
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    stopEdgePan();
    if (e.type !== "pointerup" || finished.type !== "node" || finished.moved) return;
    const node = nodes.get(finished.id);
    if (node?.itemId && !elements.get(node.id)?.classList.contains("dimmed")) {
      openItem(node.itemId);
    }
  }
  addCanvasListener(window, "pointerup", endDrag, { capture: true });
  addCanvasListener(window, "pointercancel", endDrag, { capture: true });
  addCanvasListener(window, "blur", () => {
    drag = null;
    stopEdgePan();
    spacePan = false;
  });
  addCanvasListener(window, "keydown", (e) => {
    if (e.code === "Space" && e.target === canvas) {
      e.preventDefault();
      spacePan = true;
    }
  });
  addCanvasListener(window, "keyup", (e) => {
    if (e.code === "Space") spacePan = false;
  });
  function setTabStop(target) {
    elements.get(focusId)?.setAttribute("tabindex", "-1");
    focusId = target.dataset.id;
    target.tabIndex = 0;
    canvas.tabIndex = -1;
  }
  function reveal(target) {
    const bounds = canvas.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (
      rect.left < bounds.left + 12 ||
      rect.right > bounds.right - 12 ||
      rect.top < bounds.top + 36 ||
      rect.bottom > bounds.bottom - 45
    ) {
      pan.x += (bounds.left + bounds.right - rect.left - rect.right) / 2;
      pan.y += (bounds.top + bounds.bottom - rect.top - rect.bottom) / 2;
      updateViewport();
    }
  }
  addCanvasListener(world, "focusin", (e) => {
    if (!e.target.matches("button:not(.dimmed)")) return;
    setTabStop(e.target);
    if (!drag && e.target.matches(":focus-visible")) reveal(e.target);
  });
  addCanvasListener(canvas, "keydown", (e) => {
    const offset = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!offset || !visibleLogins.length) return;
    e.preventDefault();
    const index = visibleLogins.indexOf(e.target);
    const next = index === -1 ? 0 : (index + offset + visibleLogins.length) % visibleLogins.length;
    const target = visibleLogins[next];
    setTabStop(target);
    reveal(target);
    target.focus({ preventScroll: true });
  });
  addCanvasListener(world, "click", (e) => {
    // Keyboard and assistive technology produce a click without a pointer sequence.
    const target = e.target.closest("button:not(.dimmed)");
    if (target && e.detail === 0) openItem(nodes.get(target.dataset.id).itemId);
  });
  addCanvasListener(
    canvas,
    "wheel",
    (e) => {
      e.preventDefault();
      if (drag?.type === "node") return;
      zoom = clamp(zoom * (e.deltaY < 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM);
      updateViewport();
    },
    { passive: false },
  );
  function updateViewport(animate = false) {
    world.classList.toggle("nodevault-camera-transition", animate);
    world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    canvas.style.backgroundPosition = `${pan.x}px ${pan.y}px`;
  }
  function updateSearch() {
    const matches = new Set();
    visibleLogins = [];
    for (const node of nodes.values()) {
      if (node.type !== "account" || !node.name.toLowerCase().includes(search)) continue;
      visibleLogins.push(elements.get(node.id));
      for (let ancestor = node; ancestor && !matches.has(ancestor.id);) {
        matches.add(ancestor.id);
        ancestor = nodes.get(ancestor.parent);
      }
    }
    const nextFocus = visibleLogins.find((el) => el.dataset.id === focusId) ?? visibleLogins[0];
    focusId = nextFocus?.dataset.id ?? null;
    canvas.tabIndex = nextFocus ? -1 : 0;
    for (const [id, el] of elements) {
      const dimmed = Boolean(search) && !matches.has(id);
      el.classList.toggle("dimmed", dimmed);
      if (el.matches("button")) {
        el.tabIndex = el === nextFocus ? 0 : -1;
        el.setAttribute("aria-disabled", String(dimmed));
      }
    }
  }
  function draw() {
    const hadNodeFocus = world.contains(document.activeElement);
    clearIcons();
    world.replaceChildren();
    world.classList.toggle("nodevault-rounded", rounded);
    elements.clear();
    for (const node of nodes.values()) {
      const el = document.createElement(node.type === "account" ? "button" : "div");
      el.className = "nodevault-bubble " + node.type + (node.id === selected ? " active" : "");
      el.dataset.id = node.id;
      const parent = nodes.get(node.parent);
      const offset = parent?.r ?? 0;
      el.style.left = node.x + offset + "px";
      el.style.top = node.y + offset + "px";
      el.style.width = el.style.height = node.r * 2 + "px";
      const label = document.createElement("span");
      label.textContent = node.name;
      if (node.type === "account") {
        el.type = "button";
        label.className = "account-label";
        el.title = node.name;
        const folder = parent.type === "category" ? parent : nodes.get(parent.parent);
        el.setAttribute("aria-label", `${node.name}, in ${folder.name}`);
        const icon = document.createElement(renderIcon ? "app-vault-icon" : "span");
        if (!renderIcon) icon.className = "bwi bwi-globe";
        icon.classList.add("nodevault-account-icon");
        icon.setAttribute("aria-hidden", "true");
        el.append(icon);
        if (renderIcon) destroyIcons.push(renderIcon(icon, itemById.get(node.itemId).serviceHost));
      } else {
        el.classList.toggle("empty", node.count === 0);
        label.className = "nodevault-heading";
        const count = document.createElement("span");
        count.className = "nodevault-count";
        count.textContent = String(node.count);
        label.append(count);
      }
      el.append(label);
      (elements.get(node.parent) ?? world).append(el);
      elements.set(node.id, el);
    }
    updateSearch();
    if (hadNodeFocus) {
      (elements.get(focusId) ?? canvas).focus({ preventScroll: true });
    }
  }
  function clearIcons() {
    for (const destroyIcon of destroyIcons) destroyIcon();
    destroyIcons.length = 0;
  }
  return {
    setData(nextFolders, nextItems) {
      const first = nodes.size === 0;
      folders = nextFolders;
      itemSummaries = nextItems;
      itemById = new Map(nextItems.map((item) => [item.id, item]));
      build();
      if (first) fitGraph();
    },
    setRounded(value) {
      rounded = value;
      build();
    },
    setSearch(value) {
      search = value.trim().toLowerCase();
      updateSearch();
    },
    setSelected(id) {
      elements.get(selected)?.classList.remove("active");
      selected = id == null ? null : accountIdFor(id);
      elements.get(selected)?.classList.add("active");
    },
    zoomBy(factor) {
      zoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
      updateViewport(true);
    },
    fit() {
      fitGraph(true);
    },
    destroy() {
      abort.abort();
      stopEdgePan();
      clearIcons();
      world.remove();
      positions.clear();
      nodes.clear();
      elements.clear();
      visibleLogins = [];
      itemById.clear();
      folders = [];
      itemSummaries = [];
    },
  };
}
