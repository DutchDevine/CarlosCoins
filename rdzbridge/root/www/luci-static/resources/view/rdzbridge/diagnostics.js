'use strict';
'require view';
'require rpc';
'require fs';
'require ui';

var callInterfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { interface: [] } });
var callBoard = rpc.declare({ object: 'system', method: 'board', expect: {} });

function execJson(path, args) {
  return fs.exec_direct(path, args || []).then(function(output) {
    return JSON.parse(output || '{}');
  }).catch(function() { return {}; });
}

function resultBox(title, output, good) {
  return E('div', { class: 'cbi-section' }, [
    E('h3', {}, title),
    E('pre', { style: 'white-space:pre-wrap;max-height:260px;overflow:auto;border-left:4px solid ' + (good ? '#4caf50' : '#d33') }, output || '—')
  ]);
}

function mark(ok) {
  return E('span', { class: 'label ' + (ok ? 'success' : 'warning') }, ok ? _('OK') : _('Niet gereed'));
}

return view.extend({
  load: function() {
    return Promise.all([
      callInterfaces(),
      callBoard(),
      execJson('/usr/libexec/rdzbridge-ethernet-status'),
      execJson('/usr/libexec/rdzbridge-watchdog-status'),
      execJson('/usr/libexec/rdzbridge-connectivity-status')
    ]);
  },

  runTests: function(button, host) {
    button.disabled = true;
    button.textContent = _('Testen…');
    host.replaceChildren(E('p', {}, _('De echte RTL8822CE-, RTL8168-, WWAN-, NAT-, DNS- en LuCI-keten wordt getest.')));

    return execJson('/usr/libexec/rdzbridge-hardware-selftest').then(function(test) {
      function row(label, value, ok) {
        return E('tr', {}, [
          E('th', { style: 'text-align:left;width:38%' }, label),
          E('td', {}, [ mark(!!ok), ' ', value || '—' ])
        ]);
      }

      var wifi = test.wifi || {};
      var wwan = test.wwan || {};
      var ethernet = test.ethernet || {};
      var routing = test.routing || {};
      var services = test.services || {};

      host.replaceChildren(E('div', { class: 'cbi-section' }, [
        E('h3', {}, test.overall ? _('Hardwarezelftest geslaagd') : _('Hardwarezelftest vraagt aandacht')),
        E('table', { class: 'table' }, [
          row(_('RTL8822CE-driver'), [ wifi.device, wifi.driver ].filter(Boolean).join(' · '), wifi.present),
          row(_('Wifi-scan'), wifi.scan ? _('Netwerken kunnen worden gescand') : _('Scannen mislukt'), wifi.scan),
          row(_('Wifi-associatie'), wifi.associated ? (wifi.ssid || _('Verbonden')) : _('Niet geassocieerd'), wifi.associated),
          row(_('WWAN DHCP'), wwan.ip || _('Geen IPv4-adres'), wwan.up && !!wwan.ip),
          row(_('Standaardroute'), wwan.default_route ? _('Aanwezig') : _('Ontbreekt'), wwan.default_route),
          row(_('RTL8168/r8169'), [ ethernet.device, ethernet.driver ].filter(Boolean).join(' · '), ethernet.present),
          row(_('Ethernetkabel'), ethernet.carrier ? ((ethernet.speed || '—') + ' Mbit/s') : _('Geen carrier'), ethernet.carrier),
          row(_('NAT/masquerading'), routing.nat ? _('Actief') : _('Ontbreekt'), routing.nat),
          row(_('LAN naar WAN'), routing.lan_to_wan ? _('Forwarding actief') : _('Forwarding ontbreekt'), routing.lan_to_wan),
          row(_('LuCI-webserver'), services.luci ? _('Bereikbaar') : _('Niet bereikbaar'), services.luci),
          row(_('DNS'), services.dns ? _('Werkend') : _('Niet werkend'), services.dns),
          row(_('Internet'), services.internet ? _('Bereikbaar') : _('Niet bereikbaar'), services.internet)
        ])
      ]));
    }).catch(function(error) {
      host.replaceChildren(resultBox(_('Hardwarezelftest mislukt'), error.message || String(error), false));
    }).finally(function() {
      button.disabled = false;
      button.textContent = _('Hardwarezelftest uitvoeren');
    });
  },

  reconnect: function(button) {
    button.disabled = true;
    button.textContent = _('Herstellen…');
    return execJson('/usr/libexec/rdzbridge-reconnect').then(function(result) {
      if (!result.ok)
        throw new Error(result.message || _('WWAN-herstel mislukt.'));
      ui.addNotification(null, E('p', {}, result.message || _('WWAN is verbonden.')));
    }).catch(function(error) {
      ui.addNotification(null, E('p', {}, error.message || String(error)), 'error');
    }).finally(function() {
      button.disabled = false;
      button.textContent = _('WWAN herstellen');
    });
  },

  render: function(data) {
    var interfaces = data[0].interface || [];
    var board = data[1] || {};
    var ethernet = data[2] || {};
    var watchdog = data[3] || {};
    var connectivity = data[4] || {};
    var wwan = interfaces.find(function(i) { return i.interface === 'wwan'; }) || {};
    var lan = interfaces.find(function(i) { return i.interface === 'lan'; }) || {};
    var testHost = E('div', { style: 'margin-top:1em' });

    function line(name, val) {
      return E('tr', {}, [ E('th', { style: 'text-align:left;width:35%' }, name), E('td', {}, val || '—') ]);
    }

    var routes = (wwan.route || []).map(function(route) {
      return (route.target || '0.0.0.0') + '/' + (route.mask || 0) + (route.nexthop ? ' via ' + route.nexthop : '');
    }).join(', ');

    var testButton = E('button', {
      class: 'btn cbi-button cbi-button-action important',
      click: ui.createHandlerFn(this, function() { return this.runTests(testButton, testHost); })
    }, _('Hardwarezelftest uitvoeren'));

    var reconnectButton = E('button', {
      class: 'btn cbi-button cbi-button-action',
      click: ui.createHandlerFn(this, function() { return this.reconnect(reconnectButton); })
    }, _('WWAN herstellen'));

    return E([], [
      E('h2', {}, _('Diagnose en hardwarezelftest')),
      E('div', { class: 'cbi-section' }, [
        E('table', { class: 'table' }, [
          line(_('Model'), board.model),
          line(_('OpenWrt'), board.release?.description),
          line(_('Internetcontrole'), connectivity.status),
          line(_('WWAN-status'), wwan.up ? _('Verbonden') : _('Niet verbonden')),
          line(_('WWAN-apparaat'), wwan.l3_device || wwan.device),
          line(_('WWAN IPv4'), (wwan['ipv4-address'] || []).map(function(a) { return a.address + '/' + a.mask; }).join(', ')),
          line(_('Standaardroute'), routes),
          line(_('DNS'), (wwan['dns-server'] || []).join(', ')),
          line(_('LAN-status'), lan.up ? _('Actief') : _('Niet actief')),
          line(_('LAN IPv4'), (lan['ipv4-address'] || []).map(function(a) { return a.address + '/' + a.mask; }).join(', ')),
          line(_('Ethernetcontroller'), ethernet.present ? [ ethernet.device, ethernet.driver, ethernet.speed ? ethernet.speed + ' Mbit/s' : null ].filter(Boolean).join(' · ') : _('Niet gevonden')),
          line(_('Ethernetkabel'), ethernet.carrier ? _('Actief') : _('Niet actief')),
          line(_('Watchdog'), watchdog.enabled === false ? _('Uitgeschakeld') : [ watchdog.status || _('Actief'), watchdog.failures != null ? _('fouten: %s').format(watchdog.failures) : null ].filter(Boolean).join(' · ')),
          line(_('Laatste herstelactie'), watchdog.last_action || _('Geen'))
        ])
      ]),
      connectivity.status === 'captive_portal' ? E('div', { class: 'alert-message warning' }, [
        _('Een aanmeldpagina is vereist. '),
        E('a', { href: connectivity.portal_url || 'http://neverssl.com/', target: '_blank', rel: 'noreferrer' }, _('Loginpagina openen'))
      ]) : null,
      E('div', { style: 'display:flex;gap:.75em;flex-wrap:wrap;margin-top:1em' }, [
        testButton,
        reconnectButton,
        E('a', { class: 'btn cbi-button', href: L.url('admin/status/logs') }, _('Systeemlog openen')),
        E('a', { class: 'btn cbi-button', href: L.url('admin/system/reboot') }, _('Router herstarten')),
        E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/overview') }, _('Terug'))
      ]),
      testHost
    ].filter(Boolean));
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
