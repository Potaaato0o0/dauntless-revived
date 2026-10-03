---
title: Työkalut
parent: Dauntless Revived suomeksi
nav_order: 7
lang: fi
ref: tools
locale: fi_FI
description: "Kolme pientä Python-työkalua Dauntlessin tutkimiseen: xref.py ohjelmatiedoston merkkijonoille, utocdir.py IoStore-säiliöille ja pak9.py pak-tiedostoille."
---

{% assign crashes_page = site.pages | where: "path", "fi/findings/crashes.md" | first %}
{% assign awakening_page = site.pages | where: "path", "fi/findings/awakening-2-1-1.md" | first %}
{% assign contract_page = site.pages | where: "path", "fi/findings/backend-contract.md" | first %}
{% assign scripts_page = site.pages | where: "path", "fi/reference/scripts.md" | first %}

# Työkalut
{: .no_toc }

Suuri osa tämän sivuston staattisesta analyysistä (pelin ohjelmatiedostojen tutkimisesta ajamatta
niitä) tehtiin kolmella pienellä Python-skriptillä. Mikään niistä ei ole erityisen nokkela. Ne ovat
olemassa, koska tavalliset työkalut eivät joko tunteneet näitä tiedostomuotoja tai eivät pystyneet
avaamaan näitä tiedostoja.

