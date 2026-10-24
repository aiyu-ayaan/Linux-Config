import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

const CACHE_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'material-you-aiyu']);
const SAMPLE_SIZE = 96;          // wallpaper is decoded at this size to find the seed colour
const FALLBACK = {hue: 290, chroma: 40}; // M3 baseline purple when the wallpaper is grey

// ---- colour maths: M3 "tone" is CIELAB L*, so palettes are built in CIE LCh(ab) -------

const D65 = [0.95047, 1, 1.08883];

function srgbToLab([r, g, b]) {
    const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const xyz = [
        0.4124 * R + 0.3576 * G + 0.1805 * B,
        0.2126 * R + 0.7152 * G + 0.0722 * B,
        0.0193 * R + 0.1192 * G + 0.9505 * B,
    ].map((v, i) => v / D65[i]);
    const f = t => t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116;
    const [fx, fy, fz] = xyz.map(f);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// LCh -> sRGB [0..255], or null when outside the sRGB gamut
function lchToSrgb(L, C, h) {
    const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = t => t ** 3 > 0.008856 ? t ** 3 : (116 * t - 16) / 903.3;
    const X = D65[0] * inv(fx), Y = L > 8 ? fy ** 3 : L / 903.3, Z = D65[2] * inv(fz);
    const lin = [
        3.2406 * X - 1.5372 * Y - 0.4986 * Z,
        -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
        0.0557 * X - 0.2040 * Y + 1.0570 * Z,
    ];
    if (lin.some(c => c < -0.0005 || c > 1.0005))
        return null;
    const gamma = c => (c = Math.min(Math.max(c, 0), 1)) <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return lin.map(c => Math.round(gamma(c) * 255));
}

// Colour at `tone` of the palette (hue, chroma); chroma is reduced until it fits sRGB
function tone(palette, t) {
    for (let c = palette.chroma; c >= 0; c -= 0.5) {
        const rgb = lchToSrgb(t, c, palette.hue);
        if (rgb)
            return rgb;
    }
    return lchToSrgb(t, 0, 0);
}

const hex = rgb => `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
const rgba = (rgb, a) => `rgba(${rgb.join(', ')}, ${a})`;

// Seed = the most "colourful" hue family of the wallpaper (hue histogram weighted by chroma)
function seedFromPixbuf(pixbuf) {
    const px = pixbuf.read_pixel_bytes().toArray();
    const n = pixbuf.get_n_channels(), stride = pixbuf.get_rowstride();
    const bins = Array.from({length: 36}, () => ({w: 0, x: 0, y: 0, c: 0}));
    for (let y = 0; y < pixbuf.get_height(); y++) {
        for (let x = 0; x < pixbuf.get_width(); x++) {
            const i = y * stride + x * n;
            const [L, a, b] = srgbToLab([px[i], px[i + 1], px[i + 2]]);
            const C = Math.hypot(a, b);
            if (L < 12 || L > 94 || C < 10)
                continue;
            const h = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
            const bin = bins[Math.floor(h / 10) % 36];
            bin.w += C;
            bin.x += C * Math.cos(h * Math.PI / 180);
            bin.y += C * Math.sin(h * Math.PI / 180);
            bin.c += C * C;
        }
    }
    // Score each bin together with its neighbours so one hue family wins, not one slice
    let best = null, bestScore = 0;
    bins.forEach((bin, i) => {
        const score = bin.w + 0.5 * (bins[(i + 35) % 36].w + bins[(i + 1) % 36].w);
        if (score > bestScore) {
            bestScore = score;
            best = bin;
        }
    });
    if (!best || best.w === 0)
        return FALLBACK;
    return {
        hue: (Math.atan2(best.y, best.x) * 180 / Math.PI + 360) % 360,
        chroma: best.c / best.w,
    };
}

// M3 dark scheme from a seed. Palette chromas follow the tonal-spot scheme, with a
// livelier primary (Expressive); tones follow the M3 dark role table.
function darkScheme(seed) {
    const P = {hue: seed.hue, chroma: Math.min(Math.max(seed.chroma, 40), 56)};
    const S = {hue: seed.hue, chroma: 16};
    const T = {hue: (seed.hue + 60) % 360, chroma: 28};
    const N = {hue: seed.hue, chroma: 5};
    const NV = {hue: seed.hue, chroma: 9};
    return {
        primary: tone(P, 80), onPrimary: tone(P, 20),
        primaryContainer: tone(P, 30), onPrimaryContainer: tone(P, 90),
        primaryHover: tone(P, 86), primaryPressed: tone(P, 74),
        secondary: tone(S, 80), onSecondary: tone(S, 20),
        secondaryContainer: tone(S, 30), onSecondaryContainer: tone(S, 90),
        tertiary: tone(T, 80), onTertiary: tone(T, 20),
        tertiaryContainer: tone(T, 30), onTertiaryContainer: tone(T, 90),
        surface: tone(N, 6), surfaceBright: tone(N, 24),
        surfaceContainerLowest: tone(N, 4), surfaceContainerLow: tone(N, 10),
        surfaceContainer: tone(N, 12), surfaceContainerHigh: tone(N, 17),
        surfaceContainerHighest: tone(N, 22), surfaceHover: tone(N, 27), surfacePressed: tone(N, 31),
        onSurface: tone(N, 90), onSurfaceVariant: tone(NV, 80),
        outline: tone(NV, 60), outlineVariant: tone(NV, 30),
        error: [0xff, 0xb4, 0xab], onError: [0x69, 0x00, 0x05],
    };
}

function shellCss(c) {
    const h = k => hex(c[k]);
    return `/* Generated by material-you@aiyu.local from the wallpaper. Do not edit. */

/* Top bar: pill buttons, tonal state layers */
#panel .panel-button { border-radius: 999px; transition-duration: 200ms; }
#panel .panel-button:hover { box-shadow: inset 0 0 0 100px ${rgba(c.onSurface, 0.10)}; }
#panel .panel-button:active, #panel .panel-button:checked,
#panel .panel-button:active:hover, #panel .panel-button:checked:hover {
  box-shadow: inset 0 0 0 100px ${h('primaryContainer')}; color: ${h('onPrimaryContainer')}; }
