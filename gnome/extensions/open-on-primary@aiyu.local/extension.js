import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

// A window of an app launched from the shell (dash, dock, overview, search) within this
// long counts as that launch's window, even if the app already had windows open.
const LAUNCH_WINDOW_MS = 10000;
const MOVED_TYPES = [Meta.WindowType.NORMAL, Meta.WindowType.SPLASHSCREEN];
const LAUNCH_METHODS = ['activate', 'activate_full', 'open_new_window', 'launch', 'launch_action'];

export default class OpenOnPrimary extends Extension {
    enable() {
        this._launched = new Map(); // app id -> time of last launch from the shell
        this._pending = new Set();  // windows created but not mapped yet (mutter places them at map)
        this._inj = new InjectionManager();

        const launched = this._launched;
        for (const name of LAUNCH_METHODS) {
            this._inj.overrideMethod(Shell.App.prototype, name, original => function (...args) {
                launched.set(this.get_id(), Date.now());
                return original.call(this, ...args);
            });
        }

        const tracker = Shell.WindowTracker.get_default();
        this._ids = [
            [global.display, global.display.connect('window-created', (d, win) => {
                if (!MOVED_TYPES.includes(win.get_window_type()) || win.get_transient_for()) return;
                this._pending.add(win);
                win.connect('unmanaged', () => this._pending?.delete(win));
            })],
            // 'map' runs after mutter placed the window but before its first frame is shown
            [global.window_manager, global.window_manager.connect('map', (wm, actor) => {
                const win = actor.meta_window;
                if (!this._pending.delete(win)) return;
                const primary = global.display.get_primary_monitor();
                if (win.get_monitor() === primary) return;

                const app = tracker.get_window_app(win);
                const id = app?.get_id();
                const others = app?.get_windows().filter(w =>
                    w !== win && w.get_window_type() === Meta.WindowType.NORMAL) ?? [];
                const fromShell = Date.now() - (this._launched.get(id) ?? 0) < LAUNCH_WINDOW_MS;
                // Leave in-app new windows (Ctrl+N, tab dragged out) where mutter put them
                if (others.length > 0 && !fromShell) return;
                if (win.get_window_type() === Meta.WindowType.NORMAL) this._launched.delete(id);
                win.move_to_monitor(primary);
            })],
        ];
    }

    disable() {
        for (const [obj, id] of this._ids ?? []) obj.disconnect(id);
        this._ids = null;
        this._inj?.clear();
        this._inj = null;
        this._launched = null;
        this._pending = null;
    }
}
