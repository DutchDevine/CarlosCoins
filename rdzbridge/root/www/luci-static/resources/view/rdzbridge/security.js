'use strict';
'require view';
'require fs';

function readStatus() {
  return fs.exec_direct('/usr/libexec/rdzbridge-security-status', []).then(function(output) {
    return JSON.parse(output || '{}');
  }).catch(function() { return {}; });
}

return view.extend({
  load: readStatus,

  render: function(status) {
    var configured = !!status.configured;
    var httpsUrl = 'https://' + window.location.hostname + L.url('admin/rdzbridge/overview');

    return E([], [
      E('h2', {}, _('Beveiliging')),
      E('div', { class: configured ? 'alert-message success' : 'alert-message warning' }, [
        E('strong', {}, configured ? _('Beheerderswachtwoord ingesteld') : _('Beheerderswachtwoord ontbreekt')),
        E('br'),
        configured ? _('De LuCI-interface is met het rootaccount beveiligd.') : _('Stel een uniek rootwachtwoord in voordat de router regulier wordt gebruikt.')
      ]),
      E('div', { class: 'cbi-section' }, [
        E('h3', {}, _('Aanbevolen instellingen')),
        E('div', { class: 'cbi-section-node' }, [
          E('ol', {}, [
            E('li', {}, _('Stel een sterk en uniek routerwachtwoord in.')),
            E('li', {}, _('Beheer de router uitsluitend via het lokale Ethernet-LAN.')),
            E('li', {}, _('Gebruik HTTPS wanneer je de certificaatwaarschuwing van het lokale, zelfondertekende certificaat hebt gecontroleerd.')),
            E('li', {}, _('De hotspotwachtwoorden worden lokaal in OpenWrt opgeslagen en nooit door het dashboard teruggetoond.'))
          ]),
          E('div', { style: 'display:flex;gap:.75em;flex-wrap:wrap;margin-top:1em' }, [
            E('a', { class: 'btn cbi-button cbi-button-action important', href: L.url('admin/system/admin/password') }, configured ? _('Wachtwoord wijzigen') : _('Wachtwoord nu instellen')),
            E('a', { class: 'btn cbi-button', href: httpsUrl }, _('Open via HTTPS')),
            E('a', { class: 'btn cbi-button', href: L.url('admin/system/admin/dropbear') }, _('SSH-instellingen')),
            E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/overview') }, _('Terug'))
          ])
        ])
      ])
    ]);
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
