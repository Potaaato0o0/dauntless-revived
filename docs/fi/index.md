---
title: Dauntless Revived suomeksi
nav_order: 100
has_children: true
has_toc: false
permalink: /fi/
description: "Dauntless Revived on yksityinen palvelin, jolla Dauntlessia voi taas pelata: aito 1.4.4-versio ja muokattu Undaunted. Mikä toimii ja miten sen saa käyttöön."
lang: fi
ref: index
locale: fi_FI
---

{% assign setup_page = site.pages | where: "path", "fi/setup/index.md" | first %}
{% assign findings_page = site.pages | where: "path", "fi/findings/index.md" | first %}
{% assign reference_page = site.pages | where: "path", "fi/reference/index.md" | first %}
{% assign roadmap_page = site.pages | where: "path", "fi/roadmap.md" | first %}
{% assign legal_page = site.pages | where: "path", "fi/legal.md" | first %}

# Dauntless Revived

**Dauntless** on Phoenix Labsin tekemä tietokonepeli, jossa pelaajat metsästävät yhdessä suuria
hirviöitä. Pelin viralliset palvelimet (tietokoneet, jotka pyörittivät peliä verkossa) suljettiin
**30.5.2025**. Peliä voi silti yhä pelata yksityisellä palvelimella. Dauntless Revived on yksi
sellainen: yksityinen ja ei-kaupallinen hanke, joka säilyttää pelin ja herättää sen henkiin. Siinä
käytetään aitoa **Dauntless 1.4.4** -peliohjelmaa (lokakuulta 2020). Palvelimena on muokattu versio
avoimen lähdekoodin [Undaunted](https://github.com/SyST3MDeV/Undaunted)-palvelimesta, jonka ovat
tehneet gwog ja muut tekijät (lisenssi AGPL-3.0). Palvelin ei ole julkinen: omistaja pitää sitä
pystyssä muutamalle ystävälle. Kuka tahansa, jolla on oma kopio 1.4.4-peliohjelmasta, voi pystyttää
samanlaisen palvelimen [repositorion]({{ site.github.repository_url }}) (koodivaraston) avulla.

Aloitimme tutkimalla pelin viimeistä versiota, **2.1.1**:tä (”Awakening”). Kaikki, mitä opimme
molemmista versioista, on kirjoitettu tälle sivustolle.

**Lyhyesti:**

- Dauntlessin viralliset palvelimet suljettiin 30.5.2025.
- Tämä hanke saa pelin vanhan version 1.4.4 toimimaan taas omalla palvelimella.
- Palvelin on pieni ja yksityinen. Se on tehty muutamalle ystävälle, ei kaikille avoimeksi.
- Jos sinulla on oma kopio pelistä, voit pystyttää oman palvelimen tämän sivuston ohjeilla.

> **Vastuuvapaus.** Dauntless Revived on epävirallinen fanien tekemä hanke. Se **ei liity Phoenix
> Labsiin eikä Epic Gamesiin, eivätkä ne ole hyväksyneet tai tukeneet sitä**. ”Dauntless” ja siihen
> liittyvät nimet ovat omistajiensa tavaramerkkejä. **Tällä sivustolla ja lähdekoodissa ei ole
> pelin tiedostoja**: ei ohjelmatiedostoja, ei pak-paketteja, ei grafiikkaa eikä pelin asetuksia, eikä
> linkkejä niiden latauksiin. Jos haluat käyttää jotakin täällä kuvattua, tarvitset **oman kopion**
> Dauntless 1.4.4 -peliohjelmasta. Julkista palvelinta, jolle voisi liittyä, ei ole.

[Asennusohjeet]({{ setup_page.url | relative_url }}){: .btn .btn-primary .mr-2 }
[Lue löydökset]({{ findings_page.url | relative_url }}){: .btn .mr-2 }
[Tekninen viite]({{ reference_page.url | relative_url }}){: .btn .mr-2 }
[Hosting-kumppani · EU Gamehost]({{ '/fi/setup/hosting-partner.html' | relative_url }}){: .btn .mr-2 }
[Liity Discordiin](https://discord.gg/ZJRprHzsgu){: .btn .btn-primary .mr-2 }
[Tiekartta]({{ roadmap_page.url | relative_url }}){: .btn }

## Patreon-tukijat

Suuri kiitos kaikille, jotka tukevat Dauntless Revivediä Patreonissa. Tuki on vapaaehtoista eikä anna pelillisiä etuja.

- **nasagi** — kiitos Patreon-tukijaksi liittymisestä ja projektin tukemisesta. ❤️

---

## Tilanne nyt {#current-status}

Tilanne 22.9.2026. Kaikki tämän osion tiedot koskevat **1.4.4**-peliohjelmaa. Itse peliä on tähän
mennessä pelannut yksi ihminen, omistaja, yksin: ensin palvelinkoneella ja 22.9.2026 internetin yli
vuokratulla koneella pyörivällä palvelimella. Seuraavaksi on vuorossa testi toisen pelaajan kanssa.

### Mikä toimii {#what-works}

| Ominaisuus | Tila | Huomiot |
|---|---|---|
| Kirjautuminen omalla tilillä | Toimii | Jokaisella pelaajalla on tili meidän palvelimellamme, ja hän kirjautuu henkilökohtaisella tiliavaimella (pitkä salainen tunnus, joka toimii salasanana). **Epic-tiliä ei tarvita.** Versiossa 1.4.4 ei ole Epic Online Services -kirjautumista, koska versio on sitä vanhempi. Peli käynnistetään niin sanotussa exchange code -kirjautumistilassa. Peliin ladattava DLL-tiedosto (pieni ohjelmakirjasto) ohjaa pelin Epic-tyylisen tilipalvelukutsun meidän metagame-palveluumme (palvelimen osa, joka hoitaa tilit ja hahmot). Metagame hyväksyy pelaajan tiliavaimen vaihtokoodina eli exchange codena. |
| Opetusjakso (tutorial) | Toimii | Uusi hahmo ohjataan opetussaarelle. Saari pyörii pelipalvelimella, jonka deploy-palvelin (ohjelma, joka käynnistää pelipalvelimet) käynnistää tarvittaessa. |
| Ramsgate | Toimii | Pysyvä Ramsgate-palvelin pyörii taustapalvelun rinnalla. Ramsgate on pelin keskuskaupunki. Opetusjakson jälkeen ja jokaisella myöhemmällä kirjautumisella pelaaja menee suoraan sinne. |
| Metsästyspalvelimet | Toimii (yksin) | Deploy-palvelin käynnistää yhden pelipalvelimen jokaista metsästystä varten. Meidän kokoonpanossamme yksi pelaaja on pelannut opetusjakson metsästyksen, tavallisen metsästyksen (Lesser Boreus) ja takaa-ajon (pursuit) palvelinkoneella sekä uuden pelaajan takaa-ajon internetin yli vuokratulla palvelimella, jolla pyöri kolme pelipalvelinta yhtä aikaa. Undauntedin historian mukaan neljän pelaajan metsästykset ovat toimineet samalla peliversiolla, mutta me **emme ole vielä testanneet** metsästyksiä useamman kuin yhden pelaajan kanssa. |
| Tavaroiden ja varustesarjojen tallennus | Toimii (yksin); lisäpaikkojen käyttöliittymätesti puuttuu | Materiaalit, Ramsit (pelin raha, todennäköisesti `CURRENCY_NOTES`-pino), valmistetut ja saadut varusteet sekä hahmon tiedot (tehtävien eteneminen, opetusjakson tila, liput, ulkonäkö) tallennetaan SQLite-tietokantaan. Taustapalvelu tallentaa kaikkien kuuden asiakaspaikan avaukset, aktiivisen paikan ja erilliset varustesarjat; pelissä on kokeiltu vain paikkaa 0. Metsästyksistä saatu saalis tallentuu, ja tiedot säilyvät uudelleenkäynnistyksissä. |
| Slayer-taso, mestaruus ja Hunt Pass | Toimii (yksin), oletuksena päällä | Oikea eteneminen (progression): Slayer-taso, aseiden ja hirviöiden mestaruus (mastery) ja Hunt Pass (kauden palkintorata) alkavat alusta (Slayer-taso 1) ja tallentuvat. Jokaisella tilillä on Elite Hunt Pass, ja tasopalkinnot annetaan kerran. Slayer-tasoa, aseiden mestaruutta ja Hunt Passia on testattu pelissä kertakäyttöisellä testitilillä, myös koko palvelimen uudelleenkäynnistyksen yli. Vuokratulla palvelimella 22.9.2026 omistajan uusi tili nousi Slayer-tasolle 3 ja sai aseen mestaruutta ja hirviön mestaruutta (taso 2; hirviön mestaruus nähtiin pelissä ensimmäistä kertaa), ja pelipalvelin vahvisti tasopalkinnot. `PROGRESSION_MODE=stub` palauttaa alkuperäisen projektin kiinteän tason 50. |
| Palvelin vuokratulla koneella | Käynnissä | [Windows-palvelinpaketti]({{ '/fi/setup/windows-server.html' | relative_url }}) asennettiin vuokratulle Windows Server 2019 -virtuaalipalvelimelle julkiseen tilaan 21.–22.9.2026. Siellä tarkistettu: palvelinkokonaisuus käynnistyy koneen käynnistyessä paketin palvelutilillä, Ramsgate pyörii ja lähettää elonmerkkejä (heartbeat), yhdyskäytävä vastaa internetistä kiinnitetyllä varmenteella, ja tunnin välein otettava varmuuskopio toimii. Oikealle palvelimelle asentaminen paljasti kolme ongelmaa, joita hiekkalaatikkotestit eivät voineet löytää, ja ne kaikki on korjattu paketissa: palvelutilin kuvauksen 48 merkin enimmäispituus, Windows-levykuva, joka ei hyväksy ilman tallennettua salasanaa ajettavia ajastettuja tehtäviä (”S4U”) muille kuin ylläpitäjille, ja palveluntarjoajan levykuva, joka piti Windowsin palomuurin pois päältä käytäntöarvoilla. Ensimmäisessä oikeassa testissä (22.9.2026) opetussaari ja Training Dojo käynnistyivät tarvittaessa, kolme pelipalvelinta pyöri yhtä aikaa, ja sallittujen lista avasi UDP-peliportit pelaajalle ja sulki ne, kun hän lähti. Useita tallennusten versioristiriitoja torjuttiin suunnitellusti (vanhempia tai kahdentuneita koko tilannekuvan tallennuksia), ja uusin tallennus säilyi. |
| Kaverikäynnistin | Julkaistu | CI julkaisi ensimmäisen version, 0.1.0:n, [GitHubin julkaisuihin](https://github.com/mixutin/dauntless-revived/releases/latest) `SHA256SUMS.txt`-tiedoston ja käännöksen alkuperätodistuksen (build provenance attestation) kanssa. Asennetut käynnistimet päivittävät itsensä. Omistaja latasi version 0.1.0 sieltä, rekisteröityi kutsulla vuokratulle palvelimelle ja latasi pelin (noin 11 Gt) yhdyskäytävän kautta. CI:n samana yönä julkaisema versio 0.1.1 ei enää laita pelin automaattista valotusta pois; se oli tehnyt Ramsgatesta ja yökohtauksista aivan liian pimeitä. Versiolla 0.1.1 Ramsgate näyttää normaalilta, ja pimeä ilmalaiva ennen metsästystä on palannut ([lisätietoa]({{ '/fi/setup/troubleshooting.html' | relative_url }}#airship-dark-windows-blown-out)). Käynnistintä ei ole vielä allekirjoitettu: omistajan koneella SmartScreen esti asennusohjelman kokonaan, ja tarkistus `SHA256SUMS.txt`-tiedostoa vasten ja eston poistaminen toimivat ([ohje]({{ '/fi/setup/friends.html' | relative_url }})). |

Palvelinkoneella (tietokone, jolla palvelin pyörii) mitattu kulutus oli: Ramsgate-palvelin noin 1,1 Gt
keskusmuistia (RAM) ja noin 0,2 suoritinydintä, jokainen metsästyspalvelin noin 0,9 Gt, ja pelaajan
oma peliohjelma 1,5–2,3 Gt (suurempi luku Cinematic-grafiikka-asetuksilla).

### Mikä ei vielä toimi {#what-does-not-work-yet}

- **Yhdessä pelaaminen internetin yli: toimii kahdella pelaajalla.** Vuokratulle palvelimelle
  kaverit liittyvät käynnistimellä ja kutsulla ilman Tailscalea. 22.9.2026 omistaja kulki sitä tietä
  kutsusta ensimmäiseen metsästykseen asti, ja myöhemmin samana yönä kaksi pelaajaa näki toisensa
  Ramsgatessa ja metsästi yhdessä, kun he jonottivat samaan metsästykseen muutaman sekunnin sisällä.
- **Ryhmät (parties), kaverit ja killat: rakennettu, odottaa testiä kahdella pelaajalla.** Kahden
  pelaajan testissä 22.9.2026 ryhmäkutsu tuli toisen pelaajan peliin mutta ei koskaan näkynyt, eikä
  kaverin lisääminen tehnyt mitään. Jäljitimme kummankin pelin koodista: palvelin kuvasi väärää
  pelaajaa, kun peli kysyi kutsun lähettäjää (`POST /accountinfo/public`), ja vastasi tilihakuun
  (`POST /account/mapping`) muodossa, jota peli ei lue. Molemmat on korjattu, ja myös killat on
  rakennettu (perustaminen, kutsut, arvot, erottaminen, lähteminen ja lakkauttaminen, tallennettuina
  SQLiteen). Kaikki läpäisee testimme, jotka toistavat pelin omat pyynnöt, ja kaikki on käytössä vuokratulla palvelimellamme 22.9.2026 alkaen, mutta kukaan ei ole vielä
  kokeillut niitä pelissä. Pelaajien on käynnistettävä peli kerran uudelleen päivityksen jälkeen.
  Ryhmään voi kutsua, vaikka ette olisi kavereita. Kaikki näkyvät yhä poissa olevina (offline):
  kavereiden näyttäminen paikalla (chat-yhteyden läsnäolotiedot) on rakennettu 23.9.2026, mutta se on
  pois päältä, kunnes chat itse on käytössä ja kaksi pelaajaa on kokeillut sitä (tiekartan kohta
  3.10). **Slayer Links** (My Links -välilehti) on rakennettu ja päällä, mutta sitä ei ole vielä
  kokeiltu pelissä. Yksityiskohdat ovat sivulla
  [Kaverit, ryhmät ja killat]({{ '/fi/findings/social.html' | relative_url }}).
- **Tekstichat.** Rakennettu ja testattu ilman peliä: Ramsgaten, metsästysten, ryhmän ja killan chat
  sekä kuiskaukset käyttäjänimin, metagamen itsensä sisällä. Se on oletuksena pois päältä, kunnes kaksi
  pelaajaa on kokeillut sitä vuokratulla palvelimella. Käytä sillä välin [Dauntless Revived Discordia](https://discord.gg/ZJRprHzsgu). Yksityiskohdat ovat
  sivulla [Tekstichat]({{ '/fi/findings/chat.html' | relative_url }}).
- **Palkkiotehtävät (bounties), odotusajat (cooldowns) ja Escalation.** Oikean etenemisen kanssa
  palkkiotehtävät ja odotusajat tallentuvat tilikohtaisesti, mutta palkkiotehtävän valitsemista ja
  lunastamista pelissä sekä odotusaikoja vuorokauden vaihteen yli ei ole vielä kokeiltu. Oikeat
  Escalation-tallennukset on rakennettu (Harmonicin 1.4.4-forkista), mutta ne ovat oletuksena pois
  päältä, koska käyttöönotto pudottaa jokaisen pelaajan tekaistusta maksimista tasolle 0; siihen asti
  Escalationille on vain tynkä (paikanpitäjä, joka ei oikeasti tallenna mitään), eikä sen eteneminen
  siirry pelikerrasta toiseen ([Escalation]({{ '/fi/findings/escalation.html' | relative_url }})).
- **Kauppa.** Ilmainen kauppa (jokainen tarjous maksaa nolla, Harmonicin forkista) on rakennettu, mutta
  se on pois päältä, kunnes omistaja päättää, pysyykö se ilmaisena, ja sitä on kokeiltu pelissä
  ([Pelin kauppa]({{ '/fi/findings/store.html' | relative_url }})).
- **Useat varustesarjat, tervetuloviesti ja postilaatikko sekä kausitapahtumat.** Oikean
  etenemisen kanssa varustesarjojen paikkojen avaukset tallentuvat, mutta lisäpaikkoja ei ole vielä
  kokeiltu pelissä.

[Tiekartassa]({{ roadmap_page.url | relative_url }}) on järjestys, jossa aiomme edetä, sekä oikeissa
pelikerroissa nähdyt virheet. Kaikki ei voi palata. Äänichat toimi Vivoxilla, joka on maksullinen
ulkopuolinen palvelu, joten käytä sen sijaan [Dauntless Revived Discordia](https://discord.gg/ZJRprHzsgu). Marraskuun 2020 jälkeen julkaistu sisältö ei
ole versiossa 1.4.4.

---

## Kenelle tämä on {#who-this-is-for}

- **Omistajalle ja muutamalle kutsutulle kaverille.** Tämä on pieni yksityinen porukka, ei julkinen
  palvelu.
- **Niille, joilla on 1.4.4-peliohjelma ja jotka haluavat pyörittää samaa omalle porukalleen.**
  [Asennus]({{ setup_page.url | relative_url }})-osio kertoo isännän (palvelimen pyörittäjän) puolen,
  kavereiden puolen ja sen, miten tarkistat, että pelikopiosi on aito ja muuttamaton.
- **Kaikille, joita kiinnostaa, miten Dauntlessin verkkopuoli toimi.**
  [Löydökset]({{ findings_page.url | relative_url }})-osioon on kirjattu taustapalvelun rajapinta (eli
  se, millaisia viestejä peli ja palvelin vaihtavat), miten Undauntedin palvelintilan DLL toimii ja
  mitä opimme 2.1.1-peliohjelmasta. Kerromme, mistä versiosta kukin tieto on peräisin, ja merkitsemme
  kaiken varmistamattoman.
- **Palvelimen ylläpitäjille ja kehittäjille, jotka tarvitsevat tarkat tiedot.**
  [Tekninen viite]({{ reference_page.url | relative_url }}) -osiossa on jokainen asetus, portti,
  HTTP-reitti, tiedosto ja skripti oletusarvoineen ja tieto siitä, kuka sen asettaa. Kaikki on
  tarkistettu koodia vasten.

---

## Miten osat sopivat yhteen (1.4.4) {#how-it-fits-together-144}

| Osa | Mikä se on | Missä se pyörii |
|---|---|---|
| Peliohjelma (client) | Muokkaamaton Dauntless 1.4.4 -ohjelmatiedosto ja sen viereen laitetut kaksi Undauntedin DLL-tiedostoa: `dxgi.dll`-välittäjä (proxy), joka lataa `UndauntedInternalServer.dll`-tiedoston. Se ohjaa peliohjelman taustapalvelukutsut metagameen tavallisena HTTP-liikenteenä | Jokaisen pelaajan tietokone |
| Metagame | Undauntedin TypeScriptillä kirjoitettu taustapalvelu: tilit, hahmot, tavarat, varustesarjat ja pelaajien yhteen sovittaminen (matchmaking) | Palvelinkone, TCP 61000 |
| Deploy-palvelin | Käynnistää pelipalvelinprosessit ja valvoo niitä | Palvelinkone, TCP 61001, vain koneen sisäinen osoite eli loopback (siinä ei ole tunnistautumista) |
| Pelipalvelimet | Lisää kopioita samasta peliohjelmasta, jotka DLL kääntää palvelintilaan: yksi pysyvä Ramsgate-palvelin ja lisäksi yksi jokaista metsästystä varten | Palvelinkone, UDP 8770–8777 |

Windows-palvelinpaketilla asennettu palvelin ajaa lisäksi sisältöpalvelinta käynnistimen latauksia
varten ja julkisessa tilassa salattua yhdyskäytävää, joka on sen ainoa julkinen portti. Jokainen osa
on kuvattu [Tekninen viite]({{ reference_page.url | relative_url }}) -osiossa.

Muutoksemme Undauntediin alkoivat pieninä ja käytännöllisinä. Molemmat palvelut kuuntelevat nyt
oletuksena vain koneen sisäisessä osoitteessa. Päällekkäinen portti on nyt selvä virhe, kun se ennen
johti hiljaiseen sulkeutumiseen. Jokainen pyyntö kirjataan lokiin. Training Dojo (harjoitussali)
käynnistyy vain silloin, kun sitä tarvitaan. Eteneminen on oletuksena oikeaa, kun taas alkuperäinen
projekti vastasi kiinteällä mallilla eikä tallentanut mitään. Tallennukset ovat turvallisempia:
toistettu tavaratapahtuma tehdään vain kerran, ja tallennusten historiasta voi palata aiempaan
versioon. Sen jälkeen olemme lisänneet käyttäjänimet ja kutsukoodit, oikeuksien tarkistuksen jokaiseen
reittiin, palvelimen puolen ryhmät, kaverilistan ja killat, sisältöpalvelimen, julkisen tilan yhdyskäytävän,
Undauntedin käynnistimen pohjalta tehdyn kaverikäynnistimen ja Windows-palvelinpaketin.
Käynnistimessä, pelin tervetulotekstissä ja palvelimen viesteissä lukee Dauntless Revived; kansiot,
palvelin-DLL:n tiedostonimi, rajapinnan reitit ja otsakkeet pitävät toistaiseksi Undaunted-nimet.
[README]({{ site.github.repository_url }}/blob/dauntless-revived/README.fi.md#muutokset-alkuperäiseen-undauntediin)
luettelee jokaisen muutoksen, ja [tiekartta]({{ roadmap_page.url | relative_url }}) kertoo, mitä on
tulossa.

---

## Miten tähän päädyttiin {#how-we-got-here}

Aloitimme pelin viimeisestä versiosta **2.1.1** ja kirjoitimme oman taustapalvelun alusta asti. Sen
työn tuloksena selvisi, että peli keskustelee Phoenix Labsin oman REST-rajapinnan kanssa
`steelyard.ca`-palvelimilla (eikä PlayFabin, kuten yhteisön aiemmissa muistiinpanoissa oletettiin).
Saimme ratkaistua koko 2.1.1:n kirjautumisketjun. Kun syötimme peliin omia käyttäjäasetuksia, saimme
jopa Ramsgaten näkymään ruudulla. Ohjattavaa pelaajahahmoa kaupunkiin emme kuitenkaan koskaan
saaneet.

**Korjaus.** Päättelimme ensin, että moninpeli on mahdotonta, koska molemmat kaupalliset versiot
(2.1.1 ja 1.4.4) ovat pelkkiä peliohjelmia: `UWorld::Listen` on korvattu tyhjällä tyngällä, ja
verkkotila on pakotettu asentoon ”client”. Tuo päätelmä oli **väärä**. Vain sisäänkäynti on
poistettu. Sen alla oleva verkkokerros (`UIpNetDriver::InitListen` sekä palvelinpuolen liittymis- ja
kirjautumiskäsittelijät) on ehjä. Peliin ladattu DLL voi ohjata sitä, ja juuri niin Undaunted
pyörittää moninpelin Ramsgatea ja metsästyksiä 1.4.4-peliohjelmalla. Kun ymmärsimme tämän, siirryimme
versioon 1.4.4 ja teimme Undauntedista oman muokatun version (forkin).

---

## Kiitokset {#credits}

Tämä hanke rakentuu gwogin (Gregory Morford) ja muiden tekijöiden **Undauntedin** varaan. Palvelintilan
DLL, deploy-palvelin, metagame ja käynnistin ovat heidän tekemiään. Muokattu versiomme on edelleen
AGPL-3.0-only-lisenssin alainen, ja sen koko lähdekoodi on [tämän sivuston repositoriossa]({{ site.github.repository_url }}).
Sivulta [Kiitokset ja lisenssi]({{ legal_page.url | relative_url }}) löydät kaikki kiitokset, sen, mitä
AGPL vaatii jokaiselta, joka pyörittää muokattua versiota, sekä huomiot tavaramerkeistä ja
pelitiedostoista.
