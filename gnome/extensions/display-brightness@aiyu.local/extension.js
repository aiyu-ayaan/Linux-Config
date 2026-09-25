// Display Brightness: one slider per display in a top-bar menu.
//   Internal panel  -> org.gnome.SettingsDaemon.Power.Screen (same path as GNOME's own slider)
//   DDC/CI monitors -> ddcutil setvcp 10, one write in flight per monitor, only the latest value is sent
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const DDCUTIL = GLib.find_program_in_path('ddcutil');
// Short DDC sleeps: a write takes ~70 ms instead of ~450 ms. A failed fast write is retried at normal speed.
const FAST_ARGS = ['--sleep-multiplier', '0.1'];
const VCP_BRIGHTNESS = '10';
const ICON = 'display-brightness-symbolic';

const PowerScreenProxy = Gio.DBusProxy.makeProxyWrapper(`
<node>
  <interface name="org.gnome.SettingsDaemon.Power.Screen">
    <property name="Brightness" type="i" access="readwrite"/>
  </interface>
</node>`);

function log(msg) {
    console.log(`[display-brightness] ${msg}`);
}

// Run a command, resolve with stdout, reject on a non-zero exit
function run(argv) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(e);
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            try {
                const [, stdout, stderr] = p.communicate_utf8_finish(res);
                if (p.get_successful())
                    resolve(stdout);
                else
                    reject(new Error(`${argv.join(' ')}: ${stderr.trim() || 'failed'}`));
            } catch (e) {
                reject(e);
            }
        });
    });
}

// `ddcutil detect --brief`: "Display N" blocks with "I2C bus: /dev/i2c-N", "DRM connector: card2-HDMI-A-1",
// "Monitor: MFG:MODEL:SERIAL". "Invalid display" blocks (the laptop panel) are skipped.
function parseDetect(text) {
    const monitors = [];
    let cur = null;
    for (const line of text.split('\n')) {
        if (/^Display \d+/.test(line)) {
            cur = {};
            monitors.push(cur);
        } else if (/^\S/.test(line)) {
            cur = null;
        } else if (cur) {
            const m = line.match(/^\s+([^:]+):\s+(.*)$/);
            if (!m)
                continue;
            if (m[1] === 'I2C bus')
                cur.bus = m[2].match(/i2c-(\d+)/)?.[1];
            else if (m[1] === 'DRM connector')
                cur.connector = m[2].replace(/^card\d+-/, '');
            else if (m[1] === 'Monitor')
                cur.model = m[2].split(':')[1]?.trim();
        }
    }
    return monitors.filter(m => m.bus).map(m => ({
        bus: m.bus,
        name: [m.model, m.connector && `(${m.connector})`].filter(Boolean).join(' ') || `Bus ${m.bus}`,
    }));
}

// Every display exposes: name, value (0..1, or null while unknown), set(value), 'changed' when it moves
// on its own (read back from the monitor, Fn keys, another app).
class DdcDisplay extends EventEmitter {
    constructor(bus, name) {
        super();
        this.bus = bus;
        this.name = name;
        this.value = null;
        this._max = 100;
        this._sent = null;      // raw value the monitor last confirmed
        this._target = null;    // raw value the user wants
        this._busy = false;
        this._fast = true;
        this._writes = 0;       // bumps on each set(); stale reads are dropped
    }

    async read() {
        if (this._busy)
            return;
        const writes = this._writes;
        const out = await run([DDCUTIL, '--bus', this.bus, '--brief', ...FAST_ARGS, 'getvcp', VCP_BRIGHTNESS])
            .catch(() => run([DDCUTIL, '--bus', this.bus, '--brief', 'getvcp', VCP_BRIGHTNESS]));
        const m = out.match(/VCP\s+10\s+C\s+(\d+)\s+(\d+)/);
        if (!m)
            throw new Error(`bus ${this.bus}: unexpected getvcp output "${out.trim()}"`);
        if (writes !== this._writes || this._busy)
            return;
        this._max = Math.max(1, Number(m[2]));
        this._sent = Number(m[1]);
        this._target = this._sent;
        this.value = this._sent / this._max;
        this.emit('changed');
    }

    set(value) {
        this.value = Math.min(1, Math.max(0, value));
        this._target = Math.round(this.value * this._max);
        this._writes++;
        this._pump();
    }

