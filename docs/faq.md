---
title: FAQ
nav_order: 6
description: "Can you still play Dauntless? Is there a private server? Short answers about Dauntless Revived: versions, Epic accounts, joining, hosting, legality and Linux."
lang: en
ref: faq
---

# Frequently asked questions
{: .no_toc }

Short answers to what people ask most about Dauntless Revived and about playing Dauntless after the
official servers shut down. Each answer links to the page with the details.

<details open markdown="block">
  <summary>Questions</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

{% comment %}
  The questions and answers live in _data/faq_en.yml. The same list feeds the FAQPage structured data in
  _includes/head_custom.html, so the page and the structured data always match. Edit the data file, not this page.
{% endcomment %}
{% for item in site.data.faq_en %}
## {{ item.q }} {#{{ item.id }}}

{% capture faq_md %}{% include faq_resolve.html md=item.a %}{% endcapture %}{{ faq_md }}
{% endfor %}
