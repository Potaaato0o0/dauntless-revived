---
title: Löydökset
parent: Dauntless Revived suomeksi
nav_order: 4
has_children: true
has_toc: false
lang: fi
ref: findings/index
locale: fi_FI
description: "Mitä Dauntlessin verkkopuolesta on saatu selville kahdesta peliversiosta: tiedostojen tarkistus, asetukset, taustapalvelun rajapinta, moninpeli ja kaatumiset."
---

{% assign verification_page = site.pages | where: "path", "fi/findings/verification.md" | first %}
{% assign assets_page = site.pages | where: "path", "fi/findings/assets.md" | first %}
{% assign contract_page = site.pages | where: "path", "fi/findings/backend-contract.md" | first %}
{% assign rev_page = site.pages | where: "path", "fi/findings/json-reversing.md" | first %}
{% assign internals_page = site.pages | where: "path", "fi/findings/client-internals.md" | first %}
{% assign mp_page = site.pages | where: "path", "fi/findings/multiplayer.md" | first %}
{% assign crashes_page = site.pages | where: "path", "fi/findings/crashes.md" | first %}
{% assign awakening_page = site.pages | where: "path", "fi/findings/awakening-2-1-1.md" | first %}
{% assign social_page = site.pages | where: "path", "fi/findings/social.md" | first %}
{% assign chat_page = site.pages | where: "path", "fi/findings/chat.md" | first %}
{% assign store_page = site.pages | where: "path", "fi/findings/store.md" | first %}
{% assign escalation_page = site.pages | where: "path", "fi/findings/escalation.md" | first %}
{% assign harmonic_page = site.pages | where: "path", "fi/findings/harmonic-fork.md" | first %}
{% assign tools_page = site.pages | where: "path", "fi/tools.md" | first %}

# Löydökset

Tähän osioon on kirjattu, mitä opimme Dauntlessin verkkopuolen toiminnasta eli siitä, miten peli
keskusteli yhtiön palvelimien (tietokoneiden, jotka pyörittivät peliä verkossa) kanssa. Tutkimme
kahta peliversiota. Aloitimme pelin viimeisestä versiosta ja siirryimme myöhemmin vanhempaan, jota
Undaunted tukee. Jokaisella sivulla kerrotaan, mitä versiota kukin tieto koskee, ja kaikki, mitä
emme ole varmistaneet, on merkitty erikseen.

| Versio | Julkaistu | Pelimoottori ja paketointi | Mihin sitä käytämme |
|---|---|---|---|
| **2.1.1** ("Awakening") | Joulukuu 2024, viimeinen julkaisu | UE5, IoStore-säiliöt | Suurin osa takaisinmallinnuksesta tehtiin tällä versiolla: taustapalvelun rajapinta, kirjautumisketju, kaatumisten tutkinta |
| **1.4.4** | Lokakuu 2020 | UE4, pak v9 | Versio, jota pelaamme Undauntedin kanssa |

UE4 ja UE5 tarkoittavat Unreal Engine -pelimoottorin versioita 4 ja 5 (pelimoottori on ohjelmisto,
jonka päälle peli on rakennettu). Takaisinmallinnus (reverse engineering) tarkoittaa valmiin ohjelman toiminnan
selvittämistä tutkimalla itse ohjelmaa, kun sen tekijöiden omia ohjeita ei ole saatavilla.

Tällä sivustolla ja lähdekoodissa ei ole pelitiedostoja. Sivuilla lainataan vain sen verran kuin kukin selitys vaatii:
päätepisteiden osoitepohjia (päätepiste on verkko-osoite, johon peli lähettää tietyn pyynnön),
kenttien ja funktioiden nimiä, muistiosoitteita ja lyhyitä koodinpätkiä.

## Sivut {#pages}