    _pump() {
        if (this._busy || this._target === null || this._target === this._sent)
            return;
        const raw = this._target;
        this._busy = true;
        const argv = fast => [DDCUTIL, '--bus', this.bus, '--noverify', ...(fast ? FAST_ARGS : []),
            'setvcp', VCP_BRIGHTNESS, String(raw)];
        run(argv(this._fast))
            .catch(e => {
                if (!this._fast)
                    throw e;
                log(`bus ${this.bus}: fast write failed, using normal DDC timing (${e.message})`);
                this._fast = false;
                return run(argv(false));
            })
            .then(() => {
                this._sent = raw;
            })
            .catch(e => {
                log(e.message);
                this._sent = null;
                if (this._target === raw)
                    this._target = null;  // give up on this value, the next set() tries again
            })
            .finally(() => {
                this._busy = false;
                this._pump();
            });
    }

    destroy() {
        this._target = null;
        this.disconnectAll();
    }
}

class InternalDisplay extends EventEmitter {
    constructor() {
        super();
        this.name = 'Built-in display';
        this.value = null;
        this._proxy = null;
    }

    // Resolves true when the laptop panel has a backlight gsd can drive
    init() {
        return new Promise(resolve => {
            this._cancellable = new Gio.Cancellable();
            new PowerScreenProxy(Gio.DBus.session, 'org.gnome.SettingsDaemon.Power',
                '/org/gnome/SettingsDaemon/Power', (proxy, error) => {
                    if (error) {
                        if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                            log(`gsd power: ${error.message}`);
                        resolve(false);
                        return;
                    }
                    this._proxy = proxy;
                    this._propsId = proxy.connect('g-properties-changed', () => {
                        if (this._sync())
                            this.emit('changed');
                    });
                    resolve(this._sync());
                }, this._cancellable);
        });
    }

    _sync() {
        const b = this._proxy?.Brightness;
        if (!Number.isInteger(b) || b < 0)
            return false;
        this.value = b / 100;
        return true;
    }

    read() {
        return Promise.resolve();  // kept current by g-properties-changed
    }

    set(value) {
        this.value = Math.min(1, Math.max(0, value));
        if (this._proxy)
            this._proxy.Brightness = Math.round(this.value * 100);
    }

    destroy() {
        this._cancellable?.cancel();
        if (this._propsId)
            this._proxy.disconnect(this._propsId);
        this._proxy = null;
        this.disconnectAll();
    }
}

// Menu row: name + percentage, slider underneath
const BrightnessRow = GObject.registerClass(
class BrightnessRow extends PopupMenu.PopupBaseMenuItem {
    _init(name, onChange) {
        super._init({activate: false, style_class: 'display-brightness-row'});
        const box = new St.BoxLayout({vertical: true, x_expand: true, style: 'spacing: 6px;'});
        const header = new St.BoxLayout({x_expand: true});
        header.add_child(new St.Label({text: name, x_expand: true, y_align: Clutter.ActorAlign.CENTER}));
        this._percent = new St.Label({text: '…', style: 'font-feature-settings: "tnum";'});
        header.add_child(this._percent);
        box.add_child(header);

        this.slider = new Slider(0);
        this.slider.accessible_name = name;
        this.slider.x_expand = true;
        box.add_child(this.slider);
        this.add_child(box);

        this._changedId = this.slider.connect('notify::value', () => {
            this._showPercent(this.slider.value);
            onChange(this.slider.value);
        });
        // Arrow keys / scroll on the row move the slider
        this.connect('key-press-event', (_a, event) => this.slider.emit('key-press-event', event));
        this.connect('scroll-event', (_a, event) => this.slider.emit('scroll-event', event));
    }

    // Update without feeding the value back to the display; ignored while the user drags this slider
    setValue(value) {
        if (value === null || this.slider._dragging)
            return;
        this.slider.block_signal_handler(this._changedId);
        this.slider.value = value;
        this.slider.unblock_signal_handler(this._changedId);
        this._showPercent(value);
    }

    _showPercent(value) {
        this._percent.text = `${Math.round(value * 100)}%`;
    }
});

