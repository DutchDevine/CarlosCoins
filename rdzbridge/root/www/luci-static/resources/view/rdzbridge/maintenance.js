'use strict';
'require view';

return view.extend({
  render: function() {
    var flashUrl = L.url('admin/system/flash');
    return E([], [
      E('h2', {}, _('Back-up en herstel')),
      E('p', {}, _('Maak vóór grotere wijzigingen een back-up van de OpenWrt-configuratie. De back-up bevat ook de RDZ-netwerk- en hotspotinstellingen.')),
      E('div', { class: 'cbi-section' }, [
        E('div', { class: 'cbi-section-node' }, [
          E('h3', {}, _('Configuratieback-up')),
          E('p', {}, _('Download een archief met UCI-configuratie, firewallregels en opgeslagen hotspotprofielen.')),
          E('a', { class: 'btn cbi-button cbi-button-action important', href: flashUrl }, _('Back-up downloaden'))
        ])
      ]),
      E('div', { class: 'cbi-section' }, [
        E('div', { class: 'cbi-section-node' }, [
          E('h3', {}, _('Configuratie herstellen')),
          E('p', {}, _('Upload een eerder gemaakte OpenWrt-back-up. Controleer daarna het LAN-adres en de wifi-profielen.')),
          E('a', { class: 'btn cbi-button cbi-button-action', href: flashUrl }, _('Back-up herstellen'))
        ])
      ]),
      E('div', { class: 'cbi-section' }, [
        E('div', { class: 'cbi-section-node' }, [
          E('h3', {}, _('Fabrieksinstellingen')),
          E('p', {}, _('Hiermee worden lokale instellingen en hotspotwachtwoorden verwijderd. De RDZ-software blijft onderdeel van de image.')),
          E('a', { class: 'btn cbi-button cbi-button-negative', href: flashUrl }, _('Fabrieksinstellingen openen'))
        ])
      ]),
      E('a', { class: 'btn cbi-button', href: L.url('admin/rdzbridge/overview') }, _('Terug naar dashboard'))
    ]);
  },
  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