#panel .panel-button#panelActivities .workspace-dot { background-color: ${h('primary')}; }

/* Menus: extra-large container, pill items */
.popup-menu-content, .candidate-popup-content {
  background-color: ${h('surfaceContainer')}; color: ${h('onSurface')};
  border-radius: 28px; padding: 10px; border: 1px solid ${h('outlineVariant')};
  box-shadow: 0 8px 24px 0 rgba(0, 0, 0, 0.35); }
.popup-menu-item { border-radius: 999px; padding: 9px 14px; transition-duration: 150ms; }
.popup-menu-item:hover, .popup-menu-item:focus, .popup-menu-item:selected {
  background-color: ${rgba(c.onSurface, 0.08)}; color: ${h('onSurface')}; }
.popup-menu-item:active { background-color: ${rgba(c.onSurface, 0.12)}; border-radius: 16px; }
.popup-menu-item:checked { background-color: ${h('secondaryContainer')}; color: ${h('onSecondaryContainer')}; }
.popup-sub-menu { background-color: ${h('surfaceContainerHigh')}; border-radius: 20px; }
.popup-separator-menu-item .popup-separator-menu-item-separator { background-color: ${h('outlineVariant')}; }

/* Quick settings: rounded-square tiles that morph into a pill when switched on */
.quick-settings { background-color: ${h('surfaceContainer')}; border-radius: 32px; padding: 16px; }
.quick-settings-grid { spacing-rows: 10px; spacing-columns: 10px; }
.quick-settings .quick-toggle, .quick-settings .quick-menu-toggle .quick-toggle-arrow {
  background-color: ${h('surfaceContainerHighest')}; color: ${h('onSurface')};
  border-radius: 20px; transition-duration: 250ms; }
