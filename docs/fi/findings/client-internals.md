---
title: Asiakasohjelman sisäosat
parent: Löydökset
grand_parent: Dauntless Revived suomeksi
nav_order: 5
lang: fi
ref: findings/client-internals
locale: fi_FI
description: "Mitä Dauntlessin peliohjelma osaa yksinään ja mitä ei: käynnistysvalitsimet, kirjautuminen, lokit, telemetria ja jumiutumisen tunnistin (2.1.1 ja 1.4.4)."
---

{% assign mp_page = site.pages | where: "path", "fi/findings/multiplayer.md" | first %}

# Asiakasohjelman sisäosat
{: .no_toc }

Asiakasohjelma (client) on se peliohjelma, jonka pelaaja käynnistää omalla tietokoneellaan.
Palvelin (server) taas on tietokone, joka pyörittää peliä verkossa. Lyhyesti: Dauntlessin mukana
tullut ohjelma on tehty vain pelaamiseen, ei pelin pyörittämiseen muille. Tällä sivulla kerromme,
mitä ohjelma osaa tehdä yksinään ja mitä ei, sekä ne harvat keinot, joilla pääsimme kurkistamaan
sen sisään.

Suurin osa tiedoista on peräisin **2.1.1**-version purkamisesta konekielestä luettavaan muotoon
(disassembly). Kun asia vaikuttaa siihen, miten pelaamme peliä nykyään, tarkistimme saman asian myös
versiosta **1.4.4**. Jokaisessa osiossa kerrotaan, mitä versiota se koskee.

