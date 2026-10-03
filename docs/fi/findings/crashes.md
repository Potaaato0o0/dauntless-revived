---
title: Kaatumisten tutkiminen
parent: Löydökset
grand_parent: Dauntless Revived suomeksi
nav_order: 7
lang: fi
ref: findings/crashes
locale: fi_FI
description: "Miten Dauntlessin kaatumisraportit muutetaan konekielen osoitteiksi, ja mistä kukin kohtaamamme kaatuminen johtui. Suurin osa koskee versiota 2.1.1."
---

{% assign internals_page = site.pages | where: "path", "fi/findings/client-internals.md" | first %}
{% assign awakening_page = site.pages | where: "path", "fi/findings/awakening-2-1-1.md" | first %}
{% assign tools_page = site.pages | where: "path", "fi/tools.md" | first %}
{% assign contract_page = site.pages | where: "path", "fi/findings/backend-contract.md" | first %}

# Kaatumisten tutkiminen
{: .no_toc }

Kun peli kaatuu (sulkeutuu yllättäen virheen takia), se jättää jälkeensä kaatumisraportin.
Dauntlessin julkaisuversion ohjelmatiedostossa ei ole symboleja (funktioiden nimiä, joita kehittäjät
käyttävät vianetsinnässä), se ei kirjoita lokitiedostoa eikä avaa omaa konsolia (kehittäjien
tekstikomentoikkunaa). (Versio 2.1.1 tulostaa kyllä lokirivejä vakiotulosteeseen eli standard
outputiin, kun se ohjataan talteen; katso
[Asiakasohjelman sisäosat]({{ internals_page.url | relative_url }}#logging).) Siksi
kaatumisraportti on usein paras saatavilla oleva todiste. Tämä sivu näyttää, miten muutimme
raportit käskyjen osoitteiksi ja mistä kukin kaatuminen lopulta johtui.

Lähes kaikki tällä sivulla on peräisin versiosta **2.1.1**, joka käynnistettiin suoraan Ramsgateen
omaa testitaustapalveluamme vasten (katso
[Itsenäinen käynnistys 2.1.1:llä]({{ awakening_page.url | relative_url }})). Menetelmä toimii
samalla tavalla versiossa **1.4.4**. Kun jokin yksityiskohta on tarkistettu vain toisessa
versiossa, kerromme sen.

<details open markdown="block">
  <summary>Sisällys</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Kaatumisraportin lukeminen {#reading-a-crash-report}

### Missä raportit ovat {#where-the-reports-are}

Versiossa **2.1.1** jokainen kaatuminen jättää kansion tänne:

```text
%LOCALAPPDATA%\Archon\Saved\Crashes\UECC-Windows-<32 hex digits>_0000\
    CrashContext.runtime-xml    <- the useful part
    CrashReportClient.ini
    UEMinidump.dmp
```

Emme ole vielä tarkistaneet, minne **1.4.4** kirjoittaa raporttinsa. Unreal 4.25 käyttää yleensä
samaa `Saved\Crashes`-rakennetta, joten katso ensin sieltä (**vahvistamaton**).

### Tärkeät kentät {#the-fields-that-matter}

`CrashContext.runtime-xml` on tavallista XML:ää. Nämä elementit ovat ne, joita käytämme:

| Elementti | Mitä se kertoo | Esimerkki (2.1.1) |
|---|---|---|
| `<ErrorMessage>` | Kohtalokas virheilmoitus tai poikkeus | `Trying to resize TArray to an invalid size of 3163556208` |
| `<CrashType>` | `Assert`, kun peli itse nosti kohtalokkaan virheen, ja `Crash`, kun kyse on poikkeuksesta | `Assert` |
| `<EngineVersion>` / `<BuildVersion>` | Mikä versio kaatui. Tarkista tämä ensin, jos sinulla on useampi asennus. | `5.1.1-682875+//phx-archon/release/2.1.1` / `//phx-archon/release/2.1.1-CL-682875` |
| `<SecondsSinceStart>` | Kuinka kauan prosessi oli ollut käynnissä. Arvo on joskus `0`, joten älä luota siihen. | `81` |
| `<PCallStack>` | Kaatuneen säikeen kutsupino (lista funktioista, joiden sisällä ohjelma oli kaatumishetkellä), yksi kehys kutakin kolmikkoa `module base + offset` (moduuli, perusosoite, siirtymä) kohden | katso alta |
| `<Threads>` | `<Thread>` jokaiselle säikeelle, ja siinä `<ThreadName>`, `<IsCrashed>` ja säikeen oma `<CallStack>` | `GameThread`, `true` |

Tiedoston alussa oleva symbolinen `<CallStack>` on tässä hyödytön. Ilman symboleja se luettelee
vain moduulien nimiä.

> **Älä julkaise raakoja kaatumisraportteja.** `CrashContext.runtime-xml` sisältää myös
> `EpicAccountId`-, `LoginId`- ja `MachineId`-tunnisteesi, koko komentorivin (mukaan lukien
> mahdolliset `-AUTH_*`-arvot) ja asennuspolkusi. `UEMinidump.dmp` sisältää prosessin muistia.
> Kopioi talteen virheilmoitus ja siirtymät. Älä jaa tiedostoja.

### Siirtymistä staattisiin osoitteisiin {#offsets-to-static-addresses}

`<PCallStack>`-kehys näyttää tältä:

```text
Dauntless-Win64-Shipping 0x00007ff7e7e30000 + 28cd7fc
```

Keskimmäinen luku on kohta, johon Windows latasi ohjelmatiedoston sillä ajokerralla. Se muuttuu
joka ajolla, koska ohjelmatiedosto on tehty ASLR:ää (osoiteavaruuden satunnaistusta) varten.
Viimeinen luku on kehyksen siirtymä tuosta perusosoitteesta, eli RVA. Sekä **2.1.1**:n että
**1.4.4**:n ohjelmatiedostojen ensisijainen perusosoite (image base) on `0x140000000`, ja
disassembler (konekieltä luettavaksi purkava ohjelma) toimii tuossa osoiteavaruudessa. Siis:

```text
static address = 0x140000000 + offset
0x140000000 + 0x28cd7fc = 0x1428cd7fc
```

Tämä lyhyt skripti tulostaa raportin jokaisen pelikoodin kehyksen staattisena osoitteena:

```python
#!/usr/bin/env python3
"""Print static addresses for the game-module frames of a UE crash report."""
import re, sys

IMAGE_BASE = 0x140000000          # preferred base of Dauntless-Win64-Shipping.exe (2.1.1 and 1.4.4)
MODULE = "Dauntless-Win64-Shipping"

xml = open(sys.argv[1], encoding="utf-8", errors="replace").read()
print(re.search(r"<ErrorMessage>(.*?)</ErrorMessage>", xml, re.S).group(1).strip())
stack = re.search(r"<PCallStack>(.*?)</PCallStack>", xml, re.S).group(1)
for module, base, offset in re.findall(r"(\S+) 0x([0-9a-fA-F]+) \+ ([0-9a-fA-F]+)", stack):
    if module == MODULE:
        print(f"{IMAGE_BASE + int(offset, 16):#x}")
    else:
        print(f"    ({module} +{offset})")
```

Pura sitten konekieltä kunkin osoitteen ympäriltä komennolla `xref.py func` (katso
[Työkalut]({{ tools_page.url | relative_url }})).

### Mitä kukin kehys tarkoittaa {#what-each-frame-means}

- **Poikkeuksessa** (`EXCEPTION_ACCESS_VIOLATION` ja vastaavat) ensimmäinen pelikoodin kehys on
  itse virheen aiheuttanut käsky.
- **Jokainen muu kehys on paluuosoite.** Se on `call`-käskyä *seuraava* käsky, joten itse kutsu
  päättyy täsmälleen tuohon osoitteeseen. Suora `call rel32` alkaa 5 tavua aiemmin. Epäsuorat
  kutsut vaihtelevat: `call qword ptr [r10 + 0x50]` on 4 tavua. Pura konekieltä hieman
  paluuosoitetta aiemmasta kohdasta, niin näet, mitä kutsuttiin.
- **Assert-virheessä** (`Fatal error: ...`) ylimmät kehykset ovat Unrealin kohtalokkaiden virheiden
  käsittelykoneistoa. Kulje alaspäin ensimmäiseen pelikoodin kehykseen.
- Ohjelmatiedostossa ei ole symbolinimiä. Käyttämämme funktioiden nimet tulevat kunkin funktion
  sisällä olevista `UE_LOG`-muotoilumerkkijonoista, esimerkiksi
  `"FOnlineLoadoutPhoenix::OnGetAllLoadoutsComplete"`. Ne ovat meidän tunnistuksiamme, eivät
  symboleja.

---

## Kaatumistyypit, joihin törmäsimme versiossa 2.1.1 {#signatures-we-hit-on-211}

| Virheilmoitus | Ylimmät pelikoodin kehykset (staattiset) | Syy | Korjaus |
|---|---|---|---|
| `Trying to resize TArray to an invalid size of <billions>` | `0x142e83135` → `0x1428cd7fc` → `0x1428b2628` → `0x1428bc067` → `0x1414356e7` | Taustapalvelumme vastasi varustesarjapyyntöön (loadout) JSON-oliolla, jota asiakasohjelma ei pystynyt täyttämään | Tiukka tila: tuntemattomat reitit palauttavat 404-vastauksen ilman runkoa. Oikea reitti palauttaa koko kirjekuoren (envelope). |
| `EXCEPTION_ACCESS_VIOLATION reading address 0x0000000000000000` | `0x1428dfba5` → `0x1428ddbc5` → `0x1423778ff` | Ei selvitetty tarkasti. Loppui kahden taustapalvelumuutoksen jälkeen (katso alta). | `active_index: -1` ja kahden oletusesineen antaminen jokaiselle pelaajalle |
| `EXCEPTION_ACCESS_VIOLATION reading address 0x0000000000000000` | `0x1427d486f` → `0x1426a561f` → `0x143edae0f` | `UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete` lukee puuttuvaa HTTP-vastausta (staattinen tulkinta, **vahvistamaton**) | Nähty kerran. Ei toistunut viimeisten korjaustemme jälkeen. |
| "Application Hang Detected" | ei mitään (ikkuna, ei kaatumisraporttia) | Unrealin jumiutumisen tunnistin | Katso [muistin karkaaminen](#memory-runaway-when-booting-a-city-map-directly) |

---

## TArray-kaatuminen: oma yleisvastauksemme {#the-tarray-crash-our-own-catch-all}

Yleisvastaus (catch-all) tarkoittaa tässä taustapalvelun reittiä, joka vastaa kaikkiin
pyyntöihin, joille ei ole omaa käsittelijää.

### Oire {#symptom}

2.1.1-asiakasohjelma käynnistyi Ramsgateen ja kuoli 80–120 sekuntia myöhemmin:

```text
Fatal error: [File:Unknown] [Line: 8] Trying to resize TArray to an invalid size of 3163556208
```

Muilla ajokerroilla luvut olivat `3051757616`, `2520240048` ja `3837075504`. Joka kerta eri "koko" on
ensimmäinen vihje. Oikeasta datasta tuleva lukumäärä pysyisi samana.

### Pino selvitettynä {#the-stack-resolved}

| Staattinen osoite | Mikä se on |
|---|---|
| `0x142e83135` | Unrealin kohtalokkaan virheen muotoilija viestille `"Trying to resize TArray%s to an invalid size of %llu"` (funktio `0x142e83100`) |
| `0x1428cd7fc` | Paluu kutsusta `call 0x140c0a6a0` (Unrealin `OnInvalidArrayNum`) varustuksen alustusfunktion `InitializeFromOnlineLoadoutData` (`0x1428cd790`) sisällä |
| `0x1428b2628` | Paluu kutsusta `call 0x1428cd790` käsittelijän sisällä, joka ajetaan, kun varustukset saapuvat (`0x1428b2560`) |
| `0x1428bc067` | Delegaatin välifunktio (thunk) |
| `0x1414356e7` | Delegaatin lähetys (broadcast) funktion `FOnlineLoadoutPhoenix::OnGetAllLoadoutsComplete` (`0x1414353b0`) sisällä |
| `0x1413f4835`, `0x14141c3c9` | Phoenixin HTTP-pyyntöjen valmistumiskoneistoa |
| `0x143edae0f` | HTTP-uudelleenyritysten hallinnan päivityskierros (tick) |
| `0x1414cdb73` | Lisää Phoenixin HTTP-koneistoa |
| `0x1412f8a65`, `0x142e87de7` | Ticker-välifunktioita |
| `0x140bff5dc` | `FEngineLoop::Tick` |

Kaatuminen on siis koodissa, joka käsittelee vastauksen `GetAllLoadoutsEndpoint`-päätepisteeseen
(endpoint, osoite, johon peli lähettää pyynnön):

```text
GET https://loadout-prod.steelyard.ca/loadout/{account_id}/{character_id}/all
```

Itsenäisessä käynnistyksessä molemmat tunnukset olivat tyhjiä, joten verkossa kulkeva pyyntö oli
`GET /loadout///all`.

### Virheen aiheuttava koodi {#the-faulting-code}

```text
0x1428cd7e0  mov   ebx, dword ptr [rdx + 0x108]   ; payload.num_account_slots
0x1428cd7e6  lea   r14, [rcx + 0x728]             ; the slot TArray
0x1428cd7ed  add   ebx, dword ptr [rdx + 0x110]   ; + payload.num_character_slots
0x1428cd7f3  jns   0x1428cd7fc                    ; non-negative: carry on
0x1428cd7f5  mov   ecx, ebx
0x1428cd7f7  call  0x140c0a6a0                    ; negative: fatal "invalid size"
```

Asiakasohjelma laskee yhteen kaksi 32-bittistä paikkamäärää. Vain **negatiivinen** summa päätyy
kohtalokkaaseen kutsuun. Viesti tulostaa sitten summan etumerkittömänä 64-bittisenä lukuna.
`3163556208` on `0xBC900970`, joka on etumerkillisenä 32-bittisenä arvona `-1131411088`. Molemmat
tarkemmin tutkimamme luvut näyttävät 64-bittisen pino-osoitteen alemmalta puolikkaalta. Ne ovat
alustamatonta pinomuistia, eivät jäsennettyä dataa.

### Miksi lukumäärät olivat roskaa {#why-the-counts-were-garbage}

1. **Vastausrakenne on pinon paikallinen muuttuja, eikä sen kuutta lukua nollata koskaan.**
   `OnGetAllLoadoutsComplete`-funktiossa konstruktori kirjoittaa vain vtablen, `loadouts`-taulukon ja
   `persistent`-aliolion. `num_account_slots`, `max_account_slots`, `num_character_slots`,
   `max_character_slots`, `active_index` ja `needs_migration` (siirtymät `+0x108`–`+0x11c`)
   säilyttävät sen, mitä pinossa sattui olemaan.
2. **JSON-lukija kirjoittaa kentän vain, jos se löytää sen oikean tyyppisenä.** `int32`-lukija
   (`0x140c3a870`) tarkistaa `cmp dword ptr [rax+8], 3` (JSON-luku). Jos avain puuttuu tai sisältää
   merkkijonon, se palaa koskematta kohteeseen. `bool`-lukija toimii samoin JSON-totuusarvoille.
3. **`loadout-prod` käärii datansa.** Rungon on oltava `{"code", "message", "payload": {...}}`. Jos
   `payload` puuttuu tai ei ole olio, asiakas ohittaa koko sisällön eikä lue yhtäkään kuudesta
   kentästä.
4. **Se lasketaan silti onnistumiseksi.** Käsittelijä hyväksyy minkä tahansa HTTP-tilakoodin
   väliltä 200–206 ja minkä tahansa rungon, joka jäsentyy JSON-olioksi. Niinpä `200` ja olio ilman
   `payload`-kenttää on "onnistunut" vastaus täynnä pinoroskaa.

### Mitä lähetimme {#what-we-were-sending}

Löysimme Phoenixin rajapinnan antamalla asiakasohjelman kulkea käynnistysvaiheensa läpi
2.1.1-testitaustapalvelumme "discovery"-tilaa (tutkimustilaa) vasten. Jokainen pyyntö
tallennettiin. Jokainen tuntematon reitti vastasi `200` ja uskottavan näköisen paikkamerkin, jotta
asiakas jatkaisi ja paljastaisi seuraavan kutsunsa. Polulle, jossa oli `loadout`, paikkamerkki oli
`{"loadouts": []}`. Kaikelle muulle se oli `{}`. Meillä oli kyllä oikea reitti polulle
`/loadout/{account_id}/{character_id}/all`. Polkuparametri ei kuitenkaan täsmää tyhjään osaan,
joten `/loadout///all` päätyi yleisvastaukseen.

Molemmat paikkamerkit jäsentyvät JSON-olioiksi, läpäisevät tilakoodin tarkistuksen, eikä niissä ole
`payload`-kenttää. Juuri tuollainen syöte tuottaa roskalukumäärät. **Kaatumisen aiheutti oma
yleisvastauksemme.**

### Miksi 404 ilman runkoa on turvallisempi {#why-a-body-less-404-is-safer}

Vaihdoimme taustapalvelun tiukkaan tilaan, jossa tuntemattomat reitit palauttavat `404`-vastauksen
**kokonaan ilman runkoa**:

- 404 on välin 200–206 ulkopuolella, joten asiakas valitsee virhehaaransa eikä koskaan lue
  rakennetta.
- Runko on tyhjä tarkoituksella. Jotkin käsittelijät saattavat jäsentää rungon tilakoodista
  riippumatta. JSON-muotoinen virherunko, kuten `{"error": "not found"}`, olisi silloin taas sama
  vaara.
- Hinta näkyy. 404 jättää yleensä odottavan lataajan kesken, ja asiakas yrittää pyyntöä uudelleen.
  Se näkyy pyyntölokissa seuraavana toteutettavana asiana. Se ei piiloudu hiljaiseksi muistin
  sotkeutumiseksi.

Mitattuna samalla käynnistyksellä: kun discovery-tila oli päällä, kaatuminen tuli noin 85 sekunnin
kohdalla. Tiukassa tilassa asiakas pysyi hengissä 220 sekuntia ja pidempään. Sen jälkeen kytkimme
discovery-tilan päälle vain uuden liikenteen kartoittamiseen, emme koskaan silloin, kun yritimme
pelata.

Vielä yksi ansa: **pelkkä JSON-taulukko** ylimmällä tasolla välttää myös kaatumisen, mutta vain
siksi, että `FJsonSerializable::FromJson` (`0x140c2fbe0`) vaatii ylimmälle tasolle olion eikä pysty
jäsentämään taulukkoa. Varustesarjojen lataaja valitsee silloin epäonnistumispolkunsa, ei koskaan
ilmoita olevansa valmis, eikä pelaajahahmo (pawn) koskaan ilmesty. Se on vakaa, mutta se ei ole
korjaus.

### Oikea korjaus {#the-real-fix}

Reitti palauttaa nyt koko kirjekuoren, jossa jokainen luku on lainausmerkitön JSON-luku ja
`needs_migration` on oikea JSON-totuusarvo:

```json
{
  "code": "OK",
  "message": "",
  "payload": {
    "loadouts": [],
    "persistent": {
      "manual_emotes": [], "intro_emote": "", "banner": "", "bannerCustomization": "",
      "flare": "", "title": "", "head_accessory": "", "back_accessory": "", "pet": "",
      "glider": "", "update_version": 0, "quick_chats": [], "emojis": [],
      "quick_curiosities_items": [], "quickwheel": []
    },
    "num_account_slots": 1,
    "max_account_slots": 5,
    "num_character_slots": 0,
    "max_character_slots": 0,
    "active_index": -1,
    "needs_migration": false
  }
}
```

- Paikkojen yhteismäärän on oltava suurempi kuin 0. Arvolla 0 asiakas kirjaa lokiin "Loadout active
  index is invalid (no loadouts exist!)", eikä lataaja koskaan valmistu.
- Lähetämme yhden paikan, emme neljää tai kahdeksaa. Asiakas rakentaa oletusvarustuksen jokaiseen
  tyhjään paikkaan `DefaultGame.ini`-tiedoston `[DefaultLoadout]`-osion perusteella. Vähemmän
  paikkoja tarkoittaa vähemmän mahdollisuuksia epäonnistua.
- `active_index` on `-1`. Seuraava osio kertoo, mitä tiedämme ja mitä emme tiedä siitä, miksi.

Kenttäkohtainen rakenne on sivulla [Taustapalvelun rajapinta]({{ contract_page.url | relative_url }}).

---

## Muistinkäyttövirhe, kun `active_index: 0` eikä varustuksia ole {#the-access-violation-after-active_index-0-with-no-loadouts}

Muistinkäyttövirhe (access violation) tarkoittaa, että ohjelma yritti lukea muistia, johon sillä ei
ole pääsyä.

### Oire {#symptom-1}

Kun kirjekuori oli paikallaan, TArray-kaatuminen oli poissa. Noin 20 sekuntia käynnistyksen jälkeen
ilmestyi uusi kaatuminen:

```text
Unhandled Exception: EXCEPTION_ACCESS_VIOLATION reading address 0x0000000000000000
```

### Pino {#the-stack}

```text
0x1428dfba5   faulting instruction
0x1428ddbc5
0x1423778ff
```

Virheen aiheuttava koodi funktiossa, joka alkaa osoitteesta `0x1428dfb70`:

```text
0x1428dfb9b  call  0x1428bda70              ; returns an object pointer, can return null
0x1428dfba0  lea   rdx, [rsp + 0x20]
0x1428dfba5  mov   rcx, qword ptr [rax]     ; read the vtable of a null object -> AV at 0x0
0x1428dfba8  mov   r8, qword ptr [rcx + 0x2c0]
0x1428dfbaf  mov   rcx, rax
0x1428dfbb2  call  r8
```

Apufunktio ei palauta oliota, ja kutsuja tekee sille virtuaalikutsun tarkistamatta. Molemmat
funktiot sijaitsevat varustesarjakoodin alueella (`0x1428c...`–`0x1428e...`). Emme nimenneet niitä.

### Syy ja korjaus {#cause-and-fix}

Kuudessa seitsemästä 2.1.1-muistinkäyttövirheraportistamme, jotka kaikki ovat noin 20 minuutin
testauksesta, on sama ylin kehys. Tuona aikana teimme taustapalveluun kaksi muutosta. Molempien
jälkeen kaatuminen loppui:

1. **`active_index: -1` arvon `0` sijaan.** Olimme lähettäneet `"active_index": 0` yhdessä
   `"loadouts": []`-kentän kanssa. Suorassa A/B-testissä käynnistys kuoli arvolla `0` noin 20
   sekunnin kohdalla. Arvolla **`-1`** se kesti yli 65 sekuntia ja pääsi varustesarjajärjestelmän läpi.
   Emme pysty selittämään tätä lukemamme koodin perusteella. Varustesarjan alustusfunktio tarkistaa
   indeksin kohdassa `0x1428cda4d`: paikkavälin sisällä oleva indeksi käytetään sellaisenaan, ja
   negatiivinen tai välin ulkopuolinen indeksi, kun paikkoja on olemassa, vain kirjaa lokiin
   "Loadout active index is invalid. Falling back on the first loadout index!" ja käyttää arvoa 0.
   Yhdellä paikallamme molempien arvojen pitäisi siellä päätyä aktivoimaan paikka 0. Mikä tahansa
   saikin arvon `-1` toimimaan paremmin, se tapahtuu jossain, mitä emme jäljittäneet
   (**selittämätön**).
2. **Ase ja lyhty jokaiselle pelaajalle.** `CheckForPlayerStart` pysähtyy viesteihin
   `"ArchonCharacter->Weapon is nullptr"` ja `"->Lantern is nullptr"`, ja epäilimme, että
   oletusvarustuksen rakentaminen vaatii myös varustetun aseen (**vahvistamaton**). Alkuperäisillä,
   virallisilla palvelimilla opetusosio (tutorial) antoi harjoitusaseen ja peruslyhdyn. Itsenäinen
   käynnistys ohittaa opetusosion, joten pelaajalla ei ollut kumpaakaan. 2.1.1-taustapalvelumme
   antaa nyt jokaiselle pelaajalle ne kaksi esinettä, jotka `[DefaultLoadout]` nimeää
   (`WP_EB_TRAINING` ja `LT_BASIC`). Se ilmoittaa ne sekä tavaraluettelotapahtuman (inventory
   transaction) tuloksessa että tallennetussa tavaraluettelossa. Asiakas saa tietää esineen
   olemassaolosta vain jommastakummasta näistä kahdesta paikasta.

Pelkistä raporteista ei selviä, kumpi kahdesta muutoksesta korjasi minkäkin kaatumisen. Emme
jäljittäneet kumpaakaan syytä staattisesti kohtaan `0x1428dfba5`. `<SecondsSinceStart>` ei
myöskään auttanut: sen arvo on 0 kolmessa näistä seitsemästä raportista, joten emme luota siihen.

### Pelaajan polun (player journey) kaatuminen {#the-player-journey-crash}

2.1.1-raporttiemme viimeinen muistinkäyttövirhe tapahtuu osoitteessa `0x1427d486f`, funktion
`UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete` (`0x1427d47a0`) sisällä. Kutsu tulee
HTTP-pyyntöjen valmistumispolulta, joten kyseessä on player journey -vastauksen käsittelijä
(`GET progression-prod/pjm/...`). Se tapahtui kerran, vähän ennen viimeistä korjauskierrostamme.
Useat sen jälkeiset viiden minuutin kestoajot eivät tuottaneet minkäänlaista kaatumista, emmekä
koskaan saaneet sitä toistumaan.

Lyhyt jälkikäteinen katsaus käsittelijään:

```text
0x1427d47d4  mov   rsi, r8                  ; third argument: the HTTP response pointer
...
0x1427d486c  mov   rcx, qword ptr [rsi]     ; the response object
0x1427d486f  mov   rax, qword ptr [rcx]     ; read its vtable -> AV at 0x0 if there is no response
0x1427d4872  call  qword ptr [rax + 0x40]   ; the response code
0x1427d4875  add   eax, 0xffffff38          ; - 200
0x1427d487c  cmp   eax, 6                   ; the usual 200..206 check
```

Käsittelijä kysyy vastaukselta sen tilakoodia tarkistamatta, onko vastausta olemassa. Pyyntö, joka
päättyy kokonaan ilman HTTP-vastausta (torjuttu, katkaistu tai aikakatkaistu), antaa sille tyhjän
(null) vastauksen. Tämän tulkinnan mukaan kaatumisen aiheutti player journey -pyyntö, joka ei saanut
vastausta, eikä väärän muotoinen runko (**vain staattinen tulkinta, testaamaton**). Rungon muoto on
erillinen avoin kysymys. Tarjoamme `{"nodes": {...}}`, eli solmutunnuksilla avainnetun olion, joka on
kopioitu asiakasohjelman omasta `POST /pjm` -rungosta, ja lähetämme sen litteänä (ilman
kirjekuorta). Staattinen tulkintamme sanoo, että `GET /pjm` on luultavasti kääritty
`{code, message, payload}` -kirjekuoreen (katso
[Taustapalvelun rajapinta]({{ contract_page.url | relative_url }})).

---

## Muistin karkaaminen, kun kaupunkikartta käynnistetään suoraan {#memory-runaway-when-booting-a-city-map-directly}

### Mitä tapahtui {#what-happened}

Versiossa **2.1.1** käynnistimme asiakasohjelman suoraan `ramsgate_01_persistent`-kartalle
ohittamalla `GameDefaultMap`-asetuksen (katso
[Itsenäinen käynnistys 2.1.1:llä]({{ awakening_page.url | relative_url }})). Ilman rajoja asiakas
kasvoi noin **9 gigatavuun** ja nosti 32 gigatavun tietokoneen muistinkäytön 98 prosenttiin (31,3 /
31,9 Gt käytössä). Emme selvittäneet, miksi se kasvoi niin suureksi. Arvauksemme on, ettei tätä
polkua ole koskaan viritetty, koska tavallinen kirjautumiskulku ei koskaan lataa kaupunkia tällä
tavalla (**vahvistamaton**).

### Rajat {#the-caps}

Nämä rivit käyttäjän `Engine.ini`-tiedostossa
(`%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Engine.ini`) laskivat saman käynnistyksen
**huippukulutuksen noin 2,8 gigatavuun**. Niiden kanssa Ramsgate latautui noin 20 sekunnissa:

```ini
[SystemSettings]
r.TextureStreaming=1
r.Streaming.PoolSize=400
r.Streaming.LimitPoolSizeToVRAM=1
r.Streaming.FullyLoadUsedTextures=0
r.MipMapLODBias=2
gc.TimeBetweenPurgingPendingKillObjects=10
s.ForceGCAfterLevelStreamedOut=1
s.ContinuouslyIncrementalGCWhileLevelsPendingPurge=1
r.ScreenPercentage=70
sg.ViewDistanceQuality=0
sg.ShadowQuality=0
sg.PostProcessQuality=0
sg.TextureQuality=0
sg.EffectsQuality=0
sg.FoliageQuality=0
sg.AntiAliasingQuality=0
```

Otimme nämä käyttöön yhdessä emmekä mitanneet kunkin vaikutusta erikseen. Odotamme tekstuurien
suoratoistopoolin koon (`r.Streaming.PoolSize`, megatavuina) vaikuttavan eniten
(**vahvistamaton**). Muut vaihtavat ulkonäköä lisätilaan.

### Vahtikoira {#the-watchdog}

Rajat eivät riitä kokeilujen aikana. Käynnistysskriptimme käynnistävät pelin ja tarkistavat sitten
sen muistinkäytön (working set) muutaman sekunnin välein. Kun kiinteä raja ylittyy, ne tappavat
prosessin, ennen kuin tietokone alkaa siirtää muistia levylle (swap). Pienin mahdollinen
PowerShell-versio:

```powershell
param([int]$CapMB = 6500, [int]$MaxSeconds = 240)
$exe = "<game folder>\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe"
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru -ArgumentList @(
  "-EpicPortal", "-windowed", "-ResX=1280", "-ResY=720")
$t = 0; $peak = 0
while ($t -lt $MaxSeconds) {
  Start-Sleep -Seconds 5; $t += 5
  $pp = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if (-not $pp) { "exited at ${t}s (peak ${peak} MB)"; return }
  $mb = [int]($pp.WorkingSet64 / 1MB); if ($mb -gt $peak) { $peak = $mb }
  if ($mb -gt $CapMB) { "cap hit: ${mb} MB at ${t}s - killing"; Stop-Process -Id $p.Id -Force; return }
}
"alive at ${t}s, peak ${peak} MB"
```

Lisää oman versiosi kirjautumisvalitsimet `-ArgumentList`-kohtaan. Kun `$MaxSeconds` täyttyy,
skripti lopettaa tarkkailun mutta jättää pelin käyntiin, joten raja ei enää ole voimassa.
2.1.1-skriptimme käytti 6,5 gigatavun rajaa. Versiossa **1.4.4** luvut ovat paljon pienempiä.
Mittasimme asiakasohjelman 1,5–1,8 gigatavuksi, Ramsgate-pelipalvelinprosessin noin 1,1
gigatavuksi ja opetusosion palvelimen noin 0,9 gigatavuksi. 1.4.4-käynnistysskriptimme käyttävät
silti vahtikoiraa: 12 Gt asiakasohjelmalle ja 5 Gt käsin käynnistetylle palvelimelle.

### Jumiutumisen tunnistin {#the-hang-detector}

Toinen tapa, jolla suora kaupunkikäynnistys päättyi versiossa 2.1.1, oli Unrealin
"Application Hang Detected" -ikkuna muutama minuutti sen jälkeen, kun Ramsgate oli piirtynyt
näkyviin. Emme koskaan saaneet selville, mikä säie jumittui tai miksi. Kirjautumiskulkua ei ollut
tässä käynnistyksessä ajettu lainkaan, mikä tekee siitä ilmeisen epäillyn, mutta sitä ei ole
todistettu. Tutkimista varten aseta `HangsAreFatal=False` käyttäjän `Engine.ini`-tiedoston
`[Core.System]`-osioon. Jumiutumisesta ilmoitetaan silloin yhä, mutta prosessia ei tapeta. Nosta
myös `PlayerStartEventTimeout` `Game.ini`-tiedoston osiossa
`[/Script/Archon.ArchonPlayerController]`, jotta 120 sekunnin turvaraja ei peitä todellista syytä.
Jokainen valitsin sekä sen hyvät ja huonot puolet käydään läpi kohdassa
[Jumiutumisen tunnistin]({{ internals_page.url | relative_url }}#the-hang-detector) sivulla
Asiakasohjelman sisäosat.

---

## Yleinen opetus {#the-general-lesson}

- **Paikkamerkki ei ole neutraali.** Tämä asiakasohjelma purkaa datan rakenteisiin, joita se ei
  koskaan nollaa. "Uskottava" vastaus, jota se ei pysty täyttämään kokonaan, antaa sille roskaa, ja
  roska tulee esiin myöhemmin jossain muualla. 404 ilman runkoa epäonnistuu äänekkäästi,
  turvallisesti ja oikeassa paikassa. Lähetä täsmälleen se, mitä asiakas lukee, tai ei mitään.
- **Tyypit ovat osa sopimusta.** Lukujen on oltava ilman lainausmerkkejä, totuusarvojen oikeita
  JSON-totuusarvoja ja taulukoiden taulukoita. Väärän tyyppinen arvo ohitetaan hiljaa, mikä tässä
  asiakasohjelmassa jättää kentän alustamatta eikä nollaksi.
- **Pelikoodin kaatumisen aiheuttaa usein vastaus, joka saapui juuri ennen sitä.** Seuraa
  paluuosoitteita takaisin HTTP-pyynnön valmistumisen käsittelijään ja sieltä päätepisteeseen.
  Tarkista myös, selviääkö käsittelijä tilanteesta, jossa vastausta ei tule lainkaan.
- **Hae muodot asiakasohjelmasta, älä arvaa.** Lue datan purkava koodi (deserialiser) tai tallenna
  asiakasohjelman omat pyyntörungot samalle resurssille. Tämä rajapinta on pitkälti symmetrinen, ja
  useat muodot, kuten `pjm` ja `cooldown`, tulivat suoraan siitä, mitä asiakasohjelma itse
  lähetti.
- **Pidä muuttuvaa lukua vihjeenä.** Joka ajolla erilainen "invalid size" tarkoitti alustamatonta
  muistia, ei huonoa dataa.
- **Rajoita resurssit ennen kuin kokeilet,** ja käsittele kaatumisraportteja yksityisinä tietoina.
