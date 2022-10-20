/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = 'battery-time-gettext';

const { Clutter, GObject, St, UPowerGlib: UPower, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const System = imports.ui.main.panel.statusArea.quickSettings._system
const Indicator = System._indicator
const SystemMenu = System._systemItem
const PowerToggle = SystemMenu._powerToggle


const { loadInterfaceXML } = imports.misc.fileUtils;

const BUS_NAME = 'org.freedesktop.UPower';
const OBJECT_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';

const DisplayDeviceInterface = loadInterfaceXML('org.freedesktop.UPower.Device');
const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(DisplayDeviceInterface);

const _ = ExtensionUtils.gettext;

// See https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-42/js/ui/status/power.js.
class Extension {
    constructor(uuid) {
        this._uuid = uuid;

        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        //Stop original proxy
        PowerToggle._proxy = null;
	//It's easier to use a new label than to unbind.
        System._percentageLabel.destroy();
        System._percentageLabel = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        System.add_child(System._percentageLabel)

        //Run our proxy
        this._proxy = new PowerManagerProxy(Gio.DBus.system, BUS_NAME, OBJECT_PATH,
            (proxy, error) => {
                if (error)
                    console.error(error.message);
                else
                    this._proxy.connect('g-properties-changed', () => this.sync());
                this.sync();
            });
        PowerToggle._proxy = this._proxy
        this.sync();
    }

    disable() {
        //Disconnect from our sync.
        PowerToggle._proxy = null;
        this._proxy = null;
        //Reconnect with original _sync.
        PowerToggle._proxy = new PowerManagerProxy(Gio.DBus.system, BUS_NAME, OBJECT_PATH,
            (proxy, error) => {
                if (error)
                    console.error(error.message);
                else
                    PowerToggle._proxy.connect('g-properties-changed', () => PowerToggle._sync());
                PowerToggle._sync();
            });
        //Rebind property with battery %,we will use the label we allocated to continue,as we destroyed original percentageLabel.
        PowerToggle.bind_property('label',
            System._percentageLabel, 'text',
            GObject.BindingFlags.SYNC_CREATE);
    }

    // Show remaining time in quick menu.
    // This function is derived from GNOME shell, because it's terrible to patch within a function
    sync() {
        PowerToggle.visible = this._proxy.IsPresent;
        if (!PowerToggle.visible)
            return;
        // The icons
        let chargingState = this._proxy.State === UPower.DeviceState.CHARGING
            ? '-charging' : '';
        let fillLevel = 10 * Math.floor(this._proxy.Percentage / 10);
        const charged =
            this._proxy.State === UPower.DeviceState.FULLY_CHARGED ||
            (this._proxy.State === UPower.DeviceState.CHARGING && fillLevel === 100);
        const icon = charged
            ? 'battery-level-100-charged-symbolic'
            : `battery-level-${fillLevel}${chargingState}-symbolic`;

        const gicon = new Gio.ThemedIcon({
            name: icon,
            use_default_fallbacks: false,
        });
        let remaining = (this._proxy.State === UPower.DeviceState.CHARGING) ? this._proxy.TimeToFull : this._proxy.TimeToEmpty
        let hours = remaining / 3600;
        let mins = remaining % 3600 / 60;
        PowerToggle.set({
            label: remaining ? _('%d:%02d').format(hours,mins) : _('%d\u2009%%').format(this._proxy.Percentage),
            fallback_icon_name: this._proxy.IconName,
            gicon,
        });
        System._percentageLabel.set_text(_('%d\u2009%%').format(this._proxy.Percentage))
    }

}

function init(meta) {
    return new Extension(meta.uuid);
}
