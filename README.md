# 2Isar2Heat

A 2.5D top-down action game set in Munich (Frauenkirche to Allianz Arena), built for iPad and tablets. It runs in the browser and installs like an app. There is one global online lobby for everyone.

**Play:** `https://<your-github-name>.github.io/2isar2heat/`

## Put it online with GitHub Pages (works from the iPad)

No build tools are needed. GitHub Pages serves the files exactly as they are.

1. **Unzip.** In the Files app, tap `2isar2heat.zip`. You get a folder called `2isar2heat` with 24 files.
2. **Create the repository.** On github.com, tap **+ → New repository**.
   - Name: `2isar2heat`
   - Visibility: **Public** (Pages is free for public repositories)
   - Tap **Create repository**.
3. **Upload the files.** On the new repository page, tap **uploading an existing file** (or **Add file → Upload files**).
   - Tap **choose your files**, open the `2isar2heat` folder and tap **Select**.
   - Select **all** files, tap **Open**, wait for the upload to finish, then tap **Commit changes**.
   - The files must sit at the top level of the repository, next to `index.html`, not inside a subfolder.
4. **Switch on Pages.** Go to **Settings → Pages**.
   - Source: **Deploy from a branch**.
   - Branch: **main**, folder: **/ (root)**.
   - Tap **Save**.
5. **Wait for the build.** GitHub builds and deploys the site by itself, which takes 1–2 minutes. Under **Actions** you will see "pages build and deployment" with a green tick when it's done. **Settings → Pages** then shows the link, for example `https://linusluef.github.io/2isar2heat/`.
6. **Install it on the iPad.** Open the link in Safari. Instead of the game you see an install screen: tap **Share → Zum Home-Bildschirm → Hinzufügen**, then start the game from the new icon. It now runs full screen like an app, without browser bars.

### Sharing the link with friends

Send the Pages link as it is. On phones and tablets the game **only runs as an installed app**. Opened in the browser, it shows an install screen in German instead of the game. The screen has no close button, and the game does not load behind it.

| Device | What the install screen does |
|---|---|
| Android (Chrome, Edge) | A **Jetzt installieren** button installs the app in one tap. Then start it from the home screen. |
| Android (other browsers, or no prompt) | Step-by-step instructions for the browser menu (Samsung Internet and Firefox included). |
| iPhone / iPad | Step-by-step instructions: Teilen → Zum Home-Bildschirm → Hinzufügen, with an arrow pointing to the share button. In apps like Instagram it first asks you to open the link in Safari. |
| Computer | Not gated: the game runs in the browser as before. |

- The one-tap install on Android needs the HTTPS link from GitHub Pages; it does not appear on a local test server.
- On iPhone and iPad, the installed app keeps its own save and settings, separate from Safari. Log in with your account to bring your progress over.

**Updating later:** upload the changed files again with the same names, so they overwrite the old ones. Pages redeploys automatically, and the app loads the new version the next time it starts.

- **Do not upload `config.js` again** if you have already put your Firebase keys into it. The zip contains an empty one that would overwrite yours.
- For this update, also upload the new file `install.js`.

## Accounts: keep your progress on every device (one-time, about 10 minutes)

The game works without this, but then progress stays on the device. Your money, weapons, armour, cars and their upgrades, homes, outfit, missions and stats can still be carried over with a **save code** (start screen → "Spielstand-Code erstellen" / "Code eingeben").

For real accounts with name and password, connect a free Firebase project. All of this works in Safari on the iPad:

1. Open **console.firebase.google.com** and sign in with a Google account.
2. **Create a project:**
   - Name: `2isar2heat`
   - Google Analytics: off
3. **Turn on logins:** go to **Build → Authentication → Get started → Sign-in method → Email/Password**. Switch on the first toggle and tap **Save**.
4. **Create the database:** go to **Build → Firestore Database → Create database**.
   - Location: e.g. `eur3 (Europe)`
   - **Start in production mode**, then **Create**.
5. **Lock the database to each player's own save:** in Firestore, open the **Rules** tab, replace everything with the rules below and tap **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /players/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

6. **Get the two keys:**
   - Tap the **gear → Project settings**, then under **Your apps** tap the **`</>` (Web)** icon.
   - Give it any nickname and tap **Register app**.
   - From the code that appears, copy the values of `apiKey` and `projectId`.
