// Variables used by Scriptable.
// icon-color: deep-gray; icon-glyph: cloud-download-alt;
//
// Bootstrap loader. This is the only file that gets copied into Scriptable:
// it downloads the real widget from this repository and runs it. The widget
// code stays under version control and the phone picks up changes on its own.
//
// FIRST RUN: run it inside the app, not as a widget. Widgets cannot present
// dialogs, so the base URL can only be entered from the app.
//
// To add a second widget, duplicate this file and change SCRIPT only.

const SCRIPT = "portfolio.js";
const BASE_KEY = "widgets_base";

async function baseUrl() {
  if (!Keychain.contains(BASE_KEY)) {
    if (!config.runsInApp) return null;
    const alert = new Alert();
    alert.title = "Configure widgets";
    alert.message =
      "Repository base URL, no trailing slash. For example:\n" +
      "https://raw.githubusercontent.com/<user>/widgets/main";
    alert.addTextField("https://...", "");
    alert.addAction("Save");
    alert.addCancelAction("Cancel");
    if ((await alert.present()) === -1) return null;
    Keychain.set(BASE_KEY, alert.textFieldValue(0).trim().replace(/\/$/, ""));
  }
  return Keychain.get(BASE_KEY);
}

// The cached copy is what keeps the widget painting when the phone is offline
// or GitHub is unreachable. Without it, any blip leaves a blank tile on the
// home screen until the next refresh succeeds.
async function fetchSource(base, name) {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.cacheDirectory(), `widgets-${name}`);
  try {
    const request = new Request(`${base}/${name}`);
    request.timeoutInterval = 15;
    const source = await request.loadString();
    if (!source || source.length < 32) throw new Error("empty response");
    fm.writeString(cache, source);
    return source;
  } catch (error) {
    if (fm.fileExists(cache)) return fm.readString(cache);
    throw error;
  }
}

function errorWidget(message) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#1c1c1e");
  const text = widget.addText(message);
  text.font = Font.mediumSystemFont(12);
  text.textColor = new Color("#ff453a");
  text.minimumScaleFactor = 0.7;
  return widget;
}

async function present(widget) {
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentSmall();
}

try {
  const base = await baseUrl();
  if (!base) {
    await present(errorWidget("Not configured.\nOpen this script in Scriptable."));
  } else {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    await new AsyncFunction(await fetchSource(base, SCRIPT))();
  }
} catch (error) {
  await present(errorWidget(`Failed to load ${SCRIPT}\n${error.message}`));
}

Script.complete();
