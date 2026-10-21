// Zumpo design export: a read-only Figma development plugin.
//
// Walks the Zumpo file and streams files to ui.html, which zips them and hands
// the zip to the browser as a download. Nothing in this file assigns to a node
// property or calls a mutating API: the only document calls are reads,
// getStyledTextSegments and exportAsync. Keep it that way, because the point of
// the tool is that running it can never change the design.
//
// The sandbox is not a full modern engine, so this file sticks to ES2017:
// no optional chaining, no nullish coalescing, no object spread, no optional
// catch binding, no toSorted. .oxlintrc.json relaxes the two rules that would
// otherwise push it there.

const FORMAT_VERSION = 1;
const FILE_KEY_FALLBACK = 'pd5Hgp7zbT2cMqQNan35uY';

// Ids recorded when the flows were built; names are the fallback if a section
// was ever recreated.
const FLOW_SECTIONS = [
  { id: '9:14700', prefix: '00', dir: '00-guide' },
  { id: '9:431', prefix: '01', dir: '01-platform' },
  { id: '9:866', prefix: '02', dir: '02-draw-and-guess' },
  { id: '9:2526', prefix: '03', dir: '03-minesweeper' },
  { id: '9:10060', prefix: '04', dir: '04-mobile' },
  { id: '40:60741', prefix: '05', dir: '05-make-24' },
  { id: '40:60743', prefix: '06', dir: '06-pairs' },
  { id: '43:61070', prefix: '07', dir: '07-trios' },
  { id: '43:61071', prefix: '08', dir: '08-liars-dice' },
  { id: '43:61072', prefix: '09', dir: '09-hush' },
  { id: '43:61073', prefix: '10', dir: '10-daily-word' },
  { id: '162:86002', prefix: '11', dir: '11-snap' },
  { id: '162:65089', prefix: '12', dir: '12-doodle-chain' },
  { id: '162:65717', prefix: '13', dir: '13-code-breaker' },
  { id: '162:67746', prefix: '14', dir: '14-gomoku' },
];
const SHARED_SECTION = { id: '9:198', name: 'Shared pieces' };
const EXPECTED_FLOWS = 250;
const EXPECTED_FAMILIES = 77;

const FLOW_CODE = /^([A-Z]{1,2}\d{2})\b/;
const PATH_TYPES = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE'];
const SHAPE_TYPES = PATH_TYPES.concat(['ELLIPSE', 'RECTANGLE']);
const GRID_MIN_CELLS = 9;
const SAMPLE_LIMIT = 6;

// Override fields that are bookkeeping rather than design.
const IGNORED_OVERRIDE_FIELDS = [
  'name',
  'pluginData',
  'sharedPluginData',
  'exportSettings',
  'locked',
  'relativeTransform',
  'x',
  'y',
  'boundVariables',
];

const FLOW_MODE = { collapse: true };
const DETAIL_MODE = { collapse: false };

// ---------------------------------------------------------------- helpers

function round(value, places) {
  const f = Math.pow(10, places === undefined ? 2 : places);
  return Math.round(value * f) / f;
}

