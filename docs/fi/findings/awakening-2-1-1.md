---
title: Itsenäinen käynnistys 2.1.1:llä
parent: Löydökset
grand_parent: Dauntless Revived suomeksi
nav_order: 8
lang: fi
ref: findings/awakening-2-1-1
locale: fi_FI
description: "Kokeilu käynnistää Dauntless 2.1.1 suoraan Ramsgateen ilman pelipalvelinta: mikä toimi, mihin jäimme (tyhjä tilitunnus) ja mistä työtä voi jatkaa."
---

{% assign contract_page = site.pages | where: "path", "fi/findings/backend-contract.md" | first %}
{% assign internals_page = site.pages | where: "path", "fi/findings/client-internals.md" | first %}
{% assign mp_page = site.pages | where: "path", "fi/findings/multiplayer.md" | first %}
{% assign crashes_page = site.pages | where: "path", "fi/findings/crashes.md" | first %}
{% assign tools_page = site.pages | where: "path", "fi/tools.md" | first %}

# Itsenäinen käynnistys 2.1.1:llä
{: .no_toc }

Ennen kuin siirryimme versioon 1.4.4 ja Undauntediin, aloitimme pelin viimeisestä versiosta,
**2.1.1**:stä ("Awakening", joulukuu 2024, Unreal Engine 5.1.1, IoStore). Tavoitteena oli seistä
Ramsgatessa (pelin kaupungissa, jossa pelaajat tapaavat toisiaan) yksin, ilman pelipalvelinta
(ohjelmaa, joka pyörittää peliä pelaajille verkossa). Yritimme tehdä sen käynnistämällä pelin
suoraan kaupunkiin omaa taustapalveluamme vasten. (Taustapalvelu tarkoittaa verkkopalveluja, joihin
peli ottaa yhteyttä, esimerkiksi kirjautumista, hahmoja ja tavaroita varten.)

Pääsimme pitkälle. Koko kirjautumisketju toimii palvelintamme vasten. Ramsgate piirtyy näkyviin ja
pysyy pystyssä. Asiakasohjelma (client, pelaajan oma peliohjelma) sitoo hahmonsa. **Ohjattavaa
pelaajaa emme kuitenkaan koskaan saaneet.** Asiakasohjelman tilitunnus (account id) jää tyhjäksi,
eikä ilman sitä pelaajahahmoa (pawn) ilmesty.

Tämä sivu kirjaa, mihin jäimme, jotta kuka tahansa pelin myöhäisten versioiden parissa työskentelevä
voi jatkaa siitä. Kaikki sivulla koskee versiota **2.1.1**, ellei rivillä toisin sanota. Vastausten
muodot käydään tarkemmin läpi sivulla
[Taustapalvelun rajapinta]({{ contract_page.url | relative_url }}). Käynnistysvalitsimet, lokit ja
jumiutumisen tunnistin ovat sivulla
[Asiakasohjelman sisäosat]({{ internals_page.url | relative_url }}).