7. **Paste them into the game:**
   - In your GitHub repository, open `config.js` and tap the **pencil** icon.
   - Paste both values between the quotes.
   - Tap **Commit changes**.
   - After 1–2 minutes the start screen shows a login.

Players log in with any **name and password** (at least 6 characters). Using an e-mail address also works.

- A name-only account has no password reset, so write the password down.
- The `apiKey` is meant to be public. The rules from step 5 make sure every player can only read and write their own save.

**Important when updating the game later:** do **not** upload `config.js` again, or your keys will be overwritten. Leave it out, or fill it in again.

## Homes, paint shops and the map

- **Homes (house symbol):** there is a free starter flat in the Lehel and five homes for sale:

  | Home | Price |
  |---|---|
  | Giesing | $2,500 |
  | Westend | $5,000 |
  | Haidhausen | $9,000 |
  | Olympiadorf | $15,000, pays rent |
  | Bogenhausen | $30,000, pays rent |

  Buy one at its front door. Owning a home gives you:
  - **Safety:** you are safe at home. The police lose you when you go inside, unless they are right behind you, and other players can't hurt you there.
  - **Respawn:** you wake up at your main home.
  - **Garage:** cars parked in the marked garage next to it are kept.
  - **Wardrobe:** change your outfit colour.
- **Paint shop (spray can):** a new colour costs $250 and clears your wanted level.
- **Garage (wrench):** repairs and tuning.
- **Map (tap the minimap, or K):** full-screen map with a legend. Tap to set a waypoint, and a GPS route shows on the minimap. Missions get a route automatically.

## Vehicles, side jobs and extras

- **New vehicles**, each handling differently:

  | Vehicle | Handling |
  |---|---|
  | Motorrad | Very quick and nimble, leans into corners; you fly off it in a hard crash |
  | SUV | Heavy, pushes other cars aside |
  | Supersportwagen | Fastest car in the city, rare |
  | MVG-Bus | Long and slow, wide turns |
  | Bierlaster | Heavy truck |
  | Krankenwagen, Feuerwehr | Sirens, side jobs by button |
  | Polizei-SUV | Used by the police from 3 stars |

- **Side jobs:** these vehicles can simply be driven (or stolen) like any other. To work, tap the green **▶ … starten** button above the driving buttons. It turns into **■ Schicht beenden**, which ends the shift and shows how many jobs you did. Getting out also ends the shift.
  - **Keyboard:** J. **Controller:** right stick click (R3).
  - The button is hidden while a story mission is running.

  | Vehicle | Where to find it | Job |
  |---|---|---|
  | Krankenwagen | Klinik (cross symbol) | Pick up injured people and bring them to the clinic |
  | Feuerwehr | Feuerwache (flame) | Put out burning cars: hold **Wasser** |
  | Bus | Busdepot (bus symbol) | Serve the stops and hold still at each one |
  | Bierlaster | Brauerei (mug) | Deliver barrels to beer gardens without crashing |
  | Taxi | Street traffic | Pick up waving passengers |

  In emergency vehicles and police cars, the horn button switches the siren on and off.
- **Stealing parked cars:** breaking in takes a moment (bar "AUFBRECHEN"), and some cars set off their alarm, which attracts nearby police.
- **Police helicopter:** from 4 stars a helicopter hunts you with a searchlight, and from 5 stars it shoots. It can be shot down.
  - **It has to see you:** its view reaches about 60 m (less in rain), and buildings block it. It also can't see you under trees in a park (on foot, on a motorbike or driving slowly) or inside your home or garage.
  - **When it loses you:** the searchlight stops following you and sweeps the streets. The helicopter circles where you were last seen, slowly widening the search, and it only shoots while it can see you.
  - **Escaping:** break its line of sight between tall buildings or under trees, then get away while it searches. A message tells you when it has lost you or found you again.
- **Stunt jumps:** 8 yellow-black ramps around the city. Each jump pays by distance and air time, and the first jump off each ramp pays an extra $500.
- **Hidden packages:** 30 Weißwurst-Tüten are hidden around the city. Each pays $100, and all 30 pay $10,000. Progress is shown in the pause menu.
- **New weapons (gun shop):** baseball bat, rifle (long range) and Molotov cocktails.
- **Sprinting:** push the joystick all the way for a moment, or hold Shift (keyboard) or B (controller). The blue bar shows your stamina.
- **Livelier squares:** Marienplatz has the Mariensäule, the Fischbrunnen, café terraces, benches, pigeons and tourists. From 20 November to 24 December there is a Christkindlmarkt with a big lit tree. Odeonsplatz, Viktualienmarkt, Stachus and Kaufingerstraße got the same treatment.

