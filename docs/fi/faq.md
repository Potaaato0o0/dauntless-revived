---
title: Usein kysyttyä
parent: Dauntless Revived suomeksi
nav_order: 6
description: "Voiko Dauntlessia vielä pelata? Onko sille yksityistä palvelinta? Lyhyet vastaukset Dauntless Revivedistä: versio, Epic-tili, liittyminen ja oma palvelin."
lang: fi
ref: faq
locale: fi_FI
---

# Usein kysyttyjä kysymyksiä
{: .no_toc }

Tällä sivulla on lyhyet vastaukset kysymyksiin, joita Dauntless Revivedistä ja Dauntlessin
pelaamisesta kysytään usein. Vastausten lopussa on linkki sivulle, jolla asiasta kerrotaan tarkemmin.

<details open markdown="block">
  <summary>Kysymykset</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

{% comment %}
  Kysymykset ja vastaukset ovat tiedostossa _data/faq_fi.yml. Sama lista tuottaa myös FAQPage-rakennetiedon
  (_includes/head_custom.html), joten sivu ja rakennetieto pysyvät aina samoina. Muokkaa datatiedostoa, älä tätä sivua.
{% endcomment %}
{% for item in site.data.faq_fi %}
## {{ item.q }} {#{{ item.id }}}

{% capture faq_md %}{% include faq_resolve.html md=item.a %}{% endcapture %}{{ faq_md }}
{% endfor %}
