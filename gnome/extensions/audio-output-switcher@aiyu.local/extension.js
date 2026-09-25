// Audio Output Switcher: volume slider + every output port in one top-bar menu.
//   Volume / mute  -> the shell's shared Gvc mixer (same as GNOME's own slider, no subprocess per change)
//   Output list    -> pactl JSON, because Gvc hides ports PipeWire marks "not available"
//                     (laptop speakers behind a misdetected headphone jack)
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const PACTL = GLib.find_program_in_path('pactl');
const SCROLL_STEP = 0.05;

// First existing name wins (Papirus has the USB / analog variants, Adwaita the generic ones)
function portIcons(sink, port) {
    const props = sink.properties ?? {};
    if (sink.name.startsWith('bluez'))
        return ['audio-headphones-symbolic', 'bluetooth-active-symbolic'];
    switch (port?.type) {
    case 'Speaker': return ['audio-speakers-symbolic'];
    case 'Headphones': return ['audio-headphones-symbolic'];
    case 'Headset': return ['audio-headset-symbolic', 'audio-headphones-symbolic'];
    case 'HDMI':
    case 'DisplayPort': return ['video-display-symbolic'];
    }
    if (props['device.form_factor'] === 'headset')
        return ['audio-headset-symbolic', 'audio-headphones-symbolic'];
    if (props['device.bus'] === 'usb')
        return ['audio-card-usb-symbolic', 'audio-card-symbolic'];
    return ['audio-speakers-symbolic', 'audio-card-symbolic'];
}

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
                    reject(new Error(`${argv.slice(1).join(' ')}: ${stderr.trim() || 'failed'}`));
            } catch (e) {
                reject(e);
            }
        });
    });
}

// One entry per (sink, port); sinks without ports (Bluetooth, virtual) get a single entry
async function listOutputs() {
    const [sinks, defaultSink] = await Promise.all([
        run([PACTL, '-f', 'json', 'list', 'sinks']).then(JSON.parse),
        run([PACTL, 'get-default-sink']).then(s => s.trim()),
    ]);
    const outputs = [];
    for (const sink of sinks) {
        const ports = sink.ports?.length ? sink.ports : [null];
        const multi = ports.length > 1;
        for (const port of ports) {
            outputs.push({
                key: `${sink.name}|${port?.name ?? ''}`,
                sink: sink.name,
                port: port?.name ?? null,
                title: multi ? port.description : sink.description,
                subtitle: multi ? sink.description : (port?.description ?? ''),
                missing: port?.availability === 'not available',
                active: sink.name === defaultSink && (!port || port.name === sink.active_port),
                icons: portIcons(sink, port),
            });
        }
    }
    return outputs;
}

