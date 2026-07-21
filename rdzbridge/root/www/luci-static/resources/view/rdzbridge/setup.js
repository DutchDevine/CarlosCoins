'use strict';
'require view';

return view.extend({
  render: function() {
    return E([], [
      E('h2', {}, _('Wifi instellen')),
      E('div', { class: 'cbi-section' }, [
        E('div', { class: 'cbi-section-node' }, [
          E('p', {}, _('De RTL8822CE wordt als wifi-client gebruikt. Scan naar de hotspot van de telefoon en maak een netwerk met de naam wwan.')),
          E('ol', {}, [
            E('li', {}, _('Open de draadloze netwerkpagina.')),
            E('li', {}, _('Klik bij de Realtek-radio op Scannen.')),
            E('li', {}, _('Selecteer de 5 GHz-hotspot van de telefoon en kies Netwerk verbinden.')),
            E('li', {}, _('Gebruik netwerknaam wwan, protocol DHCP-client en firewallzone wan.')),
            E('li', {}, _('Sla de configuratie op en keer daarna terug naar het dashboard.'))
          ]),
          E('div', { style: 'display:flex;gap:.75em;flex-wrap:wrap;margin-top:1.25em' }, [
            E('a', { class: 'btn cbi-button cbi-button-action important', href: L.url('admin/network/wireless') }, _('Hotspot scannen en verbinden')),
            E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/overview') }, _('Terug naar dashboard'))
          ])
        ])
      ])
    ]);
  },
  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