## Police, health and bodies

- **Witnesses:** you only get a wanted level if someone sees the crime. Police officers see about 45 m, passers-by about 22 m, and both need a clear line of sight. A passer-by first has to call the police, which takes a few seconds.
- **Slower stars:** the wanted level rises gradually. Even a long rampage takes well over a minute to reach 5 stars, and fewer police cars chase you at once.
- **Getting away:**
  - Patrol cars are no faster than an ordinary saloon. At low wanted levels they chase more cautiously (80 % of their top speed at 1 star, rising to full speed at 4–5 stars), so a sports car, a motorbike or clever driving gets you away.
  - Officers only know where you are while one of them can see you. Once you are out of sight they drive to where you were last seen and then search the streets around it.
  - Stay unseen long enough and you lose a star (about 9 seconds at 1 star, 16 seconds at 5 stars).
- **Health:** you take less damage than before. Out of combat, your health slowly recovers on its own up to 60.
- **Bodies:** people now have health. A light hit knocks them down and they get up again; a deadly one leaves them lying there. Bodies disappear after a while, sooner once you are out of sight, so the police can't pile up.

## Story: Isarfieber

A campaign of 11 story missions in three chapters, with characters, German dialogue and short scenes. Phone booths keep giving smaller side missions in between.

- **The characters:**
  - **Sepp:** landlord of the Grüner Hirsch in the Glockenbachviertel.
  - **Vroni:** his niece and a racing driver (Olympiapark, Odeonsplatz, airport).
  - **Memo:** a mechanic on the Giesinger Berg.
  - **Kommissar Brandl:** a detective at the Chinesischer Turm.
  - Together they fight the property shark Konrad Graf, who wants Sepp's pub.
- **How it works:**
  - The next story contact is an orange **★** on the minimap and the big map, with a light beam in the city and the name shown above the character. The HUD says who is waiting where.
  - Walk up (or stop next to them in a car, without wanted stars) and a scene starts: black bars, camera on both of you, the dialogue as text. The dialogue is also read aloud with the iPad's German voice.
  - Tap anywhere or **Weiter ›** to continue, or **Überspringen** to skip. After a failed attempt, going back replays only the last line.
- **After a mission:** the character calls you, then the next contact appears. Each chapter starts with a title card, and the last mission ends with an epilogue.
- **New mission types:**
  - **Schatten:** tail a black limousine for 70 seconds. More than 75 m behind for 8 seconds loses it, closer than 13 m for 3.5 seconds and you are spotted, and touching it blows your cover.
  - **Schrottreif:** destroy an armoured transporter with escorts, which has about three times a normal transporter's armour.
  - **Luftpost:** fly the small plane from the airport through 9 rings in the air over the city. Each ring drops leaflets.

## Online activities

These work in the global lobby with other players, and alone (offline or nobody around) against bots, the bank or the clock.

- **Starting:** walk onto the casino's red carpet or the bank's steps, or drive onto a race's chequered start ring (it has two flags and a sign). The menu opens by itself. If you close it, the button at the bottom opens it again.
- **Playing alone:** if nobody else is in the lobby, a race starts straight away as a time trial. When other players are online, the race menu offers both: invite them or drive a time trial alone. In the casino, bots take the free poker seats and blackjack is against the bank, so both work alone too.

- **Street races (chequered flag on the map):** there are three routes:
  - Altstadtring-Rallye
  - Leopold-Sprint from the Siegestor to the Allianz Arena
  - Flughafen-Run from Hallbergmoos across the apron and down the runway

  Drive onto the start ring with a car or motorbike (not an aircraft) and pick an entry fee. When you race against others, everyone in the lobby gets an invitation and has 30 seconds to drive to the start and join. The winner takes the pot; with 3 or more drivers it is split 65 / 25 / 10 %. Alone it is a time trial for gold, silver or bronze.
