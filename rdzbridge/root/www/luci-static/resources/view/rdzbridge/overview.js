'use strict';
'require view';
'require rpc';
'require poll';

var callInterfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { interface: [] } });
var callBoard = rpc.declare({ object: 'system', method: 'board', expect: {} });
var callWifi = rpc.declare({ object: 'iwinfo', method: 'info', params: [ 'device' ], expect: {} });

function value(v, fallback) {
  return (v === undefined || v === null || v === '') ? fallback : v;
}

function badge(text, good) {
  return E('span', { class: good ? 'label success' : 'label warning', style: 'font-size:1em;padding:.45em .7em' }, text);
}

return view.extend({
  load: function() {
    return Promise.all([ callInterfaces(), callBoard() ]);
  },

  render: function(data) {
    var interfaces = data[0].interface || [];
    var board = data[1] || {};
    var wwan = interfaces.find(function(i) { return i.interface === 'wwan'; }) || {};
    var lan = interfaces.find(function(i) { return i.interface === 'lan'; }) || {};
    var wifiDevice = (wwan.l3_device || wwan.device || '').replace(/^@/, '');

    var statusBox = E('div', { class: 'cbi-section' });
    var content = E('div', { class: 'cbi-section-node' });
    statusBox.appendChild(content);

    function row(label, val) {
      content.appendChild(E('div', { style: 'display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:1em;padding:.65em 0;border-bottom:1px solid var(--border-color-low,#ddd)' }, [
        E('strong', {}, label), E('span', {}, val)
      ]));
    }

    row(_('Internet'), badge(wwan.up ? _('Verbonden') : _('Niet verbonden'), !!wwan.up));
    row(_('WWAN-adres'), value((wwan['ipv4-address'] || [])[0]?.address, _('Geen adres')));
    row(_('LAN-adres'), value((lan['ipv4-address'] || [])[0]?.address, '10.77.77.1'));
    row(_('Router'), value(board.model, _('Onbekend x86-systeem')));
    row(_('OpenWrt'), value(board.release?.description, _('Onbekende versie')));

    var wifiLine = E('span', {}, wifiDevice || _('Nog niet gekoppeld'));
    row(_('Wifi-interface'), wifiLine);

    if (wifiDevice) {
      callWifi(wifiDevice).then(function(info) {
        if (!info || !wifiLine.isConnected) return;
        wifiLine.textContent = [
          value(info.ssid, wifiDevice),
          info.signal ? (info.signal + ' dBm') : null,
          info.bitrate ? (Math.round(info.bitrate / 1000) + ' Mbit/s') : null
        ].filter(Boolean).join(' · ');
      }).catch(function() {});
    }

    var actions = E('div', { style: 'display:flex;gap:.75em;flex-wrap:wrap;margin-top:1.25em' }, [
      E('a', { class: 'btn cbi-button cbi-button-action important', href: L.url('admin/rdzbridge/setup') }, _('Wifi instellen')),
      E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/diagnostics') }, _('Diagnose')),
      E('a', { class: 'btn cbi-button', href: L.url('admin/network/wireless') }, _('Geavanceerde wifi')),
      E('a', { class: 'btn cbi-button', href: L.url('admin/status/overview') }, _('OpenWrt-overzicht'))
    ]);

    poll.add(function() {
      return callInterfaces().then(function(result) {
        var current = (result.interface || []).find(function(i) { return i.interface === 'wwan'; }) || {};
        var el = content.firstElementChild?.lastElementChild;
        if (el) {
          el.replaceChildren(badge(current.up ? _('Verbonden') : _('Niet verbonden'), !!current.up));
        }
      });
    }, 5);

    return E([], [
      E('h2', {}, _('RDZ 5G Bridge')),
      E('p', {}, _('Centraal beheer voor de 5G-hotspotverbinding en het Ethernet-LAN.')),
      statusBox,
      actions
    ]);
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
