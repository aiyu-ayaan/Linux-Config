import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {MprisPlayer} from 'resource:///org/gnome/shell/ui/mpris.js';
import {Urgency} from 'resource:///org/gnome/shell/ui/messageTray.js';
import {WorkspaceSwitcherPopup} from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const TOP_GAP = 3; // px between the top of the primary monitor and the island (top bar is 30 px)
const MAX_RADIUS = 32; // M3 Expressive "extra-large-increased"; below that the island is a full pill

// Size of each state. `width` is fixed; otherwise the content's natural width, clamped.
const VIEWS = {
    compact: {height: 24, minWidth: 96, maxWidth: 280},
    osd: {height: 36, minWidth: 280, maxWidth: 320},
    workspace: {height: 32, minWidth: 150, maxWidth: 420},
    notification: {height: 60, width: 420},
    media: {height: 88, width: 420},
};
// A peek returns to the resting state after this long. Higher priority peeks are not
// replaced by lower ones while they show.
const PEEK = {
    osd: {ms: 1600, priority: 3},
    notification: {ms: 4000, priority: 2},
    workspace: {ms: 1100, priority: 2},
    media: {ms: 4000, priority: 1},
};
const HOVER_LEAVE_MS = 450;

// M3 Expressive motion scheme springs (Compose MotionScheme.expressive()):
// growing uses the bouncy "fast spatial" spring, shrinking the calmer "default spatial" one.
const SPRING_GROW = {damping: 0.6, stiffness: 800};
const SPRING_SHRINK = {damping: 0.8, stiffness: 380};

// Damped spring (mass 1) driving several numbers at once, stepped on the actor's frame clock
class Spring {
    constructor(actor, onFrame) {
        this._onFrame = onFrame;
        this._pos = null;
        this._vel = {};
        this._timeline = new Clutter.Timeline({actor, duration: 60000});
        this._timeline.connect('new-frame', () => this._step());
    }

    jump(target) {
        this._timeline.stop();
        this._pos = {...target};
        this._target = {...target};
        this._vel = {};
        this._onFrame(this._pos);
    }

    to(target, spec) {
        if (!this._pos || !St.Settings.get().enable_animations) {
            this.jump(target);
            return;
        }
        this._target = {...target};
        this._spec = spec;
        if (!this._timeline.is_playing()) {
            this._last = GLib.get_monotonic_time();
            this._timeline.start();
        }
    }

    _step() {
        const now = GLib.get_monotonic_time();
        const dt = Math.min((now - this._last) / 1e6, 0.05);
        this._last = now;
        const {damping, stiffness} = this._spec;
        const friction = 2 * damping * Math.sqrt(stiffness);
        let settled = true;
        for (const key in this._target) {
            const goal = this._target[key];
            let x = this._pos[key], v = this._vel[key] ?? 0;
            for (let t = 0; t < dt; t += 0.004) { // 4 ms sub-steps keep the stiff spring stable
                const h = Math.min(0.004, dt - t);
                v += (-stiffness * (x - goal) - friction * v) * h;
                x += v * h;
            }
            if (Math.abs(x - goal) < 0.3 && Math.abs(v) < 3) {
                x = goal;
                v = 0;
            } else {
                settled = false;
            }
            this._pos[key] = x;
            this._vel[key] = v;
        }
        this._onFrame(this._pos);
        if (settled)
            this._timeline.stop();
    }

    destroy() {
        this._timeline.stop();
        this._timeline = null;
    }
}

const label = (style_class, props = {}) => {
    const l = new St.Label({style_class, y_align: Clutter.ActorAlign.CENTER, ...props});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
};
const stripMarkup = text => (text ?? '').replace(/<[^>]*>/g, '').replace(/\s*\n\s*/g, ' ');