- **Bank heist (vault symbol, the Isarbank in the Altstadt):** up to 4 players.
  1. **Hack:** knock out three security systems around the bank, each with its own puzzle:
     - connecting wires
     - matching a radio frequency
     - cracking the vault code

     Mistakes raise the alarm.
  2. **Drill:** drill the vault while the police arrive. At least one crew member must stay at the entrance.
  3. **Escape:** grab your share and bring it to the hideout, or lose the police.
- **Casino (spade symbol, the Spielbank on Leopoldstraße):**
  - Blackjack against the bank, up to 4 players at one table.
  - Texas Hold'em against other players. Empty seats are filled with bots. Your buy-in comes back as money when you stand up.
  - Open tables from other players appear in the casino's list. Tap **Hinsetzen**, and for poker choose your buy-in on the next page.
  - **Joining is reliable:** your device keeps asking the host for a seat until it appears at the table, for up to 12 seconds; if the host never answers, your buy-in is refunded. The host also resends the table state every 2.5 seconds, so a lost message no longer drops anyone.
  - **Fair odds:** cards are shuffled at random and bots only see their own cards. Blackjack uses six decks, the dealer stands on 17, blackjack pays 3:2 and you can double; there is no splitting. With good play you lose about 1 % of your bets over time, a little more than in a real casino because splitting is missing. Losing streaks are normal variance. The poker bots play reasonably: they judge their hand by simulating the rest of the board, and bluff now and then.
- **Things to know:** whoever opens a table, race or heist is its host. If the host leaves, the table closes and everyone gets their chips back. The lobby messages are public, so in theory someone could read the poker hole cards.

## New places

- **Siegestor:** it now stands free in a roundabout.
- **University:** the Ludwig-Maximilians-Universität with Geschwister-Scholl-Platz and its fountains lies between the Siegestor and Odeonsplatz.
- **Theresienwiese:** the Bavaria and the Ruhmeshalle stand clear of the road. The beer tents are rebuilt with towers, signs and beer gardens, and there is a new Ferris wheel that lights up at night.
- **Flughafen München:** the airport lies well east of the city, about 350 m further out than before. It has two runways, both terminals, a satellite, the tower, the Munich Airport Center, hangars and parked aircraft. Planes take off and land on the same schedule for every player, so watch out on the runway. Departing planes turn north before they reach the city, and arrivals come in from the east, so no plane flies through buildings. Drive there via the Erdinger Landstraße and the small suburb Hallbergmoos.
- **Airport fence:** a fence runs around the whole airside area (runways, taxiways, apron). The only way in by car is the guarded gate on the Terminalstraße next to Terminal 2, and the barrier only lifts when you drive up to it. Pedestrians stay out of the airside area.
- **Flying:** three aircraft at the airport can be flown:

  | Aircraft | Where |
  |---|---|
  | Kleinflugzeug | By the hangars, north of the runways |
  | Turboprop | On the apron next to Terminal 1 |
  | Passagierjet | At the east end of the apron |

  - **Get in:** walk up to the aircraft and tap Einsteigen.
  - **Gas and brake:** use the pedals exactly as in a car. The aircraft speeds up smoothly while you hold gas, keeps its speed when you let go, and slows down with the brake.
  - **Take off:** taxi onto a runway and hold gas. When the aircraft reaches its take-off speed, a message says so. Then **pull the joystick down** to lift off. Every aircraft reaches that speed comfortably before the runway ends.

    | Aircraft | Take-off speed |
    |---|---|
    | Kleinflugzeug | about 86 km/h |
    | Turboprop | about 122 km/h |
    | Passagierjet | about 173 km/h |

  - **In the air:** the joystick works like a real control stick (inverted). Push it **down to climb** and **up to descend**, and left or right to turn. There are no extra climb or descend buttons any more. Without any input the aircraft holds its altitude.
  - **Land:** brake or let go of the gas, then push the joystick up. Close to the ground the descent flattens out by itself, and you can land on runways, roads, fields and meadows.
  - **Danger:** too slow means a stall, and buildings, the Olympiaturm and a steep touchdown destroy the aircraft.
  - **Keyboard:** R or N = climb, F or Shift = descend. **Controller:** left stick, or RB = climb, B = descend.
  - **Missions and pick-ups ignore aircraft:** phone booths, story and job targets, packages, health and weapon pick-ups, shops, garages and race checkpoints only react on foot or in a car, motorbike or other ground vehicle. Flying over them does nothing.
  - **Online:** other players see your aircraft at its real height.
