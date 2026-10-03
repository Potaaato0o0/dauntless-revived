---
title: Tiekartta
parent: Dauntless Revived suomeksi
nav_order: 5
description: "Dauntless Revivedin tiekartta selkokielellä: tavoite, välitavoitteet M0–M4, mitä on jo tehty ja mitä on työn alla. Päivittyvä lista on englanniksi."
lang: fi
ref: roadmap
locale: fi_FI
---

{% assign roadmap_en = site.pages | where: "path", "roadmap.md" | first %}
{% assign friends_page = site.pages | where: "path", "fi/setup/friends.md" | first %}

# Tiekartta
{: .no_toc }

Tällä sivulla kerrotaan tavallisin sanoin, mihin Dauntless Revived on menossa ja mitä on jo tehty.
Tämä on suomenkielinen yhteenveto. Tarkka tarkistuslista, jota päivitetään sitä mukaa kuin työ etenee,
on englanniksi:

[Avaa päivittyvä tarkistuslista (englanniksi)]({{ roadmap_en.url | relative_url }}){: .btn .btn-primary .mr-2 }
[ROADMAP.md GitHubissa]({{ site.github.repository_url }}/blob/dauntless-revived/ROADMAP.md){: .btn }

Yhteenveto kuvaa tilannetta 23.9.2026. Jos tämä sivu ja englanninkielinen lista eroavat toisistaan,
englanninkielinen lista on ajan tasalla.