const OutputItem = GObject.registerClass(
class OutputItem extends PopupMenu.PopupBaseMenuItem {
    _init(output) {
        super._init({style_class: 'audio-output-item'});
        this.add_child(new St.Icon({
            gicon: Gio.ThemedIcon.new_from_names(output.icons),
            style_class: 'popup-menu-icon',
        }));
        const text = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        text.add_child(new St.Label({text: output.title}));
        const sub = [output.subtitle, output.missing && 'not detected'].filter(Boolean).join(' · ');
        if (sub)
            text.add_child(new St.Label({text: sub, style: 'font-size: 0.85em; color: rgba(255,255,255,0.55);'}));
        this.add_child(text);
        this.output = output;
    }

    setActive(active) {
        this.setOrnament(active ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }
});

const AudioButton = GObject.registerClass(
class AudioButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'Audio Output Switcher');
        this._icon = new St.Icon({icon_name: 'audio-speakers-symbolic', style_class: 'system-status-icon'});
        this.add_child(this._icon);
        this._items = new Map();
        this._signature = '';

        // Volume row: mute button + slider + percentage
        const volumeItem = new PopupMenu.PopupBaseMenuItem({activate: false});
        this._muteButton = new St.Button({
            child: new St.Icon({icon_name: 'audio-volume-high-symbolic', style_class: 'popup-menu-icon'}),
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._muteButton.connect('clicked', () => this._toggleMute());
        this._slider = new Slider(0);
        this._slider.x_expand = true;
        this._slider.accessible_name = 'Volume';
        this._percent = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'min-width: 3.2em; text-align: right; font-feature-settings: "tnum";',
        });
        volumeItem.add_child(this._muteButton);
        volumeItem.add_child(this._slider);
        volumeItem.add_child(this._percent);
        volumeItem.connect('key-press-event', (_a, e) => this._slider.emit('key-press-event', e));
        this._sliderId = this._slider.connect('notify::value', () => this._setVolume(this._slider.value));
        this.menu.addMenuItem(volumeItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Output'));
        this._outputs = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._outputs);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Sound Settings', () => {
            run(['gnome-control-center', 'sound']).catch(e => console.error(e.message));
        });

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._refresh();
        });
        this.connect('scroll-event', (_a, event) => this._onScroll(event));

        // Mixer: default sink volume/mute, and device changes that should refresh the list
        this._control = getMixerControl();
        this._control.connectObject(
            'default-sink-changed', () => {
                this._bindStream();
                this._queueRefresh();
            },
            'state-changed', () => {
                this._bindStream();
                this._queueRefresh();
            },
            'output-added', () => this._queueRefresh(),
            'output-removed', () => this._queueRefresh(),
            'active-output-update', () => this._queueRefresh(),
            'card-added', () => this._queueRefresh(),
            'card-removed', () => this._queueRefresh(),
            this);
        this._bindStream();
        this._refresh();
    }

    _bindStream() {
        const stream = this._control.get_default_sink();
        if (stream === this._stream)
            return;
        this._stream?.disconnectObject(this);
        this._stream = stream;
        this._stream?.connectObject(
            'notify::volume', () => this._syncVolume(),
            'notify::is-muted', () => this._syncVolume(),
            this);
        this._syncVolume();
    }

    _syncVolume() {
        const stream = this._stream;
        const max = this._control.get_vol_max_norm();
        const value = !stream || stream.is_muted ? 0 : stream.volume / max;
        if (!this._slider._dragging) {
            this._slider.block_signal_handler(this._sliderId);
            this._slider.value = Math.min(1, value);
            this._slider.unblock_signal_handler(this._sliderId);
        }
        this._percent.text = stream ? `${Math.round(value * 100)}%` : '';
        let name = 'audio-volume-muted-symbolic';
        if (stream && value > 0)
            name = `audio-volume-${value < 0.34 ? 'low' : value < 0.67 ? 'medium' : 'high'}-symbolic`;
        this._muteButton.child.icon_name = name;
    }

    _setVolume(value) {
        const stream = this._stream;
        if (!stream)
            return;
        const wasMuted = stream.is_muted;
        stream.volume = Math.round(Math.min(1, Math.max(0, value)) * this._control.get_vol_max_norm());
        if (value < 0.005) {
            if (!wasMuted)
                stream.change_is_muted(true);
        } else if (wasMuted) {
            stream.change_is_muted(false);
        }
        stream.push_volume();
        this._percent.text = `${Math.round(value * 100)}%`;
    }

    _toggleMute() {
        const stream = this._stream;
        if (!stream)
            return;
        if (stream.is_muted && stream.volume === 0) {
            stream.volume = Math.round(0.25 * this._control.get_vol_max_norm());
            stream.push_volume();
        }
        stream.change_is_muted(!stream.is_muted);
    }

    // Scroll on the panel icon changes the volume and shows GNOME's OSD
    _onScroll(event) {
        if (!this._stream)
            return Clutter.EVENT_PROPAGATE;
        let delta = 0;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP: delta = SCROLL_STEP; break;
        case Clutter.ScrollDirection.DOWN: delta = -SCROLL_STEP; break;
        case Clutter.ScrollDirection.SMOOTH: delta = -event.get_scroll_delta()[1] * SCROLL_STEP; break;
        }
        if (!delta)
            return Clutter.EVENT_STOP;
        const current = this._stream.is_muted ? 0 : this._stream.volume / this._control.get_vol_max_norm();
        const value = Math.min(1, Math.max(0, current + delta));
        this._setVolume(value);
        Main.osdWindowManager.show(-1, Gio.ThemedIcon.new(this._muteButton.child.icon_name),
            this._outputName ?? null, value, 1);
        return Clutter.EVENT_STOP;
    }

    _queueRefresh() {
        if (this._refreshId)
            return;
        this._refreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._refreshId = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _refresh() {
        if (!PACTL) {
            this._showMessage('pactl not found (install pulseaudio-utils)');
            return;
        }
        const serial = this._serial = (this._serial ?? 0) + 1;
        let outputs;
        try {
            outputs = await listOutputs();
        } catch (e) {
            console.error(`[audio-output-switcher] ${e.message}`);
            if (serial === this._serial && this._outputs)
                this._showMessage('Could not read outputs');
            return;
        }
        if (serial !== this._serial || !this._outputs)
            return;  // a newer refresh is running, or we were destroyed
        this._render(outputs);
    }

    // Rebuild only when the set of outputs changed; otherwise just move the check mark,
    // so an open menu is not torn down under the pointer
    _render(outputs) {
        const signature = outputs.map(o => `${o.key}:${o.title}:${o.subtitle}:${o.missing}`).join('\n');
        if (signature !== this._signature) {
            this._signature = signature;
            this._outputs.removeAll();
            this._items.clear();
            for (const output of outputs) {
                const item = new OutputItem(output);
                item.connect('activate', () => this._select(item.output));
                this._items.set(output.key, item);
                this._outputs.addMenuItem(item);
            }
            if (!outputs.length)
                this._showMessage('No outputs');
        }
        const active = outputs.find(o => o.active);
        for (const output of outputs)
            this._items.get(output.key)?.setActive(output.active);
        this._outputName = active?.title;
        this._icon.gicon = Gio.ThemedIcon.new_from_names(active?.icons ?? ['audio-speakers-symbolic']);
    }

    _showMessage(text) {
        this._signature = '';
        this._items.clear();
        this._outputs.removeAll();
        this._outputs.addMenuItem(new PopupMenu.PopupMenuItem(text, {reactive: false}));
    }

    async _select(output) {
        try {
            // Set the port directly: works even when PipeWire marks it "not available"
            if (output.port)
                await run([PACTL, 'set-sink-port', output.sink, output.port]);
            await run([PACTL, 'set-default-sink', output.sink]);
        } catch (e) {
            Main.notifyError('Audio Output Switcher', e.message);
        }
        this._refresh();
    }

    destroy() {
        this._serial = -1;
        if (this._refreshId)
            GLib.source_remove(this._refreshId);
        this._refreshId = 0;
        this._control.disconnectObject(this);
        this._stream?.disconnectObject(this);
        this._stream = null;
        this._outputs = null;
        super.destroy();
    }
});

export default class AudioOutputSwitcher extends Extension {
    enable() {
        this._button = new AudioButton();
        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
    }

    disable() {
        this._button?.destroy();
        this._button = null;
    }
}