- **Radio:** in every car, bike and aircraft a station bar appears at the bottom. Swipe it left or right, or tap the arrows, to switch.

  | Station | Music |
  |---|---|
  | Isar FM | House, trance and electro-pop |
  | Lo-Fi Lehel | Lo-fi hip-hop, jazz-hop and ambient |
  | Radio Weißwurst | Polka, Landler (waltz time) and march |
  | Radio aus | Off |

  - **Every song is new:** each one gets its own key, tempo, chord progression, melody and arrangement, with intros, breaks, fills and endings. Each station rotates through its three styles.
  - **Real-sounding instruments:** plucked guitar, zither and double bass, piano, electric piano, supersaw synths, vocal pads, trumpets, tuba, accordion, clarinet, vibraphone and a full drum kit. They play in stereo with reverb and echo, dance tracks pump with the kick, and lo-fi has vinyl crackle and tape wobble.
  - **Song info:** the radio bar shows the style, artist and title. All artists and titles are made up.
  - **Presenter:**
    - The presenter speaks in German with the iPad's voice, and the music dips while they talk. What they say also appears in the radio bar.
    - When you get in or switch stations, you hear the station name and the current song.
    - Between songs there is always a short segment: the last song, a station slogan, then traffic, weather, the time or local news, and the next song.
    - When you are wanted, the news reports the manhunt and names your vehicle.
    - Songs sometimes get a short intro too.
    - On iPhone and iPad the voice only starts after you have touched the screen once, which happens anyway when you start the game.

  The music is generated live by the game, so there are no recordings or licences. Each station keeps playing in the background, so when you switch back you land in the middle of a song.
  - **Keyboard:** , and . switch stations. **Controller:** d-pad left / right.
- **Online cars:** when another player's car explodes, you now see it, and the wreck stays. Cars that other players get out of stay parked.

## Online mode: one global lobby

- On the start screen, choose **Online · globale Lobby** and enter a name. Every online player in the world joins the same lobby and sees the others driving and walking around the same Munich.
- The globe icon shows the player list: money, kills and distance. The speech-bubble icon opens the quick chat, which has fixed phrases.
- Shots, grenades, explosions and collisions between players are real.
  - If you take down a player who is wanted by the police, you collect a **bounty** for each wanted star they have.
- **Riding together:** whoever gets into a car first is the driver. Other players walk up to it and tap **Einsteigen** to ride along as passengers.
  - **Seats:** normal cars take 3 passengers; motorbikes and sports cars take 1; the bus takes 14. Aircraft take passengers too: the small plane 3, the turboprop 24, the jet 40.
  - **As a passenger:** you sit inside the vehicle for everyone (on a motorbike you are visible on the pillion seat behind the driver), hear the radio and can shoot out of the window: aim with the joystick and tap Feuer. Your shots never hit your own car. Tap **Aussteigen** to get out, unless the car is going fast.
  - **When the driver gets out:** all passengers get out too. The car stays there unlocked, so one of them can take the wheel straight away.
  - **The driver sees it:** a message in the feed shows when someone gets in or out.
  - **Wanted levels stay personal:** if a passenger is wanted, the police chase the car they are riding in.
- **What every player sees the same:** other players, the cars, planes and motorbikes they drive, their passengers, shots, grenades, explosions (also crashed planes) and cars someone left behind.
- **What is local to each device:** traffic, pedestrians, police, parked cars and missions. Each device runs these itself, so they differ between players. Keeping all of them identical would need one device to simulate the whole city and stream it to everyone else, which public MQTT brokers can't carry smoothly.
- **Smooth movement:** positions are timed with the sender's own clock and blended along a smooth curve using speed and direction, so vehicles you ride in or watch don't stutter when the network jitters. While someone rides along, the driver's device sends updates more often.
- **How it works without a server:** the game connects to three free public MQTT brokers at once over secure WebSockets (EMQX, HiveMQ and the Mosquitto test server). It sends to all three and ignores duplicates, so the lobby keeps working if one of them is down. No account or server setup is needed.
- **Things to know:**
  - These public brokers come with no uptime guarantee.
  - Anyone can read the game messages, which contain only names and positions. Don't use your real name.

## Sound

