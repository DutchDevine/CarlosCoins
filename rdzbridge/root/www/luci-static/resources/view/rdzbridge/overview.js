'use strict';
'require view';
'require rpc';
'require poll';
'require fs';
'require ui';

var callInterfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { interface: [] } });
var callBoard = rpc.declare({ object: 'system', method: 'board', expect: {} });
var callWifi = rpc.declare({ object: 'iwinfo', method: 'info', params: [ 'device' ], expect: {} });

function value(v, fallback) {
  return (v === undefined || v === null || v === '') ? fallback : v;
}

function badge(text, state) {
  var cls = state === true ? 'success' : (state === false ? 'warning' : 'notice');
  return E('span', { class: 'label ' + cls, style: 'font-size:1em;padding:.45em .7em' }, text);
}

function bytes(value) {
  var n = Number(value || 0);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KiB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MiB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
}

function execJson(path) {
  return fs.exec_direct(path, []).then(function(output) {
    return JSON.parse(output || '{}');
  }).catch(function() { return {}; });
}

function connectionBadge(status) {
  switch (status) {
  case 'online': return badge(_('Online'), true);
  case 'captive_portal': return badge(_('Loginpagina vereist'), false);
  case 'limited': return badge(_('Beperkte toegang'), null);
  case 'no_address': return badge(_('Geen WWAN-adres'), false);
  case 'disconnected': return badge(_('Wifi niet verbonden'), false);
  default: return badge(_('Geen internet'), false);
  }
}

