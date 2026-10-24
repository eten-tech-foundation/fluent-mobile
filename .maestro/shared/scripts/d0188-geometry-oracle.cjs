/**
 * Offline geometry oracle for D-0188-03.
 * Pure bounds math + optional hierarchy walk. No device I/O.
 */

function parseBounds(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw !== null) {
    const x = Number(raw.x ?? raw.left);
    const y = Number(raw.y ?? raw.top);
    const w = Number(raw.width ?? (raw.right != null ? raw.right - x : NaN));
    const h = Number(raw.height ?? (raw.bottom != null ? raw.bottom - y : NaN));
    if ([x, y, w, h].every(n => Number.isFinite(n))) {
      return { x, y, width: w, height: h };
    }
  }
  const s = String(raw).trim();
  // "[x,y][x2,y2]" Android accessibility style
  const m = s.match(
    /\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/,
  );
  if (m) {
    const x1 = Number(m[1]);
    const y1 = Number(m[2]);
    const x2 = Number(m[3]);
    const y2 = Number(m[4]);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  return null;
}

function centerOf(bounds) {
  return {
    cx: bounds.x + bounds.width / 2,
    cy: bounds.y + bounds.height / 2,
  };
}

function evaluateCentered(hostBounds, messageBounds, maxDxFrac, maxDyFrac) {
  const host = typeof hostBounds === 'object' && hostBounds.width != null
    ? hostBounds
    : parseBounds(hostBounds);
  const msg = typeof messageBounds === 'object' && messageBounds.width != null
    ? messageBounds
    : parseBounds(messageBounds);
  if (!host || !msg || host.width <= 0 || host.height <= 0) {
    return {
      ok: false,
      reason: 'missing_or_invalid_bounds',
      host,
      message: msg,
    };
  }
  const hc = centerOf(host);
  const mc = centerOf(msg);
  const deltaCenterXFrac = Math.abs(mc.cx - hc.cx) / host.width;
  const deltaCenterYFrac = Math.abs(mc.cy - hc.cy) / host.height;
  const maxDx = Number(maxDxFrac);
  const maxDy = Number(maxDyFrac);
  const ok =
    Number.isFinite(deltaCenterXFrac) &&
    Number.isFinite(deltaCenterYFrac) &&
    deltaCenterXFrac <= maxDx &&
    deltaCenterYFrac <= maxDy;
  return {
    ok,
    reason: ok ? 'centered_within_tolerance' : 'outside_tolerance',
    host,
    message: msg,
    hostCenter: hc,
    messageCenter: mc,
    deltaCenterXFrac,
    deltaCenterYFrac,
    maxDxFrac: maxDx,
    maxDyFrac: maxDy,
  };
}

function walkNodes(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  const kids = node.children || node.child || node.nodes;
  if (Array.isArray(kids)) {
    for (const c of kids) walkNodes(c, visit);
  }
}

function findBoundsById(hierarchy, testId) {
  let found = null;
  const root = hierarchy && hierarchy.hierarchy ? hierarchy.hierarchy : hierarchy;
  walkNodes(root, n => {
    const id = n.attributes?.['resource-id'] || n['resource-id'] || n.id || n.testID;
    const rid = id != null ? String(id) : '';
    if (
      rid === testId ||
      rid.endsWith(':id/' + testId) ||
      rid.endsWith('/' + testId)
    ) {
      const b =
        n.attributes?.bounds ||
        n.bounds ||
        (n.attributes &&
          n.attributes.x != null && {
            x: n.attributes.x,
            y: n.attributes.y,
            width: n.attributes.width,
            height: n.attributes.height,
          });
      const parsed = parseBounds(b);
      if (parsed) found = parsed;
    }
  });
  return found;
}

function evaluateFromHierarchy(
  hierarchy,
  opts = {},
) {
  const hostId = opts.hostId || 'resources-tab';
  const messageId = opts.messageId || 'resources-tab-empty-message';
  const maxDx = opts.maxDxFrac != null ? opts.maxDxFrac : 0.08;
  const maxDy = opts.maxDyFrac != null ? opts.maxDyFrac : 0.08;
  const host = findBoundsById(hierarchy, hostId);
  const message = findBoundsById(hierarchy, messageId);
  return evaluateCentered(host, message, maxDx, maxDy);
}

module.exports = {
  parseBounds,
  centerOf,
  evaluateCentered,
  findBoundsById,
  evaluateFromHierarchy,
};
