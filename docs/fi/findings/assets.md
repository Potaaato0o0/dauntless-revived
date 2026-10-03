---
title: Pelin sisältö ja asetukset
parent: Löydökset
grand_parent: Dauntless Revived suomeksi
nav_order: 2
lang: fi
ref: findings/assets
locale: fi_FI
description: "Miten Dauntlessin versiot 2.1.1 ja 1.4.4 tallentavat sisältönsä ja asetuksensa, miten niitä luetaan ja mitä käyttäjän asetustiedostolla voi muuttaa."
---

{% assign ci_page = site.pages | where: "path", "fi/findings/client-internals.md" | first %}
{% assign mp_page = site.pages | where: "path", "fi/findings/multiplayer.md" | first %}
{% assign verify_page = site.pages | where: "path", "fi/findings/verification.md" | first %}
{% assign contract_page = site.pages | where: "path", "fi/findings/backend-contract.md" | first %}

# Pelin sisältö ja asetukset
{: .no_toc }

Tällä sivulla kerrotaan, miten tutkimamme kaksi Dauntless-versiota tallentavat sisältönsä (kartat,
äänet, kuvat ja muut pelin osat), missä paketoidut asetukset ovat (pelin mukana toimitetut, valmiiksi
käsitellyt asetustiedostot), miten niitä luetaan ilman pelin omia työkaluja, mitkä karttapolut ovat
tärkeitä ja mitä käyttäjän oma asetustiedosto voi ohittaa. Emme koskaan muuta pelin mukana tulleita
tiedostoja. Kaikki tässä kuvattu on joko luettu noista tiedostoista tai tehty käyttäjäkohtaisen
asetuskansion kautta tai niiden viereen sijoitetulla irrallisella tiedostolla (kuten alempana
kuvatulla CA-kokoelmalla).