<details open markdown="block">
  <summary>Sisällys</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Kaksi versiota {#the-two-builds}

| | 2.1.1 "Awakening" | 1.4.4 |
|---|---|---|
| Julkaistu | Joulukuu 2024, viimeinen julkaisu | Lokakuu 2020 |
| Pelimoottori | Unreal Engine 5 | Unreal Engine 4.25.3, muutoslista (changelist) 239827 |
| Sisältö | IoStore (`.utoc`/`.ucas`). Useimmat `.pak`-tiedostot ovat pieniä tynkiä. Asetukset ovat Oodle-pakatussa pak-tiedostossa. | pak v9, salaamaton hakemisto (index), zlib |
| `Dauntless-Win64-Shipping.exe` | 151 448 856 tavua | 103 673 520 tavua |
| Kirjautuminen verkossa | Epic Online Services (EOS SDK 1.16) sekä Phoenixin taustapalvelu | Phoenixin taustapalvelu sekä Epicin vanhempi MCP-alijärjestelmä. Ei EOS:ää. |
| Käyttömme | Vain tutkimus | Tätä pyöritämme |

**Osoitteet.** Versiolle 2.1.1 annamme virtuaaliosoitteet (VA), kun ohjelman perusosoite (image
base) on `0x140000000`. Versiolle 1.4.4 annamme RVA-osoitteet (suhteelliset osoitteet) samaan
tapaan kuin Undauntedin lähdekoodi. Kun RVA:han lisää `0x140000000`, saa VA:n.

---

## Pelkkä asiakasohjelma {#a-client-only-build}

Molemmat ohjelmatiedostot ovat Unrealin `TargetType.Client`-käännöksiä, jotka on käännetty
asetuksella `WITH_SERVER_CODE=0`. Tällaisesta käännöksestä Unreal jättää pois palvelimen
aloituskohdat (entry points). Todisteet:

| Todiste | 2.1.1 | 1.4.4 |
|---|---|---|
| `UWorld::Listen`-funktion runko | `0x140bfde50`: `xor al, al` / `ret` | RVA `0x789370`: `xor al, al` / `ret` |
| Sen kutsukohta `UEngine::LoadMap`-funktiossa | `0x14537140e` | RVA `0x372E746` |
| `"Failed to listen: %s"` (`#if WITH_SERVER_CODE` -lohkon sisällä) | puuttuu | puuttuu |
| `"LoadMap: failed to Listen(%s)"` (lohkon ulkopuolella) | on mukana | on mukana |
| `UWorld::GetNetMode` | `0x1453e4ef0`: palauttaa `NM_Client` (3) aina, kun verkkoajuri on olemassa | `InternalGetNetMode`, RVA `0x378BDA0`: sama |
| `"WindowsClient"` / `"WindowsServer"` ohjelmatiedostossa | 1 / 0 | 1 / 0 |
| `GIsClient` pakotetaan arvoon 1 `FEngineLoop::PreInit`-vaiheessa | kirjoitus osoitteessa `0x140c0f683` | kirjoitukset RVA-osoitteissa `0x79A67A` ja `0x79A81B` |

Mitä kukin rivi tarkoittaa:

- **`UWorld::Listen` on tynkä (stub).** Tavallisessa Unrealissa tämä funktio luo pelin verkkoajurin
  (net driver) ja alkaa kuunnella yhteyksiä, kaikki `#if WITH_SERVER_CODE` -lohkon sisällä. Tässä
  koko runko on poissa. Linkitin (linker) yhdisti jäljelle jääneen osan yhteiseen kahden käskyn
  "palauta epätosi" -funktioon. `LoadMap` kutsuu sitä aina, kun URL-osoitteessa on `?listen`, saa
  vastaukseksi epätoden ja luovuttaa.
- **`GetNetMode` vastaa aina "asiakas".** Unrealin lähdekoodissa lukee
  `IsRunningClientOnly() ? NM_Client : NetDriver->GetNetMode()`. Molemmissa versioissa kääntäjä
  säilytti vain `NM_Client`-puolen. Näin käy vain, kun "pelkkä asiakas" on käännösaikainen vakio.
- **Alustan nimi.** `FPlatformProperties::PlatformName()` palauttaa `WindowsServer`,
  `WindowsEditor`, `WindowsClient` tai `Windows` sen mukaan, mikä malliparametri (template argument)
  valitaan, kun moottori käännetään. Kummassakin ohjelmatiedostossa on `"WindowsClient"` kerran,
  eikä `"WindowsServer"` ole kummassakaan. Versiossa 2.1.1 tuohon yhteen merkkijonoon viitataan
  koodista 21 kertaa: `PlatformName()` on upotettu (inline) jokaiseen kutsukohtaan. Samasta nimestä
  johtuu, että käyttäjän asetuskansio on `...\Saved\Config\WindowsClient`.
- **`GIsClient` pakotetaan päälle.** Versiossa 2.1.1 tavallinen käynnistyspolku kirjoittaa
  `GIsClient = 1` (`0x140c0f683`) ja `GIsServer = 0` (`0x140c0f68a`). Muut `GIsClient`-kirjoitukset
  ovat commandlet-polulla (`-run=`), jonka tämä käännös torjuu viestillä
  `"Tried to run commandlet in non-editor build"`. Omat tarkistuksemme päätyivät eri tuloksiin
  siitä, voisiko tuo polku jättää `GIsClient`-arvon nollaksi. Isännöinnin kannalta sillä ei ole
  väliä: kun `GIsClient` on 0, `LoadMap` kutsuu `Listen`-tynkää jokaisella kartan latauksella ja
  epäonnistuu.

### Mitä tämä tarkoittaa tavalliselle asiakasohjelmalle {#what-that-means-for-the-stock-client}

Ilman ohjelmaan lisättyä koodia:

- `-server` ei tee mitään. Ohjelma käynnistää tavallisen, ikkunassa toimivan asiakasohjelman
  (2.1.1, testattu).
- Kun käynnistys-URL:iin lisää `?listen`, `Browse()` epäonnistuu. Asiakasohjelma ilmoittaa sitten,
  ettei oletuskarttaa "löytynyt", ja sulkeutuu. Tämä ikkuna tulee aina, kun `Browse()` epäonnistuu,
  ei vain silloin, kun kartta puuttuu (2.1.1, testattu).
- Valitsimille `-UseStandaloneDedicatedServer`, `-GAMESERVER_STATUS_FILE=`,
  `-GAMESERVER_INSTRUCTION_FILE=` ja `-PLAYFAB_GAMEMODE=` on ohjelmassa jäsentimet (parserit), mutta
  mikään niistä ei saa prosessia isännöimään peliä. `-UseStandaloneDedicatedServer` muuttaa vain
  versiotunnusta, jota asiakas pyytää matchmaking-palvelulta (`LOCAL_<computer name>`); se oli
  Phoenixin paikallisen palvelimen kehitystila (2.1.1, disassemblyn perusteella). Nämä valitsimet
  eivät ehkä edes pääse jäsentimiinsä asti: katso alta
  [komentorivin sallittujen lista](#the-command-line-allow-list-211).
- `GlobalDefaultServerGameMode`-asetusta ei lueta koskaan. Funktiolla, joka palauttaa
  oletuspelitilan, ei ole erillispalvelimen (dedicated server) haaraa (2.1.1, disassemblyn
  perusteella).

### Mitä on yhä jäljellä {#what-is-still-there}

Vain aloituskohdat poistettiin. Niiden alla oleva kerros on ehjä:

- `UIpNetDriver::InitListen` on oikeaa, toimivaa koodia (2.1.1 `0x140c6d200`, 1.4.4 RVA
  `0x806F80`). Se on liitännäismoduulissa (plugin), johon `WITH_SERVER_CODE` ei vaikuta. Versiossa
  2.1.1 sen ainoa jäljellä oleva kutsuja on verkon majakkaisäntä (online beacon host), joka ei ole
  pelipalvelin.
- `UWorld::NotifyControlMessage`-funktion palvelinpuoli on käännetty mukaan, ja siinä on täysi
  hyppytaulu `NMT_*`-ohjausviesteille (2.1.1 `0x1453e5d40`). Mukana ovat myös
  `"PreLogin failure: %s"`, `"Join succeeded: %s"` ja `AArchonGameMode::PostLogin`.
- Asiakasohjelman oma yhteydenottopolku palvelimeen on täydellinen.

Aluksi tulkitsimme tämän niin, että koodi on "käännetty mukaan, mutta sinne ei pääse, joten
isännöinti on mahdotonta". **Se oli väärin.** Tavallinen koodipolku ei koskaan päädy näihin
funktioihin, mutta ohjelmaan lisätty koodi pääsee.
[Näin moninpeli toimii]({{ mp_page.url | relative_url }}) kertoo, miten Undaunted tekee sen
versiossa 1.4.4.

---

## Asiakasohjelman käynnistys: `LauncherCheck` ja `-EpicPortal` {#starting-the-client-launchercheck-and--epicportal}

- Molemmissa versioissa on Unrealin `LauncherCheck`-moduuli. Versiossa 2.1.1 se ei lue asetuksia
  lainkaan, vain komentorivin. Sen testi (`WasRanFromLauncher`, `0x14543f100`) menee läpi, jos
  mukana on `-EpicPortal`, `-NoEpicPortal` tai `-q`. Kahta jälkimmäistä ei ole alla kuvatulla
  komentorivin sallittujen listalla, joten jos lista toimii niin kuin disassembly näyttää, vain
  `-EpicPortal` voi läpäistä tarkistuksen. Se sopii siihen, mitä näimme: kun käynnistimme 2.1.1:n
  sen sijaan pelkällä `-NoEpicPortal`-valitsimella, se sulkeutui silti `LauncherCheck`-kohdassa
  kuuden lokirivin sisällä. Ilman `-EpicPortal`-valitsinta 2.1.1 sulkeutuu melkein heti. Annamme
  `-EpicPortal`-valitsimen aina myös versiolle 1.4.4 emmekä ole testanneet sitä ilman.
- Versiossa 2.1.1 on myös EOS:n oma asetus `bShouldEnforceBeingLaunchedByEGS`, joka käynnistää
  pelin uudelleen Epicin kaupan kautta. Se on valmiiksi `False` mukana tulleissa asetuksissa, ja
  `FOnlineSubsystemEOS::Init` katsoo sitä vain, kun `-EpicPortal` puuttuu. Sitä `LauncherCheck` ei
  testaa.
- Käynnistä `Dauntless-Win64-Shipping.exe` suoraan. `start_protected_game.exe` on EasyAntiCheatin
  (huijauksenestojärjestelmän) käynnistäjä. Kun käynnistät shipping-ohjelman suoraan, EasyAntiCheat
  ei käynnisty ollenkaan. Versiossa 2.1.1 asennus pysyy silloin muuttamattomana ja sen
  allekirjoitukset kelvollisina. Versiossa 1.4.4 Undaunted lisää kaksi DLL-tiedostoa kansioon
  `Archon\Binaries\Win64`, mutta itse ohjelmatiedosto pysyy tavu tavulta samana (sen käynnistin
  tarkistaa tiivisteen eli hashin).
- Versiossa 1.4.4 Undauntedin käynnistin antaa `-EpicPortal`-valitsimen yhdessä muiden
  Epic-valitsimien paikkamerkkiarvojen kanssa. Peli toimii paikkamerkeillä, joten mikään tällä
  polulla ei tarkista niitä:

```text
Dauntless-Win64-Shipping.exe <metagame host:port> -AUTH_PASSWORD=<account key> -AUTH_LOGIN=unused
  -AUTH_TYPE=exchangecode -epicapp=<any> -epicenv=Prod -EpicPortal -epicusername=<any>
  -epicuserid=<any> -epiclocale=en-US -epicsandboxid=<any> -epicdeploymentid=<any>
```

### Komentorivin sallittujen lista (2.1.1) {#the-command-line-allow-list-211}

Disassembly näyttää, että 2.1.1 ajaa komentorivinsä Unrealin komentorivin sallittujen listan
(allow list) läpi. `FCommandLine::Set` (`0x142f582e0`) kutsuu aina suodatinta (`0x142f42c10`), joka
poistaa jokaisen valitsimen, joka ei ala jollakin näistä (UTF-16-merkkijono osoitteessa
`0x146f22170`):

```text
-fullscreen /windowed -noautosettings -AUTH_LOGIN= -AUTH_PASSWORD= -AUTH_TYPE= -epicapp= -epicenv=
-EpicPortal -epicusername= -epicuserid= -epiclocale= -networkversionoverride= -environment=
```

Sama merkkijono on myös 1.4.4:n ohjelmatiedostossa. Emme ole **vahvistaneet suodatinta suoraan
ajon aikana** kummassakaan versiossa. Yksi 2.1.1-havainto sopii siihen: pelkkä `-NoEpicPortal`,
jonka `LauncherCheck` hyväksyisi, ei päästänyt asiakasta `LauncherCheck`-kohdan ohi. Jos suodatin
toimii niin kuin disassembly näyttää, valitsimet kuten `-server`, `-nothreadtimeout`,
`-noheartbeatthread`, `-UseStandaloneDedicatedServer`, `-NoEpicPortal`, `-q` ja `-EngineINI=`
poistetaan, ennen kuin mikään koodi lukee niitä. Pidä siis jokaista 2.1.1-havaintoa, joka riippuu
tällaisesta valitsimesta, vahvistamattomana, ja käytä mieluummin ini-asetusta, jos sellainen on
olemassa. Undauntedin palvelin-DLL lukee versiossa 1.4.4 omat argumenttinsa Win32:n
`GetCommandLineW`-funktiolla ja antaa pelimoottorille kiinteän komentorivin koukun (hook) avulla,
joka on asetettu `FCommandLine::Get`-funktioon (katso
[Näin moninpeli toimii]({{ mp_page.url | relative_url }})).

---

## Kirjautumisvalitsimet versioittain {#login-switches-per-build}

### 2.1.1: Epic Online Services
{: id="211-epic-online-services"}

Komentorivikirjautuminen kulkee kahden portin läpi:

1. **Pelin oma portti** (`0x142924b3f`) lukee vain valitsimet `-AUTH_PASSWORD=` ja `-AUTH_TYPE=`.
   Jos jompikumpi on tyhjä, se epäonnistuu heti viestillä
   `"Failed to login to Epic with no given Auth info"` ja näyttää kirjautumisvirheen ikkunan.
   EOS:ään ei oteta yhteyttä lainkaan.
2. **EOS:n automaattinen kirjautuminen** (`FUserManagerEOS::AutoLogin`, `0x141c89680`) vaatii sen
   jälkeen, ettei yksikään kolmesta valitsimesta ole tyhjä, ei myöskään `-AUTH_LOGIN=`. Jos yksi
   puuttuu, se kirjaa lokiin esimerkiksi `"AutoLogin missing AUTH_LOGIN=<login id>."`.

Anna kaikki kolme. Kun annoimme vain osan, näimme asiakasohjelman hiljaa käyttävän uudelleen
vanhentunutta, välimuistiin tallennettua tunnistetta (token) ja epäonnistuvan. `-AUTH_TYPE=`
hyväksyy tasan viisi arvoa, joita verrataan `FUserManagerEOS::Login`-funktiossa:

| `-AUTH_TYPE=` | EOS-tunnistetyyppi | Mitä se käyttää |
|---|---|---|
| `password` | 0 | `AUTH_LOGIN` tunnuksena, `AUTH_PASSWORD` tunnisteena |
| `exchangecode` | 1 | `AUTH_PASSWORD` vaihtokoodina (exchange code) |
| `persistentauth` | 2 | ei mitään. Tavoitti Epicin ja palautti meille `EOS_InvalidAuth`. |
| `developer` | 4 | `AUTH_LOGIN` ja `AUTH_PASSWORD` |
| `accountportal` | 6 | ei mitään. EOS avaa Epicin tiliportaalin selaimeen. |

Mikä tahansa muu arvo epäonnistuu viestillä
`"Unable to Login() user (%d) due to missing auth parameters"`.

- **Toimiva vaihtoehto on `accountportal`.** Pelaaja kirjautuu Epicille selaimessa.
  Kirjautumistunnuksen ja salasanan arvoja ei käytetä, mutta ne eivät saa olla tyhjiä:
  `-AUTH_TYPE=accountportal -AUTH_LOGIN=unused -AUTH_PASSWORD=unused`. Syyskuussa 2026 Epicin
  EOS-palvelu hyväksyi tämän vielä Dauntlessille.
- **Nimetöntä laitekirjautumista ei ole.** Ohjelma hakee EOS SDK:n funktiot nimen perusteella, joten
  jokainen sen käyttämä rajapinta näkyy merkkijonona. `EOS_Connect_CreateDeviceId` ei ole niiden
  joukossa.
- **Jokainen epäonnistuminen näyttää virheikkunan**, yhtä poikkeusta lukuun ottamatta.
  Asynkroninen virheenkäsittelijä (`0x142925e80`) tarkistaa Epicin virhekoodin
  `errors.com.epicgames.account.no_account_found_for_external_auth`. Sen kohdalla se valitsee toisen
  haaran eikä näytä ikkunaa.
- EOS:n jälkeen asiakas hakee Phoenix-istuntonsa pyynnöllä
  `PUT gamesession-prod.steelyard.ca/gamesession/epiceos` ja lähettää EOS-tunnisteen
  bearer-tunnisteena. Sen jälkeen se käyttää vastauksessa saamaansa istuntotunnistetta
  bearer-tunnisteena myöhemmissä kutsuissa. Sähköposti- ja salasanareittiä
  `POST auth-prod.steelyard.ca/game/login` käytetään vain, kun tunnistetyyppi ei ole `"epic"`.

### 1.4.4: ei EOS:ää lainkaan
{: id="144-no-eos-at-all"}

- 1.4.4 on EOS:ää vanhempi. Ohjelmatiedostossa ei ole viittausta tiedostoon
  `EOSSDK-Win64-Shipping.dll` eikä `OnlineSubsystemEOS`-merkkijonoja. Pelin mukana tulevissa
  valmiissa asetuksissa (cooked config) on `DefaultPlatformService=Phoenix`. Epic-tilin liikenne
  kulkee vanhemman `OnlineSubsystemMcp`:n kautta, jonka `[OnlineSubsystemMcp.*]`-osiot nimeävät
  `epicgames.com`-palvelimia.
- Arvoja `accountportal` ja `persistentauth` ei ole tässä versiossa. Se tuntee arvot
  `exchangecode`, `password` ja `developer`.
- **Käytämme Undauntedin tapaa:**
  `-AUTH_TYPE=exchangecode -AUTH_LOGIN=unused -AUTH_PASSWORD=<account key>`. Undauntedin asiakas-DLL
  ohjaa jokaisen MCP-osion `Domain`- ja `Protocol`-arvot metagameen (Undauntedin taustapalvelimeen).
  Metagamen `POST /account/api/oauth/token` tulkitsee vaihtokoodin pelaajan tiliavaimeksi ja
  palauttaa allekirjoitetun tunnisteen. Asiakas lähettää sen jälkeen tuon tunnisteen
  bearer-tunnisteena jokaisessa pyynnössä. Epic-tiliä ei tarvita lainkaan. Pidä tiliavainta yhtä
  salaisena kuin salasanaa.
- Valitsimen `-AUTH_TYPE=password` pitäisi lähettää sähköposti ja salasana Phoenixin
  `/game/login`-osoitteeseen. Emme ole **testanneet** tätä, koska käytämme vaihtokoodipolkua.
  Undauntedin metagamessa ei ole `/game/login`-käsittelijää, joten tämä reitti vaatisi ensin työtä
  taustapalvelun puolella.

---

## Ei konsolia {#no-console}

Konsoli tarkoittaa pelin sisäistä tekstikomentoikkunaa, jota kehittäjät käyttävät.

- **2.1.1:** `ALLOW_CONSOLE` on jätetty pois käännöksestä. Kokeilimme Tilde-näppäintä sekä
  ylimääräisiä `+ConsoleKeys=F8`- ja `F9`-rivejä käyttäjän `Input.ini`-tiedostossa. Mitään ei aukea.
  Valmiissa `DefaultInput.ini`-tiedostossa on yhä `ConsoleKeys` ja 898
  `ManualAutoCompleteList`-riviä huijauskomennoille. Ne ovat jäänneitä. Mikään ei lue niitä.
- **Kummassakaan versiossa** ei ole `-ExecCmds`-valitsinta, joten konsolikomentoja ei voi antaa
  komentorivilläkään.
- **1.4.4:** Undauntedin asiakas-DLL luo itse `UConsole`-olion ja sitoo sen **F2**-näppäimeen. Se
  viittaa siihen, ettei tavallinen käännös luo konsolia lainkaan. Emme ole tarkistaneet, mitä
  komentoja se hyväksyy.

---

## Lokit {#logging}

### Lokitiedostoon kirjoittaminen on poistettu (2.1.1) {#file-logging-is-stripped-211}

- Julkaisukäännös (shipping build) ei kirjoita lokitiedostoa. `-abslog=` ei tuota mitään.
  `UE_LOG`-muotoilumerkkijonot ovat yhä ohjelmatiedostossa, ja niiden avulla löydämme funktioita.
- Vakiotuloste (standard output) on poikkeus. Varhaisissa 2.1.1-ajoissamme käynnistimme ohjelman
  `-log`-valitsimella ja ohjasimme sen vakiotulosteen tiedostoon, ja se tulosti sinne 1 000–4 000
  lokiriviä käynnistystä kohden (näimme `Display`-, `Warning`- ja `Error`-rivejä). Emme selvittäneet,
  mistä valitsimesta tai asetuksesta tämä riippuu.
- Käyttäjän `Engine.ini`-tiedoston `[Core.Log]` luetaan (`0x142f22e80`). Valitsinta `-LogCmds=`
  **ei** jäsennetä. Se esiintyy vain ohjetekstissä.
- Versiosta 1.4.4 emme ole tarkistaneet, onko ohjelmatiedostossa tiedostoon kirjoittava lokikohde.
  Undauntedin DLL tulostaa omat viestinsä konsoli-ikkunaan.

### HTTPEventLog lähettää vain Warning-tason ja vakavammat rivit (2.1.1) {#httpeventlog-ships-only-warning-and-above-211}

Molempien versioiden `DefaultGame.ini`-tiedostossa on `[HTTPEventLog]`-osio, jossa on
`bEnabled=True`, `EventLogEndPoint="https://telemetry.steelyard.ca/log"` ja `Sample1InX=1` (ei
otantaa). Se näyttää keinolta saada lokivirta takaisin. Versiossa 2.1.1 se ei ole:

- `FHttpEventLog` on `FOutputDevice`. Se luodaan ehdoitta (`0x14265dd5d`). `bEnabled`-arvoa ei
  lueta koskaan.
- Sen `Serialize` (`0x142947830`) alkaa käskyillä `cmp r8b, 3` / `ja` → paluu. Jokainen rivi, joka
  on yksityiskohtaisempi kuin **Warning**, pudotetaan pois, ennen kuin viestiä edes rakennetaan.
  Tuo raja on koodiin kiinteästi kirjoitettu vakio, ei asetus.
- Muoto on Splunk HTTP Event Collector -kirjekuori (envelope): `host`, `source` (`WindowsClient`),
  `sourcetype` (`game-log`), `index` (`dauntless`), `time`, `event`, `game-id` ja `severity`. Se
  lähetetään `Authorization: Splunk <token>` -otsakkeen kanssa. Tunniste on kirjoitettu kiinteästi
  ohjelmatiedostoon. Emme toista sitä. Odotettu vastaus on `{"text":"Success","code":0}`.
- Ohjasimme `telemetry.steelyard.ca`-osoitteen palvelimellemme ja vastasimme `/log`-pyyntöihin.
  Asiakas ei lähettänyt yhtäkään riviä. Emme myöskään koskaan löytäneet kohtaa, jossa tämä
  lokilaite liittää itsensä yleiseen lokiin. Sitä ei ehkä liitetä lainkaan (**vahvistamaton**).

Käytännön seuraus: lokien yksityiskohtaisuuden lisääminen ei auta tässä kanavassa, koska se ei
koskaan lähetä Warning-tasoa lievempiä rivejä. Periaatteessa vipu toimii toisin päin. Valmis
`[Core.Log]` lukitsee `LogHttp`-luokan tasolle `Error` molemmissa versioissa, joten HTTP-varoitukset
heitetään nyt pois. Jos tuon luokan tasoksi asettaisi `Warning`, ne pääsisivät läpi. Tätä emme ole
**testanneet**.

---

## Telemetrian sykeviesti mittarina {#the-telemetry-heartbeat-as-an-instrument}

Telemetria tarkoittaa tietoja, joita peli lähettää itsestään taustapalveluun. Kun lokitiedostoa ja
konsolia ei ollut, asiakasohjelman oma telemetria oli luotettavin tapamme nähdä, mitä se teki.

- **Sykeviesti (heartbeat).** Asiakas lähettää POST-pyynnöllä sykeviestin osoitteeseen
  `TrackingEndpoint` + `/heartbeat` noin kerran sekunnissa. Molempien versioiden valmiissa
  asetuksissa osoite on `https://tracking-{environment}.steelyard.ca` (2.1.1, nähty ajossa).
  Tallentamassamme JSON-rungossa on kentät `build`, `platform`, `state`, `region`, `server`,
  `session`, `map`, `ping` ja `playtime`. Itsenäisissä ajoissamme `server` sisälsi paikallisen
  tietokoneen nimen, joten pidä tallennettuja sykeviestejä henkilötietoina.
  - **`map`** on hyödyllisin kenttä. Se kertoo, millä kartalla asiakas oikeasti on. Sen avulla
    varmistimme, että käynnistys oli todella päässyt Ramsgateen.
  - **`state`**: tallensimme arvon `menu` kirjautumiskartalla ja arvon `city` Ramsgatessa.
    Merkkijonot `menu`, `city`, `island` ja `lobby` ovat merkkijonotaulukossa heti kenttien nimien
    jälkeen. Tulkitsemme ne neljäksi mahdolliseksi arvoksi (**todennäköistä, ei todistettu**).
  - Versiossa 1.4.4 Undauntedin metagame (`POST /heartbeat`) käyttää `map`-kenttää pelaajien
    aktiivisuuden kirjaamiseen.
- **Analytiikkatapahtumat** (2.1.1) lähetetään erissä osoitteeseen
  `telemetry-ingest-prod.steelyard.ca/event?id=prod`, enintään 100 tapahtumaa pyyntöä kohden ja
  enintään 30 sekuntia myöhässä (`MaximumSecondsBeforeTelemetrySent=30`). Kahta kannattaa seurata:
  - `playerdata_load_failed` (`UArchonLoadManager::LoadFailed`, `0x1429ad0f0`). Sen
    `loaders`-taulukko nimeää ne pelaajatietojen lataajat, jotka eivät koskaan valmistuneet. Se on
    nopein tapa löytää puuttuva taustapalvelun päätepiste (endpoint, osoite, johon peli lähettää
    pyynnön).
  - `client_login_failed` nimeää kirjautumisen vaiheen, joka epäonnistui, esimerkiksi
    `LoginToEpicProxy`.
- **Kaatumisraportit.**
  `%LOCALAPPDATA%\Archon\Saved\Crashes\UECC-*\CrashContext.runtime-xml` sisältää kentät
  `<ErrorMessage>` ja `<PCallStack>`. Ota moduulin perusosoite samasta raportista. Staattinen osoite
  on silloin RVA + `0x140000000` (2.1.1).

---

## Jumiutumisen tunnistin {#the-hang-detector}

Kun pelisäie lakkaa lähettämästä sykeviestejä, Unrealin `FThreadHeartBeat` näyttää ikkunan
"Application Hang Detected" ("The application has hung and will now close.") ja sulkee ohjelman.
Tutkimuksen aikana se hävittää todisteet.

Versiossa 2.1.1 `FThreadHeartBeat::InitSettings` (`0x142ec08c0`) lukee moottorin ini-tiedoston
`[Core.System]`-osiosta neljä avainta: `StuckDuration`, `HangDuration`, `PresentHangDuration` ja
`HangsAreFatal`. Ne luetaan uudelleen ajon aikana, joten käyttäjän `Engine.ini` ohittaa ne.
Sisäänrakennettu `HangDuration` on 25 sekuntia, ja valmis `DefaultEngine.ini` nostaa sen 60
sekuntiin molemmissa versioissa. `HangsAreFatal` on oletuksena `True`.

| Valitsin | Missä | Vaikutus (2.1.1) |
|---|---|---|
| `HangsAreFatal=False` | `[Core.System]` käyttäjän `Engine.ini`-tiedostossa | Ei ikkunaa eikä sulkemista (`0x142ec4c8c` hyppää molempien ohi). Tunnistin kirjaa yhä Error-tasolla `"Hang detected on %s (thread hasn't sent a heartbeat for %.2f seconds):"` sekä kyseisen säikeen kutsupinon. **Tätä suosittelemme.** |
| `HangDuration=<seconds>` | sama osio | Raja-arvo. Pidä se 60:ssä, kun `HangsAreFatal=False`. Sen nostaminen vain viivästyttää raporttia. |
| `-nothreadtimeout` | komentorivi | Palaa ennen jumiutumisen käsittelyä (`0x142ec2f99`). Prosessia ei tapeta, mutta et myöskään saa raporttia. `-debughangdetection` kumoaa sen. Se ei ole komentorivin sallittujen listalla, joten se ei ehkä koskaan tavoita tätä koodia (**vahvistamaton**). |
| `-noheartbeatthread` | komentorivi | Löytyy molemmista ohjelmatiedostoista. Annoimme sen yhdessä `-nothreadtimeout`-valitsimen kanssa 2.1.1:n itsenäisissä käynnistyksissä. Emme purkaneet sen vaikutusta, eikä sekään ole sallittujen listalla (**vahvistamaton**). |

Kaksi huomiota lisää:

- Jumiutumisikkuna on estävä (modaalinen) ikkuna. Prosessi pysyy hengissä kaikkine säikeineen,
  kunnes joku sulkee ikkunan. Silloin on oikea hetki ottaa täysi muistivedos (memory dump),
  esimerkiksi Tehtävienhallinnasta (Task Manager) → Luo vedostiedosto (Create dump file).
- Kaikki "loading timeout" -ilmoitukset eivät ole jumiutumisia. `PlayerStartEventTimeout=120.0`
  `Game.ini`-tiedoston osiossa `[/Script/Archon.ArchonPlayerController]` on pelin oma turvaraja
  molemmissa versioissa. Se palauttaa pelaajan valikkoon viestillä
  "Loading timeout while joining the server".

---

## Asetukset: käyttäjän ini-kerros ja URL-osoitteiden lainausmerkit {#configuration-the-user-ini-layer-and-quoting-urls}

- Unreal asettaa kirjoitettavan, käyttäjäkohtaisen asetuskerroksen valmiiden oletusasetusten
  päälle: `%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\{Engine,Game,Input,...}.ini`. Tämä toimii
  molemmissa versioissa. Versiossa 2.1.1 `GameDefaultMap`-ohitus käynnisti asiakkaan suoraan
  Ramsgateen. Versiossa 1.4.4 pelipalvelimemme lukevat päätepisteiden ohituksensa
  `Game.ini`-tiedostosta.
- **Laita jokainen avain oikeaan tiedostoon.** Phoenixin päätepisteet (`[OnlineSubsystemPhoenix]`)
  ovat `DefaultGame.ini`-tiedostossa, joten niiden ohitukset kuuluvat `Game.ini`-tiedostoon. Sama
  osio `Engine.ini`-tiedostossa jätetään huomiotta.
- **Korjaus.** Päättelimme kerran, että irralliset asetustiedostot jätetään huomiotta. Testi oli
  virheellinen kolmella tavalla. Se laittoi Game-avaimia `Engine.ini`-tiedostoon. Se "muutti"
  asetusta, joka oli jo valmiiksi asetettu. Ja se mittasi `LauncherCheck`-tarkistusta, joka ei lue
  asetuksia lainkaan. Sen `-EngineINI=`-muunnelma luultavasti myös poistui komentorivin sallittujen
  listan suodattimessa, ennen kuin moottori näki sen.
- **Laita jokainen URL lainausmerkkeihin.** Versiossa 2.1.1 kirjoitimme 163 päätepisteen
  URL-osoitetta ilman lainausmerkkejä käyttäjän `Engine.ini`-tiedostoon. Peli luki tiedoston ja
  kirjoitti sen takaisin niin, että jokainen arvo oli katkaistu muotoon `https:`. Moottorin
  ini-jäsennin pudottaa lainaamattomasta arvosta kaiken `//`-merkeistä eteenpäin. Valmiit asetukset
  laittavat kaikki URL-osoitteensa lainausmerkkeihin, ja niin teemme mekin:

```ini
; in the user Game.ini
[OnlineSubsystemPhoenix]
; wrong: comes back as AuthEndpoint=https:
AuthEndpoint=https://auth-prod.steelyard.ca/game/login
; right
AuthEndpoint="http://127.0.0.1:61000/game/login"
```

- Peli kirjoittaa käyttäjän ini-tiedostot itse uudelleen. Ota niistä varmuuskopio ennen kuin
  muokkaat niitä. Virheellinen `GameDefaultMap` estää peliä käynnistymästä lainkaan.