| Sivu | Versio | Mitä sivu käsittelee |
|---|---|---|
| [Pelitiedostojen tarkistaminen]({{ verification_page.url | relative_url }}) | Molemmat | Miten varmistimme, että pelaajayhteisön arkistoimat kopiot ovat aitoja, täydellisiä ja puhtaita, ennen kuin ajoimme niistä mitään. |
| [Pelin sisältö ja asetukset]({{ assets_page.url | relative_url }}) | Molemmat | Miten kumpikin versio tallentaa sisältönsä ja paketoidut asetuksensa, miten niitä luetaan, mitkä karttapolut ovat tärkeitä ja mitä käyttäjän omalla asetustiedostolla voi ohittaa. |
| [Taustapalvelun rajapinta]({{ contract_page.url | relative_url }}) | Enimmäkseen 2.1.1 | Phoenix Labsin REST-palvelut `steelyard.ca`-palvelimilla (ei PlayFab): palvelinnimet, kuorisäännöt ja ne vastausten muodot, jotka olemme saaneet selvitettyä. |
| [JSON-rakenteen lukeminen ohjelmatiedostosta]({{ rev_page.url | relative_url }}) | 2.1.1 | Menetelmä, jolla kenttien nimet, tyypit ja kuoret saadaan selville asiakasohjelman koodista, tekemämme virheet mukaan lukien. |
| [Asiakasohjelman sisäosat]({{ internals_page.url | relative_url }}) | 2.1.1, tarkistettu 1.4.4:llä siltä osin kuin sillä on väliä | Mitä julkaistu ohjelmatiedosto pystyy tekemään ja mitä ei: käynnistysvalitsimet, lokitus, jumittumisen tunnistin ja miksi se on pelkkä asiakasversio. |
| [Näin moninpeli toimii]({{ mp_page.url | relative_url }}) | 1.4.4 | Miten Undaunted muuttaa asiakasohjelman ylimääräiset kopiot pelipalvelimiksi ohjaamalla ehjää verkkokerrosta ohjelmaan ujutetun DLL-tiedoston (ohjelmakirjaston) avulla. |
| [Kaatumisten tutkinta]({{ crashes_page.url | relative_url }}) | Enimmäkseen 2.1.1 | Miten kaatumisraporteista saadaan käskyjen muistiosoitteet, ja mistä kukin kohtaamamme kaatuminen lopulta johtui. |
| [Version 2.1.1 yksinpelikokeilu]({{ awakening_page.url | relative_url }}) | 2.1.1 | Kuinka pitkälle yksin tehty käynnistys Ramsgateen eteni, mihin se pysähtyi (pelaajalla ei ollut ohjattavaa hahmoa) ja mistä työtä voi jatkaa. |
| [Kaverit, ryhmät ja killat]({{ social_page.url | relative_url }}) | 1.4.4 | Miten peliohjelma löytää muut pelaajat, millaisia vastauksia kaverit, ryhmät ja killat tarvitsevat, miksi ensimmäisessä kahden pelaajan testissä ei näkynyt mitään ja mikä on vielä vahvistamatta. |
| [Tekstichat]({{ chat_page.url | relative_url }}) | 1.4.4 | Miten peliohjelman tekstichat toimii palvelimellamme, miksi ensimmäinen chat-palvelin näytti nimien sijaan UID-...-tunnuksia, nimimerkin tarkistus, huoneet ja kuka niihin pääsee. |
| [Pelin kauppa]({{ store_page.url | relative_url }}) | 1.4.4 | Miten kauppanäkymä näyttää ja ostaa tarjouksen, ja Harmonicin forkin pohjalta rakennettu ilmainen kauppa: ostotunniste, valikoima ja sen välilehdet, pinottavat ja yksilölliset tavarat sekä se, kuka hahmo tavaran saa. |
| [Escalation]({{ escalation_page.url | relative_url }}) | 1.4.4 | Miten Escalation-eteneminen tallennetaan, peliohjelmasta luettu kausiluettelo, säännöt, jotka jokaisen tallennuksen on läpäistävä, ja mitä pelaajat näkevät, kun oikeat tallennukset otetaan käyttöön. |
| [Harmonicin työn siirto]({{ harmonic_page.url | relative_url }}) | 1.4.4 | Mitä otimme Harmonicin 1.4.4-forkista ja missä pidimme oman ratkaisumme, ominaisuus kerrallaan ja jokaisen valinnan syyn kanssa. |

Asiakasohjelma tarkoittaa pelaajan omalla koneella toimivaa peliohjelmaa. Suurimmassa osassa
staattista analyysiä (ohjelman tutkimista sitä ajamatta) käytetyt skriptit on kuvattu sivulla
[Työkalut]({{ tools_page.url | relative_url }}).

## Korjaus {#a-correction}

Päättelimme kerran, että moninpeli on mahdoton, koska kumpikin julkaistu versio on pelkkä
asiakasversio: palvelimen käynnistyskohdat on jätetty pois käännöksestä. Päätelmä oli väärä. Niiden
alla oleva verkkokerros on ehjä, ja ohjelmaan ujutettu DLL-tiedosto (ohjelmakirjasto, jonka
toiminnot liitetään käynnissä olevaan peliin) voi ohjata sitä. Näin Undaunted pyörittää Ramsgatea ja
metsästyksiä versiolla 1.4.4. Sivu [Näin moninpeli toimii]({{ mp_page.url | relative_url }}) kertoo
yksityiskohdat.
