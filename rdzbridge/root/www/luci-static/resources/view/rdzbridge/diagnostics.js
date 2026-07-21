'use strict';
'require view';
'require rpc';

var callInterfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { interface: [] } });
var callBoard = rpc.declare({ object: 'system', method: 'board', expect: {} });

return view.extend({
  load: function() {
    return Promise.all([ callInterfaces(), callBoard() ]);
  },

  render: function(data) {
    var interfaces = data[0].interface || [];
    var board = data[1] || {};
    var wwan = interfaces.find(function(i) { return i.interface === 'wwan'; }) || {};
    var lan = interfaces.find(function(i) { return i.interface === 'lan'; }) || {};

    function line(name, value) {
      return E('tr', {}, [ E('th', { style: 'text-align:left;width:35%' }, name), E('td', {}, value || '—') ]);
    }

    var routes = (wwan.route || []).map(function(r) {
      return (r.target || '0.0.0.0') + '/' + (r.mask || 0) + (r.nexthop ? ' via ' + r.nexthop : '');
    }).join(', ');

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
          line(_('LAN IPv4'), (lan['ipv4-address'] || []).map(function(a) { return a.address + '/' + a.mask; }).join(', '))
        ])
      ]),
      E('div', { style: 'display:flex;gap:.75em;flex-wrap:wrap;margin-top:1em' }, [
        E('a', { class: 'btn cbi-button cbi-button-action', href: L.url('admin/network/diagnostics') }, _('Netwerktests openen')),
        E('a', { class: 'btn cbi-button', href: L.url('admin/status/logs') }, _('Systeemlog openen')),
        E('a', { class: 'btn cbi-button', href: L.url('admin/system/reboot') }, _('Router herstarten')),
        E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/overview') }, _('Terug'))
      ])
    ]);
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