function slug(text) {
  const s = String(text)
    .toLowerCase()
    .replace(/^zumpo\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'node';
}

function hex2(x) {
  return Math.round(Math.max(0, Math.min(1, x)) * 255)
    .toString(16)
    .padStart(2, '0');
}

function hex(color, alpha) {
  let s = '#' + hex2(color.r) + hex2(color.g) + hex2(color.b);
  const a = alpha !== undefined ? alpha : color.a;
  if (a !== undefined && a < 0.999) s += hex2(a);
  return s.toUpperCase();
}

function hash(data) {
  // FNV-1a over a string's code units or a byte array.
  let h = 0x811c9dc5;
  const isString = typeof data === 'string';
  for (let i = 0; i < data.length; i++) {
    h ^= isString ? data.charCodeAt(i) : data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function cleanPropName(key) {
  return String(key).split('#')[0];
}

function isMixed(value) {
  return value === figma.mixed;
}

function hasVisiblePaint(paints) {
  if (!paints || isMixed(paints)) return Boolean(paints);
  return paints.some((p) => p.visible !== false);
}

function lineHeight(lh) {
  if (!lh || isMixed(lh)) return undefined;
  if (lh.unit === 'AUTO') return 'auto';
  return round(lh.value) + (lh.unit === 'PIXELS' ? 'px' : '%');
}

function letterSpacing(ls) {
  if (!ls || isMixed(ls) || ls.value === 0) return undefined;
  return round(ls.value, 3) + (ls.unit === 'PIXELS' ? 'px' : '%');
}

function fontLabel(fontName) {
  if (!fontName || isMixed(fontName)) return undefined;
  return fontName.family + ' ' + fontName.style;
}

function compressBox(values) {
  const [t, r, b, l] = values;
  if (t === r && r === b && b === l) return t === 0 ? undefined : t;
  if (t === b && r === l) return [t, r];
  return values;
}

// The signature used to compare repeated cells: everything except identity
// and position, at every depth.
function signature(obj) {
  return JSON.stringify(obj, (key, value) =>
    key === 'id' || key === 'x' || key === 'y' || key === 'name'
      ? undefined
      : value,
  );
}

function valueSignature(value) {
  return value === undefined ? 'undefined' : signature(value);
}

function diffFrom(template, obj) {
  const out = {};
  const keys = new Set(Object.keys(template).concat(Object.keys(obj)));
  for (const key of keys) {
    if (key === 'id' || key === 'x' || key === 'y' || key === 'name') continue;
    if (valueSignature(template[key]) !== valueSignature(obj[key])) {
      out[key] = obj[key] === undefined ? null : obj[key];
    }
  }
  if (obj.name !== undefined && obj.name !== template.name) out.name = obj.name;
  return out;
}

function withoutKeys(obj, keys) {
  const out = {};
  for (const key of Object.keys(obj)) {
    if (keys.indexOf(key) === -1) out[key] = obj[key];
  }
  return out;
}

function sortedUnique(values) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

// A row frame holding nothing but a one-row grid of cells.
function isGridRow(o) {
  return Boolean(
    o.children &&
    o.children.length === 1 &&
    o.children[0].type === 'GRID' &&
    o.children[0].rows === 1,
  );
}

function post(message) {
  figma.ui.postMessage(message);
}

// --------------------------------------------------------------- exporter

class Exporter {
  constructor(options) {
    this.options = options;
    this.varRefs = new Map();
    this.collections = new Map();
    this.styleNames = new Map();
    this.nodeNames = new Map();
    this.mains = new Map();
    this.svgs = new Map();
    this.svgFiles = new Set();
    this.sharedFamilyIds = new Set();
    this.foreignFamilies = new Map();
    this.path = [];
    this.fileCount = 0;
    this.warnings = [];
    this.stats = { nodes: 0, instances: 0, grids: 0, gridCells: 0 };
    this.audit = {
      unboundColors: {},
      unboundSpacing: {},
      unboundRadii: {},
      unstyledText: {},
      rasterFills: {},
      foreignComponents: {},
      missingComponents: {},
      hiddenLayers: {},
      svgExportErrors: {},
    };
  }

  send(path, data) {
    post({ type: 'file', path, data });
    this.fileCount++;
  }

  sendJson(path, value) {
    this.send(path, JSON.stringify(value, null, 2) + '\n');
  }

  progress(text) {
    post({ type: 'progress', text });
  }

  warn(text) {
    this.warnings.push(text);
    post({ type: 'warning', text });
  }

  note(kind, key) {
    const bucket = this.audit[kind];
    const k = String(key);
    if (!bucket[k]) bucket[k] = { count: 0, samples: [] };
    bucket[k].count++;
    if (bucket[k].samples.length < SAMPLE_LIMIT) {
      bucket[k].samples.push(this.path.join(' > '));
    }
  }

  // A size typed into Figma rather than bound to a variable reaches the code
  // as a raw number, where the design system allows only tokens. Keyed by the
  // number, so the audit says which variables are missing.
  noteUnbound(kind, values) {
    for (const value of values) {
      if (typeof value === 'number' && value !== 0) this.note(kind, value);
    }
  }

  // ---------------------------------------------------- lookups (cached)

  async collection(id) {
    if (!this.collections.has(id)) {
      let c = null;
      try {
        c = await figma.variables.getVariableCollectionByIdAsync(id);
      } catch (e) {
        c = null;
      }
      this.collections.set(id, c);
    }
    return this.collections.get(id);
  }

  async varRef(id) {
    if (this.varRefs.has(id)) return this.varRefs.get(id);
    let ref = '$?:' + id;
    try {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) {
        const c = await this.collection(v.variableCollectionId);
        ref = '$' + (c ? c.name : '?') + ':' + v.name;
      }
    } catch (e) {
      // Keep the unresolved id; the audit shows where it came from.
    }
    this.varRefs.set(id, ref);
    return ref;
  }

  async bound(node, prop) {
    const all = node.boundVariables;
    if (!all) return null;
    let alias = all[prop];
    if (Array.isArray(alias)) alias = alias[0];
    return alias && alias.id ? this.varRef(alias.id) : null;
  }

  async num(node, prop) {
    const ref = await this.bound(node, prop);
    if (ref) return ref;
    const value = node[prop];
    return typeof value === 'number' ? round(value) : value;
  }

  async styleName(id) {
    if (!id || isMixed(id)) return undefined;
    if (!this.styleNames.has(id)) {
      let name = '?' + id;
      try {
        const style = await figma.getStyleByIdAsync(id);
        if (style) name = style.name;
      } catch (e) {
        // Fall through with the id.
      }
      this.styleNames.set(id, name);
    }
    return this.styleNames.get(id);
  }

  async nodeName(id) {
    if (!id) return undefined;
    if (!this.nodeNames.has(id)) {
      const node = await figma.getNodeByIdAsync(id);
      this.nodeNames.set(id, node ? node.name : '(missing)');
    }
    return this.nodeNames.get(id);
  }

  async mainOf(instance) {
    if (!this.mains.has(instance.id)) {
      let main = null;
      try {
        main = await instance.getMainComponentAsync();
      } catch (e) {
        main = null;
      }
      this.mains.set(instance.id, main);
    }
    return this.mains.get(instance.id);
  }

  async componentLabel(id) {
    if (!id) return undefined;
    const node = await figma.getNodeByIdAsync(id);
    if (!node) return '(missing ' + id + ')';
    if (node.parent && node.parent.type === 'COMPONENT_SET') {
      return node.parent.name + ' / ' + node.name;
    }
    return node.name;
  }

  // ------------------------------------------------------------- paints

  async paint(p) {
    let out;
    if (p.type === 'SOLID') {
      const alias = p.boundVariables && p.boundVariables.color;
      if (alias) {
        out = await this.varRef(alias.id);
      } else {
        out = hex(p.color);
        if (p.visible !== false) this.note('unboundColors', out);
      }
      if (p.opacity !== undefined && p.opacity < 0.999) {
        out += ' @' + round(p.opacity, 3);
      }
    } else if (p.type.indexOf('GRADIENT_') === 0) {
      const stops = [];
      for (const s of p.gradientStops) {
        const alias = s.boundVariables && s.boundVariables.color;
        stops.push([
          round(s.position, 3),
          alias ? await this.varRef(alias.id) : hex(s.color),
        ]);
      }
      out = {
        gradient: p.type.slice('GRADIENT_'.length).toLowerCase(),
        stops,
        transform: p.gradientTransform.map((row) =>
          row.map((v) => round(v, 3)),
        ),
      };
      if (p.opacity !== undefined && p.opacity < 0.999) {
        out.opacity = round(p.opacity, 3);
      }
    } else if (p.type === 'IMAGE' || p.type === 'VIDEO') {
      out = { media: p.type.toLowerCase(), scale: p.scaleMode };
      if (p.imageHash) out.imageHash = p.imageHash;
      if (p.visible !== false) this.note('rasterFills', p.type);
    } else {
      out = { type: p.type };
    }
    if (p.blendMode && p.blendMode !== 'NORMAL') {
      out =
        typeof out === 'string'
          ? out + ' blend:' + p.blendMode
          : Object.assign({ blend: p.blendMode }, out);
    }
    if (p.visible === false) {
      out =
        typeof out === 'string'
          ? 'hidden ' + out
          : Object.assign({ hidden: true }, out);
    }
    return out;
  }

  async paints(list) {
    if (isMixed(list)) return 'mixed';
    if (!list || !list.length) return undefined;
    const out = [];
    for (const p of list) out.push(await this.paint(p));
    return out;
  }

  async effects(list) {
    if (!list || !list.length) return undefined;
    const out = [];
    for (const e of list) {
      const o = { type: e.type.toLowerCase() };
      if (e.visible === false) o.hidden = true;
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        const alias = e.boundVariables && e.boundVariables.color;
        o.color = alias ? await this.varRef(alias.id) : hex(e.color);
        o.offset = [round(e.offset.x), round(e.offset.y)];
        o.radius = round(e.radius);
        if (e.spread) o.spread = round(e.spread);
        if (e.blendMode && e.blendMode !== 'NORMAL') o.blend = e.blendMode;
      } else if (e.radius !== undefined) {
        o.radius = round(e.radius);
      }
      out.push(o);
    }
    return out;
  }

  async reactions(node) {
    if (!('reactions' in node) || !node.reactions || !node.reactions.length) {
      return undefined;
    }
    const out = [];
    for (const r of node.reactions) {
      const o = { on: r.trigger ? r.trigger.type.toLowerCase() : 'none' };
      if (r.trigger && r.trigger.delay) o.delay = r.trigger.delay;
      const actions = r.actions || (r.action ? [r.action] : []);
      o.do = [];
      for (const a of actions) {
        if (!a) continue;
        if (a.type === 'NODE') {
          const step = { nav: String(a.navigation).toLowerCase() };
          if (a.destinationId) {
            step.to = a.destinationId;
            step.toName = await this.nodeName(a.destinationId);
          }
          if (a.transition) step.transition = a.transition.type.toLowerCase();
          o.do.push(step);
        } else if (a.type === 'URL') {
          o.do.push({ url: a.url });
        } else {
          o.do.push(a.type.toLowerCase());
        }
      }
      out.push(o);
    }
    return out;
  }

  // ------------------------------------------------------------ text

  async typography(node, o) {
    const mixed =
      isMixed(node.textStyleId) ||
      isMixed(node.fontName) ||
      isMixed(node.fontSize) ||
      isMixed(node.fills);
    if (mixed) {
      o.segments = await this.segments(node);
      return;
    }
    if (node.textStyleId) {
      o.textStyle = await this.styleName(node.textStyleId);
    } else {
      this.note('unstyledText', fontLabel(node.fontName) + ' ' + node.fontSize);
      o.font = fontLabel(node.fontName);
      o.size = await this.num(node, 'fontSize');
      const lh = lineHeight(node.lineHeight);
      if (lh && lh !== 'auto') o.lineHeight = lh;
      const ls = letterSpacing(node.letterSpacing);
      if (ls) o.letterSpacing = ls;
    }
    const fills = await this.paints(node.fills);
    if (fills) o.fills = fills;
    if (node.fillStyleId && !isMixed(node.fillStyleId)) {
      o.fillStyle = await this.styleName(node.fillStyleId);
    }
  }

  async segments(node) {
    const out = [];
    const fields = [
      'fontName',
      'fontSize',
      'textStyleId',
      'fills',
      'lineHeight',
      'letterSpacing',
      'textDecoration',
      'textCase',
    ];
    for (const seg of node.getStyledTextSegments(fields)) {
      const s = { text: seg.characters };
      if (seg.textStyleId) {
        s.textStyle = await this.styleName(seg.textStyleId);
      } else {
        this.note('unstyledText', fontLabel(seg.fontName) + ' ' + seg.fontSize);
        s.font = fontLabel(seg.fontName);
        s.size = round(seg.fontSize);
        const lh = lineHeight(seg.lineHeight);
        if (lh && lh !== 'auto') s.lineHeight = lh;
        const ls = letterSpacing(seg.letterSpacing);
        if (ls) s.letterSpacing = ls;
      }
      const fills = await this.paints(seg.fills);
      if (fills) s.fills = fills;
      if (seg.textDecoration && seg.textDecoration !== 'NONE') {
        s.decoration = seg.textDecoration.toLowerCase();
      }
      if (seg.textCase && seg.textCase !== 'ORIGINAL') {
        s.case = seg.textCase.toLowerCase();
      }
      out.push(s);
    }
    return out;
  }

  textProps(node, o) {
    const set = (key, value, fallback) => {
      if (typeof value === 'string' && value !== fallback)
        o[key] = value.toLowerCase();
    };
    set('alignH', node.textAlignHorizontal, 'LEFT');
    set('alignV', node.textAlignVertical, 'TOP');
    set('autoResize', node.textAutoResize, 'WIDTH_AND_HEIGHT');
    set('case', node.textCase, 'ORIGINAL');
    set('decoration', node.textDecoration, 'NONE');
    if (node.textTruncation && node.textTruncation !== 'DISABLED') {
      o.truncate = node.maxLines ? { maxLines: node.maxLines } : true;
    }
    if (node.paragraphSpacing)
      o.paragraphSpacing = round(node.paragraphSpacing);
  }

  // ------------------------------------------------------- frame props

  async geometry(node, parent, o) {
    const parentAuto =
      parent && 'layoutMode' in parent && parent.layoutMode !== 'NONE';
    const absolute =
      'layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE';
    if (!parentAuto || absolute) {
      o.x = round(node.x);
      o.y = round(node.y);
    }
    if (absolute) o.absolute = true;
    o.w = await this.num(node, 'width');
    o.h = await this.num(node, 'height');
    if (node.rotation) o.rotation = round(node.rotation);

    for (const [key, prop] of [
      ['wSize', 'layoutSizingHorizontal'],
      ['hSize', 'layoutSizingVertical'],
    ]) {
      if (!(prop in node)) continue;
      try {
        const v = node[prop];
        if (v && v !== 'FIXED') o[key] = v.toLowerCase();
      } catch (e) {
        // Not applicable to this node.
      }
    }
    for (const prop of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) {
      if (prop in node && node[prop] !== null && node[prop] !== undefined) {
        o[prop] = await this.num(node, prop);
      }
    }
    if (
      !parentAuto &&
      parent &&
      (parent.type === 'FRAME' || parent.type === 'COMPONENT') &&
      'constraints' in node
    ) {
      const c = node.constraints;
      if (c.horizontal !== 'MIN' || c.vertical !== 'MIN') {
        o.constraints = [c.horizontal.toLowerCase(), c.vertical.toLowerCase()];
      }
    }
  }

  async appearance(node, o) {
    if ('opacity' in node && node.opacity < 0.999) {
      o.opacity = await this.num(node, 'opacity');
    }
    if (
      'blendMode' in node &&
      node.blendMode !== 'PASS_THROUGH' &&
      node.blendMode !== 'NORMAL'
    ) {
      o.blend = node.blendMode;
    }
    if (node.isMask) o.mask = true;

    if (node.type !== 'TEXT' && 'fills' in node) {
      const fills = await this.paints(node.fills);
      if (fills) o.fills = fills;
      if (node.fillStyleId && !isMixed(node.fillStyleId)) {
        o.fillStyle = await this.styleName(node.fillStyleId);
      }
    }
    if ('strokes' in node && node.strokes && node.strokes.length) {
      o.strokes = await this.paints(node.strokes);
      if (node.strokeStyleId) {
        o.strokeStyle = await this.styleName(node.strokeStyleId);
      }
      if (isMixed(node.strokeWeight)) {
        o.strokeWeight = [
          await this.num(node, 'strokeTopWeight'),
          await this.num(node, 'strokeRightWeight'),
          await this.num(node, 'strokeBottomWeight'),
          await this.num(node, 'strokeLeftWeight'),
        ];
      } else if (node.strokeWeight !== 1) {
        o.strokeWeight = await this.num(node, 'strokeWeight');
      }
      o.strokeAlign = String(node.strokeAlign).toLowerCase();
      if (node.dashPattern && node.dashPattern.length) {
        o.dash = node.dashPattern.map((v) => round(v));
      }
    }
    if ('cornerRadius' in node) {
      if (isMixed(node.cornerRadius)) {
        o.radius = [
          await this.num(node, 'topLeftRadius'),
          await this.num(node, 'topRightRadius'),
          await this.num(node, 'bottomRightRadius'),
          await this.num(node, 'bottomLeftRadius'),
        ];
      } else if (node.cornerRadius) {
        o.radius =
          (await this.bound(node, 'topLeftRadius')) || round(node.cornerRadius);
      }
      this.noteUnbound(
        'unboundRadii',
        [].concat(o.radius === undefined ? [] : o.radius),
      );
      if (node.cornerSmoothing) o.smoothing = round(node.cornerSmoothing);
    }
    // A ring or a half circle is an ellipse with arc data; without it, either
    // reads as a plain disc.
    if (node.type === 'ELLIPSE' && node.arcData) {
      const { startingAngle, endingAngle, innerRadius } = node.arcData;
      const whole = Math.abs(endingAngle - startingAngle - 2 * Math.PI) < 1e-6;
      if (!whole || innerRadius) {
        const degrees = (radians) => round((radians * 180) / Math.PI, 1);
        o.arc = {
          start: degrees(startingAngle),
          end: degrees(endingAngle),
          inner: round(innerRadius, 3),
        };
      }
    }
    if ('effects' in node) {
      const effects = await this.effects(node.effects);
      if (effects) o.effects = effects;
      if (node.effectStyleId) {
        o.effectStyle = await this.styleName(node.effectStyleId);
      }
    }
    if ('clipsContent' in node && node.clipsContent) o.clip = true;
  }

  async layout(node, o) {
    if (!('layoutMode' in node) || node.layoutMode === 'NONE') return;
    const modes = { HORIZONTAL: 'row', VERTICAL: 'column', GRID: 'grid' };
    const l = { mode: modes[node.layoutMode] || node.layoutMode.toLowerCase() };
    const gap = await this.num(node, 'itemSpacing');
    if (gap !== 0) l.gap = gap;
    if (node.layoutWrap === 'WRAP') {
      l.wrap = true;
      if (node.counterAxisSpacing !== null) {
        l.crossGap = await this.num(node, 'counterAxisSpacing');
      }
      if (
        node.counterAxisAlignContent &&
        node.counterAxisAlignContent !== 'AUTO'
      ) {
        l.alignContent = node.counterAxisAlignContent.toLowerCase();
      }
    }
    const pad = compressBox([
      await this.num(node, 'paddingTop'),
      await this.num(node, 'paddingRight'),
      await this.num(node, 'paddingBottom'),
      await this.num(node, 'paddingLeft'),
    ]);
    if (pad !== undefined) l.pad = pad;
    // Space-between ignores the gap, so a number left in it means nothing.
    const spaced = node.primaryAxisAlignItems === 'SPACE_BETWEEN';
    this.noteUnbound(
      'unboundSpacing',
      [spaced ? 0 : l.gap, l.crossGap].concat(pad === undefined ? [] : pad),
    );
    if (node.primaryAxisAlignItems && node.primaryAxisAlignItems !== 'MIN') {
      l.justify = node.primaryAxisAlignItems.toLowerCase();
    }
    if (node.counterAxisAlignItems && node.counterAxisAlignItems !== 'MIN') {
      l.align = node.counterAxisAlignItems.toLowerCase();
    }
    if (node.layoutMode === 'GRID') {
      l.rows = node.gridRowCount;
      l.columns = node.gridColumnCount;
      if (node.gridRowGap) l.rowGap = await this.num(node, 'gridRowGap');
      if (node.gridColumnGap)
        l.columnGap = await this.num(node, 'gridColumnGap');
      this.noteUnbound('unboundSpacing', [l.rowGap, l.columnGap]);
    }
    if (node.strokesIncludedInLayout) l.strokesIncluded = true;
    if (node.itemReverseZIndex) l.reverseZ = true;
    o.layout = l;
  }

  // ----------------------------------------------------------- graphics

  isPlainContainer(node) {
    return (
      (!('layoutMode' in node) || node.layoutMode === 'NONE') &&
      !hasVisiblePaint(node.fills) &&
      !hasVisiblePaint(node.strokes)
    );
  }

  // A graphic is anything drawn with paths: a lone vector, or a group (or a
  // plain, unstyled frame) holding nothing but shapes and at least one path.
  isGraphic(node) {
    if (PATH_TYPES.indexOf(node.type) !== -1) return true;
    const container =
      node.type === 'GROUP' ||
      (node.type === 'FRAME' && this.isPlainContainer(node));
    if (!container || !node.children || !node.children.length) return false;
    let hasPath = false;
    const stack = node.children.slice();
    while (stack.length) {
      const d = stack.pop();
      if (PATH_TYPES.indexOf(d.type) !== -1) {
        hasPath = true;
      } else if (SHAPE_TYPES.indexOf(d.type) !== -1) {
        // A plain shape inside a drawing is part of the drawing.
      } else if (
        d.type === 'GROUP' ||
        (d.type === 'FRAME' && this.isPlainContainer(d))
      ) {
        for (const c of d.children) stack.push(c);
      } else {
        return false;
      }
    }
    return hasPath;
  }

  async svg(node) {
    let data;
    try {
      data = await node.exportAsync({
        format: 'SVG_STRING',
        svgIdAttribute: false,
        svgOutlineText: true,
        svgSimplifyStroke: true,
      });
    } catch (e) {
      try {
        data = await node.exportAsync({
          format: 'SVG',
          svgIdAttribute: false,
          svgOutlineText: true,
          svgSimplifyStroke: true,
        });
      } catch (err) {
        this.note(
          'svgExportErrors',
          String(err && err.message ? err.message : err),
        );
        return null;
      }
    }
    // Figma's SVG export drifts in the fifth decimal from one session to the
    // next (4.00001 for 4); three places keep an unchanged drawing unchanged.
    if (typeof data === 'string') {
      data = data.replace(/-?\d*\.\d+/g, (n) => String(round(Number(n), 3)));
    }
    const key = hash(data);
    let entry = this.svgs.get(key);
    if (!entry) {
      let file = 'svg/' + slug(node.name) + '-' + key.slice(0, 6) + '.svg';
      while (this.svgFiles.has(file)) file = file.replace('.svg', '-x.svg');
      this.svgFiles.add(file);
      entry = {
        file,
        name: node.name,
        w: round(node.width),
        h: round(node.height),
        uses: 0,
        samples: [],
      };
      this.svgs.set(key, entry);
      this.send(file, data);
    }
    entry.uses++;
    if (entry.samples.length < SAMPLE_LIMIT) {
      entry.samples.push(this.path.join(' > '));
    }
    return entry.file;
  }

  // ---------------------------------------------------------- instances

  async instance(node, o) {
    this.stats.instances++;
    const main = await this.mainOf(node);
    if (!main) {
      o.component = '(missing)';
      this.note('missingComponents', node.name);
      return;
    }
    const set =
      main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
    const family = set || main;
    o.component = family.name;
    if (set && node.variantProperties) {
      o.variant = Object.assign({}, node.variantProperties);
    }
    o.componentId = main.id;
    if (main.remote) o.remote = true;
    if (!this.sharedFamilyIds.has(family.id)) {
      this.note('foreignComponents', family.name);
      if (!main.remote) this.foreignFamilies.set(family.id, family);
    }

    let defs = {};
    try {
      defs = family.componentPropertyDefinitions || {};
    } catch (e) {
      defs = {};
    }
    const props = {};
    const setProps = new Set();
    const entries = Object.entries(node.componentProperties || {});
    for (const [key, p] of entries) {
      if (p.type === 'VARIANT') continue;
      const def = defs[key];
      let value = p.value;
      let fallback = def ? def.defaultValue : undefined;
      if (p.type === 'INSTANCE_SWAP') {
        value = await this.componentLabel(value);
        fallback = await this.componentLabel(fallback);
      }
      if (value !== fallback) {
        props[cleanPropName(key)] = value;
        setProps.add(key);
      }
    }
    if (Object.keys(props).length) o.props = props;

    const overrides = [];
    for (const ov of node.overrides || []) {
      const fields = ov.overriddenFields.filter(
        (f) => IGNORED_OVERRIDE_FIELDS.indexOf(f) === -1,
      );
      if (!fields.length) continue;
      const target =
        ov.id === node.id ? node : await figma.getNodeByIdAsync(ov.id);
      if (!target) continue;
      const refs = target.componentPropertyReferences || {};
      const entry = {};
      for (const field of fields) {
        const refField = field === 'text' ? 'characters' : field;
        // Text and visibility driven by a component property are already
        // recorded under props.
        if (refs[refField] && entries.some((e) => e[0] === refs[refField])) {
          continue;
        }
        const value = await this.fieldValue(target, field);
        if (value !== undefined) entry[refField] = value;
      }
      if (!Object.keys(entry).length) continue;
      overrides.push(
        Object.assign(
          { path: ov.id === node.id ? '.' : this.relPath(node, target) },
          entry,
        ),
      );
    }
    if (overrides.length) o.overrides = overrides;
  }

  // A slot's content belongs to the instance, not to its component, so it is
  // written in full under the slot's property. Slots inside a nested
  // instance hold that instance's own content and are left to it.
  //
  // An instance that itself sits in another instance's slot can report
  // sublayer ids that the Plugin API then cannot find (a Figma bug), so an
  // instance without slot properties is not searched at all.
  async slots(node, o, mode) {
    const props = node.componentProperties || {};
    if (!Object.keys(props).some((key) => props[key].type === 'SLOT')) return;
    const found = [];
    try {
      const stack = node.children ? node.children.slice() : [];
      while (stack.length) {
        const d = stack.shift();
        if (d.type === 'SLOT') found.push(d);
        else if (d.type !== 'INSTANCE' && d.children) stack.push(...d.children);
      }
    } catch (e) {
      this.warn('Unreadable sublayers in ' + this.path.join(' / '));
      return;
    }
    const slots = {};
    for (const d of found) {
      const refs = d.componentPropertyReferences || {};
      const key = cleanPropName(refs.slotContentId || d.name);
      const nodes = d.children.slice();
      const objs = [];
      for (const child of nodes)
        objs.push(await this.serialize(child, d, mode));
      slots[key] = mode.collapse ? this.collapse(nodes, objs) : objs;
    }
    if (Object.keys(slots).length) o.slots = slots;
  }

  relPath(root, target) {
    const names = [];
    let n = target;
    while (n && n.id !== root.id) {
      names.unshift(n.name);
      n = n.parent;
    }
    return names.join(' / ');
  }

  async fieldValue(node, field) {
    try {
      switch (field) {
        case 'characters':
        case 'text':
          return node.characters;
        case 'fills':
        case 'strokes':
          return (await this.paints(node[field])) || [];
        case 'effects':
          return (await this.effects(node.effects)) || [];
        case 'textStyleId':
        case 'fillStyleId':
        case 'strokeStyleId':
        case 'effectStyleId':
          return (await this.styleName(node[field])) || null;
        case 'fontName':
          return isMixed(node.fontName) ? 'mixed' : fontLabel(node.fontName);
        case 'lineHeight':
          return lineHeight(node.lineHeight);
        case 'letterSpacing':
          return letterSpacing(node.letterSpacing) || 0;
        case 'reactions':
          return (await this.reactions(node)) || [];
        case 'mainComponent': {
          const main = await this.mainOf(node);
          return main ? await this.componentLabel(main.id) : '(missing)';
        }
        case 'componentProperties': {
          const out = {};
          const values = node.componentProperties || {};
          for (const key of Object.keys(values)) {
            out[cleanPropName(key)] = values[key].value;
          }
          return out;
        }
        default: {
          if (!(field in node)) return undefined;
          const value = node[field];
          if (isMixed(value)) return 'mixed';
          if (typeof value === 'number') return this.num(node, field);
          if (
            typeof value === 'string' ||
            typeof value === 'boolean' ||
            value === null
          ) {
            return value;
          }
          return 'changed';
        }
      }
    } catch (e) {
      return 'unreadable';
    }
  }

  // ---------------------------------------------------------- serialize

  async serialize(node, parent, mode) {
    this.stats.nodes++;
    this.path.push(node.name);
    try {
      return await this.serializeNode(node, parent, mode);
    } finally {
      this.path.pop();
    }
  }

  async serializeNode(node, parent, mode) {
    const o = { type: node.type, id: node.id };
    if (!(node.type === 'TEXT' && node.name === node.characters)) {
      o.name = node.name;
    }
    if (node.visible === false) {
      o.visible = false;
      this.note('hiddenLayers', node.type);
    }
    await this.geometry(node, parent, o);

    const refs = node.componentPropertyReferences;
    if (refs && Object.keys(refs).length) {
      o.propRefs = {};
      for (const key of Object.keys(refs)) {
        o.propRefs[key] = cleanPropName(refs[key]);
      }
    }

    if (node.type === 'INSTANCE') {
      await this.instance(node, o);
      await this.slots(node, o, mode);
    } else if (this.isGraphic(node)) {
      if ('opacity' in node && node.opacity < 0.999) {
        o.opacity = round(node.opacity, 3);
      }
      const file = await this.svg(node);
      if (file) {
        o.svg = file;
      } else {
        await this.appearance(node, o);
      }
    } else {
      await this.appearance(node, o);
      await this.layout(node, o);
      if (node.type === 'TEXT') {
        o.text = node.characters;
        await this.typography(node, o);
        this.textProps(node, o);
      }
      if ('children' in node && node.children.length) {
        const nodes = [];
        const objs = [];
        for (const child of node.children) {
          nodes.push(child);
          objs.push(await this.serialize(child, node, mode));
        }
        o.children = mode.collapse ? this.collapse(nodes, objs) : objs;
      }
    }

    const reactions = await this.reactions(node);
    if (reactions) o.reactions = reactions;
    return o;
  }

  // --------------------------------------------------- grid collapsing

  collapse(nodes, objs) {
    const merged = this.mergeRows(nodes, objs);
    return this.collapseGrid(merged.nodes, merged.objs);
  }

  kindOf(o) {
    if (o.type === 'INSTANCE') return 'I:' + o.component;
    if (o.type === 'GRID') return 'G:' + o.kind;
    return o.type + ':' + o.w + 'x' + o.h;
  }

  // Many children of one kind (one component, or one size of frame) become a
  // grid: its size, the cell most of them look like, and the cells that differ.
  collapseGrid(nodes, objs) {
    if (objs.length < GRID_MIN_CELLS) return objs;
    const counts = new Map();
    for (const o of objs) {
      const k = this.kindOf(o);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let kind = null;
    let count = 0;
    for (const [k, c] of counts) {
      if (c > count) {
        kind = k;
        count = c;
      }
    }
    if (count < GRID_MIN_CELLS || count < objs.length * 0.7) return objs;

    const cells = [];
    objs.forEach((o, i) => {
      if (this.kindOf(o) === kind) cells.push(i);
    });
    const sigs = cells.map((i) => signature(objs[i]));
    const sigCounts = new Map();
    for (const s of sigs) sigCounts.set(s, (sigCounts.get(s) || 0) + 1);
    let templateSig = null;
    let templateCount = 0;
    for (const [s, c] of sigCounts) {
      if (c > templateCount) {
        templateSig = s;
        templateCount = c;
      }
    }
    if (templateCount < cells.length * 0.4) return objs;

    const xs = sortedUnique(cells.map((i) => Math.round(nodes[i].x)));
    const ys = sortedUnique(cells.map((i) => Math.round(nodes[i].y)));
    const template = objs[cells[sigs.indexOf(templateSig)]];
    const grid = {
      type: 'GRID',
      rows: ys.length,
      cols: xs.length,
      count: cells.length,
      kind: kind.replace(/^I:/, ''),
      firstId: objs[cells[0]].id,
    };
    if (xs.length > 1 || ys.length > 1) {
      grid.pitch = [
        xs.length > 1 ? xs[1] - xs[0] : 0,
        ys.length > 1 ? ys[1] - ys[0] : 0,
      ];
    }
    if (grid.rows * grid.cols !== grid.count) {
      grid.holes = grid.rows * grid.cols - grid.count;
    }
    grid.cell = withoutKeys(template, ['id', 'x', 'y']);
    grid.special = [];
    cells.forEach((i, n) => {
      if (sigs[n] === templateSig) return;
      grid.special.push(
        Object.assign(
          {
            r: ys.indexOf(Math.round(nodes[i].y)),
            c: xs.indexOf(Math.round(nodes[i].x)),
            id: objs[i].id,
          },
          diffFrom(template, objs[i]),
        ),
      );
    });
    this.stats.grids++;
    this.stats.gridCells += cells.length;

    const out = [];
    let placed = false;
    const cellSet = new Set(cells);
    objs.forEach((o, i) => {
      if (!cellSet.has(i)) {
        out.push(o);
      } else if (!placed) {
        out.push(grid);
        placed = true;
      }
    });
    return out;
  }

  // A board drawn as row frames, each a one-row grid of the same cell, becomes
  // one two-dimensional grid.
  mergeRows(nodes, objs) {
    const groups = new Map();
    objs.forEach((o, i) => {
      if (!isGridRow(o)) return;
      const g = o.children[0];
      const key = g.kind + '|' + g.cols + '|' + signature(g.cell);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    let rows = null;
    for (const list of groups.values()) {
      if (list.length >= 2 && (!rows || list.length > rows.length)) rows = list;
    }
    if (!rows) return { nodes, objs };
    rows.sort((a, b) => nodes[a].y - nodes[b].y);

    const first = objs[rows[0]];
    const g0 = first.children[0];
    const grid = {
      type: 'GRID',
      rows: rows.length,
      cols: g0.cols,
      count: 0,
      kind: g0.kind,
      firstId: g0.firstId,
      rowFrame: withoutKeys(first, ['id', 'x', 'y', 'children']),
    };
    grid.pitch = [
      g0.pitch ? g0.pitch[0] : 0,
      rows.length > 1 ? Math.round(nodes[rows[1]].y - nodes[rows[0]].y) : 0,
    ];
    grid.cell = g0.cell;
    grid.special = [];
    rows.forEach((i, r) => {
      const g = objs[i].children[0];
      grid.count += g.count;
      for (const s of g.special) {
        grid.special.push(Object.assign({ r }, withoutKeys(s, ['r'])));
      }
    });
    if (grid.rows * grid.cols !== grid.count) {
      grid.holes = grid.rows * grid.cols - grid.count;
    }
    this.stats.grids -= rows.length - 1;

    const rowSet = new Set(rows);
    const outNodes = [];
    const outObjs = [];
    objs.forEach((o, i) => {
      if (!rowSet.has(i)) {
        outNodes.push(nodes[i]);
        outObjs.push(o);
      } else if (i === rows[0]) {
        outNodes.push(nodes[i]);
        outObjs.push(grid);
      }
    });
    return { nodes: outNodes, objs: outObjs };
  }

  // ------------------------------------------------------------- tokens

  async tokenValue(raw, type) {
    if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
      return this.varRef(raw.id);
    }
    if (type === 'COLOR') return hex(raw);
    if (type === 'FLOAT') return round(raw, 3);
    return raw;
  }

  async resolveAlias(raw, type, modeId) {
    let value = raw;
    let mode = modeId;
    for (let depth = 0; depth < 12; depth++) {
      if (!(
        value &&
        typeof value === 'object' &&
        value.type === 'VARIABLE_ALIAS'
      )) {
        return this.tokenValue(value, type);
      }
      const v = await figma.variables.getVariableByIdAsync(value.id);
      if (!v) return '(missing)';
      const c = await this.collection(v.variableCollectionId);
      if (!c) return '(missing)';
      if (!c.modes.some((m) => m.modeId === mode)) mode = c.defaultModeId;
      value = v.valuesByMode[mode];
    }
    return '(alias loop)';
  }

  async exportTokens() {
    this.progress('Reading variables and styles');
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const out = { collections: [] };
    for (const c of collections) {
      this.collections.set(c.id, c);
      const single = c.modes.length === 1;
      const entry = {
        name: c.name,
        id: c.id,
        modes: c.modes.map((m) => m.name),
        variables: [],
      };
      if (!single) {
        const def = c.modes.find((m) => m.modeId === c.defaultModeId);
        entry.defaultMode = def ? def.name : undefined;
      }
      for (const vid of c.variableIds) {
        const v = await figma.variables.getVariableByIdAsync(vid);
        if (!v) continue;
        const t = {
          name: v.name,
          type: v.resolvedType.toLowerCase(),
          id: v.id,
        };
        if (v.description) t.description = v.description;
        if (
          v.scopes &&
          !(v.scopes.length === 1 && v.scopes[0] === 'ALL_SCOPES')
        ) {
          t.scopes = v.scopes;
        }
        if (v.codeSyntax && Object.keys(v.codeSyntax).length) {
          t.codeSyntax = v.codeSyntax;
        }
        if (v.hiddenFromPublishing) t.hidden = true;
        const values = {};
        const resolved = {};
        let aliased = false;
        for (const m of c.modes) {
          const raw = v.valuesByMode[m.modeId];
          values[m.name] = await this.tokenValue(raw, v.resolvedType);
          if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
            aliased = true;
            resolved[m.name] = await this.resolveAlias(
              raw,
              v.resolvedType,
              m.modeId,
            );
          }
        }
        if (single) {
          t.value = values[c.modes[0].name];
          if (aliased) t.resolved = resolved[c.modes[0].name];
        } else {
          t.values = values;
          if (aliased) t.resolved = resolved;
        }
        entry.variables.push(t);
      }
      out.collections.push(entry);
    }
    this.sendJson('tokens/variables.json', out);

    const textStyles = [];
    for (const s of await figma.getLocalTextStylesAsync()) {
      const t = {
        name: s.name,
        id: s.id,
        font: fontLabel(s.fontName),
        family: s.fontName.family,
        style: s.fontName.style,
        size: round(s.fontSize),
        lineHeight: lineHeight(s.lineHeight),
      };
      const ls = letterSpacing(s.letterSpacing);
      if (ls) t.letterSpacing = ls;
      if (s.paragraphSpacing) t.paragraphSpacing = round(s.paragraphSpacing);
      if (s.textCase && s.textCase !== 'ORIGINAL')
        t.case = s.textCase.toLowerCase();
      if (s.textDecoration && s.textDecoration !== 'NONE') {
        t.decoration = s.textDecoration.toLowerCase();
      }
      if (s.description) t.description = s.description;
      const bound = {};
      for (const key of Object.keys(s.boundVariables || {})) {
        const alias = s.boundVariables[key];
        if (alias && alias.id) bound[key] = await this.varRef(alias.id);
      }
      if (Object.keys(bound).length) t.bound = bound;
      textStyles.push(t);
    }
    this.sendJson('tokens/text-styles.json', textStyles);

    const paintStyles = [];
    for (const s of await figma.getLocalPaintStylesAsync()) {
      paintStyles.push({
        name: s.name,
        id: s.id,
        paints: await this.paints(s.paints),
      });
    }
    if (paintStyles.length)
      this.sendJson('tokens/paint-styles.json', paintStyles);

    const effectStyles = [];
    for (const s of await figma.getLocalEffectStylesAsync()) {
      effectStyles.push({
        name: s.name,
        id: s.id,
        effects: await this.effects(s.effects),
      });
    }
    if (effectStyles.length)
      this.sendJson('tokens/effect-styles.json', effectStyles);

    return {
      collections: out.collections.map((c) => ({
        name: c.name,
        variables: c.variables.length,
        modes: c.modes,
      })),
      textStyles: textStyles.length,
      paintStyles: paintStyles.length,
      effectStyles: effectStyles.length,
    };
  }

  // --------------------------------------------------------- components

  async exportFamily(family, dir) {
    this.path = [family.name];
    let defs = {};
    try {
      defs = family.componentPropertyDefinitions || {};
    } catch (e) {
      defs = {};
    }
    const properties = {};
    for (const key of Object.keys(defs)) {
      const d = defs[key];
      const p = { type: d.type.toLowerCase() };
      p.default =
        d.type === 'INSTANCE_SWAP'
          ? await this.componentLabel(d.defaultValue)
          : d.defaultValue;
      if (d.variantOptions) p.options = d.variantOptions;
      if (d.preferredValues && d.preferredValues.length) {
        // Preferred swaps are referenced by published key, not node id.
        p.preferred = d.preferredValues.map(
          (pv) => pv.type.toLowerCase() + ':' + pv.key,
        );
      }
      properties[cleanPropName(key)] = p;
    }

    const out = {
      format: FORMAT_VERSION,
      name: family.name,
      id: family.id,
      type: family.type,
      key: family.key,
    };
    if (family.description) out.description = family.description;
    if (family.documentationLinks && family.documentationLinks.length) {
      out.links = family.documentationLinks.map((l) => l.uri);
    }
    if (Object.keys(properties).length) out.properties = properties;

    if (family.type === 'COMPONENT_SET') {
      if (family.defaultVariant)
        out.defaultVariant = family.defaultVariant.name;
      out.variants = [];
      for (const child of family.children) {
        if (child.type !== 'COMPONENT') continue;
        out.variants.push({
          name: child.name,
          id: child.id,
          props: Object.assign({}, child.variantProperties || {}),
          node: await this.serialize(child, family, DETAIL_MODE),
        });
      }
    } else {
      out.node = await this.serialize(family, family.parent, DETAIL_MODE);
    }

    const file = dir + '/' + slug(family.name) + '.json';
    this.sendJson(file, out);

    let preview;
    if (this.options.previews) {
      preview = 'previews/' + dir + '/' + slug(family.name) + '.png';
      try {
        const png = await family.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: 2 },
        });
        this.send(preview, png);
      } catch (e) {
        preview = undefined;
      }
    }
    return {
      name: family.name,
      id: family.id,
      file,
      preview,
      variants: out.variants ? out.variants.length : 1,
    };
  }

  findFamilies(root) {
    const families = [];
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (n.type === 'COMPONENT_SET' || n.type === 'COMPONENT') {
        families.push(n);
        continue;
      }
      if (n.type === 'INSTANCE') continue;
      if ('children' in n) for (const c of n.children) stack.push(c);
    }
    families.sort((a, b) => a.name.localeCompare(b.name));
    return families;
  }

  // -------------------------------------------------------------- flows

  async findSection(page, spec) {
    const byId = await figma.getNodeByIdAsync(spec.id);
    if (byId && byId.type === 'SECTION') return byId;
    const byName = page.children.find(
      (n) =>
        n.type === 'SECTION' &&
        (spec.name
          ? n.name === spec.name
          : n.name.indexOf(spec.prefix + ' /') === 0),
    );
    if (byName) {
      this.warn(
        'Section ' + spec.id + ' not found by id; using "' + byName.name + '"',
      );
    }
    return byName || null;
  }

  // Review notes are loose text above each screen. A note belongs to the
  // nearest screen it sits above and overlaps horizontally.
  assignNotes(section, frames, others) {
    const texts = [];
    for (const n of others) {
      if (n.type === 'TEXT' && n.characters === section.name) continue;
      if (n.type === 'TEXT') {
        texts.push(n);
      } else if ('findAll' in n) {
        for (const t of n.findAll((d) => d.type === 'TEXT')) texts.push(t);
      }
    }
    const byFrame = new Map();
    const loose = [];
    for (const t of texts) {
      const box = t.absoluteBoundingBox;
      if (!box) continue;
      let best = null;
      let bestGap = Infinity;
      for (const f of frames) {
        const fb = f.absoluteBoundingBox;
        const overlaps = box.x < fb.x + fb.width && box.x + box.width > fb.x;
        const gap = fb.y - (box.y + box.height);
        if (overlaps && gap >= -1 && gap < 400 && gap < bestGap) {
          best = f;
          bestGap = gap;
        }
      }
      if (best) {
        if (!byFrame.has(best.id)) byFrame.set(best.id, []);
        byFrame.get(best.id).push({ y: box.y, text: t.characters });
      } else {
        loose.push({ id: t.id, text: t.characters });
      }
    }
    for (const list of byFrame.values()) list.sort((a, b) => a.y - b.y);
    return { byFrame, loose };
  }

  async exportSection(section, spec) {
    const frames = [];
    const others = [];
    for (const n of section.children) {
      if (n.type === 'FRAME' || n.type === 'COMPONENT') frames.push(n);
      else others.push(n);
    }
    frames.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    const notes = this.assignNotes(section, frames, others);
    const flows = [];
    for (const frame of frames) {
      const match = frame.name.match(FLOW_CODE);
      const code = match ? match[1] : slug(frame.name);
      const title = match
        ? frame.name.slice(match[0].length).replace(/^\s*[/·:-]\s*/, '')
        : frame.name;
      this.progress('Flow ' + code + ' · ' + title);
      this.path = [code];
      const file = 'flows/' + spec.dir + '/' + code + '.json';
      const doc = {
        format: FORMAT_VERSION,
        code,
        title,
        id: frame.id,
        section: section.name,
      };
      const frameNotes = notes.byFrame.get(frame.id);
      if (frameNotes) doc.reviewNotes = frameNotes.map((n) => n.text);
      doc.frame = await this.serialize(frame, section, FLOW_MODE);
      this.sendJson(file, doc);

      let preview;
      if (this.options.previews) {
        preview = 'previews/' + spec.dir + '/' + code + '.png';
        try {
          const png = await frame.exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE', value: 1 },
          });
          this.send(preview, png);
        } catch (e) {
          preview = undefined;
          this.warn('PNG export failed for ' + code);
        }
      }
      flows.push({
        code,
        title,
        id: frame.id,
        size: [round(frame.width), round(frame.height)],
        file,
        preview,
        isFlow: Boolean(match),
      });
    }
    return {
      name: section.name,
      id: section.id,
      dir: spec.dir,
      flows,
      notes: notes.loose.map((n) => n.text),
    };
  }

  // ---------------------------------------------------------------- run

  async run() {
    const started = Date.now();
    const page =
      figma.root.children.find((p) => p.id === '0:1') || figma.currentPage;
    // The current page is always loaded; loading it again asks Figma's
    // servers, and that call hangs when the desktop app has lost them.
    if (page !== figma.currentPage) await page.loadAsync();

    const tokens = await this.exportTokens();

    this.progress('Reading Shared pieces');
    const shared = await this.findSection(page, SHARED_SECTION);
    const components = [];
    if (!shared) {
      this.warn('Shared pieces section not found');
    } else {
      const families = this.findFamilies(shared);
      for (const f of families) this.sharedFamilyIds.add(f.id);
      if (families.length !== EXPECTED_FAMILIES) {
        this.warn(
          'Expected ' +
            EXPECTED_FAMILIES +
            ' component families, found ' +
            families.length,
        );
      }
      for (const f of families) {
        this.progress('Component ' + f.name);
        components.push(await this.exportFamily(f, 'components'));
      }
    }

    const sections = [];
    for (const spec of FLOW_SECTIONS) {
      const section = await this.findSection(page, spec);
      if (!section) {
        this.warn('Flow section ' + spec.prefix + ' not found');
        continue;
      }
      sections.push(await this.exportSection(section, spec));
    }
    const flowCount = sections
      .filter((s) => s.dir !== '00-guide')
      .reduce((n, s) => n + s.flows.filter((f) => f.isFlow).length, 0);
    if (flowCount !== EXPECTED_FLOWS) {
      this.warn(
        'Expected ' + EXPECTED_FLOWS + ' flow frames, found ' + flowCount,
      );
    }

    // Components used by the flows but living outside Shared pieces: still
    // exported, so nothing a screen references is missing from the bundle.
    const foreign = [];
    const done = new Set();
    while (this.foreignFamilies.size > done.size) {
      for (const [id, family] of this.foreignFamilies) {
        if (done.has(id)) continue;
        done.add(id);
        this.progress('Outside component ' + family.name);
        foreign.push(
          await this.exportFamily(family, 'components/outside-shared'),
        );
      }
    }

    this.path = [];
    const svgIndex = Array.from(this.svgs.values()).sort((a, b) =>
      a.file.localeCompare(b.file),
    );
    this.sendJson('svg/index.json', svgIndex);
    this.sendJson('audit.json', this.audit);

    const fileName = 'zumpo-figma-export.zip';
    const index = {
      format: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      file: {
        key: figma.fileKey || FILE_KEY_FALLBACK,
        name: figma.root.name,
        page: { id: page.id, name: page.name },
      },
      options: this.options,
      counts: Object.assign(
        {
          flows: flowCount,
          componentFamilies: components.length,
          outsideComponents: foreign.length,
          svgs: svgIndex.length,
          seconds: Math.round((Date.now() - started) / 1000),
        },
        this.stats,
      ),
      tokens,
      components,
      outsideComponents: foreign,
      sections,
      warnings: this.warnings,
    };
    this.sendJson('index.json', index);
    this.send('FORMAT.md', FORMAT_DOC);

    post({
      type: 'done',
      fileName,
      summary: index.counts,
      warnings: this.warnings,
    });
  }
}

