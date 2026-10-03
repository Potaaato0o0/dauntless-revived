---
title: JSON-rakenteen lukeminen ohjelmatiedostosta
parent: Löydökset
grand_parent: Dauntless Revived suomeksi
nav_order: 4
lang: fi
ref: findings/json-reversing
locale: fi_FI
description: "Miten Dauntless 2.1.1:n koodista selvitettiin palvelinvastausten kenttien nimet, JSON-tyypit ja kuoret, sekä matkan varrella tehdyt virheet ja opetukset."
---

{% assign contract_page = site.pages | where: "path", "fi/findings/backend-contract.md" | first %}
{% assign crashes_page = site.pages | where: "path", "fi/findings/crashes.md" | first %}

# JSON-rakenteen lukeminen ohjelmatiedostosta
{: .no_toc }

Phoenixin palvelimet ovat poissa, eikä kukaan julkaissut niiden rajapintaa (sopimusta siitä, millaisia
viestejä peli ja palvelin lähettävät toisilleen). Ainoa täydellinen tieto siitä, miltä kunkin
vastauksen pitää näyttää, on asiakasohjelman (pelaajan koneella toimivan peliohjelman) koodi, joka
vastauksen lukee. Tällä sivulla kerrotaan, miten saimme tuosta koodista selville kenttien nimet,
JSON-tyypit ja kuoret. JSON on yleinen tekstimuoto, jolla ohjelmat lähettävät tietoa toisilleen, ja
kuori tarkoittaa yhteistä kehystä, jonka sisään varsinainen tieto pakataan. Sivulla kerrotaan myös,
mitä teimme matkan varrella väärin, koska virheet ovat paras perustelu huolellisuudelle. Tulokset ovat
sivulla [Taustapalvelun rajapinta]({{ contract_page.url | relative_url }}).

Kaikki tämä tehtiin **2.1.1**-asiakasohjelmalla: `Dauntless-Win64-Shipping.exe`, 151 MB, UE5, ei
symboleja. Osoitteet ovat staattisia virtuaaliosoitteita, kun ohjelman kantaosoite (image base) on
`0x140000000`. Menetelmä toimii myös versiolle **1.4.4** (UE 4.25), mutta sen osoitteet ovat erilaiset,
emmekä ole vielä toistaneet työtä siellä.

