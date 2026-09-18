// Investment portfolio widget, fed from Home Assistant.
//
// Loaded and executed by loader.js — not meant to be copied into Scriptable
// directly. It reads a single Home Assistant entity whose attributes already
// carry every figure, so one HTTP request paints the whole widget.
//
// Nothing here identifies a particular installation: the instance URL and the
// access token live in the iOS keychain, which is why this file is safe to
// keep in a public repository.
//
// Expected entity (see the sensor that produces it in your HA config):
//   sensor.cartera_valor   state = current market value
//     attributes: patrimonio, invertido, dia, dia_pct, anual, anual_pct

const ENTITY = "sensor.cartera_valor";
const URL_KEY = "ha_url";
const TOKEN_KEY = "ha_token";
const LINK_KEY = "portfolio_link";
const REFRESH_MINUTES = 30;

// --- colours -------------------------------------------------------------
// Color.dynamic lets one widget follow the phone's own appearance instead of
// hardcoding a dark tile that looks wrong in light mode.

const BACKGROUND = Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e"));
const PRIMARY = Color.dynamic(new Color("#000000"), new Color("#ffffff"));
const SECONDARY = Color.dynamic(new Color("#8a8a8e"), new Color("#98989f"));
const POSITIVE = Color.dynamic(new Color("#248a3d"), new Color("#30d158"));
const NEGATIVE = Color.dynamic(new Color("#d70015"), new Color("#ff453a"));
const RULE = Color.dynamic(new Color("#e5e5ea"), new Color("#2c2c2e"));

// --- configuration -------------------------------------------------------

const stored = (key) => (Keychain.contains(key) ? Keychain.get(key) : "");

async function editSettings() {
  const alert = new Alert();
  alert.title = "Home Assistant";
  alert.message =
    "Instance URL and a long-lived access token. The tap target is optional: " +
    "leave it empty and the widget opens Scriptable instead.";
  alert.addTextField("https://homeassistant.example.com", stored(URL_KEY));
  alert.addSecureTextField("Access token", stored(TOKEN_KEY));
  alert.addTextField("Tap opens (optional)", stored(LINK_KEY));
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  if ((await alert.present()) === -1) return false;

  Keychain.set(URL_KEY, alert.textFieldValue(0).trim().replace(/\/$/, ""));
  // An empty secure field means "keep the token I already had", so that the
  // tap target can be changed without retyping a 180-character token.
  const token = alert.textFieldValue(1).trim();
  if (token) Keychain.set(TOKEN_KEY, token);
  Keychain.set(LINK_KEY, alert.textFieldValue(2).trim());
  return true;
}

async function settings() {
  const configured = Keychain.contains(URL_KEY) && Keychain.contains(TOKEN_KEY);

  // A widget cannot present dialogs, so it can only use what is already there.
  if (!config.runsInApp) {
    return configured
      ? { url: Keychain.get(URL_KEY), token: Keychain.get(TOKEN_KEY), link: stored(LINK_KEY) }
      : null;
  }

  if (!configured) {
    if (!(await editSettings())) return null;
  } else {
    // Running from inside the app is deliberate, so offer the settings rather
    // than hiding them behind a keychain reset.
    const menu = new Alert();
    menu.title = "Cartera";
    menu.addAction("Ver widget");
    menu.addAction("Ajustes");
    menu.addCancelAction("Cancelar");
    const choice = await menu.present();
    if (choice === -1) return null;
    if (choice === 1 && !(await editSettings())) return null;
  }

  return {
    url: Keychain.get(URL_KEY),
    token: Keychain.get(TOKEN_KEY),
    link: stored(LINK_KEY),
  };
}

// --- data ----------------------------------------------------------------

async function readPortfolio({ url, token }) {
  const request = new Request(`${url}/api/states/${ENTITY}`);
  request.headers = { Authorization: `Bearer ${token}` };
  request.timeoutInterval = 20;
  const state = await request.loadJSON();

  // Home Assistant answers 200 with an error body for a missing entity, so a
  // non-numeric state is the only reliable signal that something is wrong.
  const value = Number(state.state);
  if (!Number.isFinite(value)) {
    throw new Error(state.message || `${ENTITY} unavailable`);
  }

  const attr = state.attributes || {};
  return {
    value,
    netWorth: Number(attr.patrimonio),
    invested: Number(attr.invertido),
    day: Number(attr.dia),
    dayPct: Number(attr.dia_pct),
    year: Number(attr.anual),
    yearPct: Number(attr.anual_pct),
    // Year-to-date return, in percent, one number per sample. It travels as an
    // attribute so the chart costs no extra request, and it is return rather
    // than value on purpose: a value line climbs on contributions alone, so it
    // would slope reassuringly upwards through a losing year.
    series: Array.isArray(attr.serie) ? attr.serie.map(Number).filter(Number.isFinite) : [],
    updatedAt: new Date(state.last_updated),
  };
}