const BrightnessButton = GObject.registerClass(
class BrightnessButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5, 'Display Brightness');
        this._settings = settings;
        this._displays = [];
        this._rows = [];
        this.add_child(new St.Icon({icon_name: ICON, style_class: 'system-status-icon'}));

        this._status = new PopupMenu.PopupMenuItem('Looking for displays…', {reactive: false});
        this.menu.addMenuItem(this._status);
        this._section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._section);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Detect displays again', () => this.detect());

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._readAll();
        });
        this.connect('scroll-event', (_a, event) => {
            let dir = event.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.SMOOTH) {
                // Touchpads: one step per 1.0 of accumulated delta
                this._scrollAcc = (this._scrollAcc ?? 0) + event.get_scroll_delta()[1];
                if (Math.abs(this._scrollAcc) < 1)
                    return Clutter.EVENT_STOP;
                dir = this._scrollAcc < 0 ? Clutter.ScrollDirection.UP : Clutter.ScrollDirection.DOWN;
                this._scrollAcc = 0;
            }
            if (dir === Clutter.ScrollDirection.UP)
                this.step(+1);
            else if (dir === Clutter.ScrollDirection.DOWN)
                this.step(-1);
            return Clutter.EVENT_STOP;
        });
        this.detect();
    }

    async detect() {
        const gen = this._gen = (this._gen ?? 0) + 1;
        this._clear();
        this._status.label.text = 'Looking for displays…';
        this._status.show();

        const found = [];
        const internal = new InternalDisplay();
        if (await internal.init())
            found.push(internal);
        else
            internal.destroy();

        if (DDCUTIL) {
            try {
                const monitors = parseDetect(await run([DDCUTIL, 'detect', '--brief']));
                const ddc = monitors.map(m => new DdcDisplay(m.bus, m.name));
                await Promise.all(ddc.map(d => d.read().catch(e => log(e.message))));
                for (const d of ddc) {
                    if (d.value === null)
                        d.destroy();  // no DDC/CI brightness on this one
                    else
                        found.push(d);
                }
            } catch (e) {
                log(`ddcutil detect: ${e.message}`);
            }
        } else {
            log('ddcutil not found, external monitors are not listed');
        }

        if (gen !== this._gen || !this._section) {
            found.forEach(d => d.destroy());
            return;
        }
        this._build(found);
    }

    _build(displays) {
        this._displays = displays;
        if (!displays.length) {
            this._status.label.text = DDCUTIL ? 'No adjustable displays found' : 'ddcutil is not installed';
            return;
        }
        this._status.hide();

        if (displays.length > 1) {
            this._all = new BrightnessRow('All displays', v => {
                displays.forEach((d, i) => {
                    d.set(v);
                    this._rows[i].setValue(v);
                });
            });
            this._section.addMenuItem(this._all);
            this._section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        for (const d of displays) {
            const row = new BrightnessRow(d.name, v => {
                d.set(v);
                this._syncAll();
            });
            row.setValue(d.value);
            d.connect('changed', () => {
                row.setValue(d.value);
                this._syncAll();
            });
            this._rows.push(row);
            this._section.addMenuItem(row);
        }
        this._syncAll();
    }

    // "All displays" shows the average
    _syncAll() {
        const vals = this._displays.map(d => d.value).filter(v => v !== null);
        if (this._all && vals.length)
            this._all.setValue(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    _readAll() {
        for (const d of this._displays)
            d.read().catch(e => log(e.message));
    }

    // Shortcut / scroll: move every display by one step and show the OSD
    step(sign) {
        if (!this._displays.length)
            return;
        const delta = sign * this._settings.get_int('step') / 100;
        this._displays.forEach((d, i) => {
            const v = Math.min(1, Math.max(0, (d.value ?? 0) + delta));
            d.set(v);
            this._rows[i].setValue(v);
        });
        this._syncAll();
        const vals = this._displays.map(d => d.value);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        Main.osdWindowManager.show(-1, Gio.ThemedIcon.new(ICON), null, avg, 1);
    }

    _clear() {
        this._displays.forEach(d => d.destroy());
        this._displays = [];
        this._rows = [];
        this._all = null;
        this._section?.removeAll();
    }

    destroy() {
        this._gen = -1;
        this._clear();
        this._section = null;
        super.destroy();
    }
});

export default class DisplayBrightness extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._button = new BrightnessButton(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._button, 1, 'right');

        const mode = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP;
        Main.wm.addKeybinding('increase-shortcut', this._settings, Meta.KeyBindingFlags.NONE, mode,
            () => this._button.step(+1));
        Main.wm.addKeybinding('decrease-shortcut', this._settings, Meta.KeyBindingFlags.NONE, mode,
            () => this._button.step(-1));

        // Monitor plugged / unplugged: detect again once things settle (DDC needs a moment after hotplug)
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => {
            if (this._redetectId)
                GLib.source_remove(this._redetectId);
            this._redetectId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                this._redetectId = 0;
                this._button?.detect();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    disable() {
        Main.wm.removeKeybinding('increase-shortcut');
        Main.wm.removeKeybinding('decrease-shortcut');
        Main.layoutManager.disconnect(this._monitorsId);
        if (this._redetectId)
            GLib.source_remove(this._redetectId);
        this._redetectId = 0;
        this._button?.destroy();
        this._button = null;
        this._settings = null;
    }
}
