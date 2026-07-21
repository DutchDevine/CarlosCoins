'use strict';
'require view';
'require rpc';
'require fs';
'require ui';

var callInterfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { interface: [] } });
var callBoard = rpc.declare({ object: 'system', method: 'board', expect: {} });

function execJson(path) {
  return fs.exec_direct(path, []).then(function(output) {
    return JSON.parse(output || '{}');
  }).catch(function() { return {}; });
}

function resultBox(title, output, good) {
  return E('div', { class: 'cbi-section' }, [
    E('h3', {}, title),
    E('pre', { style: 'white-space:pre-wrap;max-height:240px;overflow:auto;border-left:4px solid ' + (good ? '#4caf50' : '#d33') }, output || '—')
  ]);
}

return view.extend({
  load: function() {
    return Promise.all([
      callInterfaces(),
      callBoard(),
      execJson('/usr/libexec/rdzbridge-ethernet-status'),
      execJson('/usr/libexec/rdzbridge-watchdog-status')
    ]);
  },

  runTests: function(button, host) {
    button.disabled = true;
    button.textContent = _('Testen…');
    host.replaceChildren(E('p', {}, _('Gateway, internet en DNS worden getest.')));

    return Promise.all([
      fs.exec_direct('/bin/ping', [ '-c', '3', '-W', '2', '1.1.1.1' ]).then(function(v) { return { ok: true, out: v }; }).catch(function(e) { return { ok: false, out: e.message || String(e) }; }),
      fs.exec_direct('/usr/bin/nslookup', [ 'openwrt.org' ]).then(function(v) { return { ok: true, out: v }; }).catch(function(e) { return { ok: false, out: e.message || String(e) }; })
    ]).then(function(results) {
      host.replaceChildren(
        resultBox(_('Internettest — 1.1.1.1'), results[0].out, results[0].ok),
        resultBox(_('DNS-test — openwrt.org'), results[1].out, results[1].ok)
      );
    }).finally(function() {
      button.disabled = false;
      button.textContent = _('Diagnose uitvoeren');
    });
  },

  reconnect: function() {
    return fs.exec_direct('/usr/libexec/rdzbridge-reconnect', []).then(function() {
      ui.addNotification(null, E('p', {}, _('WWAN wordt opnieuw verbonden.')));
    }).catch(function(error) {
      ui.addNotification(null, E('p', {}, error.message || String(error)), 'error');
    });
  },

  render: function(data) {
    var interfaces = data[0].interface || [];
    var board = data[1] || {};
    var ethernet = data[2] || {};
    var watchdog = data[3] || {};
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
    }, _('Diagnose uitvoeren'));

    return E([], [
      E('h2', {}, _('Diagnose')),
      E('div', { class: 'cbi-section' }, [
        E('table', { class: 'table' }, [
          line(_('Model'), board.model),
          line(_('OpenWrt'), board.release?.description),
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
      E('div', { style: 'display:flex;gap:.75em;flex-wrap:wrap;margin-top:1em' }, [
        testButton,
        E('button', { class: 'btn cbi-button cbi-button-action', click: ui.createHandlerFn(this, this.reconnect) }, _('WWAN herstellen')),
        E('a', { class: 'btn cbi-button', href: L.url('admin/status/logs') }, _('Systeemlog openen')),
        E('a', { class: 'btn cbi-button', href: L.url('admin/system/reboot') }, _('Router herstarten')),
        E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/overview') }, _('Terug'))
      ]),
      testHost
    ]);
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