> **Korjaus.** Kokeilimme itsenäistä käynnistystä ylipäätään siksi, että olimme päätelleet moninpelin
> olevan mahdoton pelkällä asiakasohjelmakäännöksellä. Tuo päätelmä oli väärä. Ohjelmatiedosto ei
> pysty isännöimään peliä *yksinään*, mutta sen verkkokerros on ehjä, ja ohjelmaan ladattu DLL
> (lisäosa, joka ladataan ohjelman sisään) voi ohjata sitä. Näin Undaunted isännöi Ramsgatea ja
> metsästyksiä versiossa 1.4.4. Katso [Näin moninpeli toimii]({{ mp_page.url | relative_url }}).
> Jälkiviisaasti ajateltuna 2.1.1:n reitti on se, joka on kuvattu kohdassa
> [Mistä jatkaa](#where-to-continue), eikä itsenäinen käynnistys.

<details open markdown="block">
  <summary>Sisällys</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Mihin jäimme {#where-we-stopped}

| Vaihe | Tila versiossa 2.1.1 |
|---|---|
| Asiakasohjelma käynnistyy ilman EasyAntiCheatia, asennus on muuttamaton ja allekirjoitukset kelvollisia | Toimii |
| Epic-kirjautuminen EOS:n kautta (tiliportaali selaimessa) | Toimii, syyskuun 2026 tilanteen mukaan |
| Phoenixin kirjautumisketju taustapalveluamme vasten, hahmon luonti mukaan lukien | Toimii |
| Käynnistys suoraan Ramsgateen | Toimii (`GameDefaultMap`) |
| Pysyy pystyssä | Toimii muistirajojen ja oikeiden vastausmuotojen kanssa. Ei kaatumista useissa viiden minuutin ajoissa. |
| Hahmo sidottu istuntoon | Toimii (`?CharacterId=` käynnistys-URL:ssa) |
| Tilitunnus sidottu | **Ei. Tämä on este.** |
| Pelaajahahmo Ramsgatessa | Ei koskaan ilmestynyt |

---

## Käännös {#the-build}

| | |
|---|---|
| Versio | 2.1.1, käännös (build) 682486, muutoslista (changelist) 682875 |
| Moottorin merkkijono kaatumisraporteissa | `5.1.1-682875+//phx-archon/release/2.1.1` |
| Allekirjoitettu | Phoenix Labs, aikaleima joulukuu 2024 |
| Sisältö | IoStore. 157 `.utoc`/`.ucas`-paria. 141 tiedostoa 156 `.pak`-tiedostosta on 339 tavun tynkiä. Loput 15 sisältävät irrallisia tiedostoja, muun muassa pelin mukana tulevat valmiit asetukset (cooked config) tiedostossa `Archon_50-WindowsClient.pak` (Oodle-pakattu). |
| Kohde | Pelkkä asiakasohjelma (`WITH_SERVER_CODE=0`). Katso [Asiakasohjelman sisäosat]({{ internals_page.url | relative_url }}). |
| Taustapalvelu | `OnlineSubsystemPhoenix`, Phoenixin oma REST-rajapinta osoitteissa `*.steelyard.ca`. Se ei ole PlayFab. |

Tarkistimme kopiomme Phoenixin tiedostoluetteloa (manifest) vasten (352/352 tiedostoa) sekä
jokaisen ohjelmatiedoston Authenticode-allekirjoituksen (75/75), ennen kuin ajoimme mitään. Emme
koskaan muuttaneet asennusta. Kaikki alla kuvattu tehtiin käyttäjän asetusten, komentorivin ja
taustapalvelun kautta.

---

## Asiakasohjelman ohjaaminen taustapalveluumme {#pointing-the-client-at-our-backend}

- **Hosts-tiedosto.** Jokainen valmiissa asetuksissa oleva `steelyard.ca`-palvelinnimi (laskujemme
  mukaan 23) sekä `steelyard.online`, `cdn.playdauntless.com` ja `store.playdauntless.com`
  ohjataan osoitteisiin `127.0.0.1` **ja** `::1`.
- **TLS.** Palvelimemme esittää `*.steelyard.ca`-jokerivarmenteen, jonka on allekirjoittanut oma
  yksityinen varmentajamme (CA). 2.1.1 lukee varmentajapakettinsa irrallisesta tiedostosta
  `<game folder>\Engine\Content\Certificates\cacert.pem`. Lisäsimme varmentajamme sinne. Älä koskaan
  lisää sitä Windowsin luotettujen varmenteiden säilöön.
- **Molemmat osoiteperheet.** Asiakas käyttää sekä IPv4- että IPv6-merkintää. Testitaustapalvelumme
  (Python, FastAPI) ajaa neljää kuuntelijaa: portti 443 on HTTPS:lle ja portti 80 tavalliselle
  HTTP:lle ja presence-WebSocketille, kumpikin sekä IPv4:llä että IPv6:lla. Uvicorn asettaa
  `IPV6_V6ONLY`-asetuksen `::`-sidonnalle, joten yksi kaksipinoinen (dual-stack) kuuntelija ei
  toimi.
- **Käynnistys.** Käynnistä `Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe` suoraan
  valitsimilla `-EpicPortal -AUTH_TYPE=accountportal -AUTH_LOGIN=unused -AUTH_PASSWORD=unused`.
  Kaikki kolme `AUTH`-valitsinta tarvitaan. EOS avaa Epicin tiliportaalin, ja pelaaja kirjautuu
  sinne itse. Älä koskaan käynnistä tiedostoa `start_protected_game.exe`, joka on EasyAntiCheatin
  käynnistäjä.
- **Jäljelle jääneet overlay-prosessit.** Kaatunut ajo voi jättää jälkeensä
  `EOSOverlayRenderer-Win64-Shipping`-prosesseja, ja ne estävät kirjautumisen päällyskerroksen
  (overlay) seuraavalla käynnistyksellä. Lopeta ne ennen uudelleenkäynnistystä.

Tämä riippuu siitä, että Epicin EOS-palvelu hyväksyy yhä kirjautumiset Dauntlessin käyttöönotolle
(deployment). Syyskuussa 2026 se hyväksyi. Jos Epic lakkauttaa käyttöönoton, 2.1.1:n kirjautuminen
pysähtyy ensimmäiseen vaiheeseen, teki taustapalvelu mitä tahansa. Versiolla 1.4.4 ei ole tällaista
riippuvuutta.

---

## Kirjautumisketju {#the-login-chain}

EOS-kirjautumisen jälkeen asiakas kulkee tämän ketjun läpi. Näillä vastauksilla ketju valmistuu, ja
`FOnlineIdentityPhoenix` ilmoittaa kirjautumisen valmistuneen oikealla tilitunnuksella. Kaikki tämä
nähtiin oikeassa ajossa.

| Kutsu | Mitä vastaamme |
|---|---|
| `POST login-queue-prod/login` | Litteä (ilman kirjekuorta), tasan viisi kenttää: `{"state": "OPEN", "error_code": "", "title": "", "message": "", "timeout": 5000}` |
| `GET gamesession-prod/features/platform/win` | `crossplay` ja `crossprogression`, molemmat `true`. Lähetämme ne samassa rungossa sekä litteinä että käärittyinä, koska tulkintamme erosivat toisistaan. |
| `GET login-queue-prod/maintenance/status` | Hyväksytään. Emme selvittäneet, mitä kenttiä se lukee. |
| `GET gamesession-prod/account/link/epic/{id}` | Kääritty: `{"code": "OK", "message": "", "payload": {"isLinked": true}}` |
| `PUT gamesession-prod/gamesession/epiceos` | Kääritty. Sisältö (payload) sisältää kentät `sessiontoken` ja `sessionid`. Tästä eteenpäin `sessiontoken` on bearer-tunniste kaikille muille palveluille. |
| `GET auth-prod/accountinfo` | Litteä: `{"username": "...", "accountId": "..."}` |
| `GET auth-prod/tags`, `GET auth-prod/isbanned` | Vastattu. Emme selvittäneet, mitä kenttiä ne lukevat. |
| `GET dauntless-prod/character` | **Pelkkä taulukko**, jonka alkiot ovat muotoa `{"id", "name", "updateVersion", "data"}` |
| `PUT dauntless-prod/character` rungolla `{"name": "..."}` | Luo hahmon. Pelkkä `{"id", "name"}`. |
| `POST dauntless-prod/character` | Tallentaa hahmon datamöhkäleen (blob). Pelkkä `{"data": "<string>"}`. Vain `data` luetaan. |

Sen jälkeen tulevat `inventory`, `mm2/candidate/player/register`, `game_tuning`, `accountinfo/public`
ja `account/mapping`.

Säännöt, joiden löytäminen kesti pisimpään:

- **Kääritty vai litteä riippuu palvelimesta.** `gamesession-*` käärii kaiken kirjekuoreen
  `{"code", "message", "payload"}`. Litteä runko jäsentyy, mutta sisältöä ei koskaan lueta. Siksi
  `isLinked: true` ja `isLinked: false` toimivat aluksi samalla tavalla. `auth-*` ja `dauntless-*`
  ovat litteitä.
- **Kirjautumisjonossa on tasan viisi kenttää.** Vain `state`-arvo `OPEN` päästää pelaajan läpi.
  Mikä tahansa muu saa asiakkaan kysymään uudelleen `max(timeout × 0.001, 5.0)` sekunnin kuluttua.
- **Kaksi alijärjestelmää lukee `GET /character`-vastauksen.** Hahmoluettelo tarvitsee kentät `id` ja
  `name`. Datavarasto etsii alkion tunnuksensa perusteella ja tarvitsee kentät `updateVersion`
  (luku) ja `data` (*merkkijono*, joka sisältää JSON-olion, tai `null`). Ilman kahta viimeistä
  asiakas lähetti pyynnön kuusi kertaa peräkkäin ja epäonnistui sitten kirjautumisessa.
- **Tallenna `updateVersion` täsmälleen sellaisena kuin se lähetettiin.** Asiakas kasvattaa sitä
  *ennen* kuin se lähettää tallennuksen. Jos palvelin lisää siihen vielä 1:n, seuraava luku näyttää
  ristiriidalta.
- **Tunnista pelaaja Epicin JWT:n `sub`-väitteen (claim) perusteella, älä bearer-tunnisteen
  perusteella.** Istuntopyynnössä bearer-tunnisteena on EOS-tunniste (JWT), ja Epic myöntää tuon
  tunnisteen aina uudelleen. Kun käytimme avaimena raakaa bearer-tunnistetta, pelaaja sai uuden
  hahmon jokaisella kirjautumisella. Johdamme pysyvät Phoenix-tunnukset `sub`-arvosta. Käytämme sitä
  vain hakuavaimena yksityisellä testipalvelimella emmekä tarkista allekirjoitusta, joten älä pidä
  sitä tunnistautumisena.

### Mitä tavallinen kulku tekee seuraavaksi {#what-the-normal-flow-does-next}

Hahmon datamöhkäle ratkaisee, mihin "Play"-painike vie. `ULoginScreen::AdvanceToPlay`
(`0x142d128f0`) lukee möhkäleestä avaimen `PlayerAccountProgressStep` funktion
`GetPlayerAccountProgressState` (`0x1429d0160`) kautta:

| Arvo | Järjestysluku | "Play" vie |
|---|---|---|
| `New` | 0 | Opetusosion (tutorial) välivideo ja hahmoeditori |
| `SavedCharacter` | 1 | Harjoitusalue (training grounds) |
| `TrainingGroundsComplete` | 2 | Metsästysalue (hunting grounds) |
| `DefeatedGnasher` ja ylemmät | 3+ | "Progression is Entered Ramsgate : So...entering Ramsgate..." |

Jokainen näistä kohteista kulkee matchmakingin (pelaajien peliin kokoamisen) kautta, opetussaari
mukaan lukien. Kun ei ollut pelipalvelinta, jonne siirtyä, tavallinen kulku päättyi ilmoitukseen
"You have been signed out". Juuri se sai meidät kokeilemaan itsenäistä käynnistystä.

Möhkäleessä on kaksi ansaa:

- **Jokaisen arvon on oltava JSON-merkkijono.** Jokainen arvo kulkee `FJsonValue::TryGetString`-funktion
  (`0x14142ba4a`) läpi. Ensimmäinen epäonnistuminen nollaa onnistumislipun ja tyhjentää koko
  varaston, joten yksikin JSON-totuusarvo heittää hiljaa pois kaikki muut avaimet. Asiakas itse
  kirjoittaa arvon `"true"` lainausmerkeissä olevana merkkijonona. Alustamme uudet hahmot arvolla
  `{"PlayerAccountProgressStep": "EnteredRamsgate"}`.
- **Älä lisää `HasFinishedTutorial`-avainta.** Jos avain on ylipäätään olemassa, arvosta riippumatta,
  tila nostetaan vähintään arvoon 6. Arvosta 6 ylöspäin `AArchonHUD::CanDisplayMOTDScreen` läpäisee
  edistymistarkistuksensa, ja asiakas avaa koko näytön päivän viestin (message of the day) ja
  yrittää ladata sen kuvan taustapalvelusta, jossa sellaista ei ole. `EnteredRamsgate` (4) läpäisee
  jo kaikki löytämämme portit.

---

## Käynnistys suoraan Ramsgateen {#booting-straight-into-ramsgate}

### Käyttäjän asetukset {#the-user-config}

Unreal asettaa kirjoitettavan, käyttäjäkohtaisen asetuskerroksen valmiiden oletusasetusten päälle:

```text
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Engine.ini
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Game.ini
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Input.ini
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\RuntimeOptions.ini
```

`Game.ini`, `Input.ini` ja `RuntimeOptions.ini` ovat aluksi tyhjiä. Peli kirjoittaa `Engine.ini`-tiedoston
itse. Kopioi tiedostot turvaan ennen kuin muokkaat niitä. Virheellinen `GameDefaultMap` estää peliä
käynnistymästä lainkaan. Varhaisissa muistiinpanoissamme luki, että tämä versio jättää irralliset
asetustiedostot huomiotta. Se oli väärin; korjaus on sivulla
[Asiakasohjelman sisäosat]({{ internals_page.url | relative_url }}).

**1.4.4 lukee samaa kansiota.** Jos sinulla on molemmat versiot, siirrä 2.1.1:n tiedostot sivuun,
ennen kuin ajat versiota 1.4.4. Jäljelle jäänyt `GameDefaultMap` tai `LocalMapOptions` rikkoo
1.4.4:n kirjautumiskulun.

### Kartan ohitus {#the-map-override}

Valmiissa asetuksissa `GameDefaultMap` on `/Game/Maps/Map_LoginMenu`. Kun sen ohittaa käyttäjän
`Engine.ini`-tiedostossa, asiakas käynnistyy suoraan kaupunkiin:

```ini
[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/ramsgate/ramsgate_01_persistent
```

- **Paketin polku.** `ramsgate_01_persistent` on pysyvä taso (persistent level). Muut
  `ramsgate_01_*`-paketit ovat suoratoistettavia alitasoja (streaming sublevels). Löysimme polun
  listaamalla IoStoren hakemistoindeksit `utocdir.py`-työkalulla (katso
  [Työkalut]({{ tools_page.url | relative_url }})). Se on tiedostossa
  `Archon_Maps_2-WindowsClient.utoc` muodossa
  `../../../Archon/Content/Maps/ramsgate/ramsgate_01_persistent.umap`, ja `Archon/Content/` vastaa
  polkua `/Game/`. Valmiit asetukset nimeävät saman kartan jo `ServerDefaultMap`-arvona ja
  `[RamsgateRework] CityMap` -arvona.
- **Miten sitä käytetään.** `UGameInstance::StartGameInstance` (`0x144dba330`) rakentaa
  käynnistys-URL:n arvoista `GameDefaultMap` ja `LocalMapOptions` ja siirtyy siihen. Staattisen
  tulkintamme mukaan tämä julkaisukäännös jättää huomiotta komentorivillä nimetyn kartan.
  Komentorivin osoitin korvataan ensin tyhjällä merkkijonolla (`0x144dba3ad`).
- **`?listen` epäonnistuu.** `LocalMapOptions=?listen` saa käynnistyksen epäonnistumaan viestillä
  "The default map ... could not be found. Exiting." `LoadMap` kutsuu tyngäksi (stub) typistettyä
  `UWorld::Listen`-funktiota, joka palauttaa aina epätoden. Ikkuna tulee aina, kun `Browse()`
  epäonnistuu, ei vain silloin, kun kartta puuttuu.

### Pelitila {#the-game-mode}

Tulkintamme mukaan `ramsgate_01_persistent`-kartan maailma-asetuksissa (world settings) ei ole
pelitilan ohitusta: sen nimitaulukossa ei ole `BPGM_*`-luokkaa eikä `/Game/Blueprints/GameMode/`-polkua.
(Toinen, riippumaton tarkistus ei antanut selvää tulosta, joten pidä tätä **todennäköisenä**.)
`CreateGameModeForURL` (`0x144da42c0`) kokeilee järjestyksessä: maailma-asetukset, URL:n
`?game=`-valinta, `GameModeMapPrefixes`-taulukko, `GlobalDefaultGameMode` ja lopuksi moottorin
perusluokka. Ensimmäiset käynnistyksemme ajoivat siis todennäköisimmin yleistä oletusta,
`BPGM_Archon_Prototype_C`. Asetimme sen sijaan kaupungin pelitilan:

```ini
[/Script/EngineSettings.GameMapsSettings]
GlobalDefaultGameMode=/Game/blueprints/gamemode/BPGM_City.BPGM_City_C
```

Emme **selvittäneet**, miten kaupungin pelaajaohjain (`player_controller_city_bp_C`) valitaan.
Mikään pelitilan blueprint tai ini-tiedosto ei aseta sitä, eikä ohjelmatiedostossa ole sille
merkkijonoa. Älä oleta, että vaihtaminen `BPGM_City`-pelitilaan antaa sinulle kaupungin ohjaimen.

### Pystyssä pitäminen {#keeping-it-up}

Ensimmäiset käynnistykset piirsivät Ramsgaten ja kuolivat sitten kolmella eri tavalla. Kaikki kolme
käsitellään sivulla [Kaatumisten tutkiminen]({{ crashes_page.url | relative_url }}):

- **Muisti.** Ilman rajoja asiakas kasvoi noin 9 gigatavuun. Suoratoistopoolin ja
  skaalautuvuusasetusten rajat käyttäjän `Engine.ini`-tiedostossa pitävät sen noin 2,8 gigatavussa.
  Käynnistimemme myös tappaa prosessin, jos se ylittää 6,5 Gt.
- **Jumiutumiset.** Unrealin jumiutumisen tunnistin sulki asiakkaan muutaman minuutin kuluttua.
  Tutkimista varten aseta `HangsAreFatal=False` osioon `[Core.System]` ja nosta
  `PlayerStartEventTimeout` `Game.ini`-tiedostossa, jotta 120 sekunnin turvaraja ei peitä todellista
  syytä.
- **Väärät muodot.** Taustapalvelumme "discovery"-tilan paikkamerkit kaatoivat asiakkaan.
  Tuntemattomien reittien on palautettava 404 ilman runkoa, ja tunnettujen reittien on palautettava
  täsmälleen oikea muoto.

Kun kaikki tämä on paikallaan, Ramsgate latautuu noin 20 sekunnissa, ja se pysyi pystyssä ilman
kaatumisia useissa viiden minuutin ajoissa. Kaupunki piirtyy kauppoineen, lyhtyineen ja
NPC-hahmoineen (tietokoneen ohjaamine hahmoineen), mutta ilman omaa pelaajaamme. Koska konsolia tai
lokitiedostoa ei ollut, telemetrian sykeviestin `map`-kenttä (`tracking-prod/heartbeat`, joka
sekunti) oli keinomme varmistaa, missä asiakas oikeasti oli.

Lopullinen käynnistysskriptimme teki tämän. `<character id>` on tunnus, jonka `GET /character`
palauttaa pelaajalle:

```powershell
param([int]$CapMB = 6500, [int]$MaxSeconds = 240)
$cfg = "$env:LOCALAPPDATA\Archon\Saved\Config\WindowsClient"
Copy-Item "$cfg\Engine.ini.bak" "$cfg\Engine.ini" -Force        # start from a known-good copy

Add-Content -Path "$cfg\Engine.ini" -Encoding ASCII -Value @"

[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/ramsgate/ramsgate_01_persistent
LocalMapOptions=?CharacterId=<character id>
GlobalDefaultGameMode=/Game/blueprints/gamemode/BPGM_City.BPGM_City_C

[Core.System]
HangsAreFatal=False
HangDuration=600.0

[SystemSettings]
r.Streaming.PoolSize=400
r.Streaming.LimitPoolSizeToVRAM=1
; ... the rest of the caps listed on the Crash forensics page
"@

Set-Content -Path "$cfg\Game.ini" -Encoding ASCII -Value @"
[/Script/Archon.ArchonPlayerController]
PlayerStartEventTimeout=600.0
"@

$exe = "<game folder>\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe"
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru -ArgumentList @(
  "-EpicPortal", "-AUTH_LOGIN=unused", "-AUTH_PASSWORD=unused", "-AUTH_TYPE=accountportal",
  "-windowed", "-ResX=1280", "-ResY=720", "-nosplash",
  "-nothreadtimeout", "-noheartbeatthread", "-nocheckpointhangdetector")
# ...then the memory watchdog loop from the Crash forensics page
```

Käytimme silloin arvoa `HangDuration=600` ja valitsinta `-nothreadtimeout`. Jälkiviisaasti: pidä
`HangDuration` 60:ssä ja jätä `-nothreadtimeout` pois. Pelkkä `HangsAreFatal=False` estää sulkemisen
ja kertoo silti, mikä säie jumittui. [Asiakasohjelman sisäosat]({{ internals_page.url | relative_url }})
selittää miksi. (Skriptin kommenteissa mainittu "Crash forensics page" on sivu
[Kaatumisten tutkiminen]({{ crashes_page.url | relative_url }}).)

---

## Miksi pelaajaa ei ilmesty: pelaajatietojen lataajat {#why-no-player-appears-the-player-data-loaders}

Kaupunki latautuu, mutta pelaajahahmo ilmestyy vasta, kun asiakas on ladannut pelaajan tiedot
taustapalvelusta:

1. `AArchonPlayerController::OnPostLogin` (`0x1429d6ea0`) kutsuu funktiota
   `UArchonLoadManager::Begin` (`0x14299b670`).
2. `Begin` käynnistää jokaisen rekisteröidyn `IArchonPlayerDataLoader`-lataajan, kunkin vasta niiden
   lataajien jälkeen, joista se riippuu.
3. `UArchonLoadManager::Complete` (`0x14299d860`) menee läpi vasta, kun **jokainen** lataaja on
   ilmoittanut olevansa valmis. Muuten se kiertää uuden kierroksen.
4. Sitten ajetaan `AArchonPlayerController::OnPlayerDataLoadComplete` (`0x1429d6900`). Se on ainoa
   polku funktioihin `CanRestartPlayer()` ja `ServerRestartPlayer()` ja siten ainoa polku
   pelaajahahmoon.
5. Jos lataajat aikakatkaistaan, `UArchonLoadManager::LoadFailed` (`0x1429ad0f0`) lähettää
   telemetriatapahtuman `playerdata_load_failed` ja palauttaa pelaajan valikkoon viestillä
   "Loading timeout while receiving Player data".

### Yksitoista lataajaa {#the-eleven-loaders}

`AArchonPlayerController::PostInitializeComponents` (`0x1429dbb60`) rekisteröi ne, mutta vain kun
ohjaimella on auktoriteetti (authority, eli se päättää pelin tilasta). Itsenäisessä käynnistyksessä
sillä on se aina. Rekisteröintijärjestyksessä:

| # | Lataaja | Taustapalvelun kutsu | Huomiot |
|---|---|---|---|
| 1 | `UProgressionComponent` | `progression-prod/progression/config`, `/progression/{accountid}`, `/progression/objectives/{accountid}` | Odottaa Entitlements-lataajaa. Katso alempana oleva avoin riski. |
| 2 | `UQuestSystemComponent` | ei omaa kutsua | Odottaa HuntPass-lataajaa |
| 3 | `AArchonLoadout` | `loadout-prod/loadout/{account_id}/{character_id}/all` | Ainoa lataaja, joka pidättää "valmis"-ilmoituksen, kun sen pyyntö epäonnistuu. Odottaa tavaraluettelon lataajaa. |
| 4 | `EntitlementsComponent` | `auth-prod/entitlementsv2` | Pisimmän ketjun juuri |
| 5 | `CohortsComponent` | `cohort-prod/playertreatments/{id}` | Epäonnistuu sallivasti (fails open): käyttää varalla käsittelyä (treatment) `E1000` ja ilmoittaa olevansa valmis |
| 6 | `HuntPassComponent` | `/huntpass/{id}` | Rekisteröidään vain, kun eräs ominaisuuslippu (feature flag) on päällä. Ilmoittaa heti olevansa valmis, jos edistymisrajapinta puuttuu. |
| 7 | `UArchonInventoryDataLoader` | `dauntless-prod/inventory/{a}/{c}` | Epäonnistuminen palauttaa pelaajan valikkoon |
| 8 | `UCooldownComponent` | `progression-prod/cooldown/{accountid}` | |
| 9–11 | `UBountyComponent`, `_Daily`, `_Weekly` | `progression-prod/bounty/...` | |

Riippuvuusketjut:

```text
Entitlements -> Progression -> HuntPass -> QuestSystem -> Bounty -> Bounty_Weekly -> Bounty_Daily
Entitlements -> HuntPass
Cooldown, Progression, QuestSystem -> Bounty
InventoryDataLoader -> Loadout
```

Yksikin juuren lähellä jumiin jäänyt lataaja pysäyttää kaiken sen takana. Juuri niin kävi
Entitlements-lataajan kanssa. Vastasimme ensin `GET /entitlementsv2`-pyyntöön pelkällä `[]`-taulukolla.
Sitä ei voi jäsentää (lukija vaatii ylimmälle tasolle olion), joten Entitlements-lataaja ei koskaan
valmistunut, eikä kuusi sen takana olevaa lataajaa edes käynnistynyt. Asiakas pyysi
`entitlementsv2`-tietoa uudelleen jokaisella latauskierroksella eikä pyytänyt `/progression/*`-tietoja
lainkaan. Oikea vastaus on `{"entitlements": []}`, ja alkioiden kentät ovat `name`, `duration` ja
`activatedDate`.

### Työlista {#the-work-list}

Kun taustapalvelu oli tiukassa tilassa (tuntemattomat reitit saavat 404-vastauksen ilman runkoa),
asiakkaan uudelleenyritykset tekivät työlistasta täsmällisen. Nämä kolmetoista pyyntöä
epäonnistuivat kukin noin 70 kertaa, ennen kuin asiakas luovutti. Tyhjät polun osat ovat puuttuva
tilitunnus (ja ennen `?CharacterId=`-valintaa myös hahmotunnus):

| Pyyntö | Mitä vastaamme | Mistä tiedämme muodon |
|---|---|---|
| `progression-prod/pjm/` | `{"nodes": {...}}`, solmutunnuksilla avainnettu olio | Asiakkaan oma `POST /pjm` -runko |
| `progression-prod/cooldown/` | `{"cooldowns": [...]}` | Asiakkaan oma `PUT /cooldown/batch` -runko |
| `progression-prod/escalation/ESC_SEASON_1/` – `ESC_SEASON_6/` (kuusi pyyntöä) | Kääritty: `escalation_level`, `next_level_xp`, `talents_progress` (taulukko), `unlock_progress` (taulukko), `update_version` | Luettu datan purkavasta koodista (deserialiser) |
| `mailbox-prod/survey/config` | Kääritty, tyhjä lista | **Vahvistamaton.** Emme löytäneet sille purkavaa koodia. |
| `mailbox-prod/eventstats/` | Kääritty | Luettu purkavasta koodista |
| `gauntlet-prod/config` | Kääritty; `each_level_rewards` ja `milestone_rewards` on oltava taulukoita | Luettu purkavasta koodista |
| `dauntless-prod/inventory//` | Litteä `{"stackedItems": [...], "instancedItems": [...]}` | Luettu purkavasta koodista |
| `cohort-prod/playertreatments/` | Kääritty, `{"treatments": []}` | Luettu purkavasta koodista |

Reittien on hyväksyttävä tyhjät polun osat ja etsittävä pelaaja silloin bearer-tunnisteen
perusteella. Täydet muodot ovat sivulla
[Taustapalvelun rajapinta]({{ contract_page.url | relative_url }}).

### Ase ja lyhty {#the-weapon-and-lantern}

Kun lataajat on saatu tyytyväisiksi, `AArchonPlayerController::CheckForPlayerStart` estää pelaajan
aloituksen niin kauan kuin `ArchonCharacter->Weapon` tai `->Lantern` on tyhjä (null).
`DefaultGame.ini`-tiedoston `[DefaultLoadout]` nimeää esineet `WP_EB_TRAINING` ja `LT_BASIC`. Asiakkaan
oma aloituslahja (`POST /inventory`, jonka se lähettää itse) kattaa haarniskan, viirin (banner),
soihdun (flare) ja aseen osan, mutta ei näitä kahta. Alkuperäisillä palvelimilla ne antoi
opetusosio, jonka me ohitamme. Taustapalvelumme antaa jokaiselle pelaajalle molemmat esineet ja
palauttaa ne myös tavaraluettelotapahtuman vastauksen `createdInstancedItems`-kentässä.

### Avoin riski edistymisessä {#an-open-risk-in-progression}

Auktoriteettipolulla `UProgressionComponent` ilmoittaa olevansa valmis vasta, kun neljä
valmiuslippua on asetettu (tarkistetaan kohdassa `0x1427cd0d0`). Löysimme kirjoittajat kolmelle
niistä: asetusvastauksen, edistymisvastauksen ja tavoitevastauksen. Neljännelle (`+0x3f3`) emme
löytäneet yhtään. Jos sillä todella ei ole kirjoittajaa, edistyminen ei voi koskaan valmistua
itsenäisessä käynnistyksessä, lähetti taustapalvelu mitä tahansa. Emme voineet testata tätä, koska
tilitunnus pysäytti meidät ensin. Jos ratkaiset tilitunnuksen ongelman eikä pelaajahahmo silti
ilmesty, katso ensin tänne.

---

## Hahmon sitominen: `?CharacterId=` {#binding-a-character-characterid}

Ennen tätä jokainen pyyntö lähti arvoilla `"characterId": ""` ja `"accountId": ""`, ja polut
kutistuivat muotoihin `/inventory//` ja `/loadout///all`.

Ohjelmatiedoston paikallisen pelaajan ja kirjautumisen koodissa on merkkijonot `?CharacterId=%s`,
`?PlatformPool=%s` ja `AuthToken=%s`. Ne näyttävät URL-valinnoilta. Kokeilimme ensimmäistä
käynnistys-URL:ssamme:

```ini
[/Script/EngineSettings.GameMapsSettings]
LocalMapOptions=?CharacterId=<character id>
```

**Se otetaan käyttöön.** Tämän jälkeen pyynnöissä oli hahmotunnus, ja poluista tuli muotoa
`/inventory//<character id>`. Tunnuksen on oltava sellainen, jonka `GET /character` palauttaa tälle
pelaajalle. Suora käynnistys vain listaa hahmot eikä koskaan luo uutta. Siksi taustapalvelumme luo
hahmon, kun lista on tyhjä, sillä tyhjä lista jättää myös kaikki myöhemmät tunnukset tyhjiksi.

Tilitunnus jäi tyhjäksi.

---

## Este: tyhjä tilitunnus {#the-blocker-an-empty-account-id}

### Oire {#the-symptom}

- Jokaisessa pyynnössä on `"accountId": ""`, ja jokainen `{accountid}`-osa on tyhjä
  (`/progression//`, `/loadout//<character id>/all`).
- Yhdessäkään pyynnössä ei ole `Authorization`-otsaketta lainkaan.
- Asiakkaan oma telemetria ilmoittaa `client_login_failed` vaiheessa `LoginToEpicProxy` viestillä
  "Failed to login to Epic with no given Auth info".

### Mistä tilitunnus tulee {#where-the-account-id-comes-from}

- `{accountid}` täytetään paikallisen pelaajan Phoenix-tunnuksen `FUniqueNetId::ToString()`-arvosta.
  Tunnus tulee funktiosta `IOnlineIdentity::GetUniquePlayerId()`, ja se tallennetaan paikalliseen
  pelaajaan (`UArchonLocalPlayer + 0x930`). Se ei ole merkkijono, jota asiakas säilyttäisi missään
  muualla.
- Ainoa taustapalvelun vastaus, jossa on tilitunnus, on `GET auth-prod/accountinfo`. Asiakas pyytää
  sitä vain kirjautumispolulta.
- URL-osoitteiden rakentajat eivät jätä pyyntöä tekemättä, kun tunnus on tyhjä. Ne käyttävät sen
  tilalla tyhjää merkkijonoa, esimerkiksi `FOnlineLoadoutPhoenix::GetAllLoadouts` kohdassa
  `0x141420b24`. Siksi pyyntöjä tulee jatkuvasti `//`-merkkeineen.

### Miksi suora käynnistys ei koskaan saa sitä {#why-the-direct-boot-never-gets-one}

Koko kirjautumis- ja hahmonvalintakulku on kartan sisällä. `Map_LoginMenu` ajaa Blueprint- ja
UMG-näkymiä (`LoginScreen_bps`, `PressStartScreen_bps` ja muita), ja ne ohjaavat Phoenixin
identiteettirajapintaa. Sikäli kuin voimme päätellä, asiakasohjelmassa ei ole C++-kielistä
automaattista kirjautumista: funktiolla, joka lukee `AuthEndpoint`-arvon, ei ole suoria kutsujia.
`GameDefaultMap`-ohitus ei viivästytä tuota kulkua. **Se poistaa sen.**

### Mitä suljimme pois {#what-we-ruled-out}

| Idea | Tulos |
|---|---|
| `?AuthToken=...` käynnistys-URL:ssa | Ei oteta käyttöön |
| `?AccountId=...` käynnistys-URL:ssa | Ei oteta käyttöön |
| Asetusavain, joka pakottaa kirjautumisen ennen karttaa tai syöttää tunnuksen | Ei löytynyt. `GameMapsSettings`-asetuksissa ei ole sellaista valintaa. |
| Komentorivin valitsin | Ei yhtään. Listasimme ohjelmatiedoston jokaisen valitsimen näköisen merkkijonon. Ainoat Archon-kohtaiset ovat `-DISABLE_MATCHMAKER_AUTH`, `-GAMESERVER_INSTRUCTION_FILE=` ja `-GAMESERVER_STATUS_FILE=`. `-AUTH_*` on EOS:n oma automaattinen kirjautuminen Epic-identiteetille, ei Phoenix-identiteetille. |
| Taustapalvelun vastaus, joka asettaa tunnuksen | Ei yhtään. Suora käynnistys ei koskaan tee sitä ainoaa pyyntöä, jonka vastaus sisältää tunnuksen. |
| Konsoli | `ALLOW_CONSOLE` on jätetty pois käännöksestä |

---

## Mistä jatkaa {#where-to-continue}

### Reitti, jonka valitsisimme nyt {#the-route-we-would-take-now}

**Anna tavallisen kirjautumisen mennä läpi ja siirry sitten oikealle palvelimelle.**

- Valmistuneen kirjautumisen jälkeen Phoenix-identiteetti ja paikallinen pelaaja elävät
  peli-instanssissa (game instance), eivät maailmassa (world). Identiteetti siis säilyy myöhemmässä
  kartan vaihdossa (**todennäköistä** olioiden rakenteen perusteella; ei testattu).
- Asiakkaan oma tie kaupunkiin on matchmaking. `UArchonOnlineSessionClient::TravelToCity` pyytää
  `mm2-prod`-palvelulta kaupungin istuntoa ja ottaa sitten yhteyden yhteysmerkkijonolla
  `%s:%d?ticket=%s?gameSessionId=%s?EncryptionToken=%s`. Se on aina palvelin ja portti, ei koskaan
  paikallisen paketin nimi.
- Tarvitset siis isännän. 2.1.1-ohjelmatiedosto ei pysty isännöimään yksinään, mutta ohjelmaan
  ladattu DLL voi saada saman ohjelmatiedoston toisen kopion isännöimään.
  [Näin moninpeli toimii]({{ mp_page.url | relative_url }}) kuvaa, miten Undaunted tekee tämän
  versiossa 1.4.4. Asiakkaan odottama matchmaking-sopimus (`/candidate/status`, `serverInfo`,
  `isNewMatchmaker`, `playerStates`) on sivulla
  [Taustapalvelun rajapinta]({{ contract_page.url | relative_url }}).
- **Älä lataa Undauntedin DLL:ää versioon 2.1.1.** Se paikkaa kiinteitä osoitteita
  1.4.4-ohjelmatiedostossa ja sotkisi muistin missä tahansa muussa versiossa. Jokainen osoite on
  etsittävä uudelleen versiolle 2.1.1. Toinen yhteisöprojekti,
  [Mystic Paradox](https://github.com/pranav158/Mystic-Paradox), siirtää samaa lähestymistapaa
  versioon 1.12.0. Emme ole kokeilleet sitä.

### 2.1.1-osoitteet, joista aloittaa
{: id="211-addresses-to-start-from"}

Staattiset osoitteet, perusosoite (image base) `0x140000000`. Nimet ovat meidän, ja ne on otettu
kunkin funktion lokimerkkijonoista. Julkaisuversion ohjelmatiedostossa ei ole symboleja.

| Mikä | Osoite |
|---|---|
| `UWorld::Listen`, tynkä: `xor al, al` / `ret` | `0x140bfde50` |
| Sen kutsu `UEngine::LoadMap`-funktiossa | `0x14537140e` |
| `UWorld::GetNetMode`, aina `NM_Client`, kun verkkoajuri on olemassa | `0x1453e4ef0` |
| `GIsClient` / `GIsServer` | `0x1488ea0f2` / `0x1488ea0f3` |
| `GIsClient`-kirjoitus `FEngineLoop::PreInit`-vaiheessa (rekisteristä; tavallisessa pelin ajossa 1) | `0x140c0f683` |
| `UIpNetDriver::InitListen`, ehjä | `0x140c6d200` |
| `UGameInstance::StartGameInstance` (käynnistys-URL) | `0x144dba330` |
| `UGameInstance::CreateGameModeForURL` | `0x144da42c0` |
| `AArchonPlayerController::PostInitializeComponents` (rekisteröi lataajat) | `0x1429dbb60` |
| `AArchonPlayerController::OnPostLogin` | `0x1429d6ea0` |
| `UArchonLoadManager::Begin` / `Complete` / `LoadFailed` | `0x14299b670` / `0x14299d860` / `0x1429ad0f0` |
| `AArchonPlayerController::OnPlayerDataLoadComplete` | `0x1429d6900` |
| `GetPlayerAccountProgressState` | `0x1429d0160` |
| `ULoginScreen::AdvanceToPlay` | `0x142d128f0` |
| `FJsonSerializable::FromJson(const FString&)` | `0x140c2fbe0` |
| JSON `int32` -lukija (tarkistaa tyypin, ohittaa kentän, jos tyyppi ei täsmää) | `0x140c3a870` |
| `FCandidateStatus::Serialize` / `FServerInfo::Serialize` | `0x1414c2a10` / `0x1414c7bf0` |
| `FThreadHeartBeat::InitSettings` (jumiutumisen tunnistimen asetukset) | `0x142ec08c0` |

### Jos pysyt itsenäisessä käynnistyksessä {#if-you-stay-with-a-standalone-boot}

- Vipu olisi jokin, joka asettaa paikallisen pelaajan Phoenix-tunnuksen ennen kuin lataajat
  käynnistyvät. Mikään asetuksissa tai komentorivillä ei tee sitä. Se vaatisi ohjelmaan lisättyä
  koodia.
- Varaudu siihen, että edellä kuvattu edistymisen valmiuslippu on seuraava muuri.
- Seuraa `playerdata_load_failed`-telemetriatapahtumaa. Sen `loaders`-taulukko nimeää jokaisen
  lataajan ja kertoo, valmistuiko se. Se ei tosin ehkä koskaan laukea. Sen ajastimen tahti tulee
  kentästä, jolle emme löytäneet kirjoittajaa.

---

## Miksi siirryimme versioon 1.4.4 {#why-we-moved-to-144}

- **Undaunted pyörittää jo moninpeli-Ramsgatea, metsästyksiä ja opetusosiota versiossa 1.4.4**
  alkuperäisellä asiakasohjelmalla ja ohjelmaan ladatulla palvelin-DLL:llä. Versiossa 2.1.1
  olisimme joutuneet rakentamaan kaiken tämän itse.
- **1.4.4 on EOS:ää vanhempi.** Pelaajat kirjautuvat omalla palvelimellamme olevalla tilillä.
  Epic-tiliä ei tarvita, eikä mikään Epicin palvelu voi sammuttaa sitä.
- **2.1.1-työmme on edelleen hyödyksi.** Molemmat versiot puhuvat samalle Phoenix-palvelulle.
  Niiden päätepisteasetuksissa on 170 yhteistä avainta, ja niistä 167:n arvot ovat tavu tavulta
  samat; kolme eroavaa liittyy äänichattiin. Vastausten muodot voivat silti erota versioiden
  välillä.
- **Hinta:** kaikki lokakuun 2020 jälkeen julkaistu sisältö puuttuu versiosta 1.4.4.