// --- formatting ----------------------------------------------------------

const LOCALE = "es-ES";

function euro(amount, decimals = 0) {
  return amount.toLocaleString(LOCALE, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// A minus sign rather than a hyphen: it lines up with the plus at the same
// optical weight, which matters when the two alternate in a column.
function signed(amount, format) {
  return (amount >= 0 ? "+" : "−") + format(Math.abs(amount));
}

const percent = (value) => signed(value, (n) => `${n.toFixed(2)} %`);

const clock = (date) =>
  date.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

// --- building blocks -----------------------------------------------------

function label(container, text, size = 10) {
  const element = container.addText(text);
  element.font = Font.semiboldSystemFont(size);
  element.textColor = SECONDARY;
  return element;
}

function amount(container, text, size) {
  const element = container.addText(text);
  element.font = Font.boldRoundedSystemFont(size);
  element.textColor = PRIMARY;
  element.minimumScaleFactor = 0.6;
  element.lineLimit = 1;
  return element;
}

function changeRow(container, name, value, pct, size = 12) {
  const row = container.addStack();
  row.centerAlignContent();
  const colour = value >= 0 ? POSITIVE : NEGATIVE;

  const caption = row.addText(name);
  caption.font = Font.mediumSystemFont(size);
  caption.textColor = SECONDARY;

  row.addSpacer();

  const money = row.addText(signed(value, (n) => euro(n)));
  money.font = Font.semiboldSystemFont(size);
  money.textColor = colour;

  const share = row.addText(`  ${percent(pct)}`);
  share.font = Font.regularSystemFont(size);
  share.textColor = colour;
  return row;
}

function statRow(container, name, text) {
  const row = container.addStack();
  row.centerAlignContent();
  const caption = row.addText(name);
  caption.font = Font.mediumSystemFont(11);
  caption.textColor = SECONDARY;
  row.addSpacer();
  const figure = row.addText(text);
  figure.font = Font.semiboldSystemFont(11);
  figure.textColor = PRIMARY;
}

// A sparkline has to be drawn into an image: Scriptable has no chart element.
//
// DrawContext resolves a Color.dynamic once, when the image is rendered, so it
// cannot follow the appearance the way a text colour does. The appearance is
// therefore read explicitly here.
function sparkline(container, series, width, height) {
  if (series.length < 2) return;

  const dark = Device.isUsingDarkAppearance();
  const rising = series[series.length - 1] >= series[0];
  const line = new Color(rising ? (dark ? "#30d158" : "#248a3d") : (dark ? "#ff453a" : "#d70015"));
  const baseline = new Color(dark ? "#48484a" : "#d1d1d6");

  const scale = 3; // drawn oversampled so the curve is not stepped on retina
  const w = width * scale;
  const h = height * scale;

  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  // Left off deliberately: the context is already oversampled by `scale`, and
  // letting it scale again would render a needlessly huge image.
  ctx.respectScreenScale = false;

  const min = Math.min(...series, 0);
  const max = Math.max(...series, 0);
  const span = max - min || 1;
  const pad = 2 * scale;
  const x = (i) => (i / (series.length - 1)) * w;
  const y = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);

  // Zero is where "made nothing" sits; without it a chart that never left the
  // red still looks like a climb.
  if (min < 0 && max > 0) {
    const zero = new Path();
    zero.move(new Point(0, y(0)));
    zero.addLine(new Point(w, y(0)));
    ctx.setStrokeColor(baseline);
    ctx.setLineWidth(1 * scale);
    ctx.addPath(zero);
    ctx.strokePath();
  }

  const area = new Path();
  area.move(new Point(0, y(series[0])));
  series.forEach((v, i) => area.addLine(new Point(x(i), y(v))));
  area.addLine(new Point(w, h));
  area.addLine(new Point(0, h));
  area.closeSubpath();
  ctx.setFillColor(new Color(line.hex, 0.18));
  ctx.addPath(area);
  ctx.fillPath();

  const curve = new Path();
  curve.move(new Point(0, y(series[0])));
  series.forEach((v, i) => curve.addLine(new Point(x(i), y(v))));
  ctx.setStrokeColor(line);
  ctx.setLineWidth(2 * scale);
  ctx.addPath(curve);
  ctx.strokePath();

  const last = series[series.length - 1];
  const dot = 3 * scale;
  ctx.setFillColor(line);
  ctx.fillEllipse(new Rect(w - dot, y(last) - dot, dot * 2, dot * 2));

  const image = container.addImage(ctx.getImage());
  image.imageSize = new Size(width, height);
}

function footer(container, date) {
  container.addSpacer();
  const stamp = container.addText(clock(date));
  stamp.font = Font.regularSystemFont(9);
  stamp.textColor = SECONDARY;
  stamp.rightAlignText();
}

// --- layouts -------------------------------------------------------------

function smallWidget(widget, data) {
  label(widget, "CARTERA");
  widget.addSpacer(4);
  amount(widget, euro(data.value), 25);
  widget.addSpacer(5);
  sparkline(widget, data.series, 130, 24);
  widget.addSpacer(5);
  changeRow(widget, "Hoy", data.day, data.dayPct, 11);
  widget.addSpacer(2);
  changeRow(widget, "Año", data.year, data.yearPct, 11);
  footer(widget, data.updatedAt);
}

function mediumWidget(widget, data) {
  const columns = widget.addStack();
  columns.spacing = 16;

  const left = columns.addStack();
  left.layoutVertically();
  left.size = new Size(150, 0);
  label(left, "CARTERA");
  left.addSpacer(6);
  amount(left, euro(data.value), 26);
  left.addSpacer(8);
  changeRow(left, "Hoy", data.day, data.dayPct);
  left.addSpacer(3);
  changeRow(left, "Año", data.year, data.yearPct);
  footer(left, data.updatedAt);

  const right = columns.addStack();
  right.layoutVertically();
  label(right, "RENTABILIDAD " + new Date().getFullYear(), 9);
  right.addSpacer(6);
  sparkline(right, data.series, 144, 52);
  right.addSpacer(8);
  statRow(right, "Aportado", euro(data.invested));
  right.addSpacer(4);
  statRow(right, "Ganado", signed(data.value - data.invested, (n) => euro(n)));
  right.addSpacer();
}

function largeWidget(widget, data) {
  label(widget, "CARTERA", 11);
  widget.addSpacer(8);
  amount(widget, euro(data.value), 34);
  widget.addSpacer(12);
  changeRow(widget, "Hoy", data.day, data.dayPct, 13);
  widget.addSpacer(5);
  changeRow(widget, "Este año", data.year, data.yearPct, 13);

  widget.addSpacer(14);
  label(widget, "RENTABILIDAD " + new Date().getFullYear(), 9);
  widget.addSpacer(6);
  sparkline(widget, data.series, 310, 64);

  widget.addSpacer(14);
  const rule = widget.addStack();
  rule.size = new Size(0, 1);
  rule.backgroundColor = RULE;
  widget.addSpacer(14);

  statRow(widget, "Aportado", euro(data.invested));
  widget.addSpacer(6);
  statRow(widget, "Ganado", signed(data.value - data.invested, (n) => euro(n)));
  widget.addSpacer(6);
  statRow(widget, "Patrimonio", euro(data.netWorth));

  footer(widget, data.updatedAt);
}

// Lock screen: no room for anything but the headline figure, and the system
// tints the text itself, so this layout sets no colours of its own.
function accessoryWidget(widget, data) {
  const figure = widget.addText(euro(data.value));
  figure.font = Font.semiboldSystemFont(15);
  const delta = widget.addText(`${percent(data.dayPct)} hoy`);
  delta.font = Font.regularSystemFont(11);
}

function failureWidget(widget, message) {
  label(widget, "CARTERA");
  widget.addSpacer(6);
  const text = widget.addText(message);
  text.font = Font.mediumSystemFont(12);
  text.textColor = NEGATIVE;
  text.minimumScaleFactor = 0.7;
}

// --- entry point ---------------------------------------------------------

const widget = new ListWidget();
const family = config.widgetFamily || "medium";
const onLockScreen = family.startsWith("accessory");

// Lock screen widgets are drawn over the wallpaper and tinted by the system:
// painting a background there produces an opaque block instead of a widget.
if (!onLockScreen) {
  widget.backgroundColor = BACKGROUND;
  widget.setPadding(14, 14, 14, 14);
}
widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);

try {
  const credentials = await settings();
  if (!credentials) {
    failureWidget(widget, "Sin configurar.\nAbre el guion en Scriptable.");
  } else {
    // Tapping the widget opens this. It is a keychain entry and not a constant
    // because it points at a private host: a LAN-only address works at home
    // and fails silently on mobile data, so it is the user's call.
    if (credentials.link) widget.url = credentials.link;

    const data = await readPortfolio(credentials);
    if (onLockScreen) accessoryWidget(widget, data);
    else if (family === "small") smallWidget(widget, data);
    else if (family === "large") largeWidget(widget, data);
    else mediumWidget(widget, data);
  }
} catch (error) {
  failureWidget(widget, error.message);
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (family === "large") {
  await widget.presentLarge();
} else if (family === "small") {
  await widget.presentSmall();
} else {
  await widget.presentMedium();
}