| Skripti | Mitä se lukee | Versio |
|---|---|---|
| [`xref.py`](#xrefpy-string-cross-references-and-annotated-disassembly) | Windowsin PE-ohjelmatiedosto (.exe): löytää koodin, joka viittaa merkkijonoon, ja purkaa konekielen luettavaksi merkkijonoilla merkittynä | Molemmat (useimmat tämän sivuston osoitteet tulivat siitä) |
| [`utocdir.py`](#utocdirpy-the-iostore-directory-index) | Unreal 5:n IoStore-säiliön (`.utoc`) hakemistoindeksi | 2.1.1 |
| [`pak9.py`](#pak9py-legacy-pak-v8v9-reader) | Unreal 4:n `.pak`-tiedosto (versio 8 tai 9), jossa on vanhanmallinen indeksi: listaa, hae, pura | 1.4.4 |

<details open markdown="block">
  <summary>Sisällys</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Lisenssi ja perussäännöt {#licence-and-ground-rules}

- Skriptit julkaistaan **GNU Affero General Public License v3.0 (AGPL-3.0)** -lisenssillä yhdessä
  Undaunted-haaramme (fork, eli oman muokatun kopiomme) kanssa. **Tila:** ne eivät ole vielä
  repositoriossa; aiomme lisätä ne `tools/`-kansioon. Nykyisessä `tools/`-kansiossa on projektin omat
  käännös- ja paketointiskriptit, eivät nämä; ne on lueteltu sivulla
  [Skriptit ja parametrit]({{ scripts_page.url | relative_url }}).
- **Käytä niitä vain tiedostoihin, jotka omistat:** omaan, laillisesti hankittuun pelikopioosi. Ne
  vain lukevat pelin tiedostoja eivätkä koskaan muuta niitä (`pak9.py get` kirjoittaa sen yhden
  puretun tiedoston antamaasi polkuun). Ne eivät sisällä pelin dataa, avaimia tai muita
  salaisuuksia.
- Ne eivät murra suojauksia. `pak9.py` kieltäytyy lukemasta salattua tai "jäädytettyä" (frozen)
  indeksiä. `utocdir.py` odottaa salaamatonta hakemistoindeksiä. Dauntless 1.4.4 ja 2.1.1
  toimitetaan molemmat salaamattomina.
- Älä julkaise sitä, mitä purat. Pelitiedostot, grafiikat ja muu sisältö sekä pelin mukana tulevat
  valmiit asetukset (cooked config) kuuluvat omistajilleen. Mukana tulleet asetukset sisältävät myös
  voimassa olevia tunnistetietoja (katso
  [Taustapalvelun rajapinta]({{ contract_page.url | relative_url }})).

## Vaatimukset {#requirements}

- Python 3. Ajoimme kaiken Ubuntussa WSL:n alla, mutta skripteissä ei ole mitään Linux-kohtaista
  paitsi Oodle-kirjaston polku.
- `xref.py`: paketit `pefile` ja `capstone` (`pip install pefile capstone`).
- `utocdir.py`: ei mitään vakiokirjaston lisäksi.
- `pak9.py`: zlib-pakatuille pak-tiedostoille vakiokirjasto. Oodle-pakatuille pak-tiedostoille
  jaettu kirjasto, joka on käännetty [ooz](https://github.com/powzix/ooz)-projektista. Katso
  [Oodle](#oodle-building-libooz) alempana.

Esimerkeissä `<exe>` on `Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe` ja `<paks>` on
`Archon/Content/Paks` pelikansiosi sisällä.

---

## `xref.py`: merkkijonojen ristiviittaukset ja merkitty konekielen purku {#xrefpy-string-cross-references-and-annotated-disassembly}

Unrealin julkaisukäännöksessä ei ole symboleja (funktioiden nimiä), mutta se on täynnä lokien
muotoilumerkkijonoja, asetusavainten nimiä ja UObject-nimiä. Useimmissa funktioissa on ainakin
yksi. `xref.py` vie merkkijonosta sitä käyttävään koodiin ja osoitteesta luettavaan konekielen
purkuun (disassembly).

```text
xref.py <exe> find <text>               locate a string and every lea that points at it
xref.py <exe> func <hex address> [n]    disassemble from an address, annotating string references
```

### `find` {#find}

Se etsii tekstiä PE-tiedoston jokaisesta osiosta sekä ASCII- että UTF-16LE-muodossa (Unrealin
`TEXT()`-merkkijonot ovat UTF-16:ta). Jokaisen osuman kohdalla se käy `.text`-osion läpi ja etsii
RIP-suhteellisia `lea`-käskyjä (`48 8D` tai `4C 8D` RIP-suhteellisella operandilla), joiden kohde on
tuo osoite. Jokaisesta niistä se tulostaa käskyn osoitteen ja arvion sen sisältävän funktion
alusta (`func~`). Arvio löydetään kulkemalla taaksepäin lähimpään `int3`-täytteeseen. Molemmat alla
olevat esimerkit ovat 2.1.1:n ohjelmatiedostosta.

```console
$ python3 xref.py <exe> find "Trying to resize TArray"
[utf16] .rdata 0x146efffe0
    xref 0x142e8311d   func~0x142e83100
    xref 0x142e83150   func~0x142e83140
```

### `func` {#func}

Se purkaa konekieltä Capstonella annetusta virtuaaliosoitteesta alkaen. Jokainen RIP-suhteellinen
`lea` merkitään merkkijonolla, johon se osoittaa: `w"..."` UTF-16:lle, `a"..."` ASCII:lle tai
raakana kohdeosoitteena, jos kohde ei ole merkkijono. Se pysähtyy ensimmäiseen `ret`-käskyyn.
Valinnainen lukumäärä (oletus 400) ei rajoita käskyjen määrää tarkasti: se lukee
lukumäärä × 12 tavua koodia ja purkaa ne kaikki, joten pidä sitä karkeana rajana.

```console
$ python3 xref.py <exe> func 0x1428cd7e0 8
0x1428cd7e0  mov     ebx, dword ptr [rdx + 0x108]
0x1428cd7e6  lea     r14, [rcx + 0x728]
0x1428cd7ed  add     ebx, dword ptr [rdx + 0x110]
0x1428cd7f3  jns     0x1428cd7fc
0x1428cd7f5  mov     ecx, ebx
0x1428cd7f7  call    0x140c0a6a0
...
```

Tuo on TArray-kaatumisen virheen aiheuttava koodi, joka on kuvattu sivulla
[Kaatumisten tutkiminen]({{ crashes_page.url | relative_url }}). Sama sivu näyttää, miten
kaatumisraportin siirtymät muutetaan osoitteiksi, jotka voi antaa `func`-komennolle.

### Näin käytämme sitä {#how-we-use-it}

1. Etsi lokimerkkijono, asetusavain tai UObject-nimi, joka kuuluu sinua kiinnostavaan toimintaan,
   esimerkiksi `"[%s] - Loading PlayerData Failed"` tai `"GameDefaultMap"`. Käytä merkkijonon alkua
   (katso [Rajoitukset](#limits)).
2. Etsi se `find`-komennolla ja valitse funktio, jossa `lea` sijaitsee.
3. Pura tuo funktio `func`-komennolla. Merkkijonomerkinnät nimeävät yleensä funktion itsensä,
   koska Unrealin koodi kirjaa oman nimensä lokiin. Esimerkiksi funktiossa `0x1427d47a0` merkinnän
   `a"UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete"` vieressä on
   `w"%s - Succeeded: %s"`.
4. Seuraa `call`-kohteita tekemällä lisää `func`-kutsuja.

Useimmat tämän sivuston funktioiden nimet löydettiin näin. Ne ovat meidän tunnistuksiamme, eivät
symboleja.

### Rajoitukset {#limits}

- Se seuraa vain `lea`-käskyjä. Viittauksia, jotka kulkevat osoittimen `mov`-käskyn, osoitintaulukoiden
  tai Unrealin `FName`-taulukon kautta, se ei löydä. Asetusavaimia luetaan usein taulukoiden kautta.
- `lea`-käskyn on osoitettava hakemasi tekstin ensimmäiseen merkkiin. Hae siis merkkijonon alkua.
  Versiossa 2.1.1 haku `"Loading PlayerData Failed"` löytää tekstin mutta ei ristiviittausta, koska
  koodi osoittaa merkkijonoon `"[%s] - Loading PlayerData Failed! ..."`.
- Funktion alku on arvio, siksi `func~`. Tarkista se, ennen kuin luotat siihen.
- Se käyttää PE-tiedoston ensisijaista perusosoitetta (`0x140000000` molemmissa Dauntless-versioissa).
  Käynnissä olevan prosessin tai kaatumisraportin osoitteet on siirretty toiseen kohtaan. Vähennä
  niistä moduulin perusosoite ja lisää `0x140000000`.

---

## `utocdir.py`: IoStoren hakemistoindeksi {#utocdirpy-the-iostore-directory-index}

Versiossa **2.1.1** 141 `.pak`-tiedostoa on 339 tavun tynkiä. Varsinainen sisältö on Unreal 5:n
IoStore-säiliöissä: `.utoc`-sisällysluettelossa ja `.ucas`-datatiedostossa. Tarvitsimme vain
tiedostojen nimet, joten kirjoitimme lukijan pelkälle hakemistoindeksille.

Se tarkistaa `.utoc`-tiedoston tunnisteen (magic) ja lukee otsakkeen. Sitten se ohittaa lohkojen
tunnukset, siirtymät ja pituudet, täydellisen hajautuksen siemenet ja ylivuotolistan, pakkauslohkot
ja menetelmien nimet sekä allekirjoituslohkon, jos säiliö on allekirjoitettu. Jäljelle jää
hakemistoindeksi: liitoskohta (mount point), hakemisto- ja tiedostomerkintöjen puu sekä
merkkijonotaulukko. Se kulkee puun läpi ja tulostaa yhden polun tiedostoa kohden. Se ei pura
mitään.

```console
$ python3 utocdir.py <paks>/Archon_0-WindowsClient.utoc | head -2
ver=5 entries=11349 flags=0x9 dirIndex=647462 at 0x6428e
../../../Archon/Content/bugbear_blaze_bb.uasset
../../../Archon/Content/Boar_loot_table.uasset
```

Otsakkeen yhteenveto menee stderr-virtaan, polut stdout-virtaan. Näin haet kaikista säiliöistä:

```console
$ for f in <paks>/*.utoc; do python3 utocdir.py "$f" 2>/dev/null | sed "s|^|$(basename "$f")  |"; done \
    | grep -i ramsgate_01_persistent
Archon_Maps_2-WindowsClient.utoc  ../../../Archon/Content/Maps/ramsgate/ramsgate_01_persistent.umap
```

`../../../Archon/Content/` vastaa polkua `/Game/`, joten tuo tiedosto on paketti
`/Game/Maps/ramsgate/ramsgate_01_persistent`. Juuri sitä polkua tarvitsimme, jotta saimme
käynnistettyä 2.1.1:n suoraan Ramsgateen (katso
[Itsenäinen käynnistys 2.1.1:llä]({{ awakening_page.url | relative_url }})).

### Rajoitukset {#limits-1}

- Vain nimet. Se ei lue lohkoja `.ucas`-tiedostosta.
- Se olettaa, että hakemistoindeksi on salaamaton (`Encrypted`-lippu, `0x2`, ei päällä). Salatulla
  säiliöllä sen tuloste on roskaa. Se ei tarkista tätä.
- Se olettaa, että säiliöllä on hakemistoindeksi (`Indexed`-lippu, `0x8`). 2.1.1:n
  `global.utoc`-tiedostossa sitä ei ole, ja skripti pysähtyy siihen `struct.error`-virheeseen. Yllä
  oleva hakusilmukka piilottaa sen `2>/dev/null`-ohjauksella.
- Testattu vain Dauntless 2.1.1:n säiliöillä (TOC-versio 5).

---

## `pak9.py`: vanhanmallisten pak v8/v9 -tiedostojen lukija {#pak9py-legacy-pak-v8v9-reader}

Versio **1.4.4** käyttää klassisia Unreal 4:n pak-tiedostoja, versiota 9. Niissä on salaamaton,
vanhanmallinen (ei "jäädytetty") indeksi, ja ne on pakattu zlibillä. `pak9.py` lukee juuri sitä.

```text
pak9.py list <pak>                 every file: uncompressed size, compression method index, path
pak9.py find <dir> <regex>         search the file lists of every *.pak in a directory
pak9.py get  <pak> <path> <out>    extract one file (stored, zlib or Oodle)
```

Se löytää pak-tiedoston lopputietueen (footer) etsimällä viimeisistä 512 tavusta tunnistetta
`0x5A6F12E1`. Lopputietueesta se lukee version, indeksin siirtymän ja koon, salatun indeksin lipun,
jäädytetyn indeksin lipun (versio 9) ja viiden pakkausmenetelmän nimet. Se kieltäytyy lukemasta
salattua tai jäädytettyä indeksiä. Sitten se jäsentää jokaisen indeksimerkinnän (siirtymät, koot,
pakkausmenetelmä, pakkauslohkot, liput ja lohkon koko). `get` vertaa polkua kirjainkoosta
välittämättä ja purkaa pakkauksen lohko kerrallaan.

```console
$ python3 pak9.py find <paks> 'DefaultGame\.ini$'
Archon_35-WindowsClient.pak      50377  ../../../Archon/Config/DefaultGame.ini

$ python3 pak9.py list <paks>/Archon_35-WindowsClient.pak | head -2
mount: ../../../Archon/  methods: ['Zlib']
      7612 cm=1 Content/World/ice/materials/ice_00_m.uasset

$ python3 pak9.py get <paks>/Archon_35-WindowsClient.pak Config/DefaultGame.ini DefaultGame.ini
wrote DefaultGame.ini (50377 bytes, Zlib)
```

`list`- ja `get`-komentojen polut ovat suhteessa liitoskohtaan. `find` tulostaa ne liitoskohta
edessään.

### Tunnettu ongelma: Oodle-haara {#known-issue-the-oodle-branch}

`pak9.py` kutsuu Oodle-kirjastosta funktiota nimeltä `Kraken_Decompress`. Kirjastokäännöksemme
(alla) vie sen vain C++:n muuntamalla (mangled) nimellä sekä tavallisena C-kääreenä nimeltä
`ooz_decompress`. Nykyisessä muodossaan Oodle-haara siis epäonnistuu `AttributeError`-virheeseen.
Olemme ajaneet `pak9.py`:tä vain versiolla 1.4.4, jonka pak-tiedostot käyttävät zlibiä tai eivät
pakkausta lainkaan, joten emme koskaan törmänneet siihen. Korjaus: kutsu sen sijaan
`ooz_decompress`-funktiota, joka ottaa samat neljä argumenttia (lähde, lähteen pituus, kohde, kohteen
pituus) ja palauttaa kirjoitettujen tavujen määrän. 2.1.1-purkuskriptimme tekivät sen jo näin.

---

## Oodle: `libooz`-kirjaston kääntäminen {#oodle-building-libooz}

Version **2.1.1** asetus-pak, `Archon_50-WindowsClient.pak`, on pakattu Oodle Krakenilla. Peli
linkittää Oodlen staattisesti eikä toimita `oo2core`-DLL:ää, joten työkalut, jotka lainaavat tuota
DLL:ää, eivät pystyneet avaamaan sitä meille. [ooz](https://github.com/powzix/ooz) on avoimen
lähdekoodin purkaja Kraken-, Mermaid-, Selkie-, Leviathan-, LZNA- ja BitKnit-pakkauksille. Sen
lisenssi on GPL-3.0-or-later, eikä se ole osa julkaisuamme. Hae se sen tekijältä.

ooz on Windows-projekti. Jotta voisimme käyttää sitä Pythonista Linuxilla, käänsimme siitä pienen
jaetun kirjaston:

1. Kopioi `kraken.cpp`, `bitknit.cpp`, `lzna.cpp` ja `stdafx.h` uuteen kansioon.
2. Poista `kraken.cpp`-tiedoston loppu `OodLZ_*`-funktiotyyppien määrittelyistä eteenpäin: siinä
   ovat `oo2core`-DLL:n lataaja ja komentorivin `main()`. Säilytä `Kraken_Decompress` ja kaikki sitä
   ennen.
3. Korvaa `stdafx.h` POSIX-versiolla. Se tarvitsee `<stdint.h>`-otsakkeen kiinteän leveyden tyypit
   ja SSE-intrinsic-otsakkeet. Liitä `__forceinline` GCC:n always-inline-attribuuttiin ja määrittele
   `WINAPI` tyhjäksi. Lisää pienet korvikkeet funktioille `_BitScanForward`, `_BitScanReverse`,
   `_rotl` ja `_byteswap_*`, rakennettuina vastaavien `__builtin_*`-funktioiden päälle. Myös
   `bitknit.cpp` ja `lzna.cpp` sisällyttävät `stdafx.h`-tiedoston, joten ne saavat saman otsakkeen.
4. Lisää C-linkityksellä oleva kääre:

   ```cpp
   #include <stddef.h>
   typedef unsigned char byte;
   int Kraken_Decompress(const byte *src, size_t src_len, byte *dst, size_t dst_len);
   extern "C" int ooz_decompress(const unsigned char *src, size_t sl, unsigned char *dst, size_t dl) {
     return Kraken_Decompress(src, sl, dst, dl);
   }
   ```

5. Käännä se:

   ```console
   $ g++ -O2 -fPIC -shared -o libooz.so kraken.cpp bitknit.cpp lzna.cpp wrap.cpp
   ```

`pak9.py` lataa kirjaston kiinteästä polusta `/root/tools/oozlib/libooz.so`. Muokkaa tuo rivi
vastaamaan paikkaa, johon laitoit kirjaston.

ooz:n oma README varoittaa, ettei se ole fuzz-turvallinen (se ei välttämättä kestä tahallaan
rikottuja syötteitä). Syötä sille vain tiedostoja, joihin luotat. Sekin on yksi syy käyttää näitä
työkaluja vain omaan asennukseesi eikä mihinkään muuhun.
