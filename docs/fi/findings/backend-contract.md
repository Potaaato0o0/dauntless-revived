---
title: Taustapalvelun rajapinta
parent: Löydökset
grand_parent: Dauntless Revived suomeksi
nav_order: 3
lang: fi
ref: findings/backend-contract
locale: fi_FI
description: "Dauntlessin taustapalvelut steelyard.ca-palvelimilla (ei PlayFab): palvelinnimet, kuorisäännöt ja vastausten muodot, selvitetty pelin omasta koodista."
---

{% assign rev_page = site.pages | where: "path", "fi/findings/json-reversing.md" | first %}
{% assign awakening_page = site.pages | where: "path", "fi/findings/awakening-2-1-1.md" | first %}
{% assign mp_page = site.pages | where: "path", "fi/findings/multiplayer.md" | first %}
{% assign crashes_page = site.pages | where: "path", "fi/findings/crashes.md" | first %}
{% assign escalation_page = site.pages | where: "path", "fi/findings/escalation.md" | first %}
{% assign store_page = site.pages | where: "path", "fi/findings/store.md" | first %}
{% assign config_page = site.pages | where: "path", "fi/reference/configuration.md" | first %}
{% assign game_page = site.pages | where: "path", "fi/reference/game-settings.md" | first %}

# Taustapalvelun rajapinta
{: .no_toc }

Dauntless keskustelee Phoenix Labsin verkkopalvelujen kanssa HTTPS-yhteyksillä (salatuilla
verkkoyhteyksillä). Nuo palvelut suljettiin pelin mukana, joten ainoa jäljellä oleva täydellinen
kuvaus niistä on asiakasohjelman (pelaajan koneella toimivan peliohjelman) koodi, joka kutsuu niitä
ja lukee niiden vastaukset. Tämä sivu on tuo kuvaus: palvelinnimet, kuorisäännöt ja ne päätepisteet
(verkko-osoitteet, joihin peli lähettää pyyntönsä), joiden tarkat vastausmuodot olemme saaneet
selville. Vastaukset ovat JSON-muotoista tekstiä (yleinen tapa, jolla ohjelmat lähettävät tietoa
toisilleen), ja kuori tarkoittaa yhteistä kehystä, jonka sisään varsinainen tieto pakataan.

Suurin osa on luettu **2.1.1**-asiakasohjelmasta (viimeinen julkaisu, UE5). Kun tiedämme, miten
**1.4.4** (lokakuu 2020, UE4, versio jota pelaamme) käyttäytyy, kerromme sen. Sitä, miten muodot
luetaan ohjelmatiedostosta, käsitellään sivulla
[JSON-rakenteen lukeminen ohjelmatiedostosta]({{ rev_page.url | relative_url }}).

