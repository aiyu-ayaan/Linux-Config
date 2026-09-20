import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

// Windows of `app` on the active workspace (sticky windows count everywhere)
function localWindows(app) {
    const ws = global.workspace_manager.get_active_workspace();
    return app.get_windows().filter(w => w.located_on_workspace(ws));
}

export default class WorkspaceIsolation extends Extension {
    enable() {
        this._inj = new InjectionManager();
        const proto = AppDisplay.AppIcon.prototype;

        // Click / Enter: activate only if the app has a window here, else open a new one here
        this._inj.overrideMethod(proto, 'activate', original => function (...args) {
            const app = this.app;
            if (app && app.state === Shell.AppState.RUNNING &&
                app.get_windows().length > 0 && localWindows(app).length === 0 &&
                app.can_open_new_window()) {
                if (!this.updating) {
                    app.open_new_window(-1);
                    Main.overview.hide();
                }
                return;
            }
            original.call(this, ...args);
        });

        // Running dot: only when the app has a window on this workspace
        this._inj.overrideMethod(proto, '_updateRunningStyle', original => function (...args) {
            original.call(this, ...args);
            if (this.app && this.app.state === Shell.AppState.RUNNING &&
                localWindows(this.app).length === 0) {
                this.remove_style_pseudo_class('running');
                this._dot?.hide();
            }
        });

        this._refresh = () => {
            const box = Main.overview.dash?._box;
            if (!box) return;
            for (const item of box.get_children()) {
                const icon = item.child?._delegate ?? item.child;
                icon?._updateRunningStyle?.();
            }
        };
        const wm = global.workspace_manager;
        this._ids = [
            [wm, wm.connect('active-workspace-changed', this._refresh)],
            [global.display, global.display.connect('window-entered-monitor', this._refresh)],
            [wm, wm.connect('workspace-switched', this._refresh)],
        ];
        this._refresh();
    }

    disable() {
        for (const [obj, id] of this._ids ?? []) obj.disconnect(id);
        this._ids = null;
        this._inj?.clear();
        this._inj = null;
        this._refresh?.();
        this._refresh = null;
    }
}