<details open markdown="block">
  <summary>Sisällys</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Miksi oikotietä ei ole {#why-there-is-no-shortcut}

- **Ei symboleja, ei PDB-tiedostoa** (symbolit ovat ohjelman sisäisiä nimiä, jotka yleensä poistetaan
  julkaistusta versiosta). Funktioiden nimiä on vain siellä, missä peli itse kirjoitti ne
  lokimerkkijonoihin, sekä Unrealin reflektiotiedoissa (pelimoottorin omassa luettelossa luokista ja
  niiden kentistä) olevat luokkien ja ominaisuuksien nimet.
- **Vastausrakenteita ei ole reflektoitu.** Sikäli kuin olemme nähneet, Phoenixin rakenteet eivät ole
  UStruct-rakenteita, jotka `FJsonObjectConverter` täyttäisi. Ne ovat käsin kirjoitettuja
  `FJsonSerializable`-luokkia. Kentän nimi on olemassa vain merkkijonovakiona, joka annetaan
  sarjallistajakutsulle (sarjallistaja on koodi, joka muuttaa tiedon JSON-tekstiksi ja takaisin)
  rakenteen `Serialize`-funktion sisällä. Pelin reflektoitujen tyyppien
  SDK-vedos ei luettele niitä.
- **Väärät vastaukset tuottavat harvoin virheitä.** Väärä muoto yleensä jäsentyy "onnistuneesti" ja
  jättää kentät oletusarvoihin tai roskaan. Oikeaa muotoa ei löydä kokeilemalla ja odottamalla
  virheilmoitusta.

Siksi luimme jäsentimet (koodin, joka muuttaa JSON-tekstin ohjelman omiksi tietorakenteiksi) suoraan.

---

## Työkalut {#tools}

Kaikki tämä on pieniä Python-skriptejä, jotka käyttävät kirjastoja `pefile` ja `capstone` ja joita
ajetaan asennuksen vain luku -kopiota vasten.

| Työkalu | Mitä se tekee |
|---|---|
| Merkkijonojen ristiviittaus (string xref) | Etsii merkkijonon sekä ASCII- että UTF-16LE-muodossa, luettelee jokaisen siihen osoittavan `lea reg, [rip+disp]` -käskyn ja kulkee taaksepäin `int3`-täytteeseen asti löytääkseen ympäröivän funktion. |
| Selitetty disassembly | Purkaa konekielen annetusta osoitteesta alkaen ja tulostaa merkkijonon, johon kukin `lea` osoittaa. Näin `Serialize`-funktiosta tulee luettava. |
| Serialize-kulkija | Pariuttaa jokaisen kentän nimen `lea`-käskyn seuraavaan `call [rax+slot]` -kutsuun ja tulostaa `(name, slot)`-rivejä. |
| Vtable-vedostimet, kutsujahakemisto | Tulostavat vtable-paikat; indeksoivat jokaisen `E8`/`E9` rel32 -kutsun, jotta voi vastata kysymykseen "kuka kutsuu tätä". |
| `utocdir.py` | Jäsentää UE5:n IoStore-muotoisen `.utoc`-hakemistoindeksin. Versiossa 2.1.1 156 `.pak`-tiedostosta 141 on 339 tavun tynkiä, ja paketoitu sisältö on `.ucas`/`.utoc`-tiedostoissa; loput 15 sisältävät irrallisia tiedostoja, muun muassa asetukset. |
| `pak9.py` | Luettelee, etsii ja purkaa tiedostoja version 1.4.4 pak v9 -muodosta (zlib, Oodle tai pakkaamaton). |
| Pyyntöjen tallennin | Tutkimuspalvelimemme tallensi jokaisen vastaanottamansa pyynnön: palvelinnimen, metodin, polun, kyselyn, otsakkeet, rungon ja sen, mikä käsittelijä vastasi. |

**Kaatumisvedokset ovat toinen lähde.** Kaatunut asiakasohjelma jättää jälkeensä tiedoston
`%LOCALAPPDATA%\Archon\Saved\Crashes\UECC-*\CrashContext.runtime-xml`, jossa on `<ErrorMessage>` ja
absoluuttisten osoitteiden `<PCallStack>`. Vähennä vedoksessa mainittu moduulin kantaosoite ja lisää
`0x140000000`, niin saat staattiset osoitteet, joita voi purkaa luettavaksi.

Jotta jumiin jäänyt asiakasohjelma pysyisi hengissä tarpeeksi kauan tutkittavaksi, kytkimme Unrealin
jumittumisen tunnistimen pois (`[Core.System] HangsAreFatal=False`, pitkä `HangDuration` sekä
`-nothreadtimeout -noheartbeatthread`). Nostimme myös arvoa `PlayerStartEventTimeout`, jotta pelin oma
120 sekunnin varmistusajastin ei peittäisi todellista syytä.

---

## Vaihe 1: päätepisteen avaimesta käsittelijään {#step-1-from-endpoint-key-to-handler}

Asiakasohjelma löytää jokaisen osoitteen hakemalla ajon aikana sen **asetusavaimen nimeä**,
esimerkiksi UTF-16-merkkijonoa `EntitlementsEndpoint`. Päätepiste tarkoittaa verkko-osoitetta, johon
peli lähettää tietyn pyynnön. Siis:

1. Etsi avaimen nimi. Sen lataava `lea` on funktiossa, joka rakentaa pyynnön (käyttöoikeuksille eli
   entitlements-kutsulle `0x14144b520`).
2. Tuo funktio joko sitoo valmistumislambdan, jonka osoitetta voi seurata, tai siirtää työn nimetylle
   käsittelijälle. Nimetyt käsittelijät on helppo löytää, koska peli kirjoittaa niiden nimet lokiin
   ASCII-merkkijonoina, kuten `"FOnlineLoadoutPhoenix::OnGetAllLoadoutsComplete"` osoitteessa
   `0x1464abb88`. Etsi nimi, niin päädyt käsittelijän sisälle.
3. **Jos avaimen nimeä ei ole ohjelmatiedostossa lainkaan, asiakasohjelma ei koskaan tee sitä
   pyyntöä,** vaikka ini-tiedosto yhä määrittelisi osoitteen. Version 2.1.1
   `GetBountiesConfigEndpoint` on tällainen.

Phoenixin rajapintoja kutsutaan vtablejen kautta, joten rel32-kutsujahakemisto ei löydä useimmille
niistä mitään. Etene aina käsittelijästä eteenpäin rakenteeseen, älä rakenteesta taaksepäin.

---

## Vaihe 2: löydä vastausrakenne {#step-2-find-the-response-struct}

Käsittelijä rakentaa vastausolionsa pinoon (ohjelman väliaikaiseen työmuistiin) ja leimaa siihen
vtablen (virtuaalifunktiotaulun eli C++-olion luettelon sen funktioista):

```
lea  rax, [rip+...]        ; -> 0x1464ab5c8, the payload struct's vtable
mov  [rbp-0x38], rax
```

Luetteloimissamme `FJsonSerializable`-vtableissa paikka `+0x28` on yhteinen
`FJsonSerializable::FromJson(const FString&)` osoitteessa `0x140c2fbe0`, ja paikka `+0x38` on
rakenteen oma `Serialize`. Tästä saadaan mekaaninen tapa luetella ne kaikki: jokainen vtable, jonka
`+0x28` osoittaa osoitteeseen `0x140c2fbe0`, on JSON-sarjallistettava tyyppi. Versiossa 2.1.1 niitä on
**422**.

`FromJson` jäsentää rungon `FJsonObject`-olioksi ja kutsuu sitten `Serialize`-funktiota lukijan kanssa
(vtable `0x14623f9e0`). Siksi ylimmän tason JSON-taulukko epäonnistuu näissä päätepisteissä:
luovutettavaa oliota ei ole.

Varo **yhdistettyjä funktioita** (folded functions). Linkkeri yhdistää funktiot, joiden koodi on
identtinen, joten yksi `Serialize` voi kuulua monelle tyypille. Yhteiseen kuoren `Serialize`-funktioon
osoitteessa `0x1414552f0` viittaa noin 30 vtablea. `Serialize`-funktiosta ei voi päätellä, mikä
päätepiste sitä käyttää; käsittelijästä voi.

---

## Vaihe 3: lue `Serialize` {#step-3-read-serialize}

Jokainen kenttä on yksi sarjallistajakutsu, ja kutsun vtable-paikka kertoo C++-tyypin. Rakenne on
sama, jonka Unrealin `JSON_SERIALIZE`-makrot tuottavat:

```
; FOnlineLoadoutsPhoenix::Serialize (0x141457f20), abridged
0x1414583bf  lea   r8,  [r15+0x108]         ; destination member
0x1414583c6  lea   rdx, [rip+...]           ; w"num_account_slots"
             ...
0x1414583d0  call  qword ptr [rax+0x80]     ; slot +0x80 = int32
```

Jokaisesta kentästä saa siis nimen (UTF-16-vakio rekisterissä `rdx`), siirtymän (`r8`) ja tyypin
(paikka).

### Paikkataulukko {#the-slot-table}

Nämä ovat lukijan paikat versiossa 2.1.1 (vtable `0x14623f9e0`). Rakensimme taulukon lukemalla kunkin
paikan funktion, emme arvaamalla käytön perusteella.

| Paikka | Funktio | C++-tyyppi | Lähetä |
|---|---|---|---|
| `+0x18` / `+0x20` | — | olion alku / loppu | — |
| `+0x40` | `0x140c3abd0` | `FDateTime` | ISO-8601-merkkijono, jossa on `T`. Lukija vaatii JSON-merkkijonon ja antaa sen funktiolle, jonka tulkitsemme olevan `FDateTime::ParseIso8601` (`0x142f75790`); luku ohitetaan |
| `+0x50` | `0x140c3aa10` | `float` | luku |
| `+0x60` | `0x140c3acd0` | `FString` | merkkijono |
| `+0x68` | `0x140c3b010` | `bool` | `true` / `false`; mitään muuta ei hyväksytä |
| `+0x70`, `+0x78` | `0x140c3af40`, `0x140c3a940` | muun kuin int32-levyiset kokonaisluvut (ei selvitetty) | luku |
| `+0x80` | `0x140c3a870` | `int32` | luku; lainausmerkeissä oleva luku jätetään huomiotta |
| `+0xa0` | `0x140c3c030` | `TArray<FString>` | merkkijonotaulukko |
| `+0xc8` | — | kuvaus eli map (nähty kentässä `playerHuntIDs`) | olio |
| `+0xe0` | `0x140c321a0` | suora pääsy JSON-olioon | käytetään sisäkkäisille olioille ja taulukoille |
| `+0x90`, `+0xa8`, `+0xe8`, `+0xf0` | — | lukijassa tyhjiä operaatioita | — |

**Korjaus:** taulukon ensimmäisessä versiossa `+0x50` oli 64-bittinen kokonaisluku. Funktion
lukeminen näyttää käskyn `cvtsd2ss`, jota seuraa 4 tavun `movss`, joten kyseessä on liukuluku (float).
Tätä paikkaa käyttävät esimerkiksi kentät `createdTimeMillis` ja `pingFrequency`.

### Sisäkkäiset oliot ja taulukot {#nested-objects-and-arrays}

Rakennetaulukoita ja sisäkkäisiä olioita ei lueta tyypitetyn paikan kautta. Koodi ottaa raakaolion
(`+0xe0`), hakee avaimen (`TryGetField`, `0x140c2f760`) ja tarkistaa JSON-tyyppitavun:

```
; progression config payload Serialize (0x1414c4e80), abridged
0x1414c4ef1  lea  rdx, [rip+...]          ; a"paths"
             call 0x140c2f760             ; look the key up
             ...
0x1414c4f4c  cmp  dword ptr [rcx+8], 5    ; EJson::Array?
0x1414c4f50  jne  <skip>
```

Tyyppiarvot ovat Unrealin `EJson`-luettelotyypin arvoja: `None 0`, `Null 1`, `String 2`, `Number 3`,
`Boolean 4`, `Array 5`, `Object 6`. Useimmat lukemamme raakahaut käyttivät **ASCII**-avainvakioita
(`a"payload"`, `a"loadouts"`, `a"paths"`, `a"entitlements"`), kun taas tyypitetyt paikkakutsut
käyttivät **UTF-16**-muotoa. Poikkeuksiakin on (mailboxin `/all/`-kääre hakee UTF-16-muotoista
avainta `"payload"`), joten etsi kumpaakin koodausta.

---

## Vaihe 4: tunnista kuori {#step-4-recognise-the-envelope}

Monet palvelut käärivät sisältönsä muotoon `{"code", "message", "payload"}`. Muistissa se on: vtable
`+0x00`, `code` `+0x08`, `message` `+0x18`, payload `+0x28`. Merkki tästä käsittelijässä on **kaksi
vtablea, jotka on tallennettu pinoon 0x28 tavun päähän toisistaan**, esimerkiksi kääre kohdassa
`[rbp-0x60]` ja sisältörakenne kohdassa `[rbp-0x38]`, ja `FromJson` kutsutaan kääreelle.

Löysimme versiosta 2.1.1 nämä kääremuunnelmat:

| Serialize | `code` | `payload` | Käyttäjät |
|---|---|---|---|
| `0x1414552f0` | merkkijono | olio | noin 30 tyyppiä, muun muassa loadout, cohort, event stats, escalation, progression config, suurin osa Gauntletista ja `/pjm` |
| `0x1414555b0` | merkkijono | taulukko | Gauntletin tulostaulukko |
| `0x141455c50` | merkkijono | int32 | Gauntletin kiltapalkinnot |
| `0x14145a2f0` | merkkijono | olio | mailbox `/all/` |
| `0x1414be3a0`, `0x1414be050` | **int32** | taulukko | `/progression/{accountid}`, `/progression/objectives/{accountid}` |
| `0x1414bffe0` | `statusCode` (int32) | — | matchmaking-koodissa; emme saaneet sitä yhdistettyä mihinkään päätepisteeseen |

Kääre tarkistaa `payload`-kentän tyypin (`cmp dword ptr [rcx+8], 6` osoitteessa `0x1414553d3`). Jos
kenttä puuttuu tai on väärää tyyppiä, **`Serialize` palaa normaalisti, jäsennys ilmoittaa
onnistuneensa, eikä sisältörakenteeseen kosketa lainkaan.**

**Litteä** päätepiste (ilman kuorta) näyttää erilaiselta. Joko rakenteen oma vtable leimataan
yksinään ja `FromJson` kutsutaan sille (migration status), tai käsittelijä jäsentää rungon
tavalliseksi `FJsonObject`-olioksi ja kutsuu `TryGetArrayField`-funktiota nimen perusteella
(molemmat inventory-käsittelijät).

---

## Vaihe 5: lue jäsennystä ympäröivät portit {#step-5-read-the-gates-around-the-parse}

Jäsennystä ympäröivä koodi ratkaisee, kuinka paljon väärä vastaus maksaa.

- **Tilakoodiportti:** `call [rax+0x40]` (vastauskoodi), sitten
  `add eax, 0xffffff38 / cmp eax, 6 / ja <fail>`. Vain koodit 200–206 pääsevät läpi.
- **Jäsennyksen tulos:** `test bl, bl / je <fail>` kutsun `FromJson` jälkeen.
- **Mitä vastausta käyttävä koodi tekee epäonnistuessa.** Tämä erottaa harmittoman päätepisteen
  estävästä. `AArchonLoadout` ei koskaan ilmoita valmistuneensa, jos lukeminen epäonnistuu.
  Cohorts-komponentti palaa oletuskäsittelyyn (treatment) ja jatkaa. Epäonnistunut
  tavaraluettelokysely heittää pelaajan takaisin päävalikkoon. Migration-vastausta, joka ei koskaan
  sano "valmis", kysellään loputtomiin.

---

## Miksi tyypeillä on väliä {#why-types-are-load-bearing}

Tyypitetyt lukijat eivät muunna arvoja eivätkä valita. Tässä int32-lukija, paikka `+0x80`:

```
; 0x140c3a870, abridged
0x140c3a8b2  cmp  eax, -1                  ; key not found?
             je   0x140c3a8e6              ;   -> result = false
0x140c3a8dc  cmp  dword ptr [rax+8], 3     ; EJson::Number?
             jne  0x140c3a8e6              ;   -> result = false
             ...
0x140c3a8f7  test bl, bl
             je   0x140c3a92b              ; false: the destination is never written
```

Puuttuva avain ja väärä tyyppi saavat saman kohtelun: **C++-jäsen säilyttää sen, mitä siinä oli
ennestään.** Bool-lukija tekee samoin käskyllä `cmp dword ptr [rax+8], 4`. Useat vastausrakenteet
(esimerkiksi kaikki kolme loadout-vastausta) ovat pinossa olevia paikallisia muuttujia, joiden
konstruktorit nollaavat vain osan jäsenistä. Niissä "se, mitä siinä oli ennestään" on pinoon jäänyttä
vanhaa muistia.

Tapauksia, joihin törmäsimme tai jotka luimme koodista versiossa 2.1.1:

| Kenttä | Väärä arvo | Seuraus |
|---|---|---|
| `serverInfo.port` | `"7777"` (merkkijono) | Jää nollaksi. Tilatarkistus menee läpi (se tarkistaa vain `host`-kentän), minkä jälkeen yhteysmerkkijonon rakentaja hylkää istunnon lokirivillä, joka ei koskaan päädy lokitiedostoon (tiedostoon lokitus on poistettu). Asiakasohjelma ei vain siirry minnekään. |
| Loadout-paikkojen määrät | puuttuu tai lainausmerkeissä | Pinon roskaa ja sitten kohtalokas `TArray`-koonmuutos (katso seuraava osio) |
| `needs_migration` | `0` tai `"false"` | Ei kirjoiteta; pinon roska ratkaisee, mikä koodipolku ajetaan |
| `active_index` | `0` ja tyhjä `loadouts` | Testeissämme käynnistys kaatui osoitteen `0x0` muistinkäyttövirheeseen (access violation) noin 20 sekunnin kohdalla; `-1` vältti sen. Syy on selvittämättä (katso [Kaatumisten tutkinta]({{ crashes_page.url | relative_url }})) |
| `migration_finished` | puuttuu | Jää epätodeksi (false), ja asiakasohjelma kyselee loputtomiin |
| `entitlementsv2`-runko | `[]` | `FromJson` epäonnistuu; käyttöoikeuksien lataaja ei koskaan valmistu, eivätkä sen takana olevat kuusi lataajaa koskaan käynnisty |
| Hahmon `data`-arvot | JSON-arvo `true` | `TryGetString` epäonnistuu, ja koko hahmon tietovarasto nollataan |
| Hahmon `updateVersion` | puuttuu | "Failed To Parse All Required Fields", kuusi uudelleenyritystä, epäonnistunut kirjautuminen |
| `treatments`-alkiot | olioita | Luetaan tyyppinä `TArray<FString>`, joten niiden on oltava merkkijonoja |
| `confirmed_fremium_rank` | oikein kirjoitettuna | Ei löydy, jää nollaksi. Asiakasohjelman kirjoitusasu on `fremium`. |
| `code` polussa `/progression/{id}` | merkkijono | Harmiton: tämä muunnelma lukee int32-arvon, mutta mikään ei lue `code`-kenttää takaisin |

Kirjainkoko on eri asia. `FJsonObject` tallentaa kenttänsä `TMap<FString, ...>`-rakenteeseen, ja
Unreal vertaa `FString`-avaimia yleensä kirjainkoosta välittämättä, joten avainten `sessionToken` ja
`sessiontoken` pitäisi olla sama avain. Tämä on pelimoottorin vakiokäytöstä; emme testanneet sitä
erikseen.

---

## Väärä muoto kaataa, ei epäonnistu {#a-wrong-shape-crashes-it-does-not-fail}

Tämä on tarina, joka opetti meille yllä olevat säännöt. Tässä se kerrotaan JSONin näkökulmasta.
Kaatumisraportin puoli, kehys kehykseltä, on sivulla
[Kaatumisten tutkinta]({{ crashes_page.url | relative_url }}).

**Löytötila (discovery mode).** Alussa tutkimuspalvelimemme vastasi jokaiseen *tuntemattomaan*
reittiin koodilla `200` ja arvatulla rungolla: `{}` tai polun avainsanojen perusteella valitulla
tyngällä. Jokainen pyyntö tallennettiin. Liikenteen kartoittamiseen se toimi hyvin. Asiakasohjelma
jatkoi käynnistysvaihettaan ja näytti meille joka kerta seuraavan kutsun.

**Kaatuminen.** Kun asiakasohjelman sai käynnistettyä suoraan Ramsgateen, se kuoli noin
**85 sekunnin** kohdalla:

```
Fatal error: Trying to resize TArray to an invalid size of 3163556208
```

Toinen ajo antoi luvun `3051757616`. Muutimme kutsupinon staattisiksi osoitteiksi ja seurasimme sitä
taaksepäin:

```
0x142e83135  fatal log: "Trying to resize TArray%s to an invalid size of %llu"
0x1428cd7fc  InitializeFromOnlineLoadoutData (0x1428cd790)
0x1428b2628  loadout-loaded handler (0x1428b2560)
0x1428bc067  delegate thunk (0x1428bc050)
0x1414356e7  FOnlineLoadoutPhoenix::OnGetAllLoadoutsComplete (0x1414353b0), delegate broadcast
  ...        Phoenix HTTP completion, HTTP retry manager, ticker, FEngineLoop::Tick
```

Virheen aiheuttava koodi laskee yhteen kaksi loadout-sisällön kenttää ja tarkistaa vain etumerkin:

```
0x1428cd7e0  mov  ebx, dword ptr [rdx+0x108]   ; num_account_slots
0x1428cd7ed  add  ebx, dword ptr [rdx+0x110]   ; + num_character_slots
0x1428cd7f3  jns  0x1428cd7fc                  ; only a negative sum reaches the fatal
0x1428cd7f7  call 0x140c0a6a0                  ; OnInvalidArrayNum
```

**Miksi.** Vastausrakenne on 0x120 tavun paikallinen pinomuuttuja funktiossa
`OnGetAllLoadoutsComplete`. Sen konstruktori kirjoittaa vtablen, `loadouts`-taulukon ja
`persistent`-aliolion eikä **koskaan koske kuuteen skalaarikenttään kohdissa `+0x108`..`+0x11c`**. Ne
täytetään vain, jos JSON antaa ne. Löytötilan tynkämme kaikelle, jonka polussa oli "loadout", oli
`{"loadouts": []}`. Se on kelvollinen olio, mutta siinä ei ole `payload`-kenttää eikä määriä, joten
määrät olivat pinoon jäänyttä vanhaa muistia. `3163556208` on `0xBC900970`, joka on int32-lukuna
negatiivinen ja muodoltaan kuin osoittimen alempi puolisko. Se ei koskaan ollut meidän lähettämämme
luku.

**Todiste.** Löytötila päällä kaatuminen tuli 85 sekunnin kohdalla. Löytötila pois päältä
(tuntemattomiin reitteihin vastattiin `404`) asiakasohjelma toimi yli 220 sekuntia.

**Korjaus kolmessa osassa:**

1. **Tiukka tila.** Tuntemattomat reitit palauttavat `404`:n **ilman minkäänlaista runkoa**.
   JSON-muotoisessa virherungossa on sama riski, jos käsittelijä jäsentää sen tilakoodista
   välittämättä. Löytötila on yhä käytettävissä uuden liikenteen kartoittamiseen, mutta se ei ole
   koskaan päällä pelatessa.
2. **Oikea muoto.** Loadout-päätepiste sai täyden kuorensa numeerisine määrineen.
3. **Seuraava kaatuminen.** Kun kuori oli paikallaan, `active_index: 0` ja tyhjä `loadouts`-taulukko
   kaatoivat ohjelman virheeseen `EXCEPTION_ACCESS_VIOLATION reading 0x0` noin 20 sekunnin kohdalla.
   Arvo `-1` vei asiakasohjelman loadout-järjestelmän ohi, ja sen jälkeen se toimi minuutteja
   kaatumatta.

**Houkutteleva näennäiskorjaus.** Jonkin aikaa vastasimme tuohon päätepisteeseen pelkällä `[]`.
Kaatuminen katosi, mutta vain siksi, että ylimmän tason taulukko saa `FromJson`-kutsun epäonnistumaan.
Loadout-lataaja kulki silloin epäonnistumispolkuaan, ei koskaan ilmoittanut valmistuneensa ja kysyi
uudelleen jokaisella latauskierroksella. Asiakasohjelma oli vakaa, mutta se ei koskaan pystynyt
tuomaan pelaajaa pelimaailmaan.

**Opetukset:**

- Tässä asiakasohjelmassa väärä muoto ei ole validointivirhe. Se on määrittelemätöntä käytöstä.
- `404` on turvallinen paikanpitäjä. `{}` ei ole.
- "Kaatuminen katosi" ja "päätepiste toimii" ovat eri väitteitä. Tarkista, että lataaja oikeasti
  valmistuu.
- Luku, joka vaihtuu ajosta toiseen ja näyttää osoittimelta, on alustamatonta muistia, ei dataa.

---

## Anna asiakasohjelman näyttää: sen omat pyyntörungot {#let-the-client-show-you-its-own-request-bodies}

Phoenixin rajapinta on pitkälti symmetrinen. Asiakasohjelma kirjoittaa samoja resursseja, joita se
lukee: pelaajan polku (journey), odotusajat (cooldowns), hahmot (characters) ja tavaraluettelo
(inventory). `FJsonSerializable`-luokassa yksi `Serialize`-funktio tekee molemmat työt: se kirjoittaa
tallennettaessa ja lukee ladattaessa. Aina kun asiakasohjelma siis *lähettää* rakenteen, näet ne
kenttien nimet ja JSON-tyypit, joita se odottaa lukevansa takaisin samaan rakenteeseen.

Tallensimme jokaisen pyynnön ja kävimme tallennetut rungot läpi ennen kuin arvasimme mitään muotoa:

- **`POST /pjm/{accountid}`** näytti, että `nodes` on **solmun tunnisteella avainnettu olio** eikä
  taulukko, ja näytti kunkin solmun kentät:

  ```json
  {"nodes": {"Slayer_00": {"node_id": "Slayer_00", "node_status": 2, "objectives": []}}}
  ```

  Lukija vahvisti tämän tarkistamalla, että `nodes`-arvon tyyppi on 6 (Object).
- **`PUT /cooldown/batch/{accountid}`** antoi muodon `{"cooldowns": [{"cooldown_id",
  "cooldown_started_date"}]}` ja asiakasohjelman käyttämän päivämäärämuodon. Eräpyyntö ja vastaus
  käyttävät samaa säiliötyyppiä, joten yhdistetyn erän palauttaminen takaisin on oikein.
- **`POST /inventory`** antoi transaktion kenttien nimet ja aloituslahjan tarkat luettelotunnisteet
  (catalog id).

Menetelmällä on rajansa:

- **Transaktio ei ole symmetrinen.** `POST /inventory` lähettää `add...`/`remove...`/`save...`-luettelot
  ja lukee takaisin `created...`/`updated...`/`removed...`-luettelot. Pyynnön kaiuttaminen takaisin
  jäsentyy hyvin eikä anna mitään.
- **Pyyntörunko ei näytä kuorta.** Asiakasohjelma kirjoittaa `/pjm`-datan ilman kuorta. Staattinen
  luentamme `GET /pjm` -käsittelijästä löytää sen ympäriltä tavallisen kääreen. Käytä pyyntörunkoja
  kenttien nimiin ja tyyppeihin, ja tarkista kääre käsittelijästä.

---

## Muita tapoja nähdä sisään {#other-ways-to-see-inside}

Julkaisuversioista on poistettu tiedostoon lokitus, joten seurasimme asiakasohjelmaa sen
verkkoliikenteen kautta:

- **Sykeviesti (heartbeat).** 2.1.1 lähettää `{state, map, server, session, ping, playtime}`
  osoitteeseen `tracking-prod.steelyard.ca/heartbeat` joka sekunti. `map` kertoo, missä asiakasohjelma
  todella on.
- **Toistuvat pyynnöt.** Tiukassa tilassa päätepiste, jota asiakasohjelma tarvitsee, näkyy samana
  pyyntönä yhä uudelleen. Version 2.1.1 erillisessä käynnistyksessämme jokaista puuttuvaa päätepistettä
  pyydettiin 70 kertaa ennen kuin asiakasohjelma luovutti. Lataaja, joka ei ole valmis, kysyy
  uudelleen jokaisella latauskierroksella.
- **Telemetriatapahtumat** (pelin lähettämät käyttötiedot). `playerdata_load_failed` nimeää jokaisen
  lataajan ja kertoo, valmistuiko se; `client_login_failed` nimeää kirjautumisen vaiheen, joka
  epäonnistui. Molemmat saapuvat osoitteeseen `telemetry-ingest-prod.steelyard.ca/event`.

---

## Vältettäviä virheitä {#mistakes-worth-avoiding}

- **Lähellä oleva koodi ei ole todiste.** Luulimme kerran `/gamesession/playerjoined`-vastauksen
  jäsennintä matchmakingin `serverInfo`-rakenteeksi, koska kummassakin mainitaan `gameSessionId`.
  Yhdistä rakenne päätepisteeseensä käsittelijän kutsuketjun kautta.
- **Etsi myös lyhyitä siirtymiä.** Yhdellä `UProgressionComponent`-komponentin valmiuslipulla
  (`+0x3f3`) ei näyttänyt olevan kirjoittajaa. Hakumme kattoivat vain 32-bittiset siirtymät, joten
  tallennus uudelleen sijoitetun osoittimen kautta 8-bittisellä siirtymällä ei näkyisi. Tuo kysymys on
  yhä auki.
- **Lue luettelotyypit merkkijonovertailuketjuista.** Arvot kuten matchmakingin `status` ja
  `PlayerAccountProgressStep` ovat merkkijonoja, joita verrataan yksi kerrallaan ja jotka muutetaan
  pieniksi luvuiksi. Ketju antaa sekä kelvolliset kirjoitusasut että niiden järjestyksen.
- **Älä luota käytön perusteella rakennettuun paikkataulukkoon.** Lue paikan funktio (katso `+0x50`
  yllä).
- **Vertaa ini-tiedostoa ohjelmatiedostoon.** Ini-tiedostossa määritelty avain, jonka nimeä ei
  esiinny exe-tiedostossa lainkaan, on kuollut.