<details open markdown="block">
  <summary>Sisällys</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Kuinka varmoja olemme {#how-sure-we-are}

Jokaisella tämän sivun muodolla on yksi seuraavista merkinnöistä.

| Merkintä | Merkitys |
|---|---|
| **testattu** | Palvelimemme lähetti tämän oikealle asiakasohjelmalle, ja asiakasohjelma toimi sen mukaan näkyvästi: se teki ketjun seuraavan kutsun, loi hahmon tai jatkoi toimintaansa kohdassa, jossa se ennen kaatui. |
| **koodista luettu** | Luettu asiakasohjelman jäsentimestä ohjelmatiedostossa. Palvelimemme saattaa lähettää sen, mutta emme ole nähneet todisteita siitä, että asiakasohjelma käytti sitä. |
| **Undaunted** | Se, mitä [Undauntedin](https://github.com/SyST3MDeV/Undaunted) palvelin lähettää 1.4.4-asiakasohjelmalle, jolla sen kautta oikeasti pelataan. Tämä osoittaa, että asiakasohjelma *hyväksyy* muodon. Se ei osoita, että asiakasohjelma jäsentää sen. Useat näistä lataajista jatkavat, vaikka jäsennys epäonnistuisi. |
| **varmistamaton** | Päätelty, tai lähteemme ovat eri mieltä. Tekstissä kerrotaan kumpi. |

Osoitteet ovat staattisia virtuaaliosoitteita version 2.1.1 tiedostossa
`Dauntless-Win64-Shipping.exe`, kantaosoite `0x140000000`. Ne eivät päde versioon 1.4.4.

---

## Ei PlayFab: `OnlineSubsystemPhoenix` osoitteessa steelyard.ca {#not-playfab-onlinesubsystemphoenix-on-steelyardca}

Jotkin aiemmat yhteisön kirjoitukset väittivät Dauntlessin taustapalvelun olevan PlayFab. **Se ei
ole.** Version 2.1.1 151 megatavun ohjelmatiedostossa on täsmälleen kaksi PlayFab-polkua
(`/Client/UpdateUserTitleDisplayName` ja `/Server/WriteTitleEvent`) eikä PlayFab-kirjautumista
lainkaan. Taustapalvelu on **`OnlineSubsystemPhoenix`**: Phoenix Labsin oma REST-rajapinta
**`steelyard.ca`**-verkkotunnuksessa.

Päätepistetaulukko on paketoiduissa asetuksissa (pelin mukana toimitetuissa, valmiiksi käsitellyissä
asetustiedostoissa): `DefaultGame.ini`, osio `[OnlineSubsystemPhoenix]`. Jokainen päätepiste on avain,
jonka arvo on osoitepohja, esimerkiksi:

```ini
EntitlementsEndpoint = "https://auth-{environment}.steelyard.ca/entitlementsv2"
```

`{environment}` saa arvon `prod`. Laskujemme mukaan version 2.1.1 osiossa on 198 avainta, joiden arvo
on `http(s)`-osoite, ja version 1.4.4 osiossa 166, ja lisäksi kummassakin yksi `ws://`-avain
(presence-yhteys). Osa on kehitys- tai testiympäristön merkintöjä tai `_v2`-kaksoiskappaleita.

Tiedoston saaminen ulos:

- **2.1.1** pitää asetuksensa tiedostossa `Archon_50-WindowsClient.pak`. Se on pakattu Oodlella, eikä
  pelin mukana tule `oo2core`-DLL:ää (Oodle on linkitetty staattisesti), joten tavalliset
  pak-työkalut eivät saaneet sitä auki. Käänsimme avoimen lähdekoodin `ooz`-purkajan jaetuksi
  kirjastoksi ja ohjasimme sitä Pythonista.
- **1.4.4** käyttää pak v9 -muotoa, jossa on salaamaton vanhanmallinen indeksi ja zlib-pakkaus.
  Asetukset ovat tiedostossa `Archon_35-WindowsClient.pak`. Pieni pak v9 -lukija riittää.

> **Salaisuudet julkaistuissa asetuksissa.** Version 2.1.1 paketoiduissa asetuksissa on toimiva
> Slack-webhook-osoite (avain `PhoenixEventsMessageEndpoint`) sekä Epic Online Services -palvelun
> asiakassalaisuus ja salausavain selväkielisinä. Version 1.4.4 asetuksissa on myös Slack-webhook.
> Mitään näistä ei toisteta tässä, eikä yksityispalvelin tarvitse niistä yhtäkään.

---

## Palvelinnimet {#hosts}

Jokainen palvelinnimi noudattaa kaavaa `<service>-prod.steelyard.ca`, muutamaa poikkeusta lukuun
ottamatta. Version 2.1.1 tutkimuspalvelimemme vastasi niihin kaikkiin niin, että jokainen nimi
ohjattiin hosts-tiedostossa (Windowsin tiedosto, joka kertoo, mihin koneeseen mikäkin verkkonimi
osoittaa) palvelimelle itselleen (sekä `127.0.0.1` että `::1`). Undaunted tekee sen versiossa 1.4.4
toisin: sen ohjelmaan ujuttama DLL (ohjelmakirjasto, jonka koodi liitetään käynnissä olevaan peliin)
koukuttaa asiakasohjelman asetushaun ja kirjoittaa jokaisen
`[OnlineSubsystemPhoenix]`-osoitteen uudelleen tavalliseksi `http://`-osoitteeksi metagame-palvelimen
(Undauntedin taustapalvelu, joka korvaa Phoenixin verkkopalvelut) omaan osoitteeseen, joten
hosts-tiedostoa tai TLS-salausta ei tarvita. Pelipalvelinprosessit saavat saman vaikutuksen käyttäjän
`Game.ini`-tiedostoon lainausmerkeissä kirjoitetuista ohituksista (katso alla).

| Palvelinnimi | Mihin asiakasohjelma sitä käyttää | Kuori |
|---|---|---|
| `auth-prod` | Salasanakirjautuminen, tilitiedot, tunnisteet (tags), porttikieltotarkistus, käyttöoikeudet (entitlements) | litteä |
| `gamesession-prod` | Epicin tunnisteen vaihto Phoenixin istuntotunnisteeksi, tilien linkitys, alustan ominaisuudet | kuoressa |
| `login-queue-prod` | Kirjautumisjono, huoltokatkon tila | litteä |
| `dauntless-prod` | Hahmot, tavaraluettelo, kilta | litteä; `GET /character` on paljas taulukko |
| `loadout-prod` | Varustukset (loadouts) | kuoressa |
| `progression-prod` | Eteneminen, pelaajan polku (`/pjm`), odotusajat (cooldowns), escalation, palkkiotehtävät (bounties), pelin viritysarvot (game tuning) | sekalainen; katso [Eteneminen](#progression-progression-prod) |
| `mm2-prod` | Matchmaking (pelaajien yhdistäminen samaan peliin), porukat (parties), äänikanavalle liittyminen | katso [Matchmaking](#matchmaking-and-travel-mm2-prod) |
| `presence-prod` | Istunnon WebSocket-yhteys, **tavallinen `ws://` portissa 80** | — |
| `gauntlet-prod` | Gauntlet (vain 2.1.1) | kuoressa |
| `mailbox-prod` | Posti, tapahtumatilastot, päivitysmuistiinpanot, kyselyt | kuoressa siltä osin kuin luimme |
| `cohort-prod` | A/B-testien käsittelyryhmät (treatments) | kuoressa |
| `migration-prod` | Pelaajatietojen siirto alustalta toiselle (vain 2.1.1) | litteä |
| `store-prod` | Kauppa, täsmäytys (reconcile), sisällöntuottajakoodit | litteä siltä osin kuin luimme |
| `tracking-prod`, `telemetry-ingest-prod`, `telemetry` | Sykeviesti (heartbeat), analytiikkatapahtumat, lokien lähetys | — |
| `breadcrumbs-prod`, `guild-prod`, `leaderboards-prod`, `motd-prod`, `profanity-filter-prod`, `social-prod`, `subscription-prod` | Kuten nimi kertoo | — |
| `steelyard.online/dauntless-status` | Tilabanneri, **tavallinen `http://`** | litteä |
| `cdn.playdauntless.com`, `store.playdauntless.com` | Uutiskuvat, verkkokauppa | — |

"Kuoressa" tarkoittaa, että vastaus on kääritty yhteiseen kehykseen (katso [Kuori](#the-envelope)).
"Litteä" tarkoittaa, että vastaus on tavallinen JSON-olio ilman kuorta.

---

## Säännöt, jotka koskevat jokaista päätepistettä {#rules-that-apply-to-every-endpoint}

Nämä pätevät versioon 2.1.1, jonka käsittelijät luimme. Emme ole nähneet version 1.4.4 rikkovan
yhtäkään niistä.

- **Vain tilakoodit 200–206.** Jokainen lukemamme valmistumiskäsittelijä tarkistaa tilakoodin
  käskyillä `add eax, 0xffffff38 / cmp eax, 6 / ja <fail>`, mikä tarkoittaa `200 <= status <= 206`.
  Kaikki muu ohjautuu epäonnistumishaaraan ennen kuin runkoa luetaan. Kirjautumisjono haluaa
  täsmälleen koodin 200.
- **Ylimmällä tasolla JSON-olio.** Lähes jokainen vastaus kulkee funktion
  `FJsonSerializable::FromJson(const FString&)` (`0x140c2fbe0`) kautta, ja se vaatii JSON-olion. Paljas
  taulukko ei jäsenny. Tuo epäonnistuminen on turvallinen, mutta useimmiten vastausta odottava
  lataaja ei koskaan valmistu. Ainoa poikkeus on `GET /character`, joka jäsennetään taulukkona.
- **Puuttuvat tai väärän tyyppiset kentät eivät ole virheitä.** Tyypitetyt lukijat ohittavat kentän,
  joka puuttuu tai on väärää JSON-tyyppiä, ja jättävät C++-jäsenen ennalleen. Osa vastausrakenteista on
  pinossa (ohjelman väliaikaisessa työmuistissa) eikä niitä koskaan nollata, joten "ennalleen" voi tarkoittaa alustamatonta muistia. `"7777"`
  siellä, missä asiakasohjelma odottaa arvoa `7777`, ei ole validointivirhe: kenttä ohitetaan hiljaa,
  ja rakenteessa, jota ei ole koskaan nollattu, se tarkoittaa määrittelemätöntä käytöstä.
  Yksityiskohdat ovat [takaisinmallinnussivulla]({{ rev_page.url | relative_url }}#why-types-are-load-bearing).
- **Tuntematon reitti: `404` tyhjällä rungolla.** Älä koskaan vastaa tuntemattomaan reittiin `{}`.
  Juuri se kaatoi asiakasohjelmamme (katso
  [Väärä muoto kaataa]({{ rev_page.url | relative_url }}#a-wrong-shape-crashes-it-does-not-fail)).
- **Kuuntele sekä IPv4:ää että IPv6:ta.** Hosts-tiedosto ohjaa jokaisen nimen sekä osoitteeseen
  `127.0.0.1` että `::1`, joten asiakasohjelma voi ottaa yhteyden kumman tahansa kautta. Version 2.1.1
  palvelimellamme (uvicorn) sidomme kummankin osoiteperheen erikseen, koska `::`-sidonta asettaa
  `IPV6_V6ONLY`-valinnan.
- **TLS pelin omaa CA-kokoelmaa vasten.** Asiakasohjelma tarkistaa palvelinvarmenteet mukana tulevaa
  `cacert.pem`-tiedostoa vasten (luettelo varmentajista, joihin peli luottaa), ei Windowsin
  varmennevarastoa vasten. 2.1.1 lukee pelikansiosta irrallisen tiedoston
  `Engine/Content/Certificates/cacert.pem`, ja sinne laitoimme oman yksityisen varmentajamme version
  2.1.1 testausta varten. 1.4.4 pitää kokoelmansa tiedoston `Archon_0-WindowsClient.pak` sisällä. Emme
  koskaan koske Windowsin luottamusvarastoon. (Undaunted välttää koko kysymyksen versiossa 1.4.4
  kirjoittamalla jokaisen osoitteen uudelleen `http://`-muotoon, kuten kohdassa
  [Palvelinnimet](#hosts) kerrotaan.)
- **Laita osoitteet lainausmerkkeihin käyttäjän ini-ohituksissa.** Päätepisteet voi ohittaa käyttäjän
  asetuksissa, `%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Game.ini`. Meidän 1.4.4-kokoonpanomme
  ohjaa pelipalvelinprosessinsa metagame-palvelimeen tällä tavalla. Jos osoite jää ilman
  lainausmerkkejä, ini-jäsennin tulkitsee merkit `//` kommentin aluksi ja katkaisee arvon muotoon
  `https:`.

---

## Kuori {#the-envelope}

Monet palvelut käärivät vastauksensa kuoreen:

```json
{"code": "OK", "message": "", "payload": { }}
```

`payload` on yleensä olio. Se voi olla myös taulukko (gauntletin tulostaulukko) tai pelkkä luku
(gauntletin kiltapalkinnot). Muistissa kääre on järjestetty näin (vtable on olion funktiotaulun
osoite): vtable `+0x00`, `code` `+0x08`,
`message` `+0x18`, payload `+0x28`.

**Jos `payload` puuttuu tai on väärää JSON-tyyppiä, jäsennys onnistuu silti, eikä sisältörakenteeseen
kosketa.** Litteä runko, joka lähetetään kuorta odottavaan päätepisteeseen, siis "toimii": ei virhettä,
ei uudelleenyritystä, vain oletusarvot. Niin kävi kutsun `GET /account/link/...` kanssa: se antoi
saman tuloksen litteällä rungolla `{"isLinked": true}` ja `{"isLinked": false}`, koska asiakasohjelma
ei lukenut kumpaakaan.

Oletimme ensin, että kuorta käyttää vain `gamesession-*`. Käsittelijöiden lukeminen osoitti, että
kääre on paljon yleisempi:

| Muoto | Missä (2.1.1) |
|---|---|
| **Kuoressa**, `code` on merkkijono | `gamesession-*`, `loadout-*`, `gauntlet-*`, `cohort-*`, `mailbox-*` (`/eventstats/`, `/all/`), ja `progression-prod`-palvelussa: `/progression/config`, `/escalation/...`, `/progression/{a}/{p}` sekä staattisen luentamme mukaan `/pjm` |
| **Kuoressa**, `code` on **int32** ja `payload` **taulukko** | `progression-prod` `/progression/{accountid}` ja `/progression/objectives/{accountid}` |
| **Litteä** olio | `auth-*`, `dauntless-*` (paitsi `GET /character`), `login-queue-*`, `migration-*`, `store-*`, `progression-prod` `/cooldown` ja `/bounty`, `dauntless-status` |
| **Paljas taulukko** | `GET dauntless-prod/character` |

Millään jäljittämällämme polulla mikään ei toimi `code`-kentän perusteella. (Loadout-käsittelijä
muuntaa sen virhearvoksi, mutta sen kuuntelija ei koskaan katso tuota arvoa.) Undaunted lähettää
versiolle 1.4.4 lähes jokaisessa kuorellisessa vastauksessa `"code": null`, ja 1.4.4 toimii sen kanssa;
poikkeus on `/candidate/regions`, joka saa arvon `"code": 200`. Lähetä silti merkkijono (tai luku
int32-muunnelmalle), jotta kenttä ainakin jäsentyy.

---

## Kirjautuminen ja istunto (2.1.1) {#login-and-session-211}

Tämä on version 2.1.1 käynnistysketju siinä järjestyksessä, jossa asiakasohjelma sitä kutsuu. Näillä
vastauksilla asiakasohjelma kirjautuu sisään, ja `FOnlineIdentityPhoenix` ilmoittaa kirjautumisen
valmistuneen oikealla tilitunnisteella. Se todistaa jokaisen alla **testatuksi** merkityn rivin
toimivan alusta loppuun.

| # | Kutsu | Vastaus | Merkintä |
|---|---|---|---|
| 1 | `POST login-queue-prod/login` | litteä, täsmälleen viisi kenttää (alla) | testattu |
| 2 | `GET gamesession-prod/features/platform/{platform}` | `crossplay`, `crossprogression` (totuusarvoja) | testattu, katso huomautus |
| 3 | `GET gamesession-prod/account/link/{service}/{accountid}` | kuoressa, payload `{"isLinked": true}` | testattu |
| 4 | `PUT gamesession-prod/gamesession/{linkedaccountservice}` | kuoressa, payload `{"sessiontoken", "sessionid"}` | testattu |
| 5 | `GET auth-prod/accountinfo` | litteä `{"username", "accountId"}` | testattu |
| 6 | `GET auth-prod/tags`, `GET auth-prod/isbanned` | vastattu; muotoa ei luettu | — |
| 7 | `GET dauntless-prod/character` ja siitä eteenpäin | katso [Hahmot](#characters-dauntless-prod) | testattu |

**Kirjautumisjono.** Vastauksen lukee käsin kirjoitettu läpikävijä (visitor), joka tuntee täsmälleen
viisi avainta:

```json
{"state": "OPEN", "error_code": "", "title": "", "message": "", "timeout": 5000}
```

`UArchonLoginQueueClient` päästää pelaajan läpi vain, kun `state` on `OPEN` (kirjainkoolla ei ole
väliä). Mikä tahansa muu tila, tai `state`-kentän puuttuminen kokonaan, saa sen kysymään uudelleen
`max(timeout * 0.001, 5.0)` sekunnin kuluttua. Muut avaimet jätetään yksinkertaisesti huomiotta:
varhaisissa vastauksissamme oli kenttiä kuten `position` ja `ready` mutta ei `state`-kenttää, ja
asiakasohjelma jatkoi kyselemistä 5 sekunnin välein. `timeout`-kentän on oltava JSON-luku. Undaunted
lähettää samat viisi avainta versiolle 1.4.4 (`error_code` `"TicketRateOk"`, `timeout` 8000).

**Alustan ominaisuudet.** Kaksi staattista luentaamme olivat eri mieltä siitä, onko tämä kuoressa,
joten 2.1.1-palvelimemme lähettää molemmat muodot samassa rungossa; tuntemattomat avaimet jätetään
huomiotta. Undaunted lähettää versiolle 1.4.4 vain kuorellisen muodon.

**Istuntotunniste.** Asiakasohjelma lähettää Epic-tunnisteensa muodossa `Authorization: BEARER <jwt>`
ja odottaa takaisin kenttiä `payload.sessiontoken` ja `payload.sessionid`. Siitä eteenpäin
`sessiontoken` on bearer-tunniste kaikkiin muihin palveluihin. Polun osa on versiossa 2.1.1 `epiceos`
ja versiossa 1.4.4 `epic` (Undauntedin mukaan), ja se täytetään samaan `{linkedaccountservice}`-pohjaan.
Epic myöntää JWT-tunnisteen uudelleen, joten bearer vaihtuu kirjautumisten välillä. Ota pelaajan
identiteetti sen sijaan JWT:n `sub`-kentästä (claim), tai pelaaja saa uuden hahmon jokaisella
kirjautumisella.

**Tilitiedot.** Litteä, ei käärettä. Tässä palautettu `accountId` menee jokaiseen myöhempään
`{accountid}`-polun osaan, joten sen on pysyttävä samana samalle pelaajalle. Undauntedin
1.4.4-vastaus lisää kentät `creationDate`, `email`, `preferredLanguage` ja `verified`.

**Muut identiteettipäätepisteet (koodista luettu).** `POST auth-prod/game/login` (`AuthEndpoint`,
sähköposti- ja salasanapolku) luetaan litteänä muotona `{"displayName", "accountId", "token"}`, ja
kaikki kolme ovat pakollisia. Version 2.1.1 Epic-kirjautuminen ei koskaan kutsu sitä, joten emme ole
kokeilleet sitä. Undauntedin 1.4.4-kokoonpano käynnistää pelin valitsimella `-AUTH_TYPE=exchangecode`
ja vastaa itse Epic-tyyliseen tunnisteenvaihtoon. Sen DLL ohjaa myös `AuthEndpoint`-osoitteen
uudelleen, mutta sen palvelimella ei ole käsittelijää polulle `/game/login`, joten päättelemme, ettei
1.4.4 kutsu sitä siinäkään kokoonpanossa (varmistamaton). `PUT gamesession-prod/account`
(Phoenix-tilin luonti) tavoitetaan vain, kun `isLinked` on false. Sen payload on `{"id", "sessiontoken"}`.

**Presence-WebSocket (koodista luettu).** `ws://presence-prod.steelyard.ca/ws/{accountid}`, tavallinen
`ws://` portissa 80. Asiakasohjelma pyytää täsmälleen yhtä aliprotokollaa, `json`, ja 101-vastauksen
pitäisi toistaa se (WebSocket-asiakas voi hylätä kättelyn, joka ei toista sitä). Luentamme mukaan
asiakasohjelma ei koskaan lähetä kehystä ja jättää vastaanottamansa huomiotta, joten koko sopimus on
"hyväksy yhteys ja pidä se auki". Mikään 2.1.1-ajomme ei ole vielä avannut tätä yhteyttä, joten tätä
ei ole testattu.

---

## Hahmot (`dauntless-prod`) {#characters-dauntless-prod}

Litteitä, ja kaikki **testattuja** versiossa 2.1.1.

| Kutsu | Pyyntö | Vastaus |
|---|---|---|
| `GET /character` | — | **paljas taulukko** muotoa `{"id", "name", "updateVersion", "data"}` |
| `PUT /character` (luonti) | `{"name": "..."}` | paljas `{"id", "name"}`; vain nämä kaksi luetaan |
| `POST /character` (tietovaraston tallennus) | `{"characterId", "data", "updateVersion"}` | paljas olio; vain `data` luetaan |

```json
[
  {
    "id": "<character id>",
    "name": "Slayer",
    "updateVersion": 3,
    "data": "{\"PlayerAccountProgressStep\":\"EnteredRamsgate\"}"
  }
]
```

Kaksi asiakasohjelman osaa lukee kutsun `GET /character`. Hahmoluettelo tarvitsee kentät `id` ja
`name`. `FPhoenixCharacterDataStore` etsii alkion, jonka `id` vastaa sen hahmoa, ja tarvitsee sitten
`updateVersion`-kentän JSON-lukuna ja `data`-kentän JSON-**merkkijonona** (tai `null`). Jos jompikumpi
puuttuu, se kirjoittaa lokiin "Failed To Parse All Required Fields", hakee uudelleen enintään kuusi
kertaa ja epäonnistuttaa sitten kirjautumisen. Luettelon kääriminen muotoon `{"characters": [...]}`
antaa virheen `Failed to get all characters: ParseError`.

**`updateVersion`.** Asiakasohjelma kasvattaa välimuistissa olevaa versionumeroaan *ennen* kuin se
lähettää tallennuksen. Tallenna luku täsmälleen sellaisena kuin se lähetettiin. Jos palvelin lisää
siihen 1, se menee asiakasohjelman edelle, ja seuraava luku näyttää ristiriidalta. Undaunted hylkää
tallennuksen koodilla `409`, kun tallennettu versio on jo suurempi tai yhtä suuri kuin saapuva. Se
sääntö on sopusoinnussa tämän kanssa.

**`data`-möhkäle on JSON-merkkijono, joka sisältää JSON-olion, ja sen jokaisen arvon on oltava
merkkijono.** Asiakasohjelma syöttää jokaisen arvon funktion `FJsonValue::TryGetString` läpi (kutsu
osoitteessa `0x14142ba4a`). Ensimmäinen arvo, joka ei ole merkkijono, nollaa onnistumislipun ja
tyhjentää koko varaston, joten yksi ainoa JSON-arvo `true` heittää hiljaa pois kaikki muut avaimet.
Asiakasohjelma itse kirjoittaa arvon `"true"` lainausmerkeissä olevana merkkijonona.

Avain, joka ratkaisee, minne uusi hahmo menee, on `PlayerAccountProgressStep`. Sen arvo on
luettelotyypin nimi ilman etuliitettä:

| Arvo | | Arvo | |
|---|---|---|---|
| `New` | 0 | `EnteredRamsgate` | 4 |
| `SavedCharacter` | 1 | `FinishedFirstHunt` | 5 |
| `TrainingGroundsComplete` | 2 | `FinishedSecondHunt` | 6 |
| `DefeatedGnasher` | 3 | mikä tahansa muu | "Unknown" |

`ULoginScreen::AdvanceToPlay` (`0x142d128f0`) lähettää tilan 0 alkuelokuvaan ja hahmonluontiin, tilan 1
harjoitusalueelle (training grounds), tilan 2 metsästysmaille (hunting grounds) ja tilan 3 tai
suuremman Ramsgateen. "On saapunut Ramsgateen" tarkoittaa kaikkialla, mihin katsoimme, ehtoa
`state >= 4`. Komentorivivalitsin `-ForceFTUEFlow` pakottaa opetusosion tilasta riippumatta. Uusi
hahmo, joka luodaan datalla

```json
{"PlayerAccountProgressStep": "EnteredRamsgate"}
```

ohittaa opetusosion. **Älä** lisää avainta `HasFinishedTutorial`. Pelkkä sen olemassaolo (arvoa ei
koskaan tarkisteta) nostaa tilan arvoon 6, mikä kytkee päälle MOTD-näkymän (päivän viesti;
`AArchonHUD::CanDisplayMOTDScreen` vaatii `>= 6`). Näkymä yrittää sitten hakea sisältöä, jota
yksityispalvelimella ei ole. (2.1.1, koodista luettu.)

---

## Käyttöoikeudet (`auth-prod`) {#entitlements-auth-prod}

`GET /entitlementsv2` (2.1.1, koodista luettu):

```json
{"entitlements": []}
```

Tämä on litteä olio, jossa on yksi avain; se ei ole paljas taulukko eikä kuoressa. Serialize
`0x14145f960` lukee vain ASCII-avaimen `entitlements` ja tarkistaa, että se on taulukko. Jokaisella
alkiolla on `name` (merkkijono), `duration` (int32) ja `activatedDate` (merkkijono). Nimikenttä on
`name`, ei `entitlement`.

Tällä on enemmän merkitystä kuin näyttää. Käyttöoikeuksien lataaja on version 2.1.1 pelaajatietojen
riippuvuusketjun juuressa (katso [Lataajat](#why-these-endpoints-matter-the-player-data-loaders-211)).
Niin kauan kuin vastasimme `[]`, asiakasohjelma pyysi käyttöoikeuksia uudelleen jokaisella
latauskierroksella eikä koskaan pyytänyt mitään polusta `/progression/*`.

**1.4.4:** Undaunted vastaa `{"code": null, "message": "OK", "payload": []}`, mikä on eri muoto. Emme
tiedä, odottaako version 1.4.4 jäsennin sitä vai jatkaako se vain, kun jäsennys epäonnistuu.
(varmistamaton)

---

## Varustukset (`loadout-prod`) {#loadouts-loadout-prod}

Kaikki loadout-vastaukset ovat **kuoressa**, ja jokaisella niissä olevalla luvulla on merkitystä.

### `GET /loadout/{account_id}/{character_id}/all` {#get-loadoutaccount_idcharacter_idall}

2.1.1. **Testattu:** tämä vastaus lopetti kaatumisen ja vei asiakasohjelman vakaasti
loadout-järjestelmän ohi.

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

- **Neljän paikkamäärän ja `active_index`-kentän on oltava lainausmerkittömiä JSON-lukuja, ja
  `needs_migration`-kentän oikea JSON-arvo `false`.** Sisältörakenne on paikallinen pinomuuttuja. Sen
  konstruktori nollaa `loadouts`-taulukon ja `persistent`-kentän, mutta ei kuutta skalaarikenttää
  kohdissa `+0x108`..`+0x11c`. Puuttuva tai lainausmerkeissä oleva arvo jättää pinoon roskaa.
  `UArchonLoadout::InitializeFromOnlineLoadoutData` (`0x1428cd790`) mitoittaa sitten taulukon summalla
  `num_account_slots + num_character_slots` ja kuolee virheeseen
  `Trying to resize TArray to an invalid size of ~3 billion`.
- **Lähetä `active_index: -1`, kun `loadouts` on tyhjä.** Arvolla `0` version 2.1.1 käynnistyksemme
  kaatui virheeseen `EXCEPTION_ACCESS_VIOLATION reading 0x0` noin 20 sekunnin kohdalla. Arvoon `-1`
  vaihtaminen vei asiakasohjelman loadout-järjestelmän ohi. Emme pysty selittämään eroa lukemamme
  koodin perusteella: loadout-alustaja (`0x1428cda4d`) palaa paikkaan 0 kummallakin arvolla, kun paikka
  on olemassa (**selittämätön**, katso [Kaatumisten tutkinta]({{ crashes_page.url | relative_url }})).
- **Paikkojen yhteismäärän on oltava yli nolla.** Nollalla lataus pysähtyy viestiin "Loadout active
  index is invalid (no loadouts exist!)", eikä lataaja koskaan ilmoita valmistuneensa. Ehdoton yläraja
  on 20 paikkaa (`LoadoutSlot00`..`LoadoutSlot19`).
- **`needs_migration: false`** valitsee tavallisen polun, joka rakentaa varustukset. `true` vie sen
  sijaan erilliseen siirtohaaraan.
- **`persistent.update_version`-kentän pitäisi olla mukana.** `persistent`-konstruktori nollaa sen
  ympärillä olevat kentät mutta ohittaa tämän.
- **`loadouts: []` on vähäriskinen valinta.** Jokaiselle tyhjälle paikalle asiakasohjelma rakentaa
  oletusvarustuksen oman asetuksensa `[DefaultLoadout]`-osion pohjalta. Käsin kirjoitettu alkio
  (0x280 tavua kenttiä) voi aiheuttaa virheen "Loadout slot data could not be initialized".

Loadout-alkiot käyttävät **snake_case**-kirjoitustapaa: `slot_index` (int32, paikka, johon alkio
sijoittuu; alueen ulkopuoliset alkiot pudotetaan), `update_version`; `weapon`, `helmet`, `chest`,
`arms`, `legs`, `lantern`, `player_role`, `subweapon` ja `persistent` ovat kukin muotoa
`{"instance_id", "instance_data"}`; lisäksi `appearance`, `flask`, `custom_name` (merkkijonoja) ja
`quick_items` (`[{"item_index", "item_id", "instance_id"}]`). Tavaraluettelo käyttää samoista asioista
camelCase-kirjoitustapaa. Tyylien sekoittaminen antaa hiljaa tyhjiä kenttiä.

**1.4.4 (Undaunted):** sama kääre ja samat kenttien nimet, oikeat varustukset, paikat 1/1/1/1 ja
`active_index: 0`.

### Muut loadout-kutsut (2.1.1, koodista luettu) {#other-loadout-calls-211-static}

| Kutsu | Payload |
|---|---|
| `GET /loadout/{account_id}/slotcount`, `.../{character_id}/slotcount` | `{"num_account_slots", "max_account_slots", "num_character_slots", "max_character_slots"}`, kaikki int32. Neljä määrää ovat paikallisessa pinomuuttujassa, jota ei koskaan nollata, joten älä koskaan lähetä tätä ilman kuorta. Pidä luvut yhtenäisinä `/all`-vastauksen kanssa. |
| `GET /loadout/{account_id}/{character_id}` (aktiivinen varustesarja) | Yhden loadout-alkion kentät ja persistent-kentät litistettyinä payloadiin, sekä `active_slot` (int32). `active_slot`-kenttää ei nollata, joten se on lähetettävä. Yksi katselmoinneistamme havaitsi, ettei alkion `slot_index`- ja `update_version`-kenttiäkään nollata, joten lähetä nekin (varmistamaton). Ei vielä nähty liikenteessä. |

---

## Tavaraluettelo (`dauntless-prod`) {#inventory-dauntless-prod}

Litteitä olioita, ei käärettä. Käsittelijät jäsentävät rungon tavalliseksi `FJsonObject`-olioksi ja
poimivat taulukot nimen perusteella. (2.1.1, koodista luettu; pyyntörungot on tallennettu
**oikeasta** liikenteestä.)

**`GET /inventory/{accountid}/{characterid}`:**

```json
{
  "stackedItems":   [{"catalogId": "QI_BASIC_FLARE_DURABLE", "quantity": 5}],
  "instancedItems": [{"catalogId": "WP_EB_TRAINING", "instanceId": "WP_EB_TRAINING", "updateVersion": 1},
                     {"catalogId": "LT_BASIC", "instanceId": "LT_BASIC", "updateVersion": 1}]
}
```

**`POST /inventory` (transaktion suorittaminen).** Asiakasohjelma lähettää kentät `characterId`,
`accountId`, `source` ja `transactionId` sekä luettelot `addInstancedItems`, `addStackedItems`,
`removeInstancedItems`, `removeStackedItems` ja `saveInstancedItems`. Vastaus käyttää **eri avaimia**,
jotka kaikki ovat valinnaisia taulukoita:

```json
{"createdInstancedItems": [], "updatedInstancedItems": [], "updatedStackedItems": [], "removedInstancedItems": []}
```

Jos palautat pyynnön sellaisenaan takaisin, asiakasohjelma laskee transaktion onnistuneeksi eikä saa
mitään. Undaunted käyttää samoja neljää tulosavainta versiolle 1.4.4. Version 2.1.1 palvelimemme
lähettää tällä hetkellä kentän `deletedInstancedItems`, jota asiakasohjelma ei koskaan lue. Siitä ei ole
haittaa niin kauan kuin se on aina tyhjä, mutta oikea nimi on `removedInstancedItems`.

Esineiden kentät: `catalogId` (pakollinen, ja sen on oltava asiakasohjelman omassa luettelossa, muuten
tulee virhe "Can't find catalog id"), `quantity` (luku) pinottaville esineille, `instanceId` ja
`updateVersion` (luku) yksilöllisille esineille sekä valinnainen `itemData`-merkkijono.
**Asiakasohjelman luettelo ratkaisee, onko esine pinottava vai yksilöllinen, eikä se taulukko, jossa
esine saapuu.** Laita kaikki neljä kenttää jokaiseen esineeseen, niin oikea haara löytää tarvitsemansa.

Epäonnistunut tavaraluettelokysely huomataan heti. Asiakasohjelma näyttää viestin "Failed to retrieve
your character's inventory." ja palaa päävalikkoon.

**Aloitusvarusteet (version 2.1.1 erillinen kaupunkikäynnistys).**
`AArchonPlayerController::CheckForPlayerStart` ei aloita pelaajaa niin kauan kuin hahmolla ei ole
asetta tai lyhtyä. Asiakasohjelman oma aloituslahja (panssari, banneri, soihtu, aseen *osa*) ei
sisällä kumpaakaan. Julkaistussa pelissä ne annettiin opetusosiossa. Palvelimemme lisää kaksi
`[DefaultLoadout]`-osiossa nimettyä esinettä, `WP_EB_TRAINING` ja `LT_BASIC`.

---

## Eteneminen (`progression-prod`) {#progression-progression-prod}

Tällä palvelimella muodot vaihtelevat, joten tarkista jokainen päätepiste erikseen. Kaikki 2.1.1,
**koodista luettu**, ellei toisin mainita.

| Kutsu | Muoto |
|---|---|
| `GET /progression/config` | kuoressa (`code` on merkkijono); payload `{"paths": [...]}`, jonka on oltava taulukko |
| `GET /progression/{accountid}` | kuoressa, **`code` on int32**, **payload on taulukko** etenemisratojen tietueita |
| `GET /progression/{accountid}/{progressionid}` | kuoressa (`code` on merkkijono); payload on yksi radan tietue (todennäköisesti) |
| `GET /progression/objectives/{accountid}` | kuoressa, `code` on int32, payload on taulukko (todennäköisesti) |
| `GET /escalation/{season_id}/{account_id}` | kuoressa; katso alla |
| `GET /pjm`, `GET /pjm/{accountid}` | `nodes` on **solmun tunnisteella avainnettu olio**; kuori varmistamaton, katso alla |
| `GET /cooldown/{accountid}` | litteä `{"cooldowns": [...]}` |
| `PUT /cooldown/batch/{accountid}` | litteä; sama sarjallistaja kuin pyynnössä |
| `GET /bounty/{accountid}` | litteä `{"bounties": [], "draft_data": {...}}` |

**`/progression/config`.** Jokaisella polulla on `progression_id`, `premium_gating_entitlement`,
`progression_multiplier` (float), `requirements` (`[{"rank_id", "xp_required"}]`), `free_rewards`,
`premium_rewards`, `start_date`, `end_date`, `progression_multiplier_start_date`,
`progression_multiplier_end_date` ja `prestige` (`{"xp_per_level"}`). Jokaiselle palkintoluettelossa
esiintyvälle `rank_id`-arvolle tarvitaan vastaava vaatimus, muuten asiakasohjelma kirjoittaa lokiin
"Found rewards for rank_id %d but could not find a corresponding requirement". Version 2.1.1
ohjelmatiedostosta vakioina löytämämme ratojen tunnisteet ovat `SLAYER_RANK` ja `WEAPONSMITH`.
Undaunted tarjoaa versiolle 1.4.4 oikean 10 polun asetuksen, jossa on tunnisteet `season09b` ja
`MasteryTrack_*`.

**Ratojen tietueet** (`/progression/{accountid}` ja vastaavat): `phx_account_id`, `progression_id`,
`progress`, `confirmed_fremium_rank`, `confirmed_premium_rank` (int32-lukuja) ja `confirmed_date`
(luetaan päivämääränä). `fremium` on asiakasohjelmassa todella kirjoitettu noin; oikein kirjoitettuna
arvo jää nollaksi.

**Escalation.** Asiakasohjelma pyytää tunnisteet `ESC_SEASON_1`–`ESC_SEASON_6` jokaisella kaupungin
latauksella:

```json
{"code": "OK", "message": "", "payload": {
  "escalation_level": 0, "next_level_xp": 0,
  "talents_progress": [], "unlock_progress": [], "update_version": 0}}
```

Talent-alkiot ovat muotoa `{"rank", "talent_id"}` ja unlock-alkiot muotoa `{"collected", "reward_id"}`.
`update_version` on int32 naapuriensa perusteella; sen lukemista emme eristäneet. Undaunted lähettää
versiolle 1.4.4 saman kuorellisen muodon. Version 1.4.4 kausiluettelo, tallennusreitti ja palvelimemme
säännöt (oletuksena pois päältä) ovat sivulla [Escalation]({{ escalation_page.url | relative_url }}).

**Pelaajan polku (`/pjm`).** Asiakasohjelman oma kirjoitus, `POST /pjm/{accountid}`, näyttää tältä:

```json
{"nodes": {
  "Slayer_00": {"node_id": "Slayer_00", "node_status": 2, "objectives": []},
  "Slayer_01": {"node_id": "Slayer_01", "node_status": 0,
                "objectives": [{"online_objective_id": "...", "objective_amount": 0, "objective_status": 0}]}}}
```

`nodes` on solmun tunnisteella avainnettu olio eikä taulukko. Pyyntörunko näyttää sen, ja lukija
vahvistaa sen tarkistamalla, että kyseessä on JSON-olio. `node_status` kulkee kokonaislukulukijan
kautta. **Varmistamaton:** staattinen luentamme `GET`-käsittelijästä
(`UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete`, `0x1427d47a0`) löytää tavallisen
kääreen, jonka `payload` sisältää `{"nodes": {...}, "update_version": 0}`. Version 2.1.1 palvelimemme
vastaa ilman kuorta. Asiakasohjelma lakkasi yrittämästä uudelleen, mutta se ei todista mitään:
kuoreton runko jäsentyy virheettä joka tapauksessa. Journey-komponentti tarkistetaan vasta, kun
pelaajan hahmo (pawn) on olemassa, eikä 2.1.1-käynnistyksemme koskaan päässyt niin pitkälle.
Kuorellisella muodolla on paremmat todisteet.

**Odotusajat (cooldowns).** Alkiot ovat muotoa `{"cooldown_id", "cooldown_started_date"}`.
`cooldown_started_date` luetaan **tavallisena merkkijonona** eikä päivämäärälukijan kautta,
esimerkiksi `"2026-09-20T00:00:00.000Z"`. Erä-`PUT`-pyyntö ja vastaus jakavat saman sarjallistajan,
joten saapuvan erän yhdistäminen hallussasi olevaan ja sen palauttaminen on oikein. Saman
sarjallistajan käytön `GET`-kutsussa näimme vain välillisesti (todennäköisesti). Undaunted lähettää
versiolle 1.4.4 kuorellisen cooldown-vastauksen.

**Palkkiotehtävät (bounties).** `bounties`-alkioissa on kentät `bounty_id`, `premium_bounty`,
`slot_index`, `objectives` (`[{"objective_id", "progress"}]`), `drafted_timestamp`, `update_version`
ja `claimed`. `draft_data` on `{"current_draft_choices": [], "previous_draft_selections": [],
"bronze_count": 0, "silver_count": 0, "gold_count": 0}`. **2.1.1 ei koskaan pyydä polkua
`GET /bounty/game-data`.** Sen asetusavain, `GetBountiesConfigEndpoint`, on yhä ini-tiedostossa,
mutta avaimen nimeä ei esiinny missään ohjelmatiedostossa, joten mikään ei koskaan hae sitä.
Palkkiotehtävien asetukset tulevat sen sijaan pelin viritysmöhkäleestä `bounty_game_data`
(`GET /game_tuning/{blobid}`). Undaunted tarjoaa polun `/bounty/game-data` versiolle 1.4.4.

### Oma 1.4.4-palvelimemme: tasopalkinnot, uusinnat ja asetukset {#progression-on-our-server}

Tämä osa koskee **versiota 1.4.4 meidän palvelimellamme** (oikea eteneminen, oletus), ja se perustuu
ohjelmatiedostoon ja pelitesteihimme. Merkit: **B** luettu 1.4.4-ohjelmatiedostosta, **V** varmistettu
pelissä, **S** vahva päätelmä.

- **Vahvistus ei maksa mitään.** 1.4.4-pelipalvelin maksaa jokaisen tason palkinnot itse reitin
  `/inventory` kautta kolmea polkua pitkin (B `0x141472fa0`, `0x1414876a0`, `0x141481920`), ja
  pelitestimme näki jokaisen palkinnon annettavan täsmälleen kerran (V, tiekartan kohta 2.10). Siksi
  `POST /progression/<tili>/<rata>/<taso>/confirm/<public tai premium>` vain nostaa vahvistettua tasoa
  eikä anna mitään. Testi vartioi, että vahvistus jättää tavaraluettelot, tavaralokin ja oikeudet
  ennalleen. Harmonicin haara maksoi vahvistuksessa; meidän tietokannassamme, jossa sen
  lunastuskirjanpito alkaisi tyhjänä, se maksaisi uudelleen jokaisen tason, jonka pelaajat ovat jo
  vahvistaneet.
- **Elite-tasojen oikeudet (valinnainen).** Vain pelin oma `GrantProgressionAction` nimeää oikeuden
  myönnön (B `0x1446c84c0`, käytössä kohdassa `0x141487aa5`). Antaako pelipalvelin season09b-tasojen
  pysyvät oikeudet (premium 6, 9, 29 ja 50, ilmainen 50) itse reitin `POST /entitlementv2` kautta, on
  auki. `PROGRESSION_CONFIRM_ENTITLEMENTS=1` saa tasoa nostavan vahvistuksen antamaan kyseisen tason
  pysyvät oikeudet asetuksista (lähde `confirm:<rata>:<taso>`), ei koskaan tavaroita, valuuttoja tai
  määräaikaisia tehosteita (premium 16, 34, 42 ja 47). Oletuksena pois, kunnes pelitesti ratkaisee:
  saavuta Elite-taso 6 metsästysten XP:llä ja katso, tuleeko `POST /entitlementv2`.
- **Uusinnat.** Pelipalvelin yrittää epäonnistunutta pyyntöä uudelleen jopa 5 kertaa
  (`HTTPRetryCount=5`, B). Myöntö (`POST /progression/<tili>`), jonka runko on tavu tavulta sama kuin
  tilin edellinen myöntö, alle `PROGRESSION_REPLAY_WINDOW_S` sekuntia sen jälkeen (oletus 5) eikä
  välissä ole muuta etenemisen kirjoitusta, saa ensimmäisen myönnön tallennetun vastauksen eikä lisää
  mitään; tauluun `progression_events` kirjataan rivi. Mikä tahansa välissä tullut vahvistus, nollaus
  tai muu myöntö tekee samasta rungosta uuden myönnön. Ikkuna pysyy selvästi pelipalvelimen
  myöntöjen lähetysvälin alla: `UProgressionComponent` lähettää jonoon kertyneet myöntönsä enintään
  kerran `QueuedGrantTimeout`-ajassa, joka on 10 sekuntia (`DefaultGame.ini`; kertakäyttöinen ajastin
  asetetaan kohdassa `0x14145a4a9`, B), joten kaksi tarkoituksellista myöntöä tulee yleensä noin 10
  sekunnin välein ja voi olla samanlaisia. Yhteysvirheen jälkeinen uusinta tulee sekunneissa; kadonnut
  vastaus uusitaan vasta `HTTPTimeoutSeconds=600` jälkeen, minkään ikkunan ulkopuolella. Vähintään 10
  sekunnin ikkuna pitäisi seuraavaa lähetystä uusintana ja hukkaisi sen XP:n. Tavoite, joka saapuu tallennettua pienempänä,
  kirjataan lokiin ("objective went backwards") ja tallennetaan lähetettynä.
- **Asetukset.** `GET /progression/config` ja tasolaskenta lukevat yhtä lataajaa: mukana tulevaa
  tiedostoa `vendor/progression_config.json` tai, asetuksella `PROGRESSION_CONFIG_DIR`, kansiota
  kausitiedostoja, jotka korvaavat ratoja tai lisäävät niitä ja jotka tarkistetaan käynnistyksessä
  (huono tiedosto pysäyttää käynnistyksen). `ACTIVE_HUNT_PASS` (oletus `season09b`) on Hunt Pass, jonka
  tili saa, kun mitään ei ole tallennettu. Älä koskaan muokkaa kautta paikallaan, kun pelaajilla on
  siinä etenemistä (S): tallennettu eteneminen lasketaan sen vaatimuksia vasten.
- **Saldot.** `GET /balance` ja `POST /reconcile` vastaavat peliohjelman valuuttataulukkoon (se lukee
  kentän `CURRENCY_PLATINUM`, B `0x14161a790`, `0x1415d16dc`). Jokainen `CURRENCY_*`-avain kummallakin
  kirjoitusasulla kertoo nyt, mitä tilin aktiivisella hahmolla on tavaraluettelossa pinona
  (`BALANCE_FROM_INVENTORY`, päällä). `CURRENCY_PLATINUM_UNIV` ei ole mukana: ohjelmatiedosto nimeää
  sen vain Elite-tarjousnäkymän yhteydessä (B `0x14477fc50`, käytössä kohdissa `0x1417ddd68` ja
  `0x1417dddeb`), ei siellä, missä saldot luetaan (S).

Nämä asetukset ovat sivuilla [Asetukset]({{ config_page.url | relative_url }}#metagame-progression)
ja [Pelin asetukset]({{ game_page.url | relative_url }}#hunt-pass-seasons). Version 1.4.4 kauppareitit
(`/product/...`, `/token/...`, `/notification/...`) ovat sivulla
[Pelin kauppa]({{ store_page.url | relative_url }}).

---

## Kohortit ja postilaatikko {#cohorts-and-mailbox}

2.1.1, koodista luettu.

| Kutsu | Muoto |
|---|---|
| `GET cohort-prod/playertreatments/{account_id}` | kuoressa; payload `{"treatments": ["..."]}`. Alkiot ovat **merkkijonoja**. |
| `GET mailbox-prod/eventstats/` | kuoressa; payload `{"stats": [{"statname": "...", "amount": 0}]}` |
| `GET mailbox-prod/all/` | kuoressa; payloadin omaa kenttäluetteloa **ei ole selvitetty** |
| `GET mailbox-prod/survey/config` | **ei selvitetty** |

Cohorts-lataaja epäonnistuu avoimesti (fails open) eli päästää pelaajan silti eteenpäin. Kun kysely
epäonnistuu, se palaa oletuskäsittelyyn `E1000` ja ilmoittaa silti valmistuneensa. Siksi Undauntedin
kuoreton 1.4.4-vastaus (`{"treatments": [...]}`) ei kerro meille mitään suuntaan eikä toiseen.

---

## Tila, tietojen siirto ja Gauntlet {#status-migration-and-gauntlet}

**`GET http://steelyard.online/dauntless-status`** (2.1.1, koodista luettu; luimme funktion alusta
`ret`-käskyyn asti). Litteä, täsmälleen yhdeksän kenttää, kysellään noin 30 sekunnin välein koko
istunnon ajan:

```json
{"show-status": false, "en": "", "fr": "", "it": "", "es": "", "de": "", "pt": "", "ru": "", "ja": ""}
```

`show-status`-kentän on oltava oikea JSON-totuusarvo. Kumpikaan kutsukohta ei nollaa tuota tavua ennen
jäsennystä, joten arvolla `{}` (tai `"false"`) asiakasohjelma haarautuu alustamattoman muistin
perusteella ja saattaa piirtää tyhjän tilabannerin. Kahdeksan merkkijonoa nollataan etukäteen, joten
ne voi turvallisesti jättää pois, mutta niiden lähettäminen ei maksa mitään.

**`GET /migration/status`, `POST /migration/trigger`** (vain 2.1.1, koodista luettu). Litteä:

```json
{"migration_finished": true, "migration_failed": false}
```

Tämä jumittaa eikä kaada. Arvolla `{}` `migration_finished` jää epätodeksi, ja asiakasohjelma
kyselee loputtomiin.

**Gauntlet** (vain 2.1.1, koodista luettu). Kaikki on kuoressa.

| Kutsu | Payload |
|---|---|
| `GET /config` | `{"gauntlet_id", "start_at", "end_at", "each_level_rewards": [], "milestone_rewards": []}`; päivämäärät kulkevat päivämäärälukijan kautta |
| `GET /leaderboard/get_leaderboard/{gauntlet_id}` | **taulukko** muotoa `{"guild_name", "guild_nameplate", "level", "remaining_sec"}` |
| `GET /rewards/personal/{gauntlet_id}/{account_id}` | kuvauksena (map) käytetty olio; jokaisella arvolla on numeerinen `cleared` (todennäköisesti). `{}` on turvallinen. |
| `GET /rewards/guild/{gauntlet_id}/{account_id}` | pelkkä **luku**, esim. `"payload": 0` |
| `GET /progression/{gauntlet_id}/{account_id}` | `{"personal_progression": 0, "guild_progression": 0}` |

Jokainen steelyard-palvelinnimi osoittaa samaan palvelimeen, joten kaksi palvelua voi vaatia samaa
polkua: `/progression/{a}/{b}` on sekä Gauntletin eteneminen että `progression-prod`-palvelun rata.
Reititä `Host`-otsakkeen perusteella.

**Kauppa** (koodista luettu). `POST store-prod/reconcile` lähettää `{"authorization"}`, emmekä
löytäneet vastauksen jäsennystä; se näyttää "lähetä ja unohda" -kutsulta. `store-prod/creator` on
`POST`, jossa on `{"slug", "authorization"}`. Lähellä oleva vastausrakenne `{"success", "reason"}` on
luultavasti sen vastaus, mutta emme saaneet niitä yhdistettyä (varmistamaton).

---

## Matchmaking ja siirtyminen (`mm2-prod`) {#matchmaking-and-travel-mm2-prod}

Ramsgate ei ole kartta, jonka asiakasohjelma avaa paikallisesti.
`UArchonOnlineSessionClient::TravelToCity` tekee kaupungille matchmaking-pyynnön (pyynnön päästä
pelaamaan samaan peliin muiden kanssa). Kun matchmaking-palvelu sanoo ottelun olevan valmis,
asiakasohjelma ottaa yhteyden oikeaan pelipalvelimeen UDP:n kautta. Metsästykset ja opetussaari toimivat
samalla tavalla.

> **Korjaus.** Kirjoitimme version 2.1.1 matchmaking-käsittelijämme aikomuksena pyörittää kaupunkia
> asiakasohjelman toisella kopiolla. Sitten päättelimme, ettei julkaistu asiakasohjelma voi toimia
> pelipalvelimena lainkaan, ja lopetimme siihen. Siksi siirtymisosuutta ei koskaan testattu versiolla
> 2.1.1. Tuo päätelmä oli väärä. Asiakasohjelman verkkokerros on ehjä, ja ohjelmaan ujutettu DLL voi
> ohjata sitä; näin Undaunted toimii isäntänä versiossa 1.4.4 (katso
> [Näin moninpeli toimii]({{ mp_page.url | relative_url }})). Kaikki alla oleva on version 2.1.1 osalta
> **koodista luettua**. Version 1.4.4 kulku toimii **käytännössä** Undauntedin kautta.

### Kulku {#the-flow}

Kaikki polut ovat suhteessa osoitteeseen `MatchmakingEndpoint = https://mm2-{environment}.steelyard.ca`.

| Vaihe | Kutsu |
|---|---|
| Alueet | `GET /candidate/regions` |
| Aloita tai liity | `POST /candidate/join`, tai `POST /candidate/join/{candidateId}`, kun liitytään tiettyyn ehdokkaaseen |
| Kysele tilaa | `GET /candidate/status` |
| Peru | `DELETE /candidate`, `DELETE /candidate/leave` |
| Muut | `POST /candidate/player/ready`, `PUT /candidate/player/{playerId}/loadout`, `GET /candidate/players/loadout?playerIds=...` |

**Kutsua `POST /candidate` ei ole.** `DELETE /candidate` peruu. (Version 2.1.1 tutkimuspalvelimemme
tekee tämän väärin. Se kirjoitettiin ennen kuin luimme nämä käsittelijät.)

`/candidate/join`-pyynnön rungossa on kentät `buildId`, `gameMode`, `gameType`, `gameArgs`,
`regionUrlsPings` (olio), `isPrivate` ja `privateMatch` (molemmat valinnaisia ja jätetään pois, kun
niitä ei ole asetettu, joten älä tee niistä pakollisia), `playerId`, `partyId`, `hunts` (taulukko),
`playerHuntId`, `allow_crossplay`, `session_id`, `gauntlet_level`, `hashcode` ja `loadout`.

### `GET /candidate/status` {#get-candidatestatus}

```json
{
  "candidateId": "<id>",
  "status": "IN_PROGRESS",
  "statusReason": "",
  "gameMode": "<as requested>",
  "candidateStatusPeriodMillis": 1000,
  "serverInfo": {
    "gameSessionId": "<id>",
    "instanceId": "<id>",
    "host": "127.0.0.1",
    "port": 7777,
    "gameArgs": ""
  }
}
```

Kentät, jotka asiakasohjelma lukee (2.1.1, `FCandidateStatus::Serialize` `0x1414c2a10`):
`candidateId`, `status`, `statusReason`, `message`, `gameMode`, `huntId`, `gameArgs` (merkkijonoja);
`serverInfo` (olio); `playerStates` (olio); `playerHuntIDs` (kuvaus eli map); `createdTimeMillis` ja
`lobbyDuration` (luetaan **float**-lukijalla); `idealRemainingMillis`, `forcedRemainingMillis`,
`candidateStatusPeriodMillis` (int32); `isNewMatchmaker` (bool).

- **`status`** on jokin seuraavista: `NEW`, `MATCHING`, `MATCHED`, `QUEUED_FOR_START`, `IN_PROGRESS`,
  `CANCELED`, `FAILED`. `CANCELED` ja `FAILED` lopettavat matchmakingin. Mikä tahansa muu kysyy
  uudelleen ajan `candidateStatusPeriodMillis` kuluttua, rajattuna välille 1–10 sekuntia (oletus
  1000 ms).
- **`isNewMatchmaker`** ratkaisee, mitkä tilat käynnistävät siirtymisen. False tai puuttuu (oletus):
  `MATCHED`, `QUEUED_FOR_START` tai `IN_PROGRESS`, eikä pelaajatarkistusta. True: vain `IN_PROGRESS`,
  ja `playerStates`-kentän on sisällettävä paikallinen pelaaja.
- **`playerStates` on pelaajan tunnisteella avainnettu olio** eikä taulukko. Jokainen arvo on
  `{"isReadyToLeaveLobby": bool, "publicLoadoutHash": "..."}`. Sitä haetaan vain, kun
  `isNewMatchmaker` on true. (Undaunted lähettää versiolle 1.4.4 kirjaimellisen avaimen `"UserId"`.
  Se toimii vain siksi, että `isNewMatchmaker` puuttuu, joten hakua ei koskaan tehdä.)
- **`serverInfo`-kentässä** on täsmälleen viisi kenttää: `gameSessionId`, `instanceId`, `host`
  (merkkijonoja), `port` (int32) ja `gameArgs`. Siinä ei ole `ticket`-kenttää.
- **`host` ei saa olla tyhjä.** Tyhjä host jättää asiakasohjelman kyselemään loputtomiin, hiljaa.
- **`port`-kentän on oltava JSON-luku.** `"7777"` jättää sen nollaksi. Tilatarkistus menee läpi (se
  katsoo vain `host`-kenttää), ja sitten `GetResolvedConnectStringInternal` hylkää istunnon viestillä
  "Invalid session info". Julkaisuversioista on poistettu tiedostoon lokitus, joten tuo viesti ei
  koskaan päädy lokitiedostoon.

**Kuoressa vai ei?** Versiolle 1.4.4 Undaunted vastaa ilman kuorta, ja se toimii käytännössä.
Versiossa 2.1.1 emme saaneet tilakäsittelijää yhdistettyä mihinkään jäsentimeen. Lähellä on kaksi
kääreen jäsennintä, joista toinen lukee muotoa `{code, message, payload}` ja toinen muotoa
`{statusCode, message, payload}`, kummassakin int32-koodit. (varmistamaton)

**`/candidate/regions`.** Undaunted lähettää versiolle 1.4.4 kuorellisen vastauksen, `code` 200,
payloadina `{"maxPingingStepTime", "pingCount", "pingFrequency", "regionUrls"}` ja ajat sekunteina.
Versiossa 2.1.1 `pingFrequency` ja `maxPingingStepTime` kulkevat float-lukijan kautta. Version 2.1.1
kuori on varmistamaton.

### Siirtymisosoite (2.1.1) {#the-travel-url-211}

Yhteysmerkkijono rakennetaan tällä muotoilulla:

```
%s:%d?ticket=%s?gameSessionId=%s?EncryptionToken=%s
```

Kentät ovat palvelin (host), portti, lippu (ticket), peli-istunnon tunniste ja salaustunniste.
**Jokainen valinta erotetaan `?`-merkillä, ei `&`-merkillä.** Esimerkiksi:

```
127.0.0.1:7777?ticket=<ticket>?gameSessionId=<id>?EncryptionToken=<a>:<b>
```

- Lippu ja salaustunniste tulevat asiakasohjelman istuntotiedoista, eivät `serverInfo`-kentästä.
  `EncryptionToken` on itse muotoa `"%s:%s"` kahdesta istuntotietojen kentästä, ja se on tyhjä, kun
  ensimmäinen niistä on tyhjä.
- Paketoitu `DefaultEngine.ini` kytkee päälle asetuksen `net.AllowEncryption=True` ja
  AES-pakettikäsittelijän.
- `POST /key/generate` lähettää `X-Session-Id`-otsakkeen. Isännän puolella valitsin
  `-DISABLE_MATCHMAKER_AUTH` saa funktion `RedeemMatchmakerTicket` ohittamaan lipun tarkistuksen.
- Asiakasohjelmaan käännetty palvelinpuolen koodi ilmoittaa liittyvästä pelaajasta kutsulla
  `POST /gamesession/playerjoined` ja lähettää `X-SecretKey`-otsakkeen. Se lukee takaisin
  `{"playerId", "gameSessionId", "statusCode" (int32), "message", "token", "gameId"}`.
- `-UseStandaloneDedicatedServer` saa asiakasohjelman pyytämään matchmaking-palvelulta
  `BUILDVERSION=LOCAL_<ComputerName>`. Se näyttää Phoenixin omalta paikallisen palvelimen
  kehitystilalta. Emme ole tutkineet sitä.

---

## Telemetria mittarina {#telemetry-you-can-use-as-instruments}

Telemetria tarkoittaa pelin lähettämiä käyttötietoja. Nämä kutsut eivät estä mitään, mutta ne
kertovat, mitä asiakasohjelma tekee. Tiedostoon lokitus on poistettu julkaisuversiosta.

- **`tracking-prod/heartbeat`** (2.1.1): asiakasohjelma lähettää `{state, map, server, session, ping,
  playtime}` joka sekunti. `map` on luotettavin tapa tietää, missä asiakasohjelma oikeasti on.
  Undauntedin 1.4.4-palvelin ottaa vastaan kutsun `POST /heartbeat` rungolla `{map}` ja vastaa pelkällä
  tekstillä `20000`, jonka merkitystä emme tiedä.
- **`telemetry-ingest-prod/event?id=prod`**: analytiikkatapahtumat, muun muassa `client_login_failed`.
  Versiossa 2.1.1 `UArchonLoadManager::LoadFailed` (`0x1429ad0f0`) lähettää tapahtuman
  `playerdata_load_failed` sisällöllä `{"map", "time", "loaders": [{"name", "loaded"}]}`, joka nimeää
  jokaisen jumiin jääneen lataajan. Sen ajastimen tahti tulee kentästä, jolle emme löytäneet
  kirjoittajaa. Jos tahti on 0, tapahtuma ei koskaan laukea.
- **`telemetry.steelyard.ca/log`**: paketoidut asetukset kytkevät päälle osion `[HTTPEventLog]` ilman
  otantaa. Periaatteessa se lähettää asiakasohjelman lokin jatkuvana virtana Splunk HEC -riveinä, ja
  odotettu vastaus on `{"text": "Success", "code": 0}`. Emme ole vielä saaneet sinne mitään liikennettä.

---

## Miksi näillä päätepisteillä on väliä: pelaajatietojen lataajat (2.1.1) {#why-these-endpoints-matter-the-player-data-loaders-211}

Versiossa 2.1.1 pelaajan hahmo (pawn) ilmestyy pelimaailmaan vasta, kun **jokainen** rekisteröity
`IArchonPlayerDataLoader` ilmoittaa valmistuneensa. `AArchonPlayerController::OnPostLogin` käynnistää
funktion `UArchonLoadManager::Begin` (`0x14299b670`). Kun kaikki lataajat ovat valmiita, ajetaan
`OnPlayerDataLoadComplete` (`0x1429d6900`), ja se on ainoa polku funktioon `ServerRestartPlayer()`.
Jos jokin lataaja ei koskaan valmistu, pelaaja näkee lopulta ilmoituksen "You have been signed out".

Lataajia on yksitoista:

| Lataaja | Päätepiste | Jos vastaus epäonnistuu |
|---|---|---|
| `EntitlementsComponent` | `auth-prod/entitlementsv2` | ei koskaan valmis; ketjun juuri |
| `UProgressionComponent` | `/progression/config`, `/progression/{id}`, `/progression/objectives/{id}` | odottaa kaikkia kolmea |
| `HuntPassComponent` | `/huntpass/{id}` | valmis heti, jos etenemisrajapinta puuttuu; rekisteröidään vain, kun eräs ominaisuuslippu on päällä |
| `UQuestSystemComponent` | ei omaa päätepistettä | paikallinen tila |
| `UBountyComponent`, `_Weekly`, `_Daily` | `/bounty/{id}` | — |
| `UCooldownComponent` | `/cooldown/{id}` | — |
| `UArchonInventoryDataLoader` | `/inventory/{a}/{c}` | virheikkuna, takaisin päävalikkoon |
| `AArchonLoadout` | `/loadout/{a}/{c}/all` | **ei koskaan valmis**: ainoa lataaja, joka jättää "valmis"-ilmoituksen antamatta epäonnistuessaan |
| `CohortsComponent` | `/playertreatments/{id}` | päästää läpi käsittelyllä `E1000` |

Riippuvuudet: Entitlements → Progression → HuntPass → QuestSystem → Bounty → Bounty_Weekly →
Bounty_Daily. HuntPass odottaa myös Entitlementsia, ja Bounty odottaa myös Progressionia ja
Cooldownia. InventoryDataLoader → Loadout. Yksi jumiin jäänyt lataaja lähellä juurta pysäyttää kaiken
sen takana. Ainoa yllätys: `UArchonLoadManager::Add` kirjoittaa lokiin tyhjän (null) lataajan mutta
lisää sen silti, eikä tyhjä merkintä voi koskaan ilmoittaa valmistuneensa.

Toinen, myöhempi portti, `AArchonPlayerController::CheckForPlayerStart`, ajetaan, kun hahmo on
olemassa, ja sillä on oma aikakatkaisunsa (`PlayerStartEventTimeout`, oletuksena 120 s). Se odottaa
asetta, lyhtyä ja panssaria, pelaajan polun komponenttia, escalation-komponenttia (siitä ne kuusi
`ESC_SEASON_*`-pyyntöä) ja varustesarjojen replikointia.

Version 2.1.1 erillisessä käynnistyksessämme palvelimemme vastaa lataajien päätepisteisiin, mutta
tilitunniste on tyhjä. Asiakasohjelma ei siinä tilassa koskaan ajanut kirjautumistaan, joten hahmo ei
koskaan ilmestynyt. Siksi moni tämän sivun muoto on **koodista luettu** eikä **testattu**.
Yksityiskohdat ovat sivulla [Version 2.1.1 yksinpelikokeilu]({{ awakening_page.url | relative_url }}).

---

## 2.1.1 ja 1.4.4 rinnakkain

**Sama palvelu, lähes samat osoitteet.** Niistä 165 `http(s)`-osoiteavaimesta osiossa
`[OnlineSubsystemPhoenix]`, jotka kumpikin versio määrittelee, **162:lla on tavulleen samat
osoitteet**. Kokonaismäärät riippuvat siitä, mitä lasketaan (mitkä avaimet, kehitysmerkinnät,
`_v2`-kaksoiskappaleet, `ws://`-yhteys). Ensimmäinen vertailumme antoi tulokseksi 151/154, emmekä
pystyneet toistamaan juuri tuota jakoa. Jokainen kokeilemamme laskutapa antaa kuitenkin saman
vastauksen: ainoat eroavat osoitteet ovat kolme äänichatin avainta:

| Avain | 2.1.1 (EOS-ääni) | 1.4.4 (Vivox) |
|---|---|---|
| `VoiceChatJoinPartyEndpoint` | `mm2-.../evoice/join/party` | `mm2-.../vivox/join/party/{channel_type}` |
| `VoiceChatJoinGameEndpoint` | `mm2-.../evoice/join/game` | `mm2-.../vivox/join/game/{game_id}/{channel_type}` |
| `VoiceChatJoinDebugEndpoint` | `mm2-.../evoice/join/channel` | `mm2-.../vivox/join/channel/{channel_id}/{channel_type}` |

Versiossa 1.4.4 on lisäksi `VoiceChatLoginEndpoint`, jonka 2.1.1 jätti pois. Versiossa 1.4.4 ääni
kulki Vivoxin kautta, joka on maksullinen kolmannen osapuolen palvelu. Emme aio palauttaa sitä.

**28 päätepistettä on vain versiossa 2.1.1.** Nämä ovat steelyard.ca-palvelimien
`...Endpoint`-avaimia, joita versiossa 1.4.4 ei ole, joten se ei koskaan kutsu niitä:

| Alue | Avaimet |
|---|---|
| Gauntlet ja trials (11) | `GauntletConfigEndpoint`, `GauntletEndedLevelEndpoint`, `GauntletGetEntryEndpoint`, `GauntletGrantGuildRewardsEndpoint`, `GauntletGuildRewardsEndpoint`, `GauntletLevelAccessEndpoint`, `GauntletLevelFinishedEndpoint`, `GauntletLevelRewardsEndpoint`, `GauntletProgressionEndpoint`, `GauntletSeasonLeaderboardEndpoint`, `GetTrialsLeaderboardsEndpoint` |
| Kauppa ja aarrearkut (5) | `StoreGetSteamOffersEndpoint`, `StoreLootboxDetailsEndpoint`, `StoreLootboxDrawEndpoint`, `StoreLootboxListEndpoint`, `StoreLootboxServerDrawEndpoint` |
| Eteneminen (4) | `SetPlayerFactionEndpoint`, `TrackedObjectivesEndpoint`, `Tracker_Endpoint`, `Tracker_Delete_Endpoint` |
| Postilaatikko (3) | `MailboxQueryTriggerConfigEndpoint`, `MailboxQueryTriggerSurveyEndpoint`, `PatchNotesGetDataEndpoint` |
| Tietojen siirto (2) | `PlayerDataMigrationCheckStatusEndpoint`, `PlayerDataMigrationTriggerEndpoint` |
| Tili ja tila (3) | `CloneAccountEndpoint`, `IsBannedEndpoint`, `PhoenixAlternativeStatusMessageEndpoint` |

Viisi muuta avainta on vain versiossa 2.1.1, mutta ne on nimetty eri tavalla:
`GetPlayerFactionsEndpointClient`, `GetPlayerFactionsEndpointServer`,
`GrantProgressionPurchaseEndPoint` sekä Steam-transaktioiden avaimet `StoreSteamInitializeTxn` ja
`StoreSteamFinalizeTxn`.

**Erilainen kirjautuminen.** 1.4.4 on Epic Online Servicesiä vanhempi. Se käyttää asetusta
`DefaultPlatformService=Phoenix` Epicin vanhemman MCP-alijärjestelmän kanssa ja hyväksyy valitsimet
`-AUTH_TYPE=password`, `exchangecode` tai `developer`. 2.1.1 kirjautuu EOS:n kautta
(`-AUTH_TYPE=accountportal`). Istuntotunnisteen polun osa seuraa samaa linjaa: `/gamesession/epic`
versiossa 1.4.4, `/gamesession/epiceos` versiossa 2.1.1.

**Sama osoite ei tarkoita samaa muotoa.** Undauntedin 1.4.4-palvelin ja meidän 2.1.1-luentamme ovat eri
mieltä useista päätepisteistä:

| Päätepiste | 2.1.1 (staattinen luentamme) | 1.4.4 (mitä Undaunted lähettää) |
|---|---|---|
| `/entitlementsv2` | litteä `{"entitlements": []}` | kuoressa, `payload: []` |
| `/cooldown/{id}` | litteä `{"cooldowns": [...]}` | kuoressa |
| `/bounty/{id}` | litteä | kuoressa, mukana päivittäisten ja viikoittaisten luonnosvalintojen tiedot (draft data) |
| `/eventstats/`, `/playertreatments/{id}` | kuoressa | litteä |
| `/progression/objectives/{id}` | payload on taulukko | payload on `{"objectives", "progress_tracks"}` |
| `/candidate/regions` | kentät luetaan float-lukuina; kuori tuntematon | kuoressa, `code` 200, ajat sekunteina |
| Etenemisratojen tunnisteet | `SLAYER_RANK`, `WEAPONSMITH` | `season09b`, `MasteryTrack_*` |

Osa näistä on todellisia muutoksia neljän vuoden ajalta. Toiset voivat olla muotoja, jotka
1.4.4-asiakasohjelma sietää jäsentämättä niitä. Tiedämme sen vasta, kun luemme version 1.4.4
jäsentimet, mitä emme ole vielä tehneet.

**Kirjainkoko.** Undaunted lähettää versiolle 1.4.4 kentän `sessionToken`, kun taas version 2.1.1
lukija pyytää kenttää `sessiontoken`. Unrealin `FJsonObject` pitää kenttänsä
`TMap<FString, ...>`-rakenteessa, ja `FString`-avaimia verrataan yleensä kirjainkoosta välittämättä,
joten tällaisilla kirjainkokoeroilla ei pitäisi olla merkitystä. Tämä on pelimoottorin vakiokäytöstä;
emme ole testanneet sitä kummallakaan versiolla. Kirjoitusasulla on sen sijaan merkitystä
(`confirmed_fremium_rank`).

---

## Avoimet kysymykset {#open-questions}

- Onko `GET /candidate/status` kuoressa versiossa 2.1.1.
- Onko `GET /pjm` kuoressa (staattinen luentamme sanoo kyllä, palvelimemme sanoo ei).
- `mailbox-prod/all/`-vastauksen payload-kentät ja kaikki kutsusta `/survey/config`.
- Version 2.1.1 `UProgressionComponent` tarvitsee neljä valmiuslippua ennen kuin se ilmoittaa
  valmistuneensa, emmekä löytäneet koodia, joka koskaan asettaisi yhtä niistä (`+0x3f3`). Jos sillä
  todella ei ole asettajaa, eteneminen ei voi koskaan valmistua erillisessä käynnistyksessämme, lähetti
  taustapalvelu mitä tahansa.
- Onko latausvirheiden telemetria-ajastimen tahti nollasta poikkeava.
- Version 1.4.4 jäsentimet itse. Jokainen tämän sivun 1.4.4-muoto tulee Undauntedin palvelimelta, ei
  version 1.4.4 ohjelmatiedostosta.