<details open markdown="block">
  <summary>Sisältö</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Tavoite {#goal}

Tavoite on yksinkertainen: **pieni kaveriporukka pelaa yhdessä tällä palvelimella, ja kaikki, mitä
he pelissä ansaitsevat, säilyy.**

Työjärjestys on sovittu näin: kaverit kutsutaan mukaan vasta, kun välitavoite M2 (kaikki ansaittu
tallentuu) on valmis. Silloin jo heidän ensimmäinen metsästyksensä lasketaan. Siksi turvaverkon (M0)
jälkeen rakennetaan ensin M2. Sen voi rakentaa ja testata omistaja yksin. Ryhmät (parties)
rakennetaan M2:n rinnalla, ja niitä testataan toisella tilillä ja toisella peli-ikkunalla samalla
koneella. Muu yhdessä pelaamiseen tarvittava (M1) valmistellaan samaan aikaan. Ensimmäinen yhteinen
peli-ilta odottaa, kunnes M2 on valmis.

Tilanne 22.9.2026: M2:sta oikea eteneminen on valmis ja oletuksena päällä. Ensimmäinen oikea testi
vuokratulla palvelimella julkisessa tilassa (ei Tailscalen kautta) onnistui 22.9.2026 yhdellä
pelaajalla, ja seuraavaksi on vuorossa kahden pelaajan testi kaverin kanssa. Suorituskyvyn
mittaamisen (4.12) on tarkoitus ottaa ensimmäiset mittauksensa ensimmäisissä kaveritesteissä.
Nimenvaihdon toinen osa (4.15) tehdään ensimmäisen kaveritestin jälkeen. PostgreSQL (4.14) tarvitaan
ennen mitään julkista julkaisua, ei kaveripalvelinta varten.

---

## Missä mennään nyt {#where-we-are}

**Harmonicin 1.4.4-forkin siirto (23.9.2026).** Harmonic ylläpitää toista Undaunted-haaraa
versiolle 1.4.4 ([github.com/Harmonicrain/Undaunted](https://github.com/Harmonicrain/Undaunted),
AGPL-3.0). Vertasimme sitä omaamme ominaisuus kerrallaan ja otimme sen, mikä toi jotain uutta, lukuun
ottamatta muutamaa syineen pois jätettyä alustan kohtaa (DLL-puolen kohdat, palvelintilan koukku ja
`METAGAME_ADDRESS` sekä HuntDiag, odottavat päätöstä itse käännetyn DLL:n jakamisesta; deploy-palvelimen
porttiodotus ja pelipalvelimen lokitiedostot jätettiin pois); siellä, missä meillä oli jo pelissä
kokeiltu ratkaisu, pidimme omamme, ja jokaisen valinnan syy on
kirjattu sivulle [Harmonicin työn siirto]({{ '/fi/findings/harmonic-fork.html' | relative_url }}).

- **Rakennettu, oletuksena pois päältä** (odottaa päätöstä tai pelitestiä): oikeat
  Escalation-tallennukset (kohta 2.16; käyttöönotto pudottaa kaikki tekaistusta maksimista tasolle 0),
  ilmainen pelin kauppa (kohta 3.7; odottaa päätöstä, pysyykö kauppa ilmaisena), kavereiden paikalla
  olo chat-palvelimessa (kohta 3.10) ja Elite-tasojen oikeudet tason vahvistuksessa.
- **Rakennettu, oletuksena päällä:** Slayer Links (kohta 3.15; pois asetuksella `SLAYER_LINKS=0`),
  kaatuneen Ramsgaten uudelleenkäynnistys, kun pelaaja matkustaa sinne (`PERSISTENT_WORLD_LIVENESS=0`),
  ja kahdesti saapuva ryhmäkutsun hyväksyntä (ei kytkintä); nämä vastaavat vain siellä, missä ennen tuli
  virhe tai 404. Lisäksi kolme muutosta vastauksiin, jotka jo toimivat: `/balance` hahmon oikeista
  valuutoista (kohta 2.17; `BALANCE_FROM_INVENTORY=0`), istunnon tarkistus, joka nimeää pelaajan oman
  tilin (`VERIFY_STUB_ACCOUNT=1` palauttaa vanhan vastauksen), ja suoja toistettuja XP-myöntöjä
  vastaan, joka muuttaa vain alle 5 sekunnin kuluttua tavu tavulta samana toistuvan myönnön
  (`PROGRESSION_REPLAY_WINDOW_S=0`).
- Kolme uutta tietokantamuutosta lisää vain tauluja, ja edellinen versio käynnistyy yhä muutetulla
  tietokannalla. Harmonicin 119 testitapauksesta 103 siirrettiin ja 7 käännettiin väittämään meidän
  toimintaamme. Palvelin-DLL kääntyy nyt asennetuilla Build Toolseilla (kohta 4.4), mutta täällä
  käännettyä DLL:ää ei jaeta.
- **Ei vielä viety palvelimelle eikä kokeiltu pelissä.** Harmonic mainitaan kiitoksissa ja
  tiedostossa `NOTICE.md`.

Itse peliä on toistaiseksi pelannut yksi pelaaja, omistaja: ensin omalla koneellaan ja 22.9.2026
myös internetin yli vuokratulla palvelimella. Nämä toimivat:
kirjautuminen, opetusjakso, Ramsgate (pelin keskuskaupunki), Training Dojo (harjoitussali), oikeat
metsästykset, esineiden valmistus (crafting), tavarat ja käytössä oleva varustesarja.

**Palvelin vuokratulla koneella (21.–22.9.2026).** Windows-palvelinpaketti asennettiin oikealle
vuokratulle Windows Server 2019 -virtuaalipalvelimelle julkiseen tilaan. Palvelimella on tarkistettu:
palvelinkokonaisuus käynnistyy koneen käynnistyessä palvelutilillä (istunnossa 0 eli ilman
työpöytää), Ramsgate pyörii ja lähettää elonmerkkejä (heartbeat), yhdyskäytävä vastaa internetistä
kiinnitetyllä varmenteella, ja tunnin välein ajettava varmuuskopiotehtävä toimii. Oikea palvelin
paljasti kolme asiaa, joita hiekkalaatikkotestit eivät voineet löytää, ja ne kaikki on korjattu
paketissa:

- Windows sallii paikallisen käyttäjätilin kuvaukseen enintään 48 merkkiä.
- Se levykuva ei hyväksy ilman tallennettua salasanaa ajettavia ajastettuja tehtäviä (”S4U”) muille
  kuin ylläpitäjille, joten palvelutilin tehtävät käyttävät nyt tallennettua satunnaista salasanaa.
- Palveluntarjoajan levykuva piti Windowsin palomuurin pois päältä käytäntöarvoilla (`EnableFirewall=0`
  avaimen `HKLM\SOFTWARE\Policies\Microsoft\WindowsFirewall` alla). Asennusohjelma poistaa ne nyt ja
  tarkistaa, mikä palomuuriasetus oikeasti on voimassa; muutos vaatii uudelleenkäynnistyksen.

**Kaverikäynnistin 0.1.0 on julkaistu.** CI julkaisi sen GitHubin julkaisuihin (ensimmäinen
automaattinen julkaisu) `SHA256SUMS.txt`-tiedoston ja käännöksen alkuperätodistuksen (build provenance
attestation) kanssa. Asennetut käynnistimet päivittyvät `launcher-updates`-kanavasta. Käynnistintä ei
ole vielä allekirjoitettu. Versio 0.1.1 julkaistiin samana yönä (katso alla).

**Ensimmäinen oikea testi 22.9.2026: yksi pelaaja internetin yli.** Omistaja pelasi vuokratulla
palvelimella julkisessa tilassa käynnistimen versiolla 0.1.0, jonka hän latasi GitHubin julkaisuista.

- Windowsin SmartScreen esti omistajan koneella allekirjoittamattoman asennusohjelman kokonaan:
  tarjolla oli vain ”Älä suorita”, ei ”Suorita silti”. Tiedoston SHA-256-tiivisteen tarkistus
  `SHA256SUMS.txt`-tiedostoa vasten ja eston poistaminen (Ominaisuudet > Poista esto, tai
  `Unblock-File`) toimivat.
- Koko polku toimi: kutsu, rekisteröityminen omalla käyttäjänimellä, pelin lataus (noin 11 Gt)
  palvelimelta yhdyskäytävän kautta, opetussaari (sen pelipalvelin käynnistyi tarvittaessa),
  Ramsgate, Training Dojo (käynnistyi tarvittaessa) ja ensimmäinen metsästys (uuden pelaajan
  takaa-ajo eli pursuit).
- Eteneminen: Slayer-taso 3, aseen mestaruus ja hirviön mestaruus (taso 2), joka nähtiin nyt
  ensimmäistä kertaa pelissä. Pelipalvelin vahvisti tasopalkinnot.
- Kolme pelipalvelinta pyöri yhtä aikaa. Peliporttien sallittujen lista avasi UDP-portit pelaajalle ja
  sulki ne, kun hän lähti.
- Koko pelikerran aikana, metsästyksen loppu mukaan lukien, lokiin ei tullut yhtään ”Allowing
  overspend” -varoitusta (metagame kirjaa sen, kun tavarapyyntö poistaa enemmän kuin pelaajalla on).
  Useita tallennusten versioristiriitoja torjuttiin suunnitellusti (vanhempia tai kahdentuneita koko
  tilannekuvan tallennuksia), ja uusin tallennus säilyi.
- Käynnistimen 0.1.0 kirjoittama rivi `r.EyeAdaptationQuality=0` teki Ramsgatesta ja yökohtauksista
  aivan liian pimeitä. CI julkaisi samana yönä version 0.1.1, joka ei enää kirjoita riviä ja poistaa
  vanhan rivin seuraavalla käynnistyskerralla. Omistaja vahvisti, että Ramsgate näyttää 0.1.1:llä
  normaalilta. Pimeä ilmalaiva ennen metsästystä palasi: se on tunnettu ja lyhyt kohtaus, ja
  kunnollinen korjaus on kohta 4.17.
- **Ei vielä varmistettu:** toinen oikea pelaaja (hänen kutsunsa on jo annettu), kaksi pelaajaa
  Ramsgatessa, ryhmä ja yhteinen metsästys internetin yli. Tekstichat oli vielä rakentamatta, ja
  kavereiden näkyminen paikalla vaatii chat-yhteyden läsnäolotiedot.

**Ryhmät, kaverit ja killat on rakennettu palvelimen puolelle:** ryhmäkutsut, hyväksyminen ja
hylkääminen, johtajaksi nostaminen, poistaminen ja lähteminen, koko ryhmä samalle
metsästyspalvelimelle, yhdessä takaisin Ramsgateen, pelaajan haku nimellä, SQLiteen tallentuva
kaverilista ja estolista sekä killat (kohta 3.11: perustaminen Ramsgaten pelipalvelimen kautta,
kutsut, arvot, erottaminen, lähteminen ja lakkauttaminen, tallennettuina SQLiteen). Ne läpäisevät
testit, jotka toistavat peliohjelman omat pyynnöt, mutta niitä ei ole vielä kokeiltu kahdella oikealla
peliohjelmalla. Ryhmään voi kutsua, vaikka ette olisi kavereita. Kavereiden näkyminen paikalla vaatii
chat-yhteyden läsnäolotiedot; ne on rakennettu 23.9.2026, mutta ne ovat pois päältä (katso alta).
Tekstichat on rakennettu (katso alta).

**Kahden pelaajan testi 22.9.2026:** kaksi pelaajaa näki toisensa Ramsgatessa ja päätyi samaan
metsästyksen aulaan, mutta metsästys ei lähtenyt liikkeelle. Metagame oli merkinnyt yhden pelaajan
kahdesti odotettujen pelaajien joukkoon, joten metsästyspalvelin odotti kolmatta pelaajaa ja
ilmalaivan lähtölaskenta jäätyi. Korjaus (jokainen pelaaja jonossa vain kerran) on nyt
palvelimella. Kaverihaku ja ryhmäkutsut eivät näkyneet pelissä; syyt on sittemmin jäljitetty
(katso seuraava kappale). Aulasta poistuttuaan molemmat jonottivat samaan
metsästykseen noin kahden sekunnin sisällä ilman ryhmää: pelaajia odotettiin tasan kaksi, ja **he
metsästivät yhdessä internetin yli**, ensimmäistä kertaa vuokrapalvelimella.

**Miksi ryhmäkutsu ja kaveripyyntö eivät näkyneet (jäljitetty 22.9.2026):** ryhmäkutsu tuli toisen
pelaajan peliohjelmaan, mutta peliohjelma pudottaa kutsun, jonka lähettäjää se ei saa näkyviin, ja
reitin `POST /accountinfo/public` vastaus (alkuperäisen projektin) kuvasi **kysyjää** eikä lähettäjää.
Kaverin lisääminen pysähtyi reitille `POST /account/mapping`, jonka vastauksen peliohjelma lukee
oliona, jonka avaimina ovat kysytyt tunnukset (lähettämämme taulukko luettiin tyhjäksi). Tämä korjaa
aiemman tiedon, jonka mukaan kumpikin pysähtyi reitille `/account/mapping`. Molemmat on korjattu
ja **viety vuokratulle palvelimelle 22.9.2026** (60955e1), pelissä ei vielä kokeiltu; kummankin pelaajan on käynnistettävä peli kerran
uudelleen päivityksen jälkeen. Yksityiskohdat ovat sivulla
[Kaverit, ryhmät ja killat]({{ '/fi/findings/social.html' | relative_url }}).

**Omistajan toive 22.9.2026:** pelaajat näkyviin paikalla (online) pelissä. Nyt Sosiaalinen-paneeli
näyttää kaikki, myös sinut itsesi, tilassa "Offline". Se tarvitsee pienen läsnäolopalvelimen (XMPP,
kohta 3.10), ja se on seuraavana vuorossa, kun ryhmät ja kaverit toimivat. Ennen kuin mikään
kuuntelee portissa, peliohjelman XMPP-kirjautuminen (se lähettää tilin tunnisteen ja
kirjautumistunnisteemme) sekä huoneisiin liittymisen ja läsnäolon viestit tallennetaan kahdella
testitilillä testiportissa (esimerkiksi 62099, kuten palvelinpaketin hiekkalaatikossa). Palvelun on
tarkistettava jokainen yhteys tunnisteillamme. Julkisessa tilassa portti 61099 pysyy vain koneen
sisäisenä yhdyskäytävän takana; yksityisessä tilassa se avataan Tailscale-laitteille vasta, kun
palvelu tarkistaa kirjautumiset. (Tämän nosti esiin Vvoidddd,
[PR #6](https://github.com/mixutin/dauntless-revived/pull/6).)

**Tekstichat on rakennettu, oletuksena pois päältä (kohta 3.10, 22.9.2026).** Vvoidddd kirjoitti
ensimmäisen chat-palvelimen ([PR #9](https://github.com/mixutin/dauntless-revived/pull/9)) ja testasi
sitä oikealla 1.4.4-pelillä: Ramsgaten viestit menivät perille, mutta lähettäjänä näkyi tilitunnus
`UID-...`. Ohjelmatiedostosta luettu syy: peliohjelma liittyy jokaiseen huoneeseen nimimerkillä, jossa
käyttäjänimi jo on (`<nimi>:<tilitunnus>:<resurssi>`), ja lukee nimen siitä takaisin, mutta palvelin
heitti nimimerkin pois. Nyt chat-palvelin pitää jokaisen nimimerkin sellaisenaan, kertoo huoneessa
olijoille toisistaan ja lähettää jokaisen rivin myös lähettäjälleen, joten molemmat pelaajat näkevät
käyttäjänimet.

- Chat toimii metagamen sisällä (`CHAT=1`, palvelinpaketissa `Set-Chat.ps1 -On`) osoitteessa
  `127.0.0.1:61099`, jonne yhdyskäytävä jo välittää yhteyden: palomuurisääntöä tai uutta käynnistintä
  ei tarvita.
- Huoneisiin liittyminen tarkistetaan pelaajan omaa tiliä vasten, joten kukaan ei voi esiintyä
  toisena. Ryhmä- ja kiltahuoneet ovat vain jäsenille, ja estot koskevat huonerivejä ja kuiskauksia.
- Palvelin ei lähetä läsnäolotietoja huoneiden ulkopuolella, joten peliohjelman automaattinen
  ryhmäpotku pysyy lepotilassa.
- **Kavereiden paikalla olo on rakennettu 23.9.2026, oletuksena päällä 30.9.2026 alkaen** (`CHAT_PRESENCE=1`
  yhdessä asetuksen `CHAT=1` kanssa). Pelaajan oma läsnäolotieto välitetään hänen hyväksytyille,
  estämättömille kavereilleen, ja poistuminen kerrotaan heille. Palvelin ei koskaan lähetä pelaajalle
  huoneen ulkopuolista viestiä hänen omalta tililtään, ei edes hänen toisesta istunnostaan, joten
  ryhmäpotku pysyy unessa. Kahden pelaajan ryhmä- ja metsästystesti tarvitaan edelleen.
  `CHAT_PRESENCE=0` palauttaa aiemman toiminnan; pelaajan ei tarvitse muuttaa tilaansa käsin.
- Kun pelaajan yhteys katkeaa ja peli yhdistää uudelleen, uusi yhteys ottaa huoneet vanhalta, joten
  muut näkevät pelaajan nimen edelleen. Pingit sallivat pitkän kartan latauksen.
- **Ei vielä viety palvelimelle eikä kokeiltu kahdella pelaajalla.** Seuraavaksi, kun kukaan ei pelaa:
  vuokrattu palvelin päivitetään (se ajaa versiota 9f3f78b, jossa ei vielä ole `Set-Chat.ps1`:tä),
  chat kytketään päälle toisella ajolla, ja tehdään kahden pelaajan testi
  ([Näin se tarkistetaan]({{ '/fi/findings/chat.html' | relative_url }}#how-to-verify)). Sen jälkeen:
  yhteinen Ramsgate-kanava ryhmättömille pelaajille, kavereiden näkyminen paikalla ja yksityinen tila.
  Yksityiskohdat ovat sivulla [Tekstichat]({{ '/fi/findings/chat.html' | relative_url }}).

Käynnissä olevien pelaajien lista näytetään vain rekisteröityneille pelaajille, eikä
`/dauntless-status` enää kerro pelaajamäärää. Käynnistimessä, pelin tervetulotekstissä ja palvelimen
viesteissä lukee nyt Dauntless Revived, ja kiitoksissa mainitaan Undaunted (nimenvaihdon ensimmäinen
osa); kansiot, palvelin-DLL:n tiedostonimi (`UndauntedInternalServer.dll`), rajapinnan reitit ja
otsakkeet pitävät toistaiseksi Undaunted-nimet.

Osa pelissä ansaitusta tallentuu jo, osa ei:

- **Tallentuu:** tavarat, materiaalit, Ramsit (pelin raha), valmistetut varusteet, tehtävät ja tarinan
  eteneminen. Oikean etenemisen myötä, joka on nyt oletuksena päällä, tallentuvat myös Slayer-taso,
  aseiden ja hirviöiden mestaruus (mastery) ja Hunt Pass (Elite-passi kaikille). Se läpäisi
  pelitestin kertakäyttöisellä testitilillä, myös uudelleenkäynnistyksen yli, ja 22.9.2026
  vuokratulla palvelimella nähtiin pelissä ensimmäistä kertaa myös hirviön mestaruus.
- **Tallentuu, mutta ei vielä kokeiltu kokonaan pelissä:** palkkiotehtävät (bounties), päivittäiset
  ajastimet ja lisävarustesarjojen paikat.
- **Ei vielä tallennu:** Escalation. Sille on toistaiseksi vain tynkä, joka heittää jokaisen
  tallennuksen pois. Oikeat tallennukset on rakennettu (kohta 2.16), mutta ne ovat pois päältä, kunnes
  ne on kokeiltu pelissä ja pelaajille on kerrottu, että kaikki aloittavat tasolta 0.

---

## Mitä on jo tehty {#done-so-far}

- Peliversio 1.4.4 on tarkistettu: kaikki 406 tiedostoa vastaavat Phoenix Labsin omaa
  tiedostoluetteloa, ohjelmatiedostoja ei ole muutettu, ja haittaohjelmatarkistus oli puhdas.
- Peli on asennettu, ja palvelimen valmiit DLL-tiedostot tarkistetaan tiivisteillä (tiedostojen
  sormenjäljillä) ennen käyttöä.
- Koko palvelinkokonaisuus pyörii omistajan koneella: metagame (tilit ja hahmot), deploy-palvelin
  (käynnistää pelipalvelimet) ja pelipalvelimet.
- Kirjautuminen omalla tilillä toimii ilman Epic-tiliä.
- Opetusjakso ja sen jälkeen Ramsgate toimivat omalla palvelimella.
- Paras grafiikka (Cinematic-taso, täysi resoluutio, terävöinti) asetetaan käynnistimessä
  automaattisesti.
- Korjauksia Undauntediin: palvelut kuuntelevat oletuksena vain omalla koneella, päällekkäinen portti
  on nyt selvä virhe eikä hiljainen sulkeutuminen, jokainen pyyntö kirjataan lokiin, ja Training Dojo
  käynnistyy vain tarvittaessa.
- Muokattu versio on tallennettu ja julkaistu [repositorioon]({{ site.github.repository_url }}).
- Ensimmäiset metsästykset on pelattu omalla palvelimella: opetusjakson takaa-ajo (pursuit), Lesser
  Boreus -metsästys ja toinen takaa-ajo. Saaliit tallentuivat: esimerkiksi Ramsit nousivat
  1 260:stä 1 460:een, ja 20 kappaletta `ORB_FROST`-materiaalia saapui.
- Jokaisen pelin järjestelmän tallentuminen on käyty läpi ja tarkistettu oikeasta tietokannasta ja
  pyyntölokista.
- **Automaattiset varmuuskopiot (0.1):** tietokannasta otetaan kopio tunnin välein sekä jokaisen
  käynnistyksen ja pysäytyksen yhteydessä, ja palautustesti onnistui. Kopioita koneen ulkopuolelle ei
  vielä ole.
- **Uudelleenkäynnistystesti (0.3):** tietokannan kaikki 12 taulua olivat täsmälleen samat ennen koko
  palvelinkokonaisuuden uudelleenkäynnistystä ja sen jälkeen, ja peli latasi hahmon ja tavarat
  normaalisti.
- **Epicin chat-palvelimen esto (0.5):** peli ei enää ota yhteyttä Epicin vanhaan chat-palvelimeen.
  90 sekuntia käynnistyksen jälkeen koneen ulkopuolelle ei ollut yhtään yhteyttä.
- Tämä dokumentaatiosivusto on julkaistu.
- **Oikea eteneminen (M2) on valmis ja oletuksena päällä:** Slayer-taso, mestaruus ja Hunt Pass
  (Elite-passi kaikille) tallentuvat. Se läpäisi pelitestin kertakäyttöisellä testitilillä, myös koko
  palvelinkokonaisuuden uudelleenkäynnistyksen yli.
- **Windows-palvelinpaketti pyörii oikealla vuokratulla palvelimella** julkisessa tilassa
  (21.–22.9.2026), ja palvelimella tarkistetut asiat on lueteltu yllä.
- **Kaverikäynnistin 0.1.0** on julkaistu GitHubin julkaisuihin CI:n ensimmäisenä automaattisena
  julkaisuna, ja asennetut käynnistimet päivittävät itsensä. Versio 0.1.1 seurasi 22.9.2026.
  Seuraavassa versiossa pelaaja, jolla peli jo on, voi liittää `BaseGame144`-kansionsa polun tai
  selata siihen, ja käynnistin käyttää peliä siinä kansiossa, jossa se on, ja lataa vain puuttuvat
  tai vioittuneet tiedostot (Vvoidddd, [PR #8](https://github.com/mixutin/dauntless-revived/pull/8)).
- **Ensimmäinen oikea testi yhdellä pelaajalla (22.9.2026):** omistaja kulki vuokratulla
  palvelimella internetin yli käynnistimen latauksesta ja kutsusta pelin lataukseen, opetusjaksoon,
  Ramsgateen, Training Dojoon ja ensimmäiseen metsästykseen. Yksityiskohdat ovat yllä.
- **CI** tarkistaa jokaisen muutoksen: jokaisen paketin käännöksen ja testit, palvelinpaketin testit,
  ohjesivuston käännöksen ja sen, ettei projektiin ole lisätty salaisuuksia, avaimia, tietokantoja tai
  pelitiedostoja.
- **Nimenvaihdon ensimmäinen osa:** käynnistimessä, pelin tervetulotekstissä ja palvelimen viesteissä
  lukee Dauntless Revived.
- **Harmonicin 1.4.4-forkin siirto (23.9.2026):** Escalation, ilmainen kauppa, Slayer Links,
  kavereiden paikalla olo, deploy-palvelimen korjaukset ja pienemmät korjaukset on rakennettu ja
  testattu ilman peliä (katso yllä). Pelissä niitä ei ole vielä kokeiltu.

## Työn alla {#in-progress}

- **Kaverit, ryhmät ja killat (1.9, 1.11, 3.11)** on rakennettu, testattu ilman peliä ja viety vuokratulle palvelimelle 22.9.2026, mutta pelissä niitä ei ole vielä kokeiltu. Seuraavassa kahden pelaajan testissä katsotaan, näkyykö ryhmäkutsu
  kohdassa PARTY INVITES, tuleeko kaveripyyntö perille toisen pelaajan seuraavalla kirjautumisella ja
  toimiiko killan perustaminen Ramsgatessa. Kilta perustetaan vain, jos johtaja on itse tarkistanut
  juuri sen nimen ja nimikyltin (pelipalvelin ei välitä pelaajan tunnistetta), henkilökunnan sanat ovat
  varattuja, ja kutsuilla on omat sääntönsä: esto poistaa kahden pelaajan väliset kutsut, ja hylkäyksen
  jälkeen on tauko. Testin vaiheet ja odotetut lokirivit ovat löydössivun Kaverit, ryhmät ja killat
  kohdassa Näin se tarkistetaan.
- **Kahden pelaajan testi (1.15)** on seuraavana vuorossa vuokratulla palvelimella julkisessa
  tilassa, ja kaverin kutsu on jo annettu. Siinä kokeillaan ensimmäistä kertaa kahta pelaajaa
  Ramsgatessa, ryhmiä (1.9), yhteistä metsästystä internetin yli ja sitä, että kummankin pelaajan
  tallennukset menevät omalle tilille (1.12).
- **Käyttäjänimet ja kutsukoodit (1.5, 1.6)** on rakennettu: nimessä on 3–16 kirjainta, numeroa tai
  alaviivaa, nimi on yksilöllinen isoista ja pienistä kirjaimista riippumatta, ja ylläpitäjä voi
  vaihtaa nimen. Windows-palvelinpaketti vaatii kutsukoodin, ja omistaja rekisteröityi kutsulla.
  Uuden nimen näkymistä pelissä ei ole vielä kokeiltu.
- **Pelaajien siirto oikeaan etenemiseen (2.13).** Mitään ei siirretä automaattisesti: palvelimella,
  jolla oli jo pelaajia, he aloittavat Slayer-tasolta 1, ellei ylläpitäjä anna heille maksimitasoja
  tai valitse vanhaa tynkää (`PROGRESSION_MODE=stub`). Omalla palvelimellamme kaikki aloittavat
  alusta: omistaja on rekisteröinyt uuden tilinsä käynnistimellä vuokratulle palvelimelle ja pelannut
  sillä Slayer-tasolta 1 tasolle 3.
  Tynkäaikana pelanneen tilin siirtoa tasolle 1 ei ole vielä kokeiltu pelissä.
- **Pelin lähettämien tietojen tallennus (0.4)** on kytketty päälle omistajan koneella. Se kerää
  seuraavalla pelikerralla, millaisia tallennuksia peli lähettää niille järjestelmille, jotka eivät
  vielä tallenna mitään. Näin tallennukset voidaan rakentaa oikeassa muodossa eikä arvailemalla.
  Windows-palvelinpaketti pitää tallennuksen pois päältä julkisessa tilassa, joten vuokrattu palvelin
  ei tallenna pelaajien lähettämää sisältöä.
- **Kaveripaketti (1.14)** on koottu: se tarkistaa tiedostot, asentaa DLL-tiedostot, rekisteröi
  kaverin ja käynnistää pelin. Se on vain Tailscalea käyttävä varavaihtoehto käynnistimelle. Sitä on
  testattu koepalvelinta vasten, mutta oikea kaveri ei ole vielä kokeillut sitä. Sivulla
  [Liity kaverina]({{ friends_page.url | relative_url }}) kerrotaan, mitä paketti tekee.
- **Yhden komennon käynnistys, pysäytys ja tilannekatsaus** (`stack.ps1`) toimii omistajan koneella,
  ja Windows-palvelinpaketin `Stack.ps1` tekee saman vuokratulla palvelimella: se käynnistää kaiken
  koneen käynnistyessä ja käynnistää kaatuneen osan uudelleen.
- **Pelitestit Harmonicin siirrolle:** kaatuneen Ramsgaten uudelleenkäynnistys pelaajan matkalla,
  Escalation (2.16), kauppa (3.7), Elite-tasojen oikeudet, Claim, Slayer Links kahdella kaverilla
  (3.15), kavereiden paikalla olo kahdella pelaajalla (3.10) ja yli 30 minuutin istunto uudella
  istunnon tarkistuksella.
- **Omistajan päätökset:** pysyykö kauppa ilmaisena vai saako se hinnat pelin valuutassa,
  myydäänkö rajattomasti premium-palkkiotehtävätunnisteita, milloin Escalation kytketään päälle,
  päättyykö käynnissä oleva Slayer Link, kun kaveruus puretaan, ja jaetaanko itse käännetty DLL
  (4.4).

---

## Viisi välitavoitetta {#milestones}

Työ on jaettu viiteen välitavoitteeseen, jotka on nimetty M0–M4 (M tulee englannin sanasta milestone
eli välitavoite). Arviot ovat karkeita.

### M0: Turvaverkko {#m0-safety-net}

Tämä tehdään ennen kuin mitään muutetaan. Kaikki pelaajien tallennukset ovat yhdessä tiedostossa,
joten ensin varmistetaan, ettei mitään voi menettää. Tietokannasta otetaan automaattisesti
varmuuskopioita, salaiset avaimet varmuuskopioidaan salattuina erikseen, ja testataan, että kaikki
säilyy, kun palvelin käynnistetään uudelleen. Lisäksi tallennetaan, mitä peli lähettää niille
järjestelmille, jotka eivät vielä tallenna mitään, ja estetään peliä ottamasta yhteyttä Epicin
vanhaan chat-palvelimeen. Pelaaja ei huomaa tästä mitään, ennen kuin jokin menee rikki. Silloin se on
ero tunnin menettämisen ja kaiken menettämisen välillä. Arvioitu koko on noin päivä. Varmuuskopiot,
uudelleenkäynnistystesti ja Epicin chat-palvelimen esto ovat valmiita; salaisuuksien varmuuskopio ja
pelin lähettämien tietojen tallennus ovat vielä kesken.

### M1: Pelataan yhdessä {#m1-play-together}

Tämä välitavoite tuo kaverit mukaan. Alkuperäinen suunnitelma oli jakaa isännän kone kavereille
turvallisesti Tailscalella (ohjelma, joka tekee salatun, yksityisen yhteyden koneiden välille). Omistaja
päätti kuitenkin, että ensimmäinen kaveri-ilta pidetään vuokratulla Windows-palvelimella julkisessa
tilassa: kaverit tarvitsevat vain käynnistimen ja kutsun, yksi salattu portti on auki maailmalle, ja
pelin portit avautuvat vain kirjautuneille pelaajille. Tämä on rakennettu ja asennettu, omistaja
pelasi sillä ensimmäisen oikean testin yksin 22.9.2026, ja kahden pelaajan testi on seuraavana
vuorossa. Tilin voi luoda vain kutsukoodilla. Jokainen saa oman käyttäjänimen, jota kukaan
muu ei voi ottaa, ja kadonneen avaimen voi korvata uudella. Ryhmät ja kaverilista rakennetaan, jotta
kaverin voi kutsua samaan metsästykseen tarkoituksella (palvelimen puoli on jo rakennettu), ja muiden
pelaajien nimet näkyvät oikein. Jokaisen kaverin saaliit tallentuvat hänen
omalle tililleen, haun peruminen toimii, ja tallennukset toimivat myös hyvin pitkissä pelikerroissa.
Kaverit saavat linkin palvelimen lähdekoodiin, kuten AGPL-lisenssi edellyttää, ja kaverikäynnistin
tekee liittymisestä helppoa (kaveripaketti jää Tailscale-varavaihtoehdoksi). Lopuksi pidetään
ensimmäinen yhteinen peli-ilta, jonka aikana palvelimen kuormaa seurataan. Arvioitu koko on 1–2 viikkoa
omaa työtä sekä ryhmien (parties) parissa muualla tehtävä työ.

### M2: Kaikki ansaittu tallentuu {#m2-everything-you-earn-is-saved}

Tällä hetkellä osa ansaitusta tallentuu ja osa ei. M2:n jälkeen myös Slayer-taso, aseiden ja
hirviöiden mestaruus, Hunt Pass, palkkiotehtävät, päivittäiset ja viikoittaiset rajoitukset,
Escalation ja useat varustesarjat tallentuvat oikeasti. Useiden varustesarjojen taustapalvelu tukee
nyt kaikkia kuutta paikkaa, mutta lisäpaikkojen käyttöliittymätesti pelissä puuttuu. Samalla varmistetaan, ettei esineitä voi
monistaa eikä kuluttaa enemmän kuin omistaa, tallennuksille tulee historia, jonka avulla pelaajan voi
palauttaa aiempaan versioon, ja ylläpitäjä saa työkalut rikkoutuneen tallennuksen korjaamiseen
minuuteissa. Ruudulla näkyvä rahamäärä korjataan vastaamaan sitä, mitä pelaajalla oikeasti on. Jokainen
uusi palvelimen vastaus testataan ensin koetilillä, koska väärin muotoiltu vastaus voi kaataa pelin. On
myös päätetty, että jokainen tili saa Elite Hunt Passin. Arvioitu koko on 3–5 viikkoa. Slayer-taso,
mestaruus, Hunt Pass ja oikeudet on jo tehty, testattu pelissä ja otettu oletuksena käyttöön; loput ovat
työn alla.

### M3: Koko peli toimii {#m3-the-full-game-loop}

Kun perusasiat toimivat, peliin tuodaan takaisin loput: muut metsästystyypit (partiot, vaikeammat
heroic-takaa-ajot ja tarinatehtävät), lootlaatikoiden eli corejen avaaminen, kaikki kosmeettiset
esineet, postilaatikko ja lahjat, tervetuloviesti, kauppa, Trials-haasteet tulostauluineen,
kausitapahtumat, tekstichat, killat (guilds; rakennettu 22.9.2026, ei vielä kokeiltu pelissä) ja paluu
samaan metsästykseen, jos peli kaatuu kesken.
Ensin tarkistetaan, mitkä pelin noin 90 sisäänrakennetusta ominaisuuskytkimestä ovat päällä, koska se
ratkaisee, kannattaako osaa näistä rakentaa. Tämä vie monta viikkoa, ja osa on tutkimustyötä, jonka
kestoa ei voi tietää etukäteen. Guild Gauntletia ei rakenneta, koska sitä ei ole versiossa 1.4.4, eikä
Aether Caster -aseita luvata.

### M4: Vakaa ja helppo ylläpitää {#m4-solid-to-run}

Chat-päivitys 30.9.2026 (3.10): pelin tekstichat on nyt oletuksena päällä, kun `CHAT` puuttuu tai
on tyhjä. `CHAT=0` säilyy opt-out-asetuksena. Uusi julkinen asennus käyttää On-oletusta; vanha Off
säilytetään. Ota vanhan VPS:n chat käyttöön kerran komennolla `Set-Chat.ps1 -On`, kun kukaan ei pelaa.
Päivitys näyttää kuuntelijan tilan ja virheet kirjataan ilman viestien sisältöä tai tunnisteita.
Yksityinen paketti ja kavereiden läsnäolotieto pysyvät ennallaan. VPS-pelikoe on vielä tekemättä.

Viimeinen välitavoite tekee palvelimen pyörittämisestä helppoa ja turvallista. Kaatunut palvelu
käynnistyy itsestään uudelleen, ja kokonaisuus käynnistyy, kun omistaja kirjautuu koneelle. Lokit
pysyvät siisteinä, ja muistisuojat estävät karkaavaa palvelinta jumittamasta koko konetta.
Palvelimen DLL-tiedostot käännetään itse lähdekoodista, eikä konsoli-ikkunan sulkeminen voi enää
kaataa palvelinta. Päivitykset tehdään yhdellä turvallisella komennolla. Pidemmällä aikavälillä
selvitetään aina päällä olevaa palvelinkonetta, jotta kaverit voisivat pelata silloinkin, kun
omistajan kone on sammuksissa, ja kokeillaan, voisivatko pelipalvelimet pyöriä halvemmalla
Linux-koneella Wine-ohjelman avulla. Arvioitu koko on 1–2 viikkoa; aina päällä oleva kone,
Wine-kokeilu ja PostgreSQL ovat isompia töitä.

Aina päällä oleva kone on nyt olemassa: vuokrattu Windows Server 2019 -virtuaalipalvelin, jolle
Windows-palvelinpaketti käynnistää kaiken koneen käynnistyessä ja jolla kaatunut osa käynnistyy
itsestään uudelleen. Se on valmis vasta, kun kaverit ovat pelanneet sillä omistajan koneen ollessa
sammuksissa.

M4:ään lisättiin 22.9.2026 kuusi uutta kohtaa:

- **4.12 Suorituskyvyn kirjaaminen ja kapasiteetin mittaus.** *Mitä:* 30–60 sekunnin välein
  ajettava mittari kirjaa jokaisesta pelipalvelimesta suorittimen käytön (prosentteina yhdestä
  ytimestä), muistin, tyypin (Ramsgate, Dojo tai metsästys), pelaajamäärän ja käynnistysajan;
  palvelinkoneesta suorittimen, muistin, verkon, levyn ja pelipalvelinten määrän; ja metagamesta
  pyyntöjen vasteajat (p50 ja p95), tapahtumasilmukan viiveen ja tietokantaan kuluvan ajan. Tiedostot
  vaihtuvat päivittäin palvelimen lokikansiossa, ja niihin kirjataan vain lukuja, ei pelaajien nimiä.
  Yhteenvetotyökalu kertoo, paljonko yksi metsästys ja yksi Ramsgaten pelaaja maksavat, ja arvioi,
  montako pelaajaa tietty kone jaksaa. Omistajan syy: palvelimen rajoja ei tarvitse enää arvata.
  Ensimmäiset mittaukset tehdään ensimmäisissä kaveritesteissä. *Tilanne 22.9.2026:* mittari on
  rakennettu Vvoidddd:n ensimmäisen mittarin pohjalta
  ([PR #6](https://github.com/mixutin/dauntless-revived/pull/6)). Windows-palvelinpaketin valvoja
  kirjoittaa minuutin välein mittauksen tiedostoon `data\logs\performance\performance-<UTC-päivä>.csv`
  (30 päivää säilytetään, vain lukuja): jokainen pelipalvelin (rooli, UDP-portti, käynnistysaika,
  pelaajat, suoritin prosentteina yhdestä ytimestä ja muisti), palvelimen omat prosessit sekä kone
  (suoritin, keskusmuisti, vapaa levytila, verkko, pelipalvelinten ja paikalla olevien pelaajien
  määrä). Vielä tekemättä: metagamen vasteajat, tapahtumasilmukan viive ja tietokantaan kuluva aika
  sekä yhteenvetotyökalu. Mittaria ei ole vielä ajettu kaveri-illan aikana. *Valmis, kun:*
  kaveri-illan lokeista saadaan yhteenvetotyökalulla mitattu hinta metsästystä ja Ramsgaten pelaajaa
  kohden sekä arvio siitä, montako pelaajaa vuokrattu palvelin jaksaa.
- **4.13 Lisää peliportteja.** *Mitä:* pelipalvelinten UDP-porttialue laajennetaan yli 8770–8777:n.
  Nyt Ramsgate on portissa 8777, harjoitussali portissa 8776 ja metsästykset porteissa 8770–8775, eli
  kerralla voi olla enintään 6 metsästystä ja 24 metsästävää pelaajaa, oli kone miten iso tahansa.
  Tämä ohjelmiston raja tulee vastaan ennen laitteiston rajaa. Kaikki alueen mainitsevat kohdat
  muutetaan yhdessä (deploy-palvelin, palvelinpaketin palomuurisäännöt ja sallittujen lista,
  palveluntarjoajan palomuuri ja ohjeet), ja uudet metsästysportit tulevat 8770:n alapuolelle, kunnes
  oma DLL osaa erottaa pysyvät palvelimet. *Valmis, kun:* palvelimella pyörii yli 6 metsästystä
  kerralla, ja sallittujen lista avaa uudet portit vain kirjautuneille pelaajille.
- **4.14 PostgreSQL ennen mitään julkista julkaisua.** *Mitä:* metagame siirretään SQLitestä
  hallinnoituun PostgreSQL-tietokantaan samalla alueella kuin pelipalvelin, eikä siihen pääse
  internetistä. SQLite ei riitä isommalle joukolle: siihen voi kirjoittaa vain yksi kerrallaan,
  `better-sqlite3` on synkroninen ja pysäyttää Noden tapahtumasilmukan jokaisen kyselyn ajaksi, ja
  tietokanta on yksi tiedosto yhdellä koneella. Mukana ovat Drizzlen `pg`-murre, asynkroniset
  transaktiot, vain lisäyksen sallivat laukaisimet (triggers), JSON-sarakkeet `jsonb`-muotoon,
  kertaluonteinen kopiointityökalu sekä palveluntarjoajan päivittäiset varmuuskopiot ja oma
  öinen salattu kopio toisaalle. Ei aloitettu, eikä sitä tarvita kaveripalvelinta varten.
  *Valmis, kun:* kopiointityökalulla siirretty oikea tietokanta antaa samat tilit, hahmot, tavarat ja
  etenemisen, koko pelikerta (kirjautuminen, Ramsgate, metsästys, tallennus) toimii PostgreSQL:llä,
  tietokanta ei ota yhteyksiä internetistä, ja öinen kopio palautuu toiselle koneelle.
- **4.15 Nimenvaihdon toinen osa**, ensimmäisen kaveritestin jälkeen. *Mitä:* kansioiden nimet,
  `/undaunted/api`-reitit ja `x-undaunted-*`-otsakkeet (vanhat nimet jäävät rinnakkaisnimiksi),
  asetusten ja datatiedostojen Undaunted-nimet (esimerkiksi tietokantatiedosto `undaunted.db`),
  JWT-tunnisteiden myöntäjä ja kohde (issuer ja audience) ja palvelinpaketin asennuskansiot. Alkuperäisen projektin valmiisiin
  DLL-tiedostoihin kiinteästi kirjoitetut nimet jäävät, ellemme käännä omia DLL-tiedostoja, ja kiitokset
  Undauntedille jäävät aina. *Valmis, kun:* uusi asennus ja päivitetty palvelin toimivat uusilla
  nimillä, ennen muutosta tehty käynnistin toimii yhä rinnakkaisnimien kautta, ja jäljelle jäävät vain
  kiitokset ja valmiiden DLL-tiedostojen tarvitsemat nimet.
- **4.16 Käynnistimen allekirjoitus** (esimerkiksi Azure Trusted Signing). *Mitä:* julkaisutyönkulku
  allekirjoittaa asennusohjelman ja sovelluksen. Allekirjoittamattoman asennusohjelman SmartScreen
  estää kokonaan koneilla, joilla tunnistamattomat sovellukset on asetettu estettäviksi: Suorita
  silti -vaihtoehtoa ei ole. Siihen asti ohjeena on tarkistaa ladatun tiedoston SHA-256
  `SHA256SUMS.txt`-tiedostoa vasten ja poistaa esto (Ominaisuudet > Poista esto, tai `Unblock-File`),
  kuten sivulla [Liity kaverina]({{ friends_page.url | relative_url }}) kerrotaan. *Valmis, kun:*
  julkaistu asennusohjelma näyttää vahvistetun julkaisijan ja asentuu koneelle, joka estää
  tunnistamattomat sovellukset, ja asennetut käynnistimet päivittyvät yhä allekirjoitettuun versioon.
- **4.17 Kunnollinen korjaus pimeään ilmalaivaan ennen metsästystä.** *Mitä:* nykyisillä
  näytönohjainten ajureilla 1.4.4:n automaattinen valotus tekee ilmalaivan hytistä lähes mustan, ja
  sen ikkunat palavat puhki valkoisiksi. Rivi `r.EyeAdaptationQuality=0` (sen löysi Vvoidddd, [PR #5](https://github.com/mixutin/dauntless-revived/pull/5))
  laittaa automaattisen valotuksen pois. Se korjasi ilmalaivan, mutta teki myös Ramsgatesta ja kaikista
  yökohtauksista aivan liian pimeitä, joten käynnistimen versio 0.1.1 perui sen. Omistaja haluaa
  korjauksen, joka ei pilaa pelin ulkonäköä. Kokeiltavat vaihtoehdot: automaattinen valotus pysyy
  päällä, mutta sen vaihteluväliä rajataan; valotus mitataan toisella tavalla; tai käynnistimeen tulee
  asetus, josta jokainen pelaaja voi valita. Ensin selvitetään, mitä valotusasetuksia 1.4.4 hyväksyy
  `Engine.ini`-tiedostossa. *Kokeilu:* Vvoidddd lisäsi käynnistimeen valinnaisen asetuksen
  ([PR #7](https://github.com/mixutin/dauntless-revived/pull/7)): Asetukset > Grafiikka >
  Automaattinen valotus > **Mukautuva perusvalotus (kokeellinen)** kirjoittaa rivin
  `r.EyeAdaptation.MethodOverride=2`, jota 1.4.4:n ohjelmatiedosto kutsuu nimellä ”Auto Basic”, joten
  automaattinen valotus pysyy päällä. **Pelin oletus** on edelleen kaikkien oletus. Tämä ei ole vielä
  kunnollinen korjaus: sitä ei ole verrattu pelissä, eikä oletus muutu ennen vertailua, joten kohta on
  yhä avoin. *Valmis, kun:* omistaja vertaa vaihtoehtoja pelissä rinnakkain
  (A/B-vertailu), ja sekä ilmalaiva että Ramsgate ja yökohtaukset näyttävät oikeilta.

---

## Mitä pelaajan kannattaa tietää nyt {#what-to-tell-friends-right-now}

- Tavarat, materiaalit, Ramsit, valmistetut varusteet, tehtävät ja tarinan eteneminen tallentuvat.
- Slayer-taso, aseiden ja hirviöiden mestaruus ja Hunt Pass tallentuvat (oikea eteneminen on
  oletuksena päällä). Kaikki aloittavat tasolta 1, ja jokaisella on Elite Hunt Pass. Palkkiotehtävät
  tallentuvat, mutta niiden valitsemista ja lunastamista ei ole vielä kokeiltu pelissä.
- Älä vielä hajota cellejä (varusteisiin liitettäviä kykyesineitä) pölyksi. Kukaan ei ole
  tarkistanut, säilyykö pöly.
- Sulje peli vähintään kerran päivässä. Kirjautuminen vanhenee 24 tunnissa, ja sen jälkeen
  tallennukset voivat epäonnistua.
- Käynnistintä ei ole vielä allekirjoitettu. Jos Windows tarjoaa vain ”Älä suorita”, tarkista
  asennusohjelma saman julkaisun `SHA256SUMS.txt`-tiedostoa vasten ja poista esto (Ominaisuudet >
  Poista esto, tai `Unblock-File`).
- Ilmalaiva ennen metsästystä on toistaiseksi hyvin pimeä. Se on lyhyt kohtaus, ja kunnollinen
  korjaus on kohta 4.17. Käynnistimessä on kokeellinen valinnainen asetus (Asetukset > Grafiikka >
  Automaattinen valotus > Mukautuva perusvalotus). Jos Ramsgate tai yömetsästykset näyttävät sen kanssa
  oudoilta, vaihda takaisin asetukseen Pelin oletus.
- Ryhmät, kaverit ja killat on rakennettu palvelimelle, mutta niitä ei ole vielä kokeiltu kahdella
  pelaajalla; se on seuraava testi. Käynnistä peli kerran uudelleen seuraavan päivityksen jälkeen.
  Ryhmään voi kutsua, vaikka ette olisi kavereita. Kaikki näkyvät toistaiseksi poissa olevina
  (offline), ja kaveripyynnöt ja kiltakutsut näkyvät toiselle pelaajalle hänen seuraavalla
  kirjautumisellaan. Kun perustat killan, odota hetki nimen kirjoittamisen jälkeen ennen kuin painat
  Create.
- Tekstichattia ei vielä ole. Käytä Discordia.
- Slayer Links (My Links -välilehti) on uusi palvelimella, eikä sitä ole vielä kokeiltu pelissä.
  Escalation ja kauppa pysyvät ennallaan, kunnes isäntä kytkee ne päälle.

## Mitä ei voi palauttaa {#cant-come-back}

- **Äänichat.** Se toimi Vivoxilla, joka on maksullinen ulkopuolinen palvelu. Käytä Discordia.
- **Oikealla rahalla toiminut kauppa.** Yksityinen palvelin voi sen sijaan jakaa kosmeettiset
  esineet.
- **Marraskuun 2020 jälkeen julkaistu sisältö.** Versio 1.4.4 on sitä vanhempi.
  [Mystic Paradox](https://github.com/pranav158/Mystic-Paradox) siirtää samaa lähestymistapaa
  versioon 1.12.0.
- **Epic-alustan saavutukset.** Pelin sisäisten saavutusten edistyminen voi palata myöhemmin.
- **Alkuperäiset palkintoarvot:** palkkiotehtävien palkkiot, muiden kausien Hunt Pass -palkinnot ja
  kaupan hinnat. Kaikki, mitä asetamme niiden tilalle, on omaa suunnitteluamme.
- **Guild Gauntlet.** Sitä ei ole versiossa 1.4.4.

Kaikki yksityiskohdat, avoimet kysymykset ja kokeet, joilla ne ratkaistaan, löytyvät
[englanninkielisestä tarkistuslistasta]({{ roadmap_en.url | relative_url }}).