.quick-settings .quick-toggle:hover, .quick-settings .quick-toggle:focus,
.quick-settings .quick-toggle:focus:hover,
.quick-settings .quick-menu-toggle .quick-toggle-arrow:hover {
  background-color: ${h('surfaceHover')}; }
.quick-settings .quick-toggle:active, .quick-settings .quick-menu-toggle .quick-toggle-arrow:active {
  background-color: ${h('surfacePressed')}; border-radius: 12px; }
.quick-settings .quick-toggle:checked, .quick-settings .quick-toggle:focus:checked,
.quick-settings .quick-menu-toggle .quick-toggle-arrow:checked {
  background-color: ${h('primary')}; color: ${h('onPrimary')}; border-radius: 999px; }
.quick-settings .quick-toggle:hover:checked, .quick-settings .quick-toggle:focus:hover:checked,
.quick-settings .quick-menu-toggle .quick-toggle-arrow:hover:checked {
  background-color: ${h('primaryHover')}; }
.quick-settings .quick-toggle:active:checked, .quick-settings .quick-toggle:active:hover:checked,
.quick-settings .quick-menu-toggle .quick-toggle-arrow:active:checked {
  background-color: ${h('primaryPressed')}; border-radius: 16px; }
/* Split toggles: two segments with small inner corners and a 2px gap (Expressive split button) */
.quick-settings .quick-menu-toggle > StBoxLayout { spacing: 2px; }
.quick-settings .quick-menu-toggle .quick-toggle:ltr { border-radius: 20px 6px 6px 20px; }
.quick-settings .quick-menu-toggle .quick-toggle:ltr:checked { border-radius: 999px 6px 6px 999px; }
.quick-settings .quick-menu-toggle .quick-toggle:ltr:last-child { border-radius: 20px; }
.quick-settings .quick-menu-toggle .quick-toggle:ltr:last-child:checked { border-radius: 999px; }
.quick-settings .quick-menu-toggle .quick-toggle-arrow:ltr { border-radius: 6px 20px 20px 6px; border-left-width: 0; }
.quick-settings .quick-menu-toggle .quick-toggle-arrow:ltr:checked { border-radius: 6px 999px 999px 6px; }
.quick-toggle-menu { background-color: ${h('surfaceContainerHigh')}; border-radius: 28px; }
.quick-toggle-menu .header .icon.active { background-color: ${h('primary')}; color: ${h('onPrimary')}; }
.quick-slider .slider-bin:focus { background-color: ${h('surfaceContainerHighest')}; }

/* Sliders: thick tonal track, handle sits in a gap (Expressive slider) */
.slider {
  color: ${h('primary')};
  -barlevel-height: 12px;
  -barlevel-background-color: ${h('secondaryContainer')};
  -barlevel-active-background-color: ${h('primary')};
  -barlevel-overdrive-color: ${hex(c.error)};
  -slider-handle-radius: 9px;
  -slider-handle-border-width: 3px;
  -slider-handle-border-color: ${h('surfaceContainer')}; }

/* Calendar and notifications */
.calendar .calendar-day.calendar-today, .calendar .calendar-day.calendar-today:hover {
  background-color: ${h('primary')}; color: ${h('onPrimary')}; }
.calendar .calendar-day:selected { background-color: ${h('secondaryContainer')}; color: ${h('onSecondaryContainer')}; }
.datemenu-today-button, .events-button, .world-clocks-button, .weather-button, .message {
  background-color: ${h('surfaceContainerHigh')}; border-radius: 24px; }
.datemenu-today-button:hover, .events-button:hover, .message:hover { background-color: ${h('surfaceContainerHighest')}; }
.notification-banner {
  background-color: ${h('surfaceContainerHigh')}; border-radius: 28px;
  border: 1px solid ${h('outlineVariant')}; box-shadow: 0 8px 24px 0 rgba(0, 0, 0, 0.35); }
.message .message-title { color: ${h('onSurface')}; }
.message .message-body { color: ${h('onSurfaceVariant')}; }

