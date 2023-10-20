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

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import UPower from 'gi://UPowerGlib';

import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import {
    Extension,
    InjectionManager,
    gettext as _
} from 'resource:///org/gnome/shell/extensions/extension.js';

// See https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-42/js/ui/status/power.js.
export default class BatteryTimeExtension extends Extension {
    constructor(metadata) {
        super(metadata);

    }

    enable() {
        // FIXME: There should be a better way to monitor this.
        this._injectionManager = new InjectionManager();
        this.interval = setInterval(() => {
            const System = panel.statusArea.quickSettings._system;
            if (!System) return;
            else clearInterval(this.interval);

            //It's easier to use a new label than to unbind.
            System._percentageLabel.destroy();
            System._percentageLabel = new St.Label({
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            System.add_child(System._percentageLabel)

            // Override the sync method in powerToggle
            const powerToggle = System._systemItem._powerToggle;
            this._injectionManager.overrideMethod(powerToggle, '_sync',
                originalMethod => this.sync.bind(powerToggle));
            this.sync.call(powerToggle); // Synchronise once after override
        }, 50);
    }

    disable() {
        this._injectionManager.clear();
        this._injectionManager = null;
        clearInterval(this.interval);
        //Rebind property with battery %,we will use the label we allocated to continue,as we destroyed original percentageLabel.
        const System = panel.statusArea.quickSettings._system;
        const powerToggle = System._systemItem._powerToggle;
        powerToggle.bind_property('title',
            System._percentageLabel, 'text',
            GObject.BindingFlags.SYNC_CREATE);
    }

    // Show remaining time in quick menu.
    // This function is derived from GNOME shell, because it's terrible to patch within a function
    sync() {
        this.visible = this._proxy.IsPresent;
        if (!this.visible) {
            return;
        }
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
        this.set({
            title: remaining ? _('%d:%02d').format(hours,mins) : _('%d\u2009%%').format(this._proxy.Percentage),
            fallback_icon_name: this._proxy.IconName,
            gicon,
        });
        const System = panel.statusArea.quickSettings._system;
        System._percentageLabel.set_text(_('%d\u2009%%').format(this._proxy.Percentage))
    }

}
