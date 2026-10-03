---
title: Hosting partner
parent: Setup
nav_order: 2
description: "EU Gamehost partnership and recommended hosting examples for Dauntless Revived."
lang: en
ref: setup/hosting-partner
---

# Hosting partner: EU Gamehost

![EU Gamehost]({{ "/assets/eugamehost-partner.png" | relative_url }})

**EU Gamehost is a partnered and recommended hosting provider for Dauntless Revived.** This page is partner/promotional content, not an independent hosting benchmark.

## Recommended Dauntless Revived plans

Our recommendations start with our own measurements: Ramsgate uses about **1.1 GB RAM**, a hunt server about **0.9 GB**, the Training Dojo about **0.9 GB**, and the Node control plane about **130 MB**. With every default hunt port active and a client on the same host, our light-load estimate is roughly **9.5 GB**. Combat CPU load at scale is not fully measured yet.

That means the cheapest plans are useful, but **GAME 3 (12 GB) is our minimum recommended starting point for the full default all-in-one stack**.

| Use case | Plan | Public specification | Base monthly price shown |
|---|---|---|---:|
| Testing / control plane only | **VDS GAME 1** | 1 vCPU @ 5.8 GHz, 4 GB RAM, 60 GB NVMe, 5 Gbps unmetered | £24.99/mo |
| Trimmed / split deployment | **VDS GAME 2** | 2 vCPU @ 5.8 GHz, 8 GB RAM, 120 GB NVMe, 5 Gbps unmetered | £34.99/mo |
| **Recommended full-stack start** | **VDS GAME 3** | 3 vCPU @ 5.8 GHz, 12 GB RAM, 180 GB NVMe, 5 Gbps unmetered | £44.99/mo |
| More capacity headroom | **VDS GAME 5** | 6 vCPU @ 5.8 GHz, 24 GB RAM, 360 GB NVMe, 5 Gbps unmetered | £66.99/mo |
| Dedicated hardware | **Ryzen 7 5800X** | 8c/16t @ 4.7 GHz, 32 GB DDR4, 1 TB NVMe, 10 Gbps port | £85/mo |

[Deploy VDS GAME 1](https://www.eugamehost.com/clients/cart.php?a=add&pid=238&promocode=SIGNUP6MONTH&skipconfig=1) · [Deploy VDS GAME 2](https://www.eugamehost.com/clients/cart.php?a=add&pid=239&promocode=SIGNUP6MONTH&skipconfig=1) · [Deploy VDS GAME 3](https://www.eugamehost.com/clients/cart.php?a=add&pid=240&promocode=SIGNUP6MONTH&skipconfig=1) · [Deploy VDS GAME 5](https://www.eugamehost.com/clients/cart.php?a=add&pid=242&promocode=SIGNUP6MONTH&skipconfig=1) · [Ryzen 5800X](https://www.eugamehost.com/clients/cart.php?a=add&pid=500)

## Why this partner fits the project

EU Gamehost's public gaming VDS pages currently advertise **30 Tbps DDoS protection**, full root/administrator access, NVMe storage and Windows/Linux game-server support. The VDS plans above use dedicated high-clock Ryzen vCPU allocations and advertise 5 Gbps unmetered networking; the Ryzen 5800X dedicated option advertises a 10 Gbps port.

The public plan details and base monthly prices above were checked **2 October 2026**. Promotional discounts, stock, locations, operating-system options and exact hardware can change, so check the live EU Gamehost page before ordering.

> **Partner / advertising disclosure:** EU Gamehost partners with Dauntless Revived. These plan choices are project recommendations based on our measured Dauntless Revived footprint and provider-published specifications. They are not a guarantee of player capacity or an independent hosting benchmark.
