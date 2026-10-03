---
title: OpenBSD-palvelin
parent: Asennus
grand_parent: Dauntless Revived suomeksi
nav_order: 8
description: "Dauntless Revivedin natiivi OpenBSD 7.9 -ohjauspuoli PF:llä ja rc.d:llä sekä erillinen Linux/Proton/Wine-pelityöntekijä."
lang: fi
ref: setup/openbsd-server
locale: fi_FI
---

{% assign linux_server = site.pages | where: "path", "fi/setup/linux-server.md" | first %}
{% assign trouble_page = site.pages | where: "path", "fi/setup/troubleshooting.md" | first %}

# OpenBSD-palvelin
{: .no_toc }

OpenBSD-porttaus ajaa **ohjauspuolen natiivisti OpenBSD:ssa**, mutta lähettää varsinaiset Dauntlessin
peliprosessit erilliselle Linux-koneelle, jossa on Proton tai Wine.

Se on erillinen porttaus eikä muuta `deploy/windows-server/`-pakettia.

<details open markdown="block">
  <summary>Sisältö</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>
