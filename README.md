# widgets

Scriptable widgets for iOS, kept under version control instead of living as
loose files in iCloud Drive.

The phone holds a ten-line loader. Everything else is fetched from this
repository at refresh time, so a widget is changed by pushing a commit, never
by editing on the phone.

## Why this repository can be public

No file here names a host, a user or an instance. The Home Assistant URL and
its access token are read from the iOS keychain at runtime and are entered once
from inside the Scriptable app. What is public is the layout and the arithmetic.

The trade-off is real and worth stating plainly: **the phone executes code
fetched over the network.** Whoever controls this repository runs code on the
device that holds those keychain entries. Keep two-factor authentication on the
account. If that is not acceptable, point the loader at a commit SHA instead of
a branch — the code can then only change when the SHA is changed by hand, at the
cost of losing over-the-air updates.

## Install

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188).
2. Create a script in Scriptable, paste `loader.js` into it, and name it after
   the widget it loads.
3. Run it **inside the app** once. It asks for the repository base URL:

   ```
   https://raw.githubusercontent.com/<user>/widgets/main
   ```

4. Run it once more. It now asks for the Home Assistant URL, a long-lived access
   token (Home Assistant → profile → Security → Long-lived access tokens) and,
   optionally, the address a tap should open.
5. Add a Scriptable widget to the home screen and pick that script.

Both prompts only appear when the script runs inside the app: a widget cannot
present dialogs. A tile reading *Sin configurar* means step 3 or 4 is missing.

Running the script inside the app again offers **Ajustes**, where any of the
three values can be changed. Leaving the token field empty there keeps the
token already stored, so the tap target can be edited on its own.

### What a tap opens

Anything the phone can open, stored in the keychain rather than in this file
because it names a private host:

| Value | Opens |
|---|---|
| `https://<portfolio-host>` | the portfolio web app in Safari |
| `homeassistant://navigate/lovelace/0` | a dashboard in the Home Assistant app |
| empty | nothing useful — the widget falls back to opening Scriptable |

A LAN-only address is a deliberate choice, not a bug: it works at home and
fails on mobile data. If the widget should always open to something, point it
at a host that resolves from anywhere.

## Widgets

### `portfolio.js`

Investment portfolio: current value, change today and year to date, amount
contributed versus amount earned.

Reads one Home Assistant entity, `sensor.cartera_valor`, whose attributes carry
every figure, so the whole widget costs a single request:

| Source | Meaning |
|---|---|
| state | current market value of the holdings |
| `patrimonio` | value including cash |
| `invertido` | total contributed |
| `dia`, `dia_pct` | change today |
| `anual`, `anual_pct` | change year to date |

Supports the small, medium and large families plus the lock screen accessories.
Colours follow the phone's light or dark appearance. Visible labels are in
Spanish, matching the entity they come from; they are string literals in the
layout functions and are the only thing to change for another language.

Refreshes every 30 minutes, which is as often as the data underneath it moves.

## Adding a widget

Add `<name>.js` here, duplicate `loader.js` in Scriptable and change its
`SCRIPT` constant. The base URL is already in the keychain, so no further
configuration is needed.

A widget script is executed by the loader, not imported: it ends by calling
`Script.setWidget`, and it may use `Keychain`, `config` and every other
Scriptable global as if it had been run directly.