- **Your vehicle:** cars rumble, motorbikes sound higher and raspier, and the engine starts with a crank when you get in.
- **Aircraft:** each type sounds different.
  - Kleinflugzeug: a buzzing propeller.
  - Turboprop: propeller drone with a turbine whine.
  - Passagierjet: rising turbine whine and roar.

  Wind grows with airspeed. You also hear tyre chirps on touchdown and a stall warning when you get too slow. The airport's scheduled planes can be heard from the ground.
- **Traffic:** the three nearest moving cars have their own engine sound, panned left or right. Drivers honk when they are stuck behind you or a pedestrian, and now and then for no reason. Every car has its own horn.
- **Footsteps:** your steps follow your walking rhythm and sound different on pavement, grass and in water, wetter in the rain. You also hear people walking close by.
- **Ambience:** birds by day and crickets at night near parks, and a quiet city hum that grows with the traffic around you.

## Graphics and performance

- **Smooth while flying:** the ground textures of the city are reused from a fixed pool instead of being created anew as you fly, so memory stays flat and the iPad no longer runs out of it. At height the game draws the whole city from one detailed overview map, so nothing loads in patches and no buildings look see-through.
- **Far view:** fog and view distance grow with altitude. The picture quality stays the same.
- **Walking and running:** people walk with bending knees and elbows, planted feet and a natural arm swing, and their steps match their speed. When running they lean into it from the hips, and their legs swing out in front of the body, not behind it.
- **Shadows:** shadows are drawn every frame and locked to the shadow map's pixel grid, so shadows of fast cars and aircraft follow them smoothly without flickering.

## Controls

| | Touch | Controller | Keyboard |
|---|---|---|---|
| Steer / walk | Joystick (left) | Left stick | WASD / arrow keys |
| Aircraft climb / descend | Joystick down / up | Left stick down / up, RB / B | R or N / F or Shift |
| Gas / brake | Pedals (right). Slide your thumb between them. Hold brake while stopped to reverse. | RT / LT | W / S |
| Fire / horn / siren / water | Fire button / horn button | X | Space |
| Sprint (on foot) | Push the joystick fully | B | Shift |
| Get in or out | Button | A | E |
| Start / end a side job (taxi, ambulance, fire engine, bus, beer truck) | Green button above the driving buttons | Right stick click | J |
| Drift / nitro | Buttons | B / RB | Shift / N |
| Switch weapon | Button | Y | Q |
| Camera | Camera icon | LB | C |
| Look around (follow camera) | Swipe anywhere right of the joystick | – | – |
| Map | Tap the minimap | – | K |
| Radio station | Swipe the radio bar | D-pad left / right | , and . |
| Chat | Speech bubble | Select | T, then 1–8 |

**Free look in the follow camera:** swipe anywhere outside the joystick and the buttons (not on the minimap) to turn and tilt the camera, as in GTA San Andreas.
- **On foot:** the camera stays where you turned it, and the joystick then walks in the direction you are looking.
- **In a vehicle:** the camera swings back behind you a moment after you let go, once you are driving.
- **Top-down view:** swiping does nothing.

Settings are on the start screen and in the pause menu:

- Camera
- Steering style
- Time of day: day–night cycle, day, evening or night
- Weather: changing, clear or rain
- Graphics quality: high, medium or low
- Button size

## Files

| File | Purpose |
|---|---|
| `index.html` | Page, HUD, menus, touch controls |
| `world.js` | City generator: roads, Isar, buildings, landmarks, shops |
| `sim.js` | Game logic: driving physics, traffic, police, weapons, missions, saving |
| `render.js` | 3D graphics: facades, lit windows, day and night, rain, water, cars |
| `net.js` | Online lobby (MQTT over WebSocket) |
| `radio.js` | Car radio with three generated music stations |
| `activities.js` | Races, bank heist and casino (blackjack, Texas Hold'em), online and offline |
| `story.js` | Story campaign: characters, contact points, dialogue scenes, chapter cards |
| `account.js`, `config.js` | Accounts and cloud saves (Firebase), save codes |
| `main.js` | Input (touch, controller, keyboard), sound, HUD, lobby UI |
| `install.js` | Install screen: on phones and tablets the game only runs from the home screen |
| `sw.js`, `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | Home-screen app and offline cache |
| `three.min.js` | three.js r128 (MIT licence) |
| `*.ttf`, `OFL-*.txt` | Fonts Bungee and Barlow Condensed (SIL Open Font License) |

Without an account, your save game and settings stay in the browser on your device.