Tällä sivustolla ja lähdekoodissa ei ole pelitiedostoja, ja tällä sivulla toistetaan vain lyhyitä otteita, joita jonkin asian
selittäminen vaatii. Kummankin version paketoiduissa asetuksissa on tunnistetietoja, joita ei olisi
koskaan pitänyt julkaista. Katso [Salaisuudet paketoiduissa asetuksissa](#secrets-in-the-cooked-config).

<details open markdown="block">
  <summary>Sisällys</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Versiot yhdellä silmäyksellä {#the-two-builds-at-a-glance}

| | **2.1.1** (joulukuu 2024, viimeinen) | **1.4.4** (lokakuu 2020) |
|:--|:--|:--|
| Pelimoottori | Unreal Engine 5 | Unreal Engine 4 |
| Pakettien tallennus | IoStore: `.utoc`- ja `.ucas`-parit, kunkin vieressä `.pak` (paitsi `global`) | Pelkät perinteiset `.pak`-tiedostot |
| Pak-versio | 11 (polkutiiviste- ja täysi hakemistoindeksi) | 9 (vanhanmallinen indeksi) |
| Indeksin salaus | Ei ole | Ei ole |
| Pakkaus | Oodle (tutkimamme asetuslohkot ovat Kraken-muotoa), linkitetty staattisesti exe-tiedostoon | zlib (85/86 pak-tiedostoa) |
| Säiliöt kansiossa `Archon/Content/Paks` | 157 `.utoc`/`.ucas`-paria: 156 säiliötä sekä `global`. 156 `.pak`-tiedostosta 141 on 339 tavun tynkiä | 86 `.pak`-tiedostoa, 112 396 merkintää |
| Paketoidut asetukset | `Archon_50-WindowsClient.pak` (90 KB, 30 `.ini`-tiedostoa) | `Archon_35-WindowsClient.pak` |
| CA-kokoelma | `Archon_0-WindowsClient.pak` → `Archon/Content/Certificates/cacert.pem` | `Archon_0-WindowsClient.pak` → `Archon/Content/Certificates/cacert.pem` |
| Kartat | IoStore-säiliöt `Archon_Maps_0..2` | Pak-tiedostot `Archon_Maps_0..2` |

Molemmat versiot nimeävät säiliönsä (isot tiedostot, joihin pelin sisältö on pakattu) samalla
tavalla: `Archon_N`, sitten `Archon_Architecture_N`, `Archon_ArmourA/B/C_N`, `Archon_Atmospheres`,
`Archon_Audio_N`, `Archon_Effects_N`, `Archon_Engine`, `Archon_Intl`, `Archon_Landscape`,
`Archon_Maps_N`, `Archon_NPCs_N`, `Archon_Player_N`, `Archon_Rock_N`, `Archon_UI_N` ja `Archon_Water`.
2.1.1 lisää säiliön `Archon_MoviesHP`. Liitoskohdat (mount points) ovat suhteessa asennuksen
juurikansioon ja vaihtelevat säiliöittäin (esimerkiksi `../../../Archon/` version 2.1.1
asetuspakkauksessa tai `../../../Archon/Content/Maps/` karttasäiliössä), mutta sääntö on kaikkialla
sama: pelimoottorin pakettipolku `/Game/X` on säiliön sisällä tiedosto `Archon/Content/X`.

---

## 2.1.1: pak v11 ja IoStore

### Useimmat `.pak`-tiedostot ovat tyhjiä tynkiä {#most-pak-files-are-empty-stubs}

Versiossa 2.1.1 paketoidut pelipaketit (`.uasset`, `.umap` ja niin edelleen) ovat
IoStore-säiliöissä: `.utoc`-sisällysluettelossa ja `.ucas`-datatiedostossa. Jokaisen säiliön
vieressä on myös `.pak`. Kansion `Archon/Content/Paks` 156 säiliöstä 141:n kohdalla tuo `.pak` on
**339 tavun tynkä**: kelvollinen pak v11 -alatunniste (221 tavua), pieni indeksi eikä lainkaan
tiedostodataa. Työkalut, jotka lukevat vain `.pak`-tiedostoja, eivät siksi näe kartoista mitään.
Ramsgaten paketit ovat tiedostossa `Archon_Maps_2-WindowsClient.ucas` (71 MB), eivät sen vieressä
olevassa 339 tavun `.pak`-tiedostossa.

Loput 15 pak-tiedostoa sisältävät tiedostoja, jotka eivät ole Unreal-paketteja ja joita IoStore ei
siksi tallenna:

| Pak | Sisältö |
|:----|:---------|
| `Archon_Audio_0..4` | Wwise-äänipankit ja -media: yhteensä 864 `.bnk`- ja 10 123 `.wem`-tiedostoa, noin 1,2 GB |
| `Archon_21`, `22`, `24`, `25`, `46` | `.mp4`-videot: alkuelokuva useana resoluutiona sekä aseiden esittely- ja kykyvideot. Tallennettu pakkaamattomina |
| `Archon_Intl_0` | ICU-data ja lokalisointi (`.res`, `.locres`, `.ufont`) |
| `Archon_Engine_0` | Pelimoottorin Slate-kuvat, lisäosien kuvaukset, moottorin `.ini`-tiedostot |
| `Archon_0` | `Archon.uproject`, lisäosien kuvaukset, Oodle-sanakirjat, CA-kokoelma `cacert.pem` |
| `Archon_44` | Varjostinputkien välimuisti (`.upipelinecache`) |
| `Archon_50` | 30 paketoitua `.ini`-tiedostoa |

**Korjaus:** yhdessä välivaiheen muistiinpanoistamme väitettiin, että jokainen `Archon_N`-pak paitsi
`Archon_0` olisi tynkä. Se oli väärin. Viisitoista ei ole, ja `Archon_50` on koko asennuksen
hyödyllisin tiedosto.

### Säiliöiden liput {#container-flags}

Kaikki 157 `.utoc`-tiedostoa ovat TOC-versiota 5. Yksikään säiliö ei ole salattu tai allekirjoitettu.
152:lla on liput `0x9` (pakattu ja indeksoitu), neljällä `0x8` (indeksoitu, tallennettu
pakkaamattomana; nämä ovat neljä äänisäiliöistä) ja yhdellä, `global.utoc`, `0x0`. Pelin oma loki
vahvistaa, ettei mitään ole allekirjoitettu: käynnistyessään se tulostaa jokaisesta säiliöstä rivin
`LogIoDispatcher: Display: Toc signature hash: 0000…`.

### IoStoren hakemistoindeksin lukeminen {#reading-the-iostore-directory-index}

`.utoc` alkaa tunnistetavuilla `-==--==--==--==-` ja versiotavulla. Siinä ei ole paloille omia
tiedostonimiä, mutta indeksoiduissa säiliöissä on **hakemistoindeksi**, joka yhdistää polut
TOC-merkintöihin. Kirjoitimme sen läpikäymiseen työkalun `utocdir.py`. Näille TOC v5 -tiedostoille
toimiva rakenne:

1. **Otsake.** Siirtymästä 20 alkaen tulee yhdeksän `uint32`-kenttää: otsakkeen koko, merkintöjen
   määrä, pakattujen lohkojen määrä, pakatun lohkon merkinnän koko, pakkausmenetelmien määrä,
   menetelmän nimen pituus, pakkauslohkon koko, hakemistoindeksin koko ja osioiden määrä. Lipputavu
   on siirtymässä 80.
2. **Ohita kiinteät taulukot**, jotka tulevat otsakkeen jälkeen: palojen tunnisteet (12 tavua
   merkintää kohden), siirtymä ja pituus (10 tavua merkintää kohden), täydellisen tiivistyksen
   siemenet ja sitten luettelo paloista, joilla ei ole täydellistä tiivistettä. Sen jälkeen tulevat
   pakattujen lohkojen merkinnät ja pakkausmenetelmien nimet. Lisäksi on allekirjoituslohko, mutta
   vain, jos Signed-lippu `0x04` on asetettu.
3. **Hakemistoindeksi** tulee seuraavaksi, ja sen pituus on `dir_index_size` tavua. Siinä on:
   - liitoskohdan `FString`;
   - hakemistomerkintöjä, kussakin neljä `uint32`-arvoa: nimi, ensimmäinen lapsi, seuraava sisarus,
     ensimmäinen tiedosto;
   - tiedostomerkintöjä, kussakin kolme `uint32`-arvoa: nimi, seuraava tiedosto, TOC-merkinnän
     indeksi;
   - merkkijonotaulukko.

   `0xFFFFFFFF` tarkoittaa "ei mitään". Kulje hakemistosta 0 alkaen ja yhdistä nimiä sitä mukaa.

```python
def walk(di, prefix):
    while di != NONE:
        name, child, sibling, first_file = dirs[di]
        here = prefix if name == NONE else f"{prefix}{strings[name]}/"
        fi = first_file
        while fi != NONE:
            fname, next_file, toc_index = files[fi]
            out.append(here + strings[fname])
            fi = next_file
        if child != NONE:
            walk(child, here)
        di = sibling
```

Näin selvitimme Ramsgaten tarkan pakettipolun ja sen säiliön, jossa se on. Ohjelmatiedoston
merkkijonoissa polkua ei ole, eivätkä tynkä-`.pak`-tiedostojen indeksit luettele sitä. (Paketoidut
asetukset kyllä nimeävät sen avaimella `ServerDefaultMap`, minkä huomasimme vasta myöhemmin.)

Tiedoston irrottamiseen säiliöstä käytämme toista työkalua, `iox.py`. Kaksi kenttärakennetta on siinä
tärkeitä. Jokainen 10 tavun **siirtymä ja pituus** -merkintä on kaksi 5-tavuista **big-endian**-lukua.
Jokainen 12 tavun **pakatun lohkon merkintä** on little-endian: 5 tavun siirtymä, 3 tavun pakattu
koko, 3 tavun pakkaamaton koko ja 1 tavun pakkausmenetelmän indeksi.

### Oodle ilman Oodle-DLL:ää {#oodle-without-an-oodle-dll}

2.1.1 pakkaa pak-tiedostonsa ja säiliönsä Oodlella (jokainen tutkimamme asetuslohko on
Kraken-muotoa), eikä **pelin mukana tule yhtään `oo2core_*.dll`-tiedostoa**: Oodle on linkitetty
staattisesti tiedostoon `Dauntless-Win64-Shipping.exe`. Tavalliset pak-työkalut (repak, FModel,
ZenTools, UnrealPak) odottavat erillistä Oodle-DLL:ää (ohjelmakirjastoa), joten ne eivät avaa näitä tiedostoja, ellei
sellaista löydä muualta. Me emme löytäneet.

Sen sijaan käänsimme [`powzix/ooz`](https://github.com/powzix/ooz)-ohjelman, avoimen lähdekoodin
Kraken-purkajan, Linuxin jaetuksi kirjastoksi ja kutsumme sitä Pythonista `ctypes`-moduulin kautta:

- Poista ohjelman `main()` ja se osa, joka lataa tiedoston `oo2core_7_win64.dll`.
- Lisää pieni `stdafx.h`-välikerros. Se muuntaa MSVC:n sisäänrakennetut funktiot (`_BitScanReverse`,
  `_BitScanForward`, `_rotl`, `_byteswap_*`, `__forceinline`) GCC:n ja SSE:n vastineiksi.
- Käännä komennolla `g++ -O2 -fPIC -msse4.1 -shared ... -o libooz.so`.

`DefaultEngine.ini`-tiedoston pakattu sisältö on yksi ainoa Kraken-lohko. Se alkaa tavuilla `8C 06`.

### Huomioita pak v11 -indeksistä {#pak-v11-index-notes}

`Archon_50-WindowsClient.pak` on tavallinen pak v11. Siinä on 221 tavun alatunniste: salauksen GUID,
salatun indeksin lippu, tunnistetavut `0x5A6F12E1`, versio, indeksin siirtymä ja koko, indeksin SHA-1
sekä viisi 32 tavun pakkausmenetelmän nimeä (`Oodle`, sitten tyhjiä). Indeksi on salaamaton, ja siinä
on polkutiivisteindeksi, täysi hakemistoindeksi ja möhkäle bittitasolla pakattuja "koodattuja"
merkintöjä.

Yksi yksityiskohta turmelee käsin kirjoitetun purkajan huomaamatta. Koodatun merkinnän lippusanan
alimmat kuusi bittiä kertovat pakkauslohkon koon 2 KiB:n yksikköinä. Kun kaikki kuusi bittiä ovat
päällä (`0x3F`), todellinen lohkokoko tulee `uint32`-arvona **heti lippusanan jälkeen**, ennen
siirtymäkenttää. Jos luet kentät siinä järjestyksessä, jota muu rakenne antaa odottaa, saat
siirtymän, joka osoittaa tiedoston lopun yli, ja koot menevät ristiin. Tiedostolle
`DefaultDeviceProfiles.ini` käy juuri näin: siinä on kaksi Oodle-lohkoa, joiden lohkokoko on 1 MiB.

`ooz`-purkajalla ja tällä kenttäjärjestyksellä kaikki 30 asetustiedostoa tulivat ulos ehjinä: kunkin
koko vastaa sen merkinnässä ilmoitettua pakkaamatonta kokoa, eikä yhdessäkään ole tulostumattomia
tavuja.

---

## 1.4.4: pak v9 ja zlib

1.4.4 on IoStorea vanhempi. Kaikki on 86 perinteisessä pak-tiedostossa:

- Kaikki 86 ovat **pak-versiota 9**, ja niissä on vanhanmallinen (ei "jäädytetty") **salaamaton**
  indeksi.
- 85 käyttää **zlib**-pakkausta. Yksi ei ilmoita pakkausmenetelmää lainkaan.
- Merkintöjä on yhteensä 112 396, enimmäkseen `.uasset`/`.uexp`/`.ubulk`. Loppuihin kuuluu 11 301
  `.wem`- ja 898 `.bnk`-äänitiedostoa, 225 `.umap`-karttaa, 135 `.mp4`-videota ja 62 `.ini`-tiedostoa.

Luemme niitä työkalulla `pak9.py` (`list`, `find`, `get`). Vanhanmallinen indeksi on liitoskohdan
`FString`, merkintöjen määrä ja sitten jokaisesta merkinnästä tiedostonimi ja `FPakEntry`:

- siirtymä, koko ja pakkaamaton koko (kolme `int64`-arvoa);
- pakkausmenetelmän indeksi (`uint32`);
- SHA-1 (20 tavua);
- pakatuilla tiedostoilla lohkojen määrä ja `(start, end)`-parit;
- lipputavu ja pakkauslohkon koko (`uint32`).

Sama merkintä toistuu tiedostodatan edessä sisäisenä otsakkeena. Version 9 pak-tiedoston alatunniste
lisää indeksin tiivisteen perään "jäädytetty indeksi" -tavun. Se oli 0 jokaisessa version 1.4.4
pak-tiedostossa.

Paketoidut asetukset ovat tiedostossa **`Archon_35-WindowsClient.pak`**: `DefaultEngine.ini`
(71 981 tavua) ja `DefaultGame.ini` (50 377 tavua), molemmat zlib-pakattuja. Tekijänoikeusrivillä
lukee 2020, kuten tälle versiolle kuuluukin.

---

## Mitä paketoidut asetukset sisältävät {#what-the-cooked-config-contains}

Version 2.1.1 asetuspakkauksessa on 30 tiedostoa. Tärkeimmät ovat `DefaultEngine.ini` (81 338 tavua),
`DefaultGame.ini` (69 668 tavua), `DefaultInput.ini`, `DefaultGameplayTags.ini`,
`DefaultScalability.ini` ja `DefaultDeviceProfiles.ini` (1,17 MB). Alusta- ja kokoonpanokerrokset
ovat kansioissa `Windows/`, `WindowsClient/`, `Win64/`, `Shipping/` ja niin edelleen.
**`BinaryConfig.ini`-tiedostoa ei ole missään** (paketoidut paketointiasetukset sanovat
`bMakeBinaryConfig=False`). Ohjelmatiedostossa on sellaisen lataaja
(`{PROJECT}Config/BinaryConfig.ini`), joten jos binäärimuotoiset asetukset olisi toimitettu, ini-kerrokset
olisi ohitettu. Koska niitä ei toimitettu, tavallinen ini-hierarkia käydään läpi käynnistyksessä, ja
siksi käyttäjän omat ohitukset ylipäätään toimivat.

### `[OnlineSubsystemPhoenix]`: taustapalvelun päätepistetaulukko {#onlinesubsystemphoenix-the-backend-endpoint-table}

Tärkein osio on `[OnlineSubsystemPhoenix]` tiedostossa **`DefaultGame.ini`**, ei `DefaultEngine.ini`.
Se on asiakasohjelman (pelaajan koneella toimivan peliohjelman) taulukko Phoenixin taustapalvelun
osoitteista. Taustapalvelu tarkoittaa pelin verkkopalveluja, jotka toimivat yhtiön palvelimilla.

| | 2.1.1 | 1.4.4 |
|:--|:--|:--|
| Sijainti | `DefaultGame.ini` rivit 236–441 | `DefaultGame.ini` rivit 254–426 |
| Avaimet | 203, joista 199 on osoitteita (URL) | 171, joista 167 on osoitteita (URL) |

Neljä avainta, jotka eivät ole osoitteita, ovat samat kummassakin versiossa: HTTP-uudelleenyritysten
määrä ja aikakatkaisu sekä kaksi telemetrian niputusrajaa.

Arvot ovat osoitepohjia (URL-malleja). Julkaistu asiakasohjelma täyttää kohdan `{environment}` arvolla
`prod`, minkä näimme version 2.1.1 todellisessa liikenteessä. Muut paikkamerkit se täyttää pyyntöä
tehdessään:

```ini
[OnlineSubsystemPhoenix]
AuthEndpoint = "https://auth-{environment}.steelyard.ca/game/login"
CharacterEndpoint = "https://dauntless-{environment}.steelyard.ca/character"
GetActiveLoadoutEndpoint = "https://loadout-{environment}.steelyard.ca/loadout/{account_id}/{character_id}"
QueryLoginQueueEndpoint = "https://login-queue-{environment}.steelyard.ca/login"
MatchmakingEndpoint = "https://mm2-{environment}.steelyard.ca"
```

Palvelinnimet noudattavat kaavaa `<service>-{environment}.steelyard.ca`. Kummassakin versiossa
palvelut ovat `auth`, `gamesession`, `login-queue`, `dauntless`, `loadout`, `progression`, `mm2`,
`presence`, `social`, `guild`, `mailbox`, `store`, `subscription`, `leaderboards`, `motd`, `cohort`,
`breadcrumbs`, `tracking`, `telemetry-ingest` ja `profanity-filter`. 2.1.1 lisää palvelut `gauntlet`
ja `migration`. Muutama avain osoittaa muualle: `cdn.playdauntless.com`, `store.playdauntless.com`,
`steelyard.online`, `game-tools.1e100.steelyard.ca`, Phoenixin sisäinen testikaupan palvelin sekä
[alempana](#secrets-in-the-cooked-config) kuvattu Slack-webhook.

Kun versioita verrataan avain avaimelta, niillä on 170 yhteistä avainta, ja **niistä 167:n arvot ovat
tavulleen samat**. Kolme eroavaa liittyvät äänichattiin. 1.4.4 liittyy Vivox-kanaville
(`mm2/vivox/join/...` sekä `VoiceChatLoginEndpoint`, ainoa avain, joka on vain versiossa 1.4.4). 2.1.1
käyttää Epicin äänipalvelua (`mm2/evoice/join/...`). Ne 33 avainta, jotka ovat vain versiossa 2.1.1,
kattavat vuoden 2020 jälkeen lisättyjä ominaisuuksia, kuten Gauntletin, faktiot, aarrearkut (loot
boxes), Steam-kaupan ostot, Trials-tulostaulukot, tilin siirron, päivitysmuistiinpanot ja
porttikieltotarkistuksen.

Nämä päätepisteet (verkko-osoitteet, joihin peli lähettää pyyntönsä) osoittavat, että taustapalvelu on
Phoenixin oma, räätälöity REST-rajapinta. Se ei ole PlayFab, vaikka jotkin yhteisön muistiinpanot
niin väittivät. Sivu [Taustapalvelun rajapinta]({{ contract_page.url | relative_url }}) käsittelee
vastausten muotoja.

### Muita hyödyllisiä osioita {#other-sections-worth-knowing}

- `[OnlineSubsystem] DefaultPlatformService=Phoenix` löytyy kummankin version
  `DefaultEngine.ini`-tiedostosta. Phoenixin oma alijärjestelmä on ensisijainen.
- **2.1.1**:ssä on lohko `[/Script/OnlineSubsystemEOS.EOSSettings]`. Siinä
  `bShouldEnforceBeingLaunchedByEGS` on jo valmiiksi `False` ja `bUseEAS=True`.
- **1.4.4**:ssä ei ole EOS-osiota lainkaan. Se käyttää sen sijaan Epicin vanhempia
  `OnlineSubsystemMcp`-palveluja, joiden avaimet `Domain`, `RedirectUrl` ja `Protocol` Undauntedin DLL
  kirjoittaa uudelleen ajon aikana.
- `[/Script/EngineSettings.GameMapsSettings]` tiedostossa `DefaultEngine.ini` on sama kummassakin
  versiossa:

  ```ini
  GameInstanceClass=/Game/Blueprints/MyGameInstance.MyGameInstance_C
  GameDefaultMap=/Game/Maps/Map_LoginMenu
  ServerDefaultMap=/Game/Maps/ramsgate/ramsgate_01_persistent
  GlobalDefaultGameMode=/Game/Blueprints/BPGM_Archon_Prototype.BPGM_Archon_Prototype_C
  ```

- `DefaultLoadout=` tiedostossa `DefaultGame.ini` (2.1.1 rivi 172, 1.4.4 rivi 181) nimeää harjoitusaseen
  `WP_EB_TRAINING` ja lyhdyn `LT_BASIC`. Kun käynnistimme version 2.1.1 suoraan kaupunkiin,
  ilmestymistarkistus odotti asetta ja lyhtyä. Asiakasohjelman oma aloituslahja ei sisällä näitä
  kahta, luultavasti koska julkaistussa pelissä ne annettiin opetusosiossa, jonka ohitimme.
  Palvelimemme piti antaa ne.
- AFK-aikakatkaisut (kuinka kauan pelaaja saa olla toimettomana) ovat samat kummassakin versiossa:
  600 s kaupungissa (`ArchonGameMode_City`), 180 s metsästyssaarilla (`ArchonGameMode_Island`) ja `0`
  opetusosion pelitilassa (`BPGM_ArchonIslandTutorial`).
- `[RamsgateRework] CityMap=...ramsgate_01_persistent` näyttää editorin tai testauksen asetukselta
  (varmistamaton). Se on osioiden `[CombatDemo]` ja `[PS5AudioTestMap]` vieressä, joissa on sama
  `CityMap`-avain, heti asetuksen `bReturnToRamsgateEnabledInEditor` jälkeen, ja `Shipping/UserGame.ini`
  tyhjentää `[CombatDemo]`-osion `CityMap`-arvon. Version 2.1.1 ohjelmatiedostosta löysimme
  merkkijonoon `RamsgateRework` vain yhden viittauksen, ja se kuuluu ominaisuusluokkaan
  (`URamsgateReworkFeature`) eikä koodiin, joka lukisi tätä osiota.

### Salaisuudet paketoiduissa asetuksissa {#secrets-in-the-cooked-config}

Phoenix toimitti tunnistetietoja selväkielisinä paketoiduissa asetuksissa. Emme ole käyttäneet
niistä yhtäkään, eikä niitä toisteta tällä sivustolla.

- **Molemmat versiot:** `PhoenixEventsMessageEndpoint` osiossa `[OnlineSubsystemPhoenix]` osoittaa
  palveluun `hooks.slack.com`. Mukana oli toimiva Slack-webhook-osoite. Sitä ei toisteta tässä.
- **2.1.1:** EOS-asetuksissa ovat Epic Online Services -palvelun asiakastunnukset ja salausavain.
  Niitä ei toisteta tässä.

Jos purat asetukset itse, pidä nämä arvot poissa kaikesta, mitä julkaiset.

---

## Tärkeät karttapolut {#key-map-paths}

Unrealin pakettipolut: `/Game/` vastaa säiliöiden sisällä polkua `Archon/Content/`. Jotkin kohdat,
kuten Undauntedin metsästystaulukko ja `CityMap`, käyttävät objektipolkumuotoa `path.name`,
esimerkiksi `/Game/Maps/islands/1702/cora_jamima.cora_jamima`.

| Kartta | Pakettipolku | 2.1.1-säiliö | 1.4.4-säiliö | Huomioita |
|:----|:-------------|:----------------|:----------------|:------|
| Kirjautumisvalikko | `/Game/Maps/Map_LoginMenu` | `Archon_Maps_2` | `Archon_Maps_2` | `GameDefaultMap`. Kirjautuminen ja hahmon valinta tapahtuvat tämän kartan sisällä |
| Ramsgate | `/Game/Maps/ramsgate/ramsgate_01_persistent` | `Archon_Maps_2` | `Archon_Maps_2` | Pysyvä taso. Muut `ramsgate_01_*`-kartat (basaari, satama, pubi, valmistusalue, NPC:t, näköalat…) ovat virtaavia alitasoja, jotka ladataan tarpeen mukaan |
| Version 1.4.4 opetussaari | `/Game/Maps/islands/1705/dia_moss_triforce` | `Archon_Maps_0` | `Archon_Maps_0` | Meidän 1.4.4-palvelimellamme uudet hahmot ohjataan tänne opetusosion Gnasherin `/Game/Monsters/mcrollin/mcbeaver_tutorial_bp` kanssa |
| Harjoitusdojo (Training Dojo) | `/Game/Maps/islands/dojo/training_dojo_persistent` | `Archon_Maps_2` | `Archon_Maps_1` | Haaramme käynnistää sen tarvittaessa |
| Trials-areena | `/Game/Maps/islands/arenas/arena_ramsgate_00` | `Archon_Maps_2` | `Archon_Maps_1` | Undaunted käyttää sitä Trials-haasteisiin |
| Metsästyssaaret | `/Game/Maps/islands/<nnnn>/<name>` | | | Esimerkiksi `1705/dia_snow_big`, `1803/frida_moss_falls`, `1806/gaia_moss_cave`. Undauntedin metsästystaulukko luettelee ne, joita se käyttää |

Molemmissa versioissa on myös `/Game/Maps/tutorial/`-karttaperhe (`island_tutorial_00_*`,
`city_00_art_tutorial_vista`), jota 1.4.4-palvelimemme ei käytä. 2.1.1 lisää kartan
`/Game/Maps/islands/adventure/Moss_Triforce/adventure_moss_triforce_tutorial`, jota versiossa 1.4.4 ei
ole. **Emme ole varmistaneet**, mitä karttaa version 2.1.1 opetusosio todella käyttää.

Paketoiduissa asetuksissa on pelitilaosiot seuraaville: `/Game/Blueprints/GameMode/BPGM_City.BPGM_City_C`
(kaupunki; käytimme sitä version 2.1.1 kaupunkikäynnistyksessä), `BPGM_ArchonIslandTutorial`,
`BPGM_ArchonIslandArena` ja `BPGM_ArchonEscalation`.

---

## Käyttäjän asetuskansio {#the-user-config-folder}

Unreal asettaa paketoitujen oletusasetusten päälle kirjoitettavan, käyttäjäkohtaisen
asetuskerroksen. Dauntlessissa kumpikin versio käyttää samaa kansiota:

```text
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\
    Engine.ini   Game.ini   Input.ini   RuntimeOptions.ini   GameUserSettings.ini   (and others)
```

Tähän asetettu avain ohittaa paketoidun arvon. Meidän 2.1.1-koneellamme `Game.ini`, `Input.ini` ja
`RuntimeOptions.ini` olivat pelin ensimmäisten käynnistysten jälkeen kahden tavun tyhjiä tiedostoja,
vapaasti käytettävissä. Peli kirjoittaa `GameUserSettings.ini`-tiedoston asetusvalikostaan.

### Kantapään kautta opitut säännöt {#rules-we-learned-the-hard-way}

- **Molemmat versiot jakavat tämän kansion.** Koska projektin nimi on kummassakin `Archon`, 1.4.4 ja
  2.1.1 lukevat samoja tiedostoja. Jäljelle jääneet version 2.1.1 ohitukset (`GameDefaultMap`,
  `LocalMapOptions`, `[OnlineSubsystemPhoenix]`) ohittaisivat version 1.4.4 kirjautumisen tai ohjaisivat
  sen muualle, joten ennen ensimmäistä 1.4.4-käynnistystä siirsimme version 2.1.1 asetukset sivuun
  nimellä `WindowsClient.211` (sekatilaa emme testanneet). Kaikki saman Windows-tilin prosessit
  lukevat tätä kansiota, myös pyörittämämme 1.4.4-pelipalvelimet.
- **Laita jokainen avain hierarkiaa vastaavaan tiedostoon.** `[OnlineSubsystemPhoenix]` on
  Game-asetus, joten sen ohitukset kuuluvat tiedostoon `Game.ini`. Tiedostossa `Engine.ini` ne jätetään
  huomiotta.
- **Laita jokainen URL lainausmerkkeihin.** Ini-jäsennin pudottaa lainausmerkittömästä arvosta kaiken
  kohdasta `//` eteenpäin. Eräässä varhaisessa kokeilussamme oli 163 lainausmerkitöntä osoitetta
  version 2.1.1 käyttäjän `Engine.ini`-tiedostossa. Kun peli tallensi tiedoston uudelleen, jokainen
  arvo oli katkennut muotoon `https:`. Paketoidut asetukset laittavat kaikki osoitteensa
  lainausmerkkeihin, ja niin teemme mekin.
- **Ota varmuuskopio ennen muokkaamista.** Virheellinen `GameDefaultMap` estää pelin käynnistymisen
  ilmoitukseen "The default map … could not be found. Exiting." Tämä ikkuna tulee aina, kun
  aloituskartan lataaminen epäonnistuu, ei vain silloin, kun kartta puuttuu.
- **Korjaus:** alussa päättelimme, että irralliset ini-tiedostot jätetään huomiotta. Testi oli
  virheellinen. Se laittoi Game-avaimia tiedostoon `Engine.ini`, se "muutti" asetusta
  `bShouldEnforceBeingLaunchedByEGS`, joka oli jo valmiiksi `False`, ja se mittasi
  `LauncherCheck`-tarkistusta, joka lukee vain komentorivivalitsimia kuten `-EpicPortal` eikä
  asetuksia lainkaan. Käyttäjän asetuskerros toimii kummassakin versiossa.

### Mitä sillä voi muuttaa {#what-it-can-change}

| Asetus | Tiedosto | Versio | Vaikutus |
|:--------|:-----|:------|:-------|
| `[SystemSettings]`: `r.Streaming.PoolSize`, `r.Streaming.LimitPoolSizeToVRAM`, `sg.*Quality`, `r.ScreenPercentage`, `r.MipMapLODBias`, `gc.*` | `Engine.ini` | molemmat | Ohittaa asetusvalikon. Versiossa 2.1.1 rajattu muistivaranto ja matalat `sg.*`-arvot pudottivat erillisen kaupunkikäynnistyksen muistinkäytön noin 9 GB:stä 2,8 GB:hen. Versiossa 1.4.4 asiakasohjelman käynnistimemme käyttää samaa osiota päinvastaiseen suuntaan: se pakottaa Cinematic-laadun natiiviresoluutiolla |
| `[Core.System] HangsAreFatal=False`, `HangDuration=600` | `Engine.ini` | 2.1.1 (testattu) | Estää jumittumisen tunnistinta lopettamasta prosessia tutkimuksen aikana. Käytetään yhdessä valitsimien `-nothreadtimeout -noheartbeatthread` kanssa |
| `[/Script/EngineSettings.GameMapsSettings] GameDefaultMap=/Game/Maps/ramsgate/ramsgate_01_persistent` | `Engine.ini` | 2.1.1 | Käynnistää pelin suoraan Ramsgateen. Kaupunki piirtyy näkyviin, mutta `Map_LoginMenu`-kartan sisäinen kirjautuminen ei koskaan käynnisty, joten tiliä ja pelaajan hahmoa (pawn) ei ole |
| `LocalMapOptions=?CharacterId=<id>` | `Engine.ini` | 2.1.1 | Asiakasohjelma lukee tämän: pyynnöissä kulkee sen jälkeen tuo hahmotunniste. Arvoja `?AuthToken=` ja `?AccountId=` se **ei** lue. `?listen` saa käynnistyksen epäonnistumaan |
| `GlobalDefaultGameMode=/Game/blueprints/gamemode/BPGM_City.BPGM_City_C` | `Engine.ini` | 2.1.1 | Pelitila, kun peli käynnistetään suoraan kaupunkiin |
| `[/Script/Archon.ArchonPlayerController] PlayerStartEventTimeout=600.0` | `Game.ini` | 2.1.1 | Pidentää 120 sekunnin varmistusajastinta, joka päättyy ilmoitukseen "You have been signed out" |
| `[OnlineSubsystemPhoenix]` `*Endpoint="http://127.0.0.1:61000/..."` (167 avainta, kaikki lainausmerkeissä) | `Game.ini` | 1.4.4-pelipalvelimet | Ohjaa pelipalvelinprosessimme metagame-palvelimeemme (taustapalvelu, joka korvaa Phoenixin verkkopalvelut). Palvelintilassa Undauntedin DLL ei ohjaa päätepisteitä uudelleen, joten juuri tämä ohitus saa palvelimen taustapalvelukutsut perille metagame-palvelimeen. **Asiakasohjelma** ei tarvitse tästä mitään: DLL koukuttaa funktion `FConfigCacheIni::GetString` ja vaihtaa osoitteet muistissa |

### Mitä sillä ei voi tehdä {#what-it-cannot-do}

- **Avata konsolia versiossa 2.1.1.** `DefaultInput.ini` luettelee yhä `ConsoleKeys`-näppäimet ja lähes
  900 `ManualAutoCompleteList`-huijauskomentomerkintää, mutta konsoli on jätetty pois julkaisuversion
  käännöksestä. `+ConsoleKeys=` tiedostossa `Input.ini` ei tee mitään. Versiossa 1.4.4 Undauntedin
  kanssa DLL luo konsolin itse ja sitoo sen F2-näppäimeen.
- **Saada tavallista asiakasohjelmaa toimimaan isäntänä.** `?listen` epäonnistuu versiossa 2.1.1,
  koska kuuntelun aloituskohta (`UWorld::Listen`) on tässä pelkässä asiakasversiossa korvattu tyhjällä
  tyngällä. Tulkitsimme sen ensin niin, että "moninpeli on mahdoton". **Se oli väärin.** Alla oleva
  verkkokerros on ehjä, ja ohjelmaan ujutettu DLL voi ohjata sitä. Juuri näin Undaunted pyörittää
  1.4.4-pelipalvelimia. Katso [Näin moninpeli toimii]({{ mp_page.url | relative_url }}).
- **Ohittaa `-EpicPortal`-valitsinta versiossa 2.1.1.** `LauncherCheck` lukee vain
  komentorivivalitsimia.
- **Antaa tilille identiteettiä.** Versiossa 2.1.1 identiteetti tulee vain oikeasta kirjautumisesta
  `Map_LoginMenu`-kartassa.

### CA-kokoelma {#the-ca-bundle}

Molemmat versiot pitävät CA-kokoelmaa `cacert.pem` (luetteloa varmentajista, joihin peli luottaa
salatuissa HTTPS-yhteyksissä) `Archon_0`-pakkauksen sisällä. Kun ajoimme versiota 2.1.1 omaa
HTTPS-taustapalveluamme vasten, peli otti käyttöön irrallisen tiedoston
`<game folder>\Engine\Content\Certificates\cacert.pem`, jossa oli oma yksityinen varmentajamme. Pak-tiedosto
jäi siis koskemattomaksi, ja samoin Windowsin varmennevarasto. Versiossa 1.4.4 tätä ei tarvita.
Undauntedin DLL kirjoittaa jokaisen päätepisteen uudelleen tavalliseksi HTTP-osoitteeksi, joka
osoittaa metagame-palvelimeen.

---

## Työkalut {#tools}

Nämä skriptit toimivat Linux (WSL) -tutkimusympäristössämme. Yksikään niistä ei tarvitse Oodle-DLL:ää
tai pelin koodia:

| Työkalu | Versio | Tarkoitus |
|:-----|:------|:--------|
| `libooz.so` | 2.1.1 | `powzix/ooz` käännettynä jaetuksi kirjastoksi pienen MSVC-välikerroksen kanssa |
| `unpak2.py` | 2.1.1 | Lukee ja purkaa pak v11 -tiedostoja (koodatut merkinnät, Oodle-lohkot) |
| `utocdir.py` | 2.1.1 | Tulostaa jokaisen polun `.utoc`-hakemistoindeksistä |
| `iox.py` | 2.1.1 | Irrottaa tiedoston `.utoc`/`.ucas`-parista nimen perusteella |
| `pak9.py` | 1.4.4 | `list`, `find` ja `get` pak v8/v9 -tiedostoille, joissa on vanhanmallinen indeksi (zlib, Oodle tai pakkaamaton) |
| `xref.py` | 2.1.1 | Etsii ohjelmatiedostosta koodiviittaukset merkkijonoon ja purkaa konekielen niiden ympäriltä. Käytimme sitä näillä sivuilla mainittuihin asetusavaimiin ja lokiviesteihin |

Ohjelmatiedoston puolen yksityiskohdat, kuten mitä asetusavaimia koodi oikeasti lukee ja mitä
valitsimia se hyväksyy, ovat sivulla [Asiakasohjelman sisäosat]({{ ci_page.url | relative_url }}).
Se, miten varmistimme näiden tiedostojen aitouden, kerrotaan sivulla
[Pelitiedostojen tarkistaminen]({{ verify_page.url | relative_url }}).