const FORMAT_DOC = `# Zumpo Figma export format

Generated by tools/figma-export. Read-only snapshot of the Figma file; edit the
design in Figma, never these files.

## Layout

- index.json: file, counts, sections, every flow and component with its file.
- tokens/variables.json: variable collections, values per mode, aliases
  resolved under "resolved".
- tokens/text-styles.json (and paint-styles / effect-styles when present).
- components/<family>.json: Shared pieces families in full detail, every
  variant's tree, property definitions with defaults.
- components/outside-shared/: components the flows use that live outside
  Shared pieces. Ideally empty.
- flows/<section>/<code>.json: one per screen, compact.
- svg/: icons and illustrations, deduplicated by content; svg/index.json lists
  where each is used.
- previews/: PNG renders (flows at 1x, components at 2x), when enabled.
- audit.json: hardcoded colours, spacing and radii, text without a style,
  raster fills, components from outside Shared pieces, hidden layers.

## Conventions

- Only values that differ from the defaults below are written.
- Colours: "$Collection:name" when bound to a variable, "#RRGGBB" (or
  #RRGGBBAA) when hardcoded, " @0.5" suffix for paint opacity, "hidden " prefix
  for hidden paints. Any numeric field may also be a "$Collection:name" ref.
- x/y are written only when the parent has no auto layout or the node is
  absolutely positioned; they are relative to the nearest frame ancestor.
- w/h are always written. wSize/hSize are "hug" or "fill" (fixed omitted).
- layout: mode row/column/grid, gap, pad (one value, [vertical, horizontal]
  or [top, right, bottom, left]), justify, align, wrap.
- Instances: component (family name), variant, props (only values that differ
  from the property default), overrides (path inside the instance, "." for the
  instance itself, and the overridden fields). Children are not repeated,
  except a slot's content: slots maps each slot property to the children the
  instance put in it.
- svg: a vector drawing exported to svg/; its children are not repeated.
- arc: an ellipse drawn as part of one, such as a ring or a half circle:
  start and end in degrees clockwise from three o'clock, and inner the
  hole's radius as a fraction of the ellipse's (0 for none).
- GRID: many same-kind children folded into rows x cols, the common cell, and
  "special" cells as {r, c, id, ...only the differing fields}. rowFrame is the
  row container when the grid was drawn as rows.
- propRefs (inside components): which component property drives a field.

## Defaults (omitted)

visible true, opacity 1, rotation 0, blend normal, no fills / strokes /
effects, strokeWeight 1, radius 0, clip false, layout none, gap 0, pad 0,
justify/align min, constraints min/min, text align left/top, autoResize
width_and_height, case original, decoration none.
`;

figma.showUI(__html__, { width: 420, height: 560, themeColors: true });

figma.ui.on('message', async (msg) => {
  if (!msg || msg.type !== 'run') return;
  try {
    await new Exporter({ previews: Boolean(msg.previews) }).run();
  } catch (e) {
    post({
      type: 'error',
      message: String(e && e.message ? e.message : e),
      stack: e && e.stack ? String(e.stack) : undefined,
    });
  }
});