export default class DynamicIsland extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._inj = new InjectionManager();
        this._signals = []; // [object, id] pairs for GObject signals
        this._current = null;
        this._peekId = 0;
        this._leaveId = 0;

        this._buildIsland();
        this._hookClock();
        this._hookOsd();
        this._hookWorkspaces();
        this._hookNotifications();
        this._watchPlayers();

        this._connect(Main.layoutManager, 'monitors-changed', () => this._relayout(true));
        this._show('compact');
    }

    disable() {
        for (const [obj, id] of this._signals) obj.disconnect(id);
        this._signals = null;
        for (const id of [this._peekId, this._leaveId]) if (id) GLib.source_remove(id);
        this._inj.clear();
        this._inj = null;

        if (this._nameSub)
            Gio.DBus.session.signal_unsubscribe(this._nameSub);
        for (const entry of this._players.values())
            for (const id of entry.ids) entry.player.disconnect(id);
        this._players = null;
        this._player = null;
        for (const [source, ids] of this._sources) ids.forEach(id => source.disconnect(id));
        this._sources = null;
        this._notification = null;

        const dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu)
            dateMenu.opacity = 255;

        this._spring.destroy();
        this._spring = null;
        this._island.destroy();
        this._island = null;
        this._views = null;
        this._settings = null;
    }

    _connect(obj, signal, handler) {
        this._signals.push([obj, obj.connect(signal, handler)]);
    }

    // ---- island and its views ----------------------------------------------------------

    _buildIsland() {
        this._island = new St.Widget({
            style_class: 'dynamic-island',
            reactive: true,
            track_hover: true,
            layout_manager: new Clutter.BinLayout(),
        });
        // Inner clip so the island's own shadow is not clipped, but content swapping is
        const clip = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
            x_expand: true,
            y_expand: true,
        });
        this._island.add_child(clip);

        this._views = {};
        const view = (name, props = {}) => {
            const v = new St.BoxLayout({
                style_class: `island-view island-${name}`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                visible: false,
                ...props,
            });
            v.set_pivot_point(0.5, 0.5);
            if (VIEWS[name].width)
                v.width = VIEWS[name].width;
            clip.add_child(v);
            this._views[name] = v;
            return v;
        };

        // Resting state: clock, plus cover art and level bars while something plays
        const compact = view('compact');
        this._miniArt = new St.Icon({style_class: 'island-mini-art', icon_size: 16, visible: false});
        this._clock = label('island-clock');
        this._bars = new St.BoxLayout({style_class: 'island-bars', y_align: Clutter.ActorAlign.CENTER, visible: false});
        for (let i = 0; i < 3; i++) {
            const bar = new St.Widget({style_class: 'island-bar', y_align: Clutter.ActorAlign.CENTER});
            bar.set_pivot_point(0.5, 0.5);
            bar.scale_y = 0.4;
            this._bars.add_child(bar);
        }
        compact.add_child(this._miniArt);
        compact.add_child(this._clock);
        compact.add_child(this._bars);

        // Volume / brightness / other OSD
        const osd = view('osd');
        this._osdIcon = new St.Icon({style_class: 'island-osd-icon', icon_size: 18, y_align: Clutter.ActorAlign.CENTER});
        this._osdLabel = label('island-osd-label');
        this._osdTrack = new St.Widget({style_class: 'island-level', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._osdFill = new St.Widget({style_class: 'island-level-fill'});
        this._osdTrack.add_child(this._osdFill);
        this._osdTrack.connect('notify::width', () => this._syncOsdFill(false));
        this._osdValue = label('island-value');
        for (const a of [this._osdIcon, this._osdLabel, this._osdTrack, this._osdValue])
            osd.add_child(a);

        // Workspace switch: name + Android-style page dots (active dot stretched)
        const ws = view('workspace');
        this._wsLabel = label('island-ws-label');
        this._wsDots = new St.BoxLayout({style_class: 'island-dots', y_align: Clutter.ActorAlign.CENTER});
        ws.add_child(this._wsLabel);
        ws.add_child(this._wsDots);

        // Notification preview
        const notif = view('notification');
        this._notifIcon = new St.Icon({style_class: 'island-notif-icon', icon_size: 32, y_align: Clutter.ActorAlign.CENTER});
        const notifText = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._notifTitle = label('island-title');
        this._notifBody = label('island-body');
        notifText.add_child(this._notifTitle);
        notifText.add_child(this._notifBody);
        notif.add_child(this._notifIcon);
        notif.add_child(notifText);

        // Media card: cover, title / artist, controls
        const media = view('media');
        this._cover = new St.Icon({style_class: 'island-cover', icon_size: 60, y_align: Clutter.ActorAlign.CENTER});
        const mediaText = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._trackTitle = label('island-title');
        this._trackArtist = label('island-body');
        mediaText.add_child(this._trackTitle);
        mediaText.add_child(this._trackArtist);
        const controls = new St.BoxLayout({style_class: 'island-controls', y_align: Clutter.ActorAlign.CENTER});
        const button = (icon, action, extra = '') => {
            const b = new St.Button({
                style_class: `island-media-button ${extra}`,
                can_focus: true,
                child: new St.Icon({icon_name: icon, icon_size: 16}),
            });
            b.connect('clicked', () => {
                const p = this._activePlayer();
                if (p)
                    p[action]();
            });
            controls.add_child(b);
            return b;
        };
        button('media-skip-backward-symbolic', 'previous');
        this._playButton = button('media-playback-start-symbolic', 'playPause', 'island-play');
        button('media-skip-forward-symbolic', 'next');
        media.add_child(this._cover);
        media.add_child(mediaText);
        media.add_child(controls);

        this._island.connect('button-release-event', () => this._onClick());
        this._island.connect('notify::hover', () => this._onHover());

        this._spring = new Spring(this._island, p => this._applyGeometry(p));
        // Above the top bar, below nothing else in the chrome; hidden for fullscreen windows
        Main.layoutManager.addChrome(this._island, {trackFullscreen: true});
    }

    _applyGeometry({x, y, width, height}) {
        this._island.set_position(Math.round(x), Math.round(y));
        this._island.set_size(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
        // Shape morph: a full pill while small, the rounded M3 card shape once it is tall
        this._island.style = `border-radius: ${Math.round(Math.min(height / 2, MAX_RADIUS))}px;`;
    }

    _relayout(jump = false) {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._current)
            return;
        const spec = VIEWS[this._current];
        let width = spec.width;
        if (!width) {
            const [, natural] = this._views[this._current].get_preferred_width(spec.height);
            width = Math.min(Math.max(Math.ceil(natural), spec.minWidth), spec.maxWidth);
        }
        const target = {
            x: monitor.x + Math.round((monitor.width - width) / 2),
            y: monitor.y + TOP_GAP,
            width,
            height: spec.height,
        };
        const growing = !this._lastTarget || target.width * target.height > this._lastTarget.width * this._lastTarget.height;
        this._lastTarget = target;
        if (jump)
            this._spring.jump(target);
        else
            this._spring.to(target, growing ? SPRING_GROW : SPRING_SHRINK);
    }

    // Switch to `name`; with a peek entry it falls back to the resting state after a while
    _show(name, peek = null) {
        if (this._peekId) {
            GLib.source_remove(this._peekId);
            this._peekId = 0;
        }
        if (peek) {
            this._peekPriority = peek.priority;
            this._peekId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, peek.ms, () => {
                this._peekId = 0;
                this._show(this._restingView());
                return GLib.SOURCE_REMOVE;
            });
        }

        const prevName = this._current;
        const next = this._views[name];
        if (prevName !== name) {
            const animate = St.Settings.get().enable_animations;
            const prev = prevName ? this._views[prevName] : null;
            this._current = name;
            if (prev) {
                prev.remove_all_transitions();
                // M3 emphasized-accelerate exit, then emphasized-decelerate enter
                prev.ease({
                    opacity: 0,
                    scale_x: 0.94,
                    scale_y: 0.94,
                    duration: animate ? 120 : 0,
                    mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                    onComplete: () => {
                        if (this._current !== prevName)
                            prev.hide();
                    },
                });
            }
            next.remove_all_transitions();
            next.show();
            next.set({opacity: 0, scale_x: 0.9, scale_y: 0.9});
            next.ease({
                opacity: 255,
                scale_x: 1,
                scale_y: 1,
                delay: animate && prev ? 70 : 0,
                duration: animate ? 320 : 0,
                mode: Clutter.AnimationMode.EASE_OUT_EXPO,
            });
        }
        this._relayout();
    }

    _peek(name) {
        // A lower priority peek does not cut off one that is still showing
        if (this._peekId && PEEK[name].priority < this._peekPriority)
            return;
        this._show(name, PEEK[name]);
    }

    _restingView() {
        return this._island.hover && this._hasMedia() ? 'media' : 'compact';
    }

    _onHover() {
        if (this._leaveId) {
            GLib.source_remove(this._leaveId);
            this._leaveId = 0;
        }
        if (this._island.hover) {
            if (this._current === 'compact' && this._hasMedia())
                this._show('media');
        } else if (!this._peekId && this._current === 'media') {
            this._leaveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_LEAVE_MS, () => {
                this._leaveId = 0;
                if (!this._peekId)
                    this._show(this._restingView());
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _onClick() {
        switch (this._current) {
        case 'compact':
            Main.panel.statusArea.dateMenu?.menu.toggle();
            break;
        case 'media':
            this._activePlayer()?.raise();
            break;
        case 'notification':
            this._notification?.activate();
            this._show(this._restingView());
            break;
        default:
            this._show(this._restingView());
        }
        return Clutter.EVENT_STOP;
    }

    // ---- clock (the date menu stays in place, invisible, so its calendar opens under the island)

    _hookClock() {
        const dateMenu = Main.panel.statusArea.dateMenu;
        if (!dateMenu)
            return;
        dateMenu.opacity = 0;
        const clock = dateMenu._clockDisplay;
        const sync = () => {
            this._clock.text = clock.text;
            if (this._current === 'compact')
                this._relayout();
        };
        this._connect(clock, 'notify::text', sync);
        this._clock.text = clock.text;
    }

    // ---- OSD ---------------------------------------------------------------------------

    _hookOsd() {
        const self = this;
        this._inj.overrideMethod(Main.osdWindowManager, 'show', original => function (monitorIndex, icon, text, level, maxLevel) {
            if (!self._settings.get_boolean('replace-osd'))
                return original.call(this, monitorIndex, icon, text, level, maxLevel);
            self._showOsd(icon, text, level, maxLevel);
            return undefined;
        });
    }

    _showOsd(icon, text, level, maxLevel) {
        this._osdIcon.gicon = icon;
        const hasLevel = level !== null && level !== undefined;
        this._osdLabel.text = text ?? '';
        this._osdLabel.visible = !!text;
        this._osdTrack.visible = hasLevel;
        this._osdValue.visible = hasLevel;
        if (hasLevel) {
            this._osdFraction = Math.max(0, Math.min(level / (maxLevel || 1), 1));
            this._osdFill.style_class = level > 1 ? 'island-level-fill overdrive' : 'island-level-fill';
            this._osdValue.text = `${Math.round(level * 100)}`;
            this._syncOsdFill(this._current === 'osd');
        }
        this._peek('osd');
    }

    _syncOsdFill(animate) {
        const width = Math.round(this._osdTrack.width * (this._osdFraction ?? 0));
        this._osdFill.remove_all_transitions();
        if (animate)
            this._osdFill.ease({width, duration: 180, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        else
            this._osdFill.width = width;
    }

    // ---- workspaces (read only: nothing here changes workspaces) -------------------------

    _hookWorkspaces() {
        const self = this;
        // GNOME's own switcher popup would show at the same time; keep it invisible
        this._inj.overrideMethod(WorkspaceSwitcherPopup.prototype, 'display', original => function (...args) {
            original.call(this, ...args);
            if (self._settings.get_boolean('workspace-peek')) {
                this.remove_all_transitions();
                this.opacity = 0;
            }
        });
        this._wmPrefs = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        const wm = global.workspace_manager;
        this._connect(wm, 'active-workspace-changed', () => {
            if (this._settings.get_boolean('workspace-peek'))
                this._showWorkspace();
        });
        this._connect(wm, 'notify::n-workspaces', () => this._syncDots(false));
        this._syncDots(false);
    }

    _syncDots(animate) {
        const wm = global.workspace_manager;
        const n = wm.n_workspaces, active = wm.get_active_workspace_index();
        while (this._wsDots.get_n_children() < n)
            this._wsDots.add_child(new St.Widget({style_class: 'island-dot', y_align: Clutter.ActorAlign.CENTER}));
        while (this._wsDots.get_n_children() > n)
            this._wsDots.get_last_child().destroy();
        this._wsDots.get_children().forEach((dot, i) => {
            const on = i === active;
            if (on)
                dot.add_style_class_name('active');
            else
                dot.remove_style_class_name('active');
            dot.remove_all_transitions();
            dot.ease({
                width: on ? 20 : 6,
                duration: animate ? 420 : 0,
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            });
        });
    }

    _showWorkspace() {
        const index = global.workspace_manager.get_active_workspace_index();
        const names = this._wmPrefs.get_strv('workspace-names');
        this._wsLabel.text = names[index] || `Workspace ${index + 1}`;
        this._syncDots(true);
        this._peek('workspace');
    }

    // ---- notifications -----------------------------------------------------------------

    _hookNotifications() {
        const tray = Main.messageTray;
        this._sources = new Map(); // source -> signal ids
        this._connect(tray, 'source-added', (t, source) => this._watchSource(source));
        tray.getSources().forEach(s => this._watchSource(s));
    }

    _watchSource(source) {
        const ids = [
            source.connect('notification-request-banner', (s, n) => this._onBanner(n)),
            source.connect('destroy', () => {
                ids.forEach(id => source.disconnect(id));
                this._sources?.delete(source);
            }),
        ];
        this._sources.set(source, ids);
    }

    _onBanner(notification) {
        if (!this._settings.get_boolean('notification-peek'))
            return;
        // Same rules GNOME uses for showing a banner
        if (notification.acknowledged || notification.urgency === Urgency.LOW)
            return;
        if (!notification.source.policy.showBanners && notification.urgency !== Urgency.CRITICAL)
            return;
        this._notification = notification;
        notification.connect('destroy', () => {
            if (this._notification === notification)
                this._notification = null;
        });
        this._notifIcon.gicon = notification.gicon ?? notification.source.icon ??
            new Gio.ThemedIcon({name: 'dialog-information-symbolic'});
        this._notifTitle.text = stripMarkup(notification.title || notification.source.title);
        this._notifBody.text = stripMarkup(notification.body);
        this._notifBody.visible = !!this._notifBody.text;
        this._peek('notification');
    }

    // ---- media (MPRIS) -----------------------------------------------------------------

    _watchPlayers() {
        this._players = new Map(); // bus name -> {player, ids, title, closed}
        this._player = null;
        const bus = Gio.DBus.session;
        this._nameSub = bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus',
            'NameOwnerChanged', '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (c, sender, path, iface, signal, params) => {
                const [name, oldOwner, newOwner] = params.deepUnpack();
                if (name.startsWith(MPRIS_PREFIX) && newOwner && !oldOwner)
                    this._addPlayer(name);
            });
        bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'ListNames', null, null, Gio.DBusCallFlags.NONE, -1, null, (c, res) => {
                try {
                    const [names] = c.call_finish(res).deepUnpack();
                    names.filter(n => n.startsWith(MPRIS_PREFIX)).forEach(n => this._addPlayer(n));
                } catch (e) {
                    logError(e, 'dynamic-island: ListNames');
                }
            });
    }

    _addPlayer(busName) {
        if (!this._players || this._players.has(busName))
            return;
        const entry = {player: new MprisPlayer(busName), title: null, closed: false};
        entry.ids = [
            entry.player.connect('changed', () => this._onPlayerChanged(entry)),
            entry.player.connect('closed', () => {
                entry.closed = true;
                this._players?.delete(busName);
                if (this._player === entry) {
                    this._player = [...this._players.values()].find(e => this._isPlaying(e)) ?? null;
                    this._syncMedia();
                }
            }),
        ];
        this._players.set(busName, entry);
    }

    _isPlaying(entry) {
        return entry && !entry.closed && entry.player.status === 'Playing';
    }

    _onPlayerChanged(entry) {
        if (entry.closed || !this._players)
            return;
        const p = entry.player;
        if (this._isPlaying(entry) || !this._player || this._player.closed ||
            (!this._isPlaying(this._player) && p.status !== 'Stopped'))
            this._player = entry;
        const newTrack = p.trackTitle !== entry.title;
        entry.title = p.trackTitle;
        if (this._player !== entry)
            return;
        this._syncMedia();
        if (newTrack && this._isPlaying(entry) && this._settings.get_boolean('media-peek') && !this._island.hover)
            this._peek('media');
    }

    _activePlayer() {
        return this._player && !this._player.closed ? this._player.player : null;
    }

    _hasMedia() {
        const p = this._activePlayer();
        return !!p && p.status !== 'Stopped' && !!p.trackTitle;
    }

    _syncMedia() {
        const has = this._hasMedia();
        const p = this._activePlayer();
        const playing = this._isPlaying(this._player);
        if (has) {
            const gicon = p.trackCoverUrl
                ? new Gio.FileIcon({file: Gio.File.new_for_uri(p.trackCoverUrl)})
                : p.app?.get_icon() ?? new Gio.ThemedIcon({name: 'audio-x-generic-symbolic'});
            this._cover.gicon = gicon;
            this._miniArt.gicon = gicon;
            this._trackTitle.text = p.trackTitle;
            this._trackArtist.text = (p.trackArtists ?? []).join(', ');
            this._playButton.child.icon_name = playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
            // Expressive shape morph: the play button is a circle while paused, a rounded square while playing
            if (playing)
                this._playButton.add_style_pseudo_class('checked');
            else
                this._playButton.remove_style_pseudo_class('checked');
        }
        this._miniArt.visible = has;
        this._bars.visible = has;
        this._animateBars(has && playing);

        if (!has && this._current === 'media')
            this._show('compact');
        else if (this._current === 'compact')
            this._relayout();
    }

    _animateBars(on) {
        if (on === this._barsOn)
            return;
        this._barsOn = on;
        this._bars.get_children().forEach((bar, i) => {
            bar.remove_all_transitions();
            bar.scale_y = 0.4;
            if (on && St.Settings.get().enable_animations) {
                bar.ease({
                    scale_y: 1,
                    duration: 360 + i * 130,
                    mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                    repeatCount: -1,
                    autoReverse: true,
                });
            }
        });
    }
}