return view.extend({
  load: function() {
    return Promise.all([
      callInterfaces(),
      callBoard(),
      execJson('/usr/libexec/rdzbridge-ethernet-status'),
      execJson('/usr/libexec/rdzbridge-watchdog-status'),
      execJson('/usr/libexec/rdzbridge-security-status'),
      execJson('/usr/libexec/rdzbridge-connectivity-status')
    ]);
  },

  reconnect: function(button) {
    button.disabled = true;
    button.textContent = _('Opnieuw verbinden…');
    return fs.exec_direct('/usr/libexec/rdzbridge-reconnect', []).then(function() {
      ui.addNotification(null, E('p', {}, _('De WWAN-verbinding wordt opnieuw opgebouwd.')));
      window.setTimeout(function() { window.location.reload(); }, 3000);
    }).catch(function(error) {
      button.disabled = false;
      button.textContent = _('Wifi opnieuw verbinden');
      ui.addNotification(null, E('p', {}, error.message || String(error)), 'error');
    });
  },

  render: function(data) {
    var interfaces = data[0].interface || [];
    var board = data[1] || {};
    var ethernet = data[2] || {};
    var watchdog = data[3] || {};
    var security = data[4] || {};
    var connectivity = data[5] || {};
    var wwan = interfaces.find(function(i) { return i.interface === 'wwan'; }) || {};
    var lan = interfaces.find(function(i) { return i.interface === 'lan'; }) || {};
    var wifiDevice = (wwan.l3_device || wwan.device || '').replace(/^@/, '');

    var statusBox = E('div', { class: 'cbi-section' });
    var content = E('div', { class: 'cbi-section-node' });
    statusBox.appendChild(content);

    function row(label, val) {
      content.appendChild(E('div', { style: 'display:grid;grid-template-columns:minmax(160px,230px) 1fr;gap:1em;padding:.65em 0;border-bottom:1px solid var(--border-color-low,#ddd)' }, [
        E('strong', {}, label), E('span', {}, val)
      ]));
    }

    var internetValue = connectionBadge(connectivity.status);
    row(_('Internet via wifi'), internetValue);
    row(_('WWAN-adres'), value((wwan['ipv4-address'] || [])[0]?.address, _('Geen adres')));
    row(_('LAN-adres'), value((lan['ipv4-address'] || [])[0]?.address, '10.77.77.1'));
    row(_('Ethernet-out'), ethernet.present ? badge(ethernet.carrier ? _('Kabel actief') : _('Geen kabelverbinding'), !!ethernet.carrier) : badge(_('Niet gevonden'), false));
    row(_('Ethernetapparaat'), ethernet.present ? [ ethernet.device, ethernet.speed ? ' · ' + ethernet.speed + ' Mbit/s' : '', ethernet.driver ? ' · ' + ethernet.driver : '' ].join('') : '—');
    row(_('Ethernetverkeer'), ethernet.present ? _('Ontvangen %s · verzonden %s').format(bytes(ethernet.rx_bytes), bytes(ethernet.tx_bytes)) : '—');
    row(_('Automatisch herstel'), watchdog.enabled === false ? badge(_('Uitgeschakeld'), false) : badge(_('Actief'), null));
    row(_('Beheerderswachtwoord'), security.configured ? badge(_('Ingesteld'), true) : badge(_('Nog instellen'), false));
    row(_('Router'), value(board.model, _('Onbekend x86-systeem')));
    row(_('OpenWrt'), value(board.release?.description, _('Onbekende versie')));

    var wifiLine = E('span', {}, wifiDevice || _('Nog niet gekoppeld'));
    row(_('Wifi-interface'), wifiLine);

    if (wifiDevice) {
      callWifi(wifiDevice).then(function(info) {
        if (!info || !wifiLine.isConnected) return;
        wifiLine.textContent = [
          value(info.ssid, wifiDevice),
          info.signal != null ? info.signal + ' dBm' : null,
          info.bitrate ? Math.round(info.bitrate / 1000) + ' Mbit/s' : null,
          info.channel ? _('kanaal %s').format(info.channel) : null
        ].filter(Boolean).join(' · ');
      }).catch(function() {});
    }

    var reconnectButton = E('button', {
      class: 'btn cbi-button cbi-button-action',
      click: ui.createHandlerFn(this, function() { return this.reconnect(reconnectButton); })
    }, _('Wifi opnieuw verbinden'));

    var actions = E('div', { style: 'display:flex;gap:.75em;flex-wrap:wrap;margin-top:1.25em' }, [
      E('a', { class: 'btn cbi-button cbi-button-action important', href: L.url('admin/rdzbridge/setup') }, _('Wifi kiezen')),
      reconnectButton,
      connectivity.status === 'captive_portal' ? E('a', { class: 'btn cbi-button cbi-button-action important', href: connectivity.portal_url || 'http://neverssl.com/', target: '_blank', rel: 'noreferrer' }, _('Loginpagina openen')) : null,
      E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/diagnostics') }, _('Diagnose')),
      E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/security') }, _('Beveiliging')),
      E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/maintenance') }, _('Back-up en herstel')),
      E('a', { class: 'btn cbi-button', href: L.url('admin/status/overview') }, _('Geavanceerd beheer'))
    ].filter(Boolean));

    poll.add(function() {
      return execJson('/usr/libexec/rdzbridge-connectivity-status').then(function(current) {
        if (internetValue.isConnected)
          internetValue.replaceWith(internetValue = connectionBadge(current.status));
      });
    }, 10);

    var warning = security.configured ? null : E('div', { class: 'alert-message warning' }, [
      E('strong', {}, _('Beveiliging afronden: ')),
      _('stel eerst een beheerderswachtwoord in.'),
      ' ',
      E('a', { href: L.url('admin/rdzbridge/security') }, _('Nu instellen'))
    ]);

    var portalWarning = connectivity.status === 'captive_portal' ? E('div', { class: 'alert-message warning' }, [
      E('strong', {}, _('Wifi is verbonden, maar het netwerk vraagt om aanmelding. ')),
      _('Automatisch herstel is gepauzeerd totdat de login is voltooid.')
    ]) : null;

    return E([], [
      E('h2', {}, _('RDZ 5G Bridge')),
      E('p', {}, _('5G/wifi-internet wordt via NAT en DHCP doorgestuurd naar de Realtek Ethernet-uitgang.')),
      warning,
      portalWarning,
      statusBox,
      actions
    ].filter(Boolean));
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