/* Alt+Tab, OSD, overview search */
.switcher-list { background-color: ${h('surfaceContainer')}; border-radius: 32px; border: 1px solid ${h('outlineVariant')}; }
.switcher-list .item-box { background-color: transparent; border-radius: 20px; }
.switcher-list .item-box:selected { background-color: ${h('secondaryContainer')}; color: ${h('onSecondaryContainer')}; }
.osd-window { background-color: ${h('surfaceContainer')}; border-radius: 28px; color: ${h('onSurface')}; }
.osd-window .level { -barlevel-active-background-color: ${h('primary')}; -barlevel-background-color: ${h('secondaryContainer')}; }
.search-entry { background-color: ${h('surfaceContainerHigh')}; border-radius: 999px; color: ${h('onSurface')}; }
.search-entry:focus { box-shadow: inset 0 0 0 2px ${h('primary')}; background-color: ${h('surfaceContainerHighest')}; }

/* Dynamic island (dynamic-island@aiyu.local) */
.dynamic-island { background-color: ${h('surfaceContainerLowest')}; color: ${h('onSurface')};
  border: 1px solid ${rgba(c.outlineVariant, 0.6)}; }
.dynamic-island .island-bar, .dynamic-island .island-level-fill, .dynamic-island .island-dot.active {
  background-color: ${h('primary')}; }
