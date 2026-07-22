'use strict';
'require view';
'require rpc';
'require uci';
'require ui';
'require fs';

var callScan = rpc.declare({
  object: 'iwinfo',
  method: 'scan',
  params: [ 'device' ],
  nobatch: true,
  expect: { results: [] }
});

function notify(message, error) {
  ui.addNotification(null, E('p', {}, message), error ? 'error' : 'info');
}

function profileId(ssid) {
  var hash = 2166136261;
  for (var i = 0; i < ssid.length; i++) {
    hash ^= ssid.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'rdz_' + (hash >>> 0).toString(16);
}

function encryptionFor(network) {
  var enc = network.encryption || {};
  if (!enc.enabled)
    return 'none';

  var wpa = L.toArray(enc.wpa).map(Number);
  return wpa.indexOf(3) > -1 ? 'sae-mixed' : 'psk2';
}

function securityLabel(network) {
  var enc = encryptionFor(network);
  if (enc === 'none') return _('Open');
  if (enc === 'sae-mixed') return _('WPA2/WPA3');
  return _('WPA2');
}

function runReconnect(sectionName) {
  return fs.exec_direct('/usr/libexec/rdzbridge-reconnect', [ sectionName ]).then(function(output) {
    var result;
    try {
      result = JSON.parse(output || '{}');
    }
    catch (error) {
      throw new Error(_('Ongeldig antwoord van de wifi-backend.'));
    }

    if (!result.ok)
      throw new Error(result.message || _('De hotspotverbinding kon niet worden opgebouwd.'));

    return result;
  });
}

return view.extend({
  load: function() {
    return uci.load([ 'wireless', 'network', 'firewall' ]);
  },

  getRadio: function() {
    var radios = uci.sections('wireless', 'wifi-device');
    return radios.length ? radios[0]['.name'] : null;
  },

  getProfiles: function() {
    return uci.sections('wireless', 'wifi-iface').filter(function(section) {
      return section.rdz_profile === '1';
    });
  },

  ensureRouting: function() {
    if (!uci.get('network', 'wwan'))
      uci.add('network', 'interface', 'wwan');

    uci.set('network', 'wwan', 'proto', 'dhcp');
    uci.set('network', 'wwan', 'peerdns', '1');
    uci.set('network', 'wwan', 'metric', '10');

    var zones = uci.sections('firewall', 'zone');
    var wan = zones.find(function(zone) { return zone.name === 'wan'; });
    var wanSid = wan ? wan['.name'] : uci.add('firewall', 'zone', 'rdz_wan');

    uci.set('firewall', wanSid, 'name', 'wan');
    uci.set('firewall', wanSid, 'input', 'REJECT');
    uci.set('firewall', wanSid, 'output', 'ACCEPT');
    uci.set('firewall', wanSid, 'forward', 'REJECT');
    uci.set('firewall', wanSid, 'masq', '1');
    uci.set('firewall', wanSid, 'mtu_fix', '1');

    var networks = L.toArray(uci.get('firewall', wanSid, 'network'));
    if (networks.indexOf('wwan') < 0) {
      networks.push('wwan');
      uci.set('firewall', wanSid, 'network', networks);
    }

    var forwarding = uci.sections('firewall', 'forwarding').find(function(section) {
      return section.src === 'lan' && section.dest === 'wan';
    });

    if (!forwarding) {
      var forwardSid = uci.add('firewall', 'forwarding', 'rdz_lan_wan');
      uci.set('firewall', forwardSid, 'src', 'lan');
      uci.set('firewall', forwardSid, 'dest', 'wan');
    }
  },

  activateProfile: function(sectionName, button) {
    var profiles = this.getProfiles();
    profiles.forEach(function(profile) {
      uci.set('wireless', profile['.name'], 'disabled', profile['.name'] === sectionName ? '0' : '1');
    });
    uci.set('wireless', sectionName, 'rdz_last_used', String(Date.now()));
    this.ensureRouting();

    if (button) {
      button.disabled = true;
      button.textContent = _('Verbinden…');
    }

    return uci.save()
      .then(function() { return uci.apply(); })
      .then(function() { return runReconnect(sectionName); })
      .then(function(result) {
        notify(_('Verbonden. WWAN-adres: %s').format(result.ip || '—'));
        window.setTimeout(function() { window.location.href = L.url('admin/rdzbridge/overview'); }, 1200);
      })
      .catch(function(error) {
        if (button) {
          button.disabled = false;
          button.textContent = _('Verbinden');
        }
        notify(error.message || String(error), true);
        throw error;
      });
  },

  forgetProfile: function(sectionName) {
    uci.remove('wireless', sectionName);
    return uci.save().then(function() { return uci.apply(); });
  },

  saveProfile: function(network, password, encryption) {
    var radio = this.getRadio();
    if (!radio)
      return Promise.reject(new Error(_('Geen wifi-radio gevonden.')));

    if (encryption !== 'none' && (!password || password.length < 8))
      return Promise.reject(new Error(_('Het wifiwachtwoord moet minimaal 8 tekens bevatten.')));

    var existing = this.getProfiles().find(function(profile) {
      return profile.ssid === network.ssid;
    });
    var sid = existing ? existing['.name'] : profileId(network.ssid);

    if (!existing && uci.get('wireless', sid))
      sid = uci.add('wireless', 'wifi-iface');
    else if (!existing)
      uci.add('wireless', 'wifi-iface', sid);

    this.getProfiles().forEach(function(profile) {
      uci.set('wireless', profile['.name'], 'disabled', '1');
    });

    uci.set('wireless', radio, 'disabled', '0');
    if (!uci.get('wireless', radio, 'country'))
      uci.set('wireless', radio, 'country', 'NL');

    uci.set('wireless', sid, 'device', radio);
    uci.set('wireless', sid, 'mode', 'sta');
    uci.set('wireless', sid, 'network', 'wwan');
    uci.set('wireless', sid, 'ssid', network.ssid);
    uci.set('wireless', sid, 'encryption', encryption);
    uci.set('wireless', sid, 'disabled', '0');
    uci.set('wireless', sid, 'powersave', '0');
    uci.set('wireless', sid, 'rdz_profile', '1');
    uci.set('wireless', sid, 'rdz_last_used', String(Date.now()));

    if (encryption === 'none')
      uci.unset('wireless', sid, 'key');
    else
      uci.set('wireless', sid, 'key', password);

    this.ensureRouting();

    var profiles = this.getProfiles().sort(function(a, b) {
      return Number(b.rdz_last_used || 0) - Number(a.rdz_last_used || 0);
    });
    profiles.slice(3).forEach(function(profile) {
      if (profile['.name'] !== sid)
        uci.remove('wireless', profile['.name']);
    });

    return uci.save()
      .then(function() { return uci.apply(); })
      .then(function() { return runReconnect(sid); });
  },

  showConnectForm: function(network) {
    var host = this.formHost;
    var suggestedEncryption = encryptionFor(network);
    var password = E('input', {
      class: 'cbi-input-password',
      type: 'password',
      autocomplete: 'new-password',
      placeholder: suggestedEncryption === 'none' ? _('Niet nodig') : _('Wifiwachtwoord')
    });
    var encryption = E('select', { class: 'cbi-input-select' }, [
      E('option', { value: 'psk2', selected: suggestedEncryption === 'psk2' ? '' : null }, _('WPA2-PSK')),
      E('option', { value: 'sae-mixed', selected: suggestedEncryption === 'sae-mixed' ? '' : null }, _('WPA2/WPA3 gemengd')),
      E('option', { value: 'none', selected: suggestedEncryption === 'none' ? '' : null }, _('Open netwerk'))
    ]);

    var button = E('button', {
      class: 'btn cbi-button cbi-button-action important',
      click: ui.createHandlerFn(this, function() {
        button.disabled = true;
        button.textContent = _('Verbinden…');
        return this.saveProfile(network, password.value, encryption.value)
          .then(function(result) {
            notify(_('Verbonden. WWAN-adres: %s').format(result.ip || '—'));
            window.setTimeout(function() { window.location.href = L.url('admin/rdzbridge/overview'); }, 1200);
          })
          .catch(function(error) {
            button.disabled = false;
            button.textContent = _('Opslaan en verbinden');
            notify(error.message || String(error), true);
          });
      })
    }, _('Opslaan en verbinden'));

    host.replaceChildren(E('div', { class: 'cbi-section' }, [
      E('h3', {}, _('Verbinden met %s').format(network.ssid)),
      E('div', { class: 'cbi-section-node' }, [
        E('div', { class: 'cbi-value' }, [
          E('label', { class: 'cbi-value-title' }, _('Beveiliging')),
          E('div', { class: 'cbi-value-field' }, encryption)
        ]),
        E('div', { class: 'cbi-value' }, [
          E('label', { class: 'cbi-value-title' }, _('Wachtwoord')),
          E('div', { class: 'cbi-value-field' }, password)
        ]),
        E('p', {}, _('Maximaal drie hotspots worden lokaal op de router opgeslagen. Het wachtwoord wordt niet in de browser teruggelezen.')),
        button
      ])
    ]));
  },

  renderProfiles: function() {
    var host = this.profileHost;
    var profiles = this.getProfiles().sort(function(a, b) {
      return Number(b.rdz_last_used || 0) - Number(a.rdz_last_used || 0);
    });

    if (!profiles.length) {
      host.replaceChildren(E('p', {}, _('Nog geen hotspots opgeslagen.')));
      return;
    }

    host.replaceChildren(E('table', { class: 'table' }, [
      E('tr', { class: 'tr table-titles' }, [
        E('th', { class: 'th' }, _('Hotspot')),
        E('th', { class: 'th' }, _('Configuratie')),
        E('th', { class: 'th' }, _('Acties'))
      ])
    ].concat(profiles.map(function(profile) {
      var active = profile.disabled !== '1';
      var connectButton = E('button', {
        class: 'btn cbi-button cbi-button-action',
        click: ui.createHandlerFn(this, function() {
          return this.activateProfile(profile['.name'], connectButton).catch(function() {});
        })
      }, _('Verbinden'));

      return E('tr', { class: 'tr' }, [
        E('td', { class: 'td' }, profile.ssid || profile['.name']),
        E('td', { class: 'td' }, active ? _('Geselecteerd') : _('Opgeslagen')),
        E('td', { class: 'td' }, [
          connectButton,
          ' ',
          E('button', {
            class: 'btn cbi-button cbi-button-negative',
            click: ui.createHandlerFn(this, function() {
              return this.forgetProfile(profile['.name'])
                .then(this.renderProfiles.bind(this))
                .catch(function(error) { notify(error.message || String(error), true); });
            })
          }, _('Vergeten'))
        ])
      ]);
    }, this))));
  },

  scan: function() {
    var radio = this.getRadio();
    var host = this.scanHost;
    var button = this.scanButton;

    if (!radio) {
      host.replaceChildren(E('p', { class: 'alert-message error' }, _('Geen wifi-radio gevonden. Controleer de RTL8822CE-driver.')));
      return Promise.resolve();
    }

    button.disabled = true;
    button.textContent = _('Scannen…');
    host.replaceChildren(E('p', {}, _('Wifi-netwerken worden gezocht. Dit kan enkele seconden duren.')));

    var enableRadio = Promise.resolve();
    if (uci.get('wireless', radio, 'disabled') === '1') {
      uci.set('wireless', radio, 'disabled', '0');
      enableRadio = uci.save().then(function() { return uci.apply(); }).then(function() {
        return new Promise(function(resolve) { window.setTimeout(resolve, 2500); });
      });
    }

    return enableRadio.then(function() { return callScan(radio); }).then(function(results) {
      var seen = {};
      var networks = L.toArray(results).filter(function(network) {
        if (!network.ssid || seen[network.ssid]) return false;
        seen[network.ssid] = true;
        return true;
      }).sort(function(a, b) { return Number(b.signal || -100) - Number(a.signal || -100); });

      if (!networks.length) {
        host.replaceChildren(E('p', { class: 'alert-message warning' }, _('Geen netwerken gevonden. Zet de telefoonhotspot aan en probeer opnieuw.')));
        return;
      }

      host.replaceChildren(E('table', { class: 'table' }, [
        E('tr', { class: 'tr table-titles' }, [
          E('th', { class: 'th' }, _('Wifi-signaal')),
          E('th', { class: 'th' }, _('Kanaal')),
          E('th', { class: 'th' }, _('Signaal')),
          E('th', { class: 'th' }, _('Beveiliging')),
          E('th', { class: 'th' }, '')
        ])
      ].concat(networks.map(function(network) {
        return E('tr', { class: 'tr' }, [
          E('td', { class: 'td' }, network.ssid),
          E('td', { class: 'td' }, String(network.channel || '—')),
          E('td', { class: 'td' }, network.signal != null ? network.signal + ' dBm' : '—'),
          E('td', { class: 'td' }, securityLabel(network)),
          E('td', { class: 'td' }, E('button', {
            class: 'btn cbi-button cbi-button-action important',
            click: ui.createHandlerFn(this, function() { this.showConnectForm(network); })
          }, _('Kiezen')))
        ]);
      }, this))));
    }.bind(this)).catch(function(error) {
      host.replaceChildren(E('p', { class: 'alert-message error' }, _('Scannen mislukt: %s').format(error.message || error)));
    }).finally(function() {
      button.disabled = false;
      button.textContent = _('Opnieuw scannen');
    });
  },

  render: function() {
    this.scanHost = E('div');
    this.formHost = E('div', { style: 'margin-top:1em' });
    this.profileHost = E('div');
    this.scanButton = E('button', {
      class: 'btn cbi-button cbi-button-action important',
      click: ui.createHandlerFn(this, this.scan)
    }, _('Wifi-netwerken scannen'));

    var page = E([], [
      E('h2', {}, _('Wifi kiezen en doorzetten via Ethernet')),
      E('p', {}, _('Kies een telefoonhotspot of ander wifi-signaal. De router configureert WWAN, DHCP, firewall, NAT en Ethernet-doorsturing automatisch.')),
      E('div', { class: 'cbi-section' }, [
        E('h3', {}, _('Beschikbare netwerken')),
        E('div', { class: 'cbi-section-node' }, [ this.scanButton, this.scanHost ])
      ]),
      this.formHost,
      E('div', { class: 'cbi-section' }, [
        E('h3', {}, _('Opgeslagen hotspots')),
        E('div', { class: 'cbi-section-node' }, this.profileHost)
      ]),
      E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/overview') }, _('Terug naar dashboard'))
    ]);

    this.renderProfiles();
    window.setTimeout(this.scan.bind(this), 50);
    return page;
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});