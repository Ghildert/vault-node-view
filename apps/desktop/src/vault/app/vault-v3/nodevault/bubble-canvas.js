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
export function mountBubbleCanvas(canvas, openItem, renderIcon, moveItems) {
  const world = document.createElement("div");
  world.className = "nodevault-world";
  canvas.append(world);
  const abort = new AbortController();
  const addCanvasListener = (target, name, listener, options = {}) =>
    target.addEventListener(name, listener, { ...options, signal: abort.signal });
  const positions = new Map(),
    nodes = new Map(),
    elements = new Map(),
    labels = new Map();
  const destroyIcons = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const GAP = 16,
    ACCOUNT_GAP = 38,
    MANUAL_ACCOUNT_GAP = 26,
    CATEGORY_GAP = 22,
    INNER = 10,
    LABEL_PAD = 4,
    HEADING_GAP = 6,
    BREAKOUT_GAP = 16,
    LOGIN_RADIUS = 20,
    MIN_ZOOM = 0.3,
    MAX_ZOOM = 3;
  const EDGE_PAN_ZONE = 36;
  const EDGE_PAN_SPEED = 480;
  let rounded = false,
    labelLength = 12,
    minZoom = MIN_ZOOM,
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
  let containers = [];
  function displayService(itemId) {
    const host = itemById.get(itemId)?.serviceHost;
    return host ? { id: "host:" + encodeURIComponent(host), name: host } : undefined;
  }
  function headingInset(parent) {
    return parent.type === "category" ? 14 : 9;
  }
  function extent(x, y) {
    return rounded ? Math.max(Math.abs(x), Math.abs(y)) : Math.hypot(x, y);
  }
  function childRadius(node, x, y) {
    const bubble = extent(x, y) + node.r + INNER;
    if (node.type !== "account") return bubble;
    const leftOrRight = Math.abs(x) + node.labelHalfWidth;
    const bottom = y + node.r + LABEL_PAD + node.labelHeight;
    const top = y + node.r + LABEL_PAD;
    return Math.max(bubble, extent(leftOrRight, Math.max(Math.abs(top), Math.abs(bottom))) + 8);
  }
  function inside(parent, node, x = node.x, y = node.y) {
    return (
      y - node.r >= parent.headingBottom - 0.0001 && childRadius(node, x, y) <= parent.r + 0.0001
    );
  }
  function siblingGap(a, b) {
    if (a.type === "category") return CATEGORY_GAP;
    return a.type === "account" && b.type === "account" ? ACCOUNT_GAP : GAP;
  }
  function separated(a, b, manual = false) {
    const dx = Math.abs(a.x - b.x),
      dy = Math.abs(a.y - b.y),
      limit =
        a.r +
        b.r +
        (manual && a.type === "account" && b.type === "account"
          ? MANUAL_ACCOUNT_GAP
          : siblingGap(a, b));
    if (rounded) return dx >= limit - 0.0001 || dy >= limit - 0.0001;
    return Math.hypot(dx, dy) >= limit - 0.0001;
  }
  function* placementCandidates(step, maxRings = Infinity) {
    yield { x: 0, y: 0 };
    for (let ring = 1; ring <= maxRings; ring++) {
      const extent = ring * step;
      if (rounded) {
        for (let offset = -extent; offset < extent; offset += step) {
          yield { x: offset, y: -extent };
          yield { x: extent, y: offset };
          yield { x: -offset, y: extent };
          yield { x: -extent, y: -offset };
        }
      } else {
        const count = Math.floor(Math.PI / Math.asin(step / (2 * extent)));
        for (let i = 0; i < count; i++) {
          const slot = i % 2 === 0 ? i / 2 : Math.ceil(count / 2) + (i - 1) / 2;
          const angle = ((slot + (ring % 2) / 2) * 2 * Math.PI) / count;
          yield { x: extent * Math.cos(angle), y: extent * Math.sin(angle) };
        }
      }
    }
  }
  function fitContainer(parent, children) {
    const inset = headingInset(parent);
    const heading = inset + parent.labelHeight + HEADING_GAP;
    const halfWidth = parent.labelHalfWidth + 4;
    const headingRadius = rounded ? halfWidth : Math.hypot(halfWidth, parent.labelHeight);
    if (!children.length) {
      parent.r = Math.ceil(Math.max(46, headingRadius, heading));
    } else {
      const left = Math.min(...children.map(({ x, r }) => x - r));
      const right = Math.max(...children.map(({ x, r }) => x + r));
      const top = Math.min(...children.map(({ y, r }) => y - r));
      const bottom = Math.max(...children.map(({ y, r }) => y + r));
      let x = (left + right) / 2;
      let y = (top + bottom - heading + INNER) / 2;
      const radiusAt = (x, y) => {
        const captionTop = Math.min(0, top - y - parent.labelHeight - HEADING_GAP);
        const captionRadius = rounded ? halfWidth : Math.hypot(halfWidth, captionTop);
        return children.reduce(
          (radius, child) => Math.max(radius, childRadius(child, child.x - x, child.y - y)),
          Math.max(headingRadius, captionRadius, heading + y - top),
        );
      };
      let radius = radiusAt(x, y);
      // A circle's tightest center can differ from the center of its bounding box.
      const directions = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ];
      for (let step = radius / 4; !rounded && step >= 0.5; step /= 2) {
        const centerX = x;
        const centerY = y;
        for (const [dx, dy] of directions) {
          const nextX = centerX + dx * step;
          const nextY = centerY + dy * step;
          const nextRadius = radiusAt(nextX, nextY);
          if (nextRadius < radius) {
            x = nextX;
            y = nextY;
            radius = nextRadius;
          }
        }
      }
      parent.r = Math.ceil(radius);
      for (const child of children) {
        child.x -= x;
        child.y -= y;
      }
    }
    // Wide headings sit farther from the curved edge where the outline is wider.
    parent.headingTop = rounded
      ? inset
      : Math.max(inset, parent.r - Math.sqrt(Math.max(0, parent.r ** 2 - halfWidth ** 2)));
    parent.headingBottom = parent.headingTop + parent.labelHeight + HEADING_GAP - parent.r;
  }
  function pack(parent, children) {
    const pitch = 2 * LOGIN_RADIUS + ACCOUNT_GAP;
    const accountCluster = children.every((child) => child.type === "account");
    const smallCluster = accountCluster && children.length >= 2 && children.length <= 6;
    const step = accountCluster ? pitch : pitch / 3;
    const placed = [];
    let candidates;
    let lastRadius;
    // A rejected position stays blocked for subsequent siblings of the same size.
    // Restart for smaller siblings so they can fill gaps between larger bubbles.
    for (const child of [...children].sort((a, b) => b.r - a.r || a.id.localeCompare(b.id))) {
      if (smallCluster) {
        const index = placed.length;
        const count = children.length;
        if (rounded) {
          const columns = Math.ceil(Math.sqrt(count));
          const row = Math.floor(index / columns);
          const inRow = Math.min(columns, count - row * columns);
          child.x = ((index % columns) - (inRow - 1) / 2) * pitch;
          child.y = row * pitch;
        } else {
          const angle = (index * 2 * Math.PI) / count;
          const radius = pitch / (2 * Math.sin(Math.PI / count));
          child.x = radius * Math.cos(angle);
          child.y = radius * Math.sin(angle);
        }
        placed.push(child);
        continue;
      }
      if (child.r !== lastRadius) {
        candidates = placementCandidates(step);
        lastRadius = child.r;
      }
      let probe;
      do {
        probe = { ...candidates.next().value, r: child.r, type: child.type };
      } while (!placed.every((sibling) => separated(probe, sibling)));
      child.x = probe.x;
      child.y = probe.y;
      placed.push(child);
    }
    if (parent) fitContainer(parent, children);
    // Restore a saved arrangement together so swaps can survive a relayout.
    const savedChildren = new Map(
      children
        .map((child) => [child, savedPosition(child.id, child.parent)])
        .filter(([, saved]) => saved),
    );
    if (!savedChildren.size) return;
    const restored = children.map((child) => ({ ...child, ...savedChildren.get(child) }));
    const fits = (probe, child, arrangement) =>
      (!parent || inside(parent, probe)) &&
      arrangement.every((sibling) => sibling === child || separated(probe, sibling, true));
    if (
      restored.every(
        (probe, index) => !savedChildren.has(children[index]) || fits(probe, probe, restored),
      )
    ) {
      for (const [child, saved] of savedChildren) {
        child.x = saved.x;
        child.y = saved.y;
      }
      return;
    }
    for (const child of children) {
      const saved = savedChildren.get(child);
      if (!saved) continue;
      const probe = { ...child, ...saved };
      if (fits(probe, child, children)) {
        child.x = saved.x;
        child.y = saved.y;
      }
    }
  }
  function categoryNodes() {
    return [...nodes.values()].filter((n) => n.type === "category");
  }
  function savedPosition(id, parent) {
    const saved = positions.get(id);
    return saved?.parent === parent ? saved : undefined;
  }
  function build() {
    cancelDrag();
    const items = itemSummaries;
    const categories = groupVault(folders, items, displayService);
    nodes.clear();
    containers = [];
    for (const c of categories) {
      const parent = {
        id: c.id,
        name: c.name,
        count: c.count,
        type: "category",
        parent: null,
        folderId: c.folderId,
      };
      nodes.set(c.id, parent);
      const children = [];
      for (const service of c.services.values()) {
        const count = service.accounts.length;
        let container = parent;
        if (count > 1) {
          container = {
            id: service.id,
            name: service.name,
            count,
            type: "service",
            parent: c.id,
          };
          nodes.set(container.id, container);
          children.push(container);
        }
        const accounts = service.accounts.map((account) => {
          const n = {
            ...account,
            type: "account",
            parent: container.id,
            r: LOGIN_RADIUS,
          };
          nodes.set(n.id, n);
          return n;
        });
        if (container === parent) children.push(...accounts);
        else containers.push({ parent: container, children: accounts });
      }
      containers.push({ parent, children });
    }
    for (const [id, saved] of positions) {
      if (nodes.get(id)?.parent !== saved.parent) positions.delete(id);
    }
    draw();
  }
  function keepInside(n, current, target, parent) {
    if (!parent || inside(parent, n, target.x, target.y)) return target;
    // The outline and label constraints form a convex region. Stop at its
    // boundary along the drag path, including when a label reaches it first.
    let low = 0;
    let high = 1;
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    for (let i = 0; i < 12; i++) {
      const fraction = (low + high) / 2;
      if (inside(parent, n, current.x + fraction * dx, current.y + fraction * dy)) low = fraction;
      else high = fraction;
    }
    return { x: current.x + low * dx, y: current.y + low * dy };
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
  function jumpAcrossGroup(node, parent, siblings, cursor) {
    if (
      !parent ||
      !cursor ||
      distanceFromOutline(elements.get(parent.id), cursor.x, cursor.y) > 0
    ) {
      return null;
    }
    const bounds = elements.get(node.id).getBoundingClientRect();
    const target = keepInside(
      node,
      node,
      {
        x: node.x + (cursor.x - (bounds.left + bounds.right) / 2) / zoom,
        y: node.y + (cursor.y - (bounds.top + bounds.bottom) / 2) / zoom,
      },
      parent,
    );
    const landing = { ...node, ...target };
    if (!siblings.every((sibling) => separated(landing, sibling))) return null;

    const travel = { x: target.x - node.x, y: target.y - node.y };
    const sweep = rounded ? sweepBox : sweepCircle;
    const crossed = siblings.some((sibling) => {
      if (sibling.type !== "service") return false;
      const startX = node.x - sibling.x;
      const startY = node.y - sibling.y;
      const endX = target.x - sibling.x;
      const endY = target.y - sibling.y;
      return (
        startX * endX + startY * endY < 0 &&
        (drag?.ghostGroup === sibling.id || sweep(node, travel, sibling, sibling.r)) &&
        distanceFromOutline(elements.get(sibling.id), cursor.x, cursor.y) >= BREAKOUT_GAP
      );
    });
    return crossed ? target : null;
  }
  function rememberPosition(node, { x, y }) {
    node.x = x;
    node.y = y;
    positions.set(node.id, { parent: node.parent, x, y });
  }
  function makeRoom(node, target, siblings, parent) {
    const held = { ...node, ...target };
    const occupied = [...siblings];
    const displaced = [];
    const sweep = rounded ? sweepBox : sweepCircle;
    for (const [index, neighbor] of siblings.entries()) {
      if (separated(held, neighbor, true)) continue;
      if (neighbor.type !== "account") return false;
      const dx = neighbor.x - held.x;
      const dy = neighbor.y - held.y;
      const direction = extent(dx, dy)
        ? { x: dx, y: dy }
        : { x: held.x - node.x, y: held.y - node.y };
      const scale = (held.r + neighbor.r + MANUAL_ACCOUNT_GAP) / extent(direction.x, direction.y);
      const pushed = { x: held.x + direction.x * scale, y: held.y + direction.y * scale };
      const fits = ({ x, y }) => {
        const probe = { ...neighbor, x, y };
        const travel = { x: x - neighbor.x, y: y - neighbor.y };
        return (
          inside(parent, probe) &&
          separated(held, probe, true) &&
          occupied.every(
            (other, i) =>
              i === index ||
              (separated(probe, other, true) &&
                (other.type === "account" ||
                  !sweep(
                    neighbor,
                    travel,
                    other,
                    neighbor.r + other.r + siblingGap(neighbor, other),
                  ))),
          )
        );
      };
      let placement = fits(pushed) ? pushed : null;
      if (!placement) {
        for (const offset of placementCandidates(10, 9)) {
          const nearby = { x: neighbor.x + offset.x, y: neighbor.y + offset.y };
          if (fits(nearby)) {
            placement = nearby;
            break;
          }
        }
      }
      if (!placement && drag?.startPosition) {
        // In a tight group the only opening may be the space the held node vacated.
        for (const offset of placementCandidates(2, 8)) {
          const vacated = {
            x: drag.startPosition.x + offset.x,
            y: drag.startPosition.y + offset.y,
          };
          if (fits(vacated)) {
            placement = vacated;
            break;
          }
        }
      }
      if (!placement) return false;
      occupied[index] = { ...neighbor, ...placement };
      displaced.push({ neighbor, placement });
    }
    // Apply all pushes together so a blocked neighbor never leaves a partial move.
    for (const { neighbor, placement } of displaced) {
      rememberPosition(neighbor, placement);
      positionBubble(neighbor);
    }
    return true;
  }
  function move(n, dx, dy, cursor) {
    if (!cursor && Math.hypot(dx, dy) < 1e-8) return;
    const parent = nodes.get(n.parent);
    const siblings = [...nodes.values()].filter((x) => x.parent === n.parent && x.id !== n.id);
    const canPush = n.type === "account";
    const obstacles = canPush ? siblings.filter((sibling) => sibling.type !== "account") : siblings;
    const landing = jumpAcrossGroup(n, parent, obstacles, cursor);
    if (landing && (!canPush || makeRoom(n, landing, siblings, parent))) {
      clearGhost();
      rememberPosition(n, landing);
      return;
    }
    if (canPush && cursor && previewCrossing(n, obstacles, cursor)) return;
    // Aim from the current position so a tightly packed group can make room as
    // soon as the cursor reaches a valid arrangement.
    if (canPush && cursor) {
      const bounds = elements.get(n.id).getBoundingClientRect();
      dx = (cursor.x - drag.grabX - (bounds.left + bounds.right) / 2) / zoom;
      dy = (cursor.y - drag.grabY - (bounds.top + bounds.bottom) / 2) / zoom;
    }
    // Sweep even for large pointer events to keep ordinary collisions solid.
    // Fixed-sized pieces also make corner handling consistent.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
    const increment = { x: dx / steps, y: dy / steps };
    let current = { x: n.x, y: n.y };
    for (let i = 0; i < steps; i++) {
      const before = { ...current };
      let remaining = { ...increment };
      for (let pass = 0; pass < 8; pass++) {
        const bounded = keepInside(
          n,
          current,
          { x: current.x + remaining.x, y: current.y + remaining.y },
          parent,
        );
        remaining = { x: bounded.x - current.x, y: bounded.y - current.y };
        if (Math.hypot(remaining.x, remaining.y) < 1e-7) break;
        let first = null;
        for (const s of obstacles) {
          const limit = n.r + s.r + siblingGap(n, s);
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
        !obstacles.every((s) => separated({ ...n, ...current }, s)) ||
        (parent && !inside(parent, { ...n, ...current }))
      )
        current = before;
    }
    if (!canPush || makeRoom(n, current, siblings, parent)) rememberPosition(n, current);
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
    zoom = Math.min(w / (right - left), h / (bottom - top), 1.3);
    minZoom = Math.min(MIN_ZOOM, zoom);
    pan = { x: (-(left + right) / 2) * zoom, y: (-(top + bottom) / 2) * zoom };
    updateViewport(animate);
  }
  function moveBubble(node, dx, dy, cursor) {
    move(node, dx / zoom, dy / zoom, cursor);
    positionBubble(node);
  }
  function positionBubble(node) {
    const el = elements.get(node.id);
    const parentRadius = nodes.get(node.parent)?.r ?? 0;
    el.style.left = node.x + parentRadius + "px";
    el.style.top = node.y + parentRadius + "px";
  }
  function distanceFromOutline(el, x, y) {
    const bounds = el.getBoundingClientRect();
    const dx = Math.abs(x - (bounds.left + bounds.right) / 2);
    const dy = Math.abs(y - (bounds.top + bounds.bottom) / 2);
    const radius = bounds.width / 2;
    if (!rounded) return Math.hypot(dx, dy) - radius;
    const corner = Math.min(24 * zoom, radius);
    const edgeX = dx - radius + corner;
    const edgeY = dy - radius + corner;
    return (
      Math.hypot(Math.max(0, edgeX), Math.max(0, edgeY)) +
      Math.min(0, Math.max(edgeX, edgeY)) -
      corner
    );
  }
  function clearGhost() {
    if (!drag?.ghost) return;
    drag.ghost.remove();
    elements.get(drag.id).classList.remove("nodevault-ghost-origin");
    drag.ghost = null;
    drag.ghostGroup = null;
  }
  function previewCrossing(node, obstacles, cursor) {
    if (!drag.ghost && !obstacles.some((obstacle) => obstacle.type === "service")) return false;
    const el = elements.get(node.id);
    const source = el.getBoundingClientRect();
    const start = { x: (source.left + source.right) / 2, y: (source.top + source.bottom) / 2 };
    const isFarSide = (x, y) => (start.x - x) * (cursor.x - x) + (start.y - y) * (cursor.y - y) < 0;
    const group = obstacles.find((obstacle) => {
      if (obstacle.type !== "service") return false;
      const target = elements.get(obstacle.id);
      if (distanceFromOutline(target, cursor.x, cursor.y) <= 0) return true;
      // A quick pointer move may skip over the interior between events.
      const box = target.getBoundingClientRect();
      const x = (box.left + box.right) / 2;
      const y = (box.top + box.bottom) / 2;
      const sweep = rounded ? sweepBox : sweepCircle;
      const travel = { x: cursor.x - start.x, y: cursor.y - start.y };
      return isFarSide(x, y) && sweep(start, travel, { x, y }, box.width / 2);
    });
    if (!group && !drag.ghost) return false;
    if (group) {
      drag.ghostGroup = group.id;
    } else {
      // Returning to the side we started from cancels the crossing once clear.
      const obstacle = elements.get(drag.ghostGroup);
      const box = obstacle.getBoundingClientRect();
      const x = (box.left + box.right) / 2;
      const y = (box.top + box.bottom) / 2;
      if (!isFarSide(x, y) && distanceFromOutline(obstacle, cursor.x, cursor.y) >= BREAKOUT_GAP) {
        clearGhost();
        return false;
      }
    }
    if (!drag.ghost) {
      const ghost = el.cloneNode(true);
      ghost.removeAttribute("data-id");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.classList.add("nodevault-drag-ghost");
      world.append(ghost);
      el.classList.add("nodevault-ghost-origin");
      drag.ghost = ghost;
    }
    positionAtCursor(drag.ghost, cursor.x, cursor.y);
    return true;
  }
  function positionAtCursor(el, x, y) {
    const origin = world.getBoundingClientRect();
    el.style.left = (x - origin.left) / zoom + "px";
    el.style.top = (y - origin.top) / zoom + "px";
  }
  function trackDraggedBubble(node) {
    if (!moveItems || !node.parent) return;
    const { lastX: x, lastY: y, bounds } = drag;
    const parent = elements.get(node.parent);
    const source = nodes.get(node.parent);
    if (!drag.detached) {
      if (distanceFromOutline(parent, x, y) <= BREAKOUT_GAP) return;
      clearGhost();
      drag.detached = true;
      const el = elements.get(node.id);
      el.classList.add("nodevault-detached");
      world.append(el);
    }
    const el = elements.get(node.id);
    positionAtCursor(el, x, y);

    const sourceFolder = source.type === "category" ? source : nodes.get(source.parent);
    const overCanvas =
      x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    const target =
      overCanvas &&
      categoryNodes().find(
        (folder) =>
          folder !== sourceFolder && distanceFromOutline(elements.get(folder.id), x, y) <= 0,
      );
    elements.get(drag.targetId)?.classList.remove("nodevault-drop-target");
    drag.targetId = target?.id;
    elements.get(drag.targetId)?.classList.add("nodevault-drop-target");
  }
  function cancelDrag() {
    clearGhost();
    if (drag?.detached) {
      const node = nodes.get(drag.id);
      const el = elements.get(drag.id);
      elements.get(drag.targetId)?.classList.remove("nodevault-drop-target");
      el.classList.remove("nodevault-detached");
      elements.get(node.parent).append(el);
      positionBubble(node);
    }
    drag = null;
    stopEdgePan();
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
    if (!drag.detached && !drag.ghost) moveBubble(node, -dx, -dy);
    pan.x += dx;
    pan.y += dy;
    updateViewport();
    if (drag.ghost) moveBubble(node, 0, 0, { x: drag.lastX, y: drag.lastY });
    trackDraggedBubble(node);
    edgePanFrame = requestAnimationFrame(panAtEdge);
  }
  function stopCameraTransition() {
    if (!world.classList.contains("nodevault-camera-transition")) return;
    const current = new DOMMatrixReadOnly(getComputedStyle(world).transform);
    pan = { x: current.m41, y: current.m42 };
    zoom = current.a;
    updateViewport();
  }
  addCanvasListener(canvas, "pointerdown", (e) => {
    if ((e.button !== 0 && e.button !== 1) || drag) return;
    e.preventDefault();
    stopCameraTransition();
    const hit = e.button === 0 && !spacePan ? e.target.closest(".nodevault-bubble") : null;
    if (hit) {
      const n = nodes.get(hit.dataset.id);
      if (!n) return;
      const box = hit.getBoundingClientRect();
      drag = {
        type: "node",
        id: n.id,
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        grabX: e.clientX - (box.left + box.right) / 2,
        grabY: e.clientY - (box.top + box.bottom) / 2,
        startPosition: { x: n.x, y: n.y },
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
        if (!drag.detached) moveBubble(n, dx, dy, { x: e.clientX, y: e.clientY });
        trackDraggedBubble(n);
        if (edgePanFrame == null) edgePanFrame = requestAnimationFrame(panAtEdge);
      }
    },
    { capture: true },
  );
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.detached && e.type === "pointerup") {
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      trackDraggedBubble(nodes.get(drag.id));
    }
    const finished = drag;
    cancelDrag();
    if (e.type !== "pointerup" || finished.type !== "node") return;
    const node = nodes.get(finished.id);
    const target = nodes.get(finished.targetId);
    if (target) {
      const items = node.itemId
        ? [node]
        : [...nodes.values()].filter((item) => item.parent === node.id);
      moveItems({
        items: items.map((item) => ({
          id: item.itemId,
          folderId: itemById.get(item.itemId).folderId,
        })),
        folderId: target.folderId,
      });
      return;
    }
    if (finished.moved) return;
    if (node?.itemId && !elements.get(node.id)?.classList.contains("dimmed")) {
      openItem(node.itemId);
    }
  }
  addCanvasListener(window, "pointerup", endDrag, { capture: true });
  addCanvasListener(window, "pointercancel", endDrag, { capture: true });
  addCanvasListener(window, "blur", () => {
    cancelDrag();
    spacePan = false;
  });
  addCanvasListener(window, "keydown", (e) => {
    if (e.key === "Escape" && drag) cancelDrag();
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
      if (drag?.type === "node" || !e.deltaY) return;
      stopCameraTransition();
      const bounds = canvas.getBoundingClientRect();
      const x = e.clientX - bounds.left - canvas.clientLeft - canvas.clientWidth / 2;
      const y = e.clientY - bounds.top - canvas.clientTop - canvas.clientHeight / 2;
      const nextZoom = clamp(zoom * (e.deltaY < 0 ? 1.1 : 0.9), minZoom, MAX_ZOOM);
      const ratio = nextZoom / zoom;
      pan = { x: x + (pan.x - x) * ratio, y: y + (pan.y - y) * ratio };
      zoom = nextZoom;
      updateViewport();
    },
    { passive: false },
  );
  function updateViewport(animate = false) {
    world.classList.toggle("nodevault-camera-transition", animate);
    world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    canvas.style.backgroundPosition = `${pan.x}px ${pan.y}px`;
  }
  let matchingSearchIds = null;
  function updateSearch() {
    const matches = new Set();
    visibleLogins = [];
    for (const node of nodes.values()) {
      if (node.type !== "account") continue;
      if (
        matchingSearchIds
          ? !matchingSearchIds.has(node.itemId)
          : !node.name.toLowerCase().includes(search)
      )
        continue;
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
  function truncateLabel(name) {
    let count = 0;
    for (const { index } of segmenter.segment(name)) {
      if (count === labelLength) return name.slice(0, index) + "…";
      count++;
    }
    return name;
  }
  function draw() {
    const hadNodeFocus = world.contains(document.activeElement);
    clearIcons();
    world.replaceChildren();
    world.classList.toggle("nodevault-rounded", rounded);
    elements.clear();
    labels.clear();
    for (const node of nodes.values()) {
      const el = document.createElement(node.type === "account" ? "button" : "div");
      el.className = "nodevault-bubble " + node.type + (node.id === selected ? " active" : "");
      el.dataset.id = node.id;
      const parent = nodes.get(node.parent);
      const label = document.createElement("span");
      const name = document.createTextNode(truncateLabel(node.name));
      label.append(name);
      labels.set(node.id, name);
      el.title = node.name;
      if (node.type === "account") {
        el.type = "button";
        label.className = "account-label";
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
    relayout();
    updateSearch();
    if (hadNodeFocus) {
      (elements.get(focusId) ?? canvas).focus({ preventScroll: true });
    }
  }
  function relayout() {
    cancelDrag();
    for (const [id, name] of labels) {
      const node = nodes.get(id);
      const label = name.parentElement;
      node.labelHalfWidth = label.offsetWidth / 2 + LABEL_PAD;
      node.labelHeight = label.offsetHeight;
    }
    for (const { parent, children } of containers) pack(parent, children);
    pack(null, categoryNodes());
    for (const node of nodes.values()) {
      const el = elements.get(node.id);
      el.style.width = el.style.height = node.r * 2 + "px";
      if (node.type !== "account")
        labels.get(node.id).parentElement.style.top = node.headingTop + "px";
      positionBubble(node);
    }
  }
  if (document.fonts) addCanvasListener(document.fonts, "loadingdone", relayout);
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
    setSearch(value, matchingIds) {
      search = value.trim().toLowerCase();
      matchingSearchIds = matchingIds ? new Set(matchingIds) : null;
      updateSearch();
    },
    setLabelLength(value) {
      if (value === labelLength) return;
      labelLength = value;
      for (const [id, label] of labels) {
        label.data = truncateLabel(nodes.get(id).name);
      }
      relayout();
    },
    setSelected(id) {
      elements.get(selected)?.classList.remove("active");
      selected = id == null ? null : accountIdFor(id);
      elements.get(selected)?.classList.add("active");
    },
    zoomBy(factor) {
      zoom = clamp(zoom * factor, minZoom, MAX_ZOOM);
      updateViewport(true);
    },
    fit() {
      fitGraph(true);
    },
    destroy() {
      abort.abort();
      cancelDrag();
      clearIcons();
      world.remove();
      positions.clear();
      nodes.clear();
      elements.clear();
      labels.clear();
      visibleLogins = [];
      itemById.clear();
      folders = [];
      itemSummaries = [];
    },
  };
}