.dynamic-island .island-osd-icon { color: ${h('primary')}; }
.dynamic-island .island-level { background-color: ${h('secondaryContainer')}; }
.dynamic-island .island-level-fill.overdrive { background-color: ${hex(c.error)}; }
.dynamic-island .island-dot { background-color: ${h('outlineVariant')}; }
.dynamic-island .island-body { color: ${h('onSurfaceVariant')}; }
.dynamic-island .island-media-button { color: ${h('onSurface')}; }
.dynamic-island .island-play { background-color: ${h('primary')}; color: ${h('onPrimary')}; }
.dynamic-island .island-play:hover { background-color: ${h('primaryHover')}; }
.dynamic-island .island-play:active { background-color: ${h('primaryPressed')}; }
`;
}

export default class MaterialYou extends Extension {
    enable() {
        GLib.mkdir_with_parents(CACHE_DIR, 0o755);
        this._theme = St.ThemeContext.get_for_stage(global.stage);
        this._stylesheet = null;
        this._generation = 0;

        // Show the last generated scheme right away, then recompute from the wallpaper
        const last = GLib.build_filenamev([CACHE_DIR, 'shell.css']);
        if (GLib.file_test(last, GLib.FileTest.EXISTS))
            this._load(Gio.File.new_for_path(last));

        this._bg = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        this._bgIds = ['picture-uri', 'picture-uri-dark', 'primary-color'].map(k =>
            this._bg.connect(`changed::${k}`, () => this._queue()));
        this._themeId = this._theme.connect('changed', () => this._reload());
        this._queue();

        this._hookPopups();
    }

    disable() {
        if (this._queueId)
            GLib.source_remove(this._queueId);
        this._queueId = 0;
        this._generation++;
        this._bgIds.forEach(id => this._bg.disconnect(id));
        this._bg = null;
        this._theme.disconnect(this._themeId);
        this._unload();
        this._theme = null;
        this._inj.clear();
        this._inj = null;
    }

    // ---- stylesheet --------------------------------------------------------------------

    _load(file) {
        this._unload();
        this._theme.get_theme().load_stylesheet(file);
        this._stylesheet = file;
    }

    _unload() {
        const file = this._stylesheet;
        this._stylesheet = null; // first: unloading emits 'changed', which must not re-add it
        if (file)
            this._theme.get_theme().unload_stylesheet(file);
    }

    // The shell builds a new St.Theme when the theme changes (e.g. other extensions load);
    // our stylesheet has to be added to the new one.
    _reload() {
        const theme = this._theme.get_theme();
        if (this._stylesheet && !theme.get_custom_stylesheets().some(f => f.equal(this._stylesheet)))
            theme.load_stylesheet(this._stylesheet);
    }

    _queue() {
        if (this._queueId)
            GLib.source_remove(this._queueId);
        this._queueId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._queueId = 0;
            this._generate().catch(e => logError(e, 'material-you: generate'));
            return GLib.SOURCE_REMOVE;
        });
    }

    async _generate() {
        const generation = ++this._generation;
        const darkUri = this._bg.get_string('picture-uri-dark');
        const uri = darkUri || this._bg.get_string('picture-uri');
        let seed = FALLBACK;
        try {
            const file = Gio.File.new_for_uri(uri);
            const stream = await new Promise((resolve, reject) => {
                file.read_async(GLib.PRIORITY_LOW, null, (f, res) => {
                    try {
                        resolve(f.read_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            const pixbuf = await new Promise((resolve, reject) => {
                GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, SAMPLE_SIZE, SAMPLE_SIZE, true, null,
                    (s, res) => {
                        try {
                            resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    });
            });
            stream.close(null);
            seed = seedFromPixbuf(pixbuf);
        } catch (e) {
            log(`material-you: could not read wallpaper ${uri}, using the baseline colour: ${e.message}`);
        }
        if (generation !== this._generation)
            return; // disabled or superseded meanwhile

        const scheme = darkScheme(seed);
        const css = shellCss(scheme);
        // A fresh file name per scheme: St caches stylesheets by file
        const name = `shell-${Date.now()}.css`;
        const file = Gio.File.new_for_path(GLib.build_filenamev([CACHE_DIR, name]));
        file.replace_contents(new TextEncoder().encode(css), null, false, Gio.FileCreateFlags.NONE, null);
        this._load(file);

        // Stable copies: shell.css for the next login, colors.json for other tools
        const write = (n, text) => Gio.File.new_for_path(GLib.build_filenamev([CACHE_DIR, n]))
            .replace_contents(new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, null);
        write('shell.css', css);
        const json = {seed: {hue: Math.round(seed.hue), chroma: Math.round(seed.chroma)}};
        for (const [k, v] of Object.entries(scheme))
            json[k] = hex(v);
        write('colors.json', `${JSON.stringify(json, null, 2)}\n`);

        // Remove older generated files
        for (const info of Gio.File.new_for_path(CACHE_DIR).enumerate_children('standard::name', 0, null)) {
            const n = info.get_name();
            if (/^shell-\d+\.css$/.test(n) && n !== name)
                Gio.File.new_for_path(GLib.build_filenamev([CACHE_DIR, n])).delete(null);
        }
    }

    // ---- motion: menus open with an Expressive overshoot and close with a quick shrink -----

    _hookPopups() {
        this._inj = new InjectionManager();
        const proto = BoxPointer.BoxPointer.prototype;
        const pivot = side => {
            switch (side) {
            case St.Side.TOP: return [0.5, 0];
            case St.Side.BOTTOM: return [0.5, 1];
            case St.Side.LEFT: return [0, 0.5];
            default: return [1, 0.5];
            }
        };
        this._inj.overrideMethod(proto, 'open', original => function (animate, onComplete) {
            original.call(this, animate, onComplete);
            if (!(animate & BoxPointer.PopupAnimation.FULL) || !St.Settings.get().enable_animations) {
                this.set({scale_x: 1, scale_y: 1});
                return;
            }
            this.set_pivot_point(...pivot(this.arrowSide));
            this.set({scale_x: 0.88, scale_y: 0.82});
            this.ease({
                scale_x: 1,
                scale_y: 1,
                duration: 380,
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            });
        });
        this._inj.overrideMethod(proto, 'close', original => function (animate, onComplete) {
            const visible = this.visible;
            original.call(this, animate, () => {
                this.set({scale_x: 1, scale_y: 1});
                onComplete?.();
            });
            if (visible && animate & BoxPointer.PopupAnimation.FULL && St.Settings.get().enable_animations) {
                this.ease({
                    scale_x: 0.94,
                    scale_y: 0.9,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                });
            }
        });
    }
}
