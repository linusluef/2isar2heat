# 2Isar2Heat

A 2.5D top-down action game set in Munich (Frauenkirche to Allianz Arena), built for iPad and tablets. It runs in the browser and installs like an app. There is one global online lobby for everyone.

**Play:** `https://<your-github-name>.github.io/2isar2heat/`

## Put it online with GitHub Pages (works from the iPad)

No build tools are needed. GitHub Pages serves the files exactly as they are.

1. **Unzip.** In the Files app, tap `2isar2heat.zip`. You get a folder called `2isar2heat` with 20 files.
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
6. **Install it on the iPad.** Open the link in Safari, then tap **Share → Add to Home Screen**. The game now starts full screen like an app, without browser bars.

**Updating later:** upload the changed files again with the same names, so they overwrite the old ones. Pages redeploys automatically, and the app loads the new version the next time it starts.

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
- **Map (map icon, or K):** full-screen map with a legend. Tap to set a waypoint, and a GPS route shows on the minimap. Missions get a route automatically.

## Vehicles, side jobs and extras

- **New vehicles**, each handling differently:

  | Vehicle | Handling |
  |---|---|
  | Motorrad | Very quick and nimble, leans into corners; you fly off it in a hard crash |
  | SUV | Heavy, pushes other cars aside |
  | Supersportwagen | Fastest car in the city, rare |
  | MVG-Bus | Long and slow, wide turns |
  | Bierlaster | Heavy truck |
  | Krankenwagen, Feuerwehr | Sirens, start their side jobs |
  | Polizei-SUV | Used by the police from 3 stars |

- **Side jobs:** get into one of these vehicles and the job starts. Getting out ends the shift.

  | Vehicle | Where to find it | Job |
  |---|---|---|
  | Krankenwagen | Klinik (cross symbol) | Pick up injured people and bring them to the clinic |
  | Feuerwehr | Feuerwache (flame) | Put out burning cars: hold **Wasser** |
  | Bus | Busdepot (bus symbol) | Serve the stops and hold still at each one |
  | Bierlaster | Brauerei (mug) | Deliver barrels to beer gardens without crashing |
  | Taxi | Street traffic | Pick up waving passengers |

  In emergency vehicles and police cars, the horn button switches the siren on and off.
- **Stealing parked cars:** breaking in takes a moment (bar "AUFBRECHEN"), and some cars set off their alarm, which attracts nearby police.
- **Police helicopter:** from 4 stars a helicopter follows you with a searchlight, and from 5 stars it shoots. It can be shot down.
- **Stunt jumps:** 8 yellow-black ramps around the city. Each jump pays by distance and air time, and the first jump off each ramp pays an extra $500.
- **Hidden packages:** 30 Weißwurst-Tüten are hidden around the city. Each pays $100, and all 30 pay $10,000. Progress is shown in the pause menu.
- **New weapons (gun shop):** baseball bat, rifle (long range) and Molotov cocktails.
- **Sprinting:** push the joystick all the way for a moment, or hold Shift (keyboard) or B (controller). The blue bar shows your stamina.
- **Livelier squares:** Marienplatz has the Mariensäule, the Fischbrunnen, café terraces, benches, pigeons and tourists. From 20 November to 24 December there is a Christkindlmarkt with a big lit tree. Odeonsplatz, Viktualienmarkt, Stachus and Kaufingerstraße got the same treatment.

## Online mode: one global lobby

- On the start screen, choose **Online · globale Lobby** and enter a name. Every online player in the world joins the same lobby and sees the others driving and walking around the same Munich.
- The globe icon shows the player list: money, kills and distance. The speech-bubble icon opens the quick chat, which has fixed phrases.
- Shots, grenades, explosions and collisions between players are real.
  - If you take down a player who is wanted by the police, you collect a **bounty** for each wanted star they have.
- Each player still runs their own traffic, police and missions. You play your own game in a shared city.
- **How it works without a server:** the game connects to three free public MQTT brokers at once over secure WebSockets (EMQX, HiveMQ and the Mosquitto test server). It sends to all three and ignores duplicates, so the lobby keeps working if one of them is down. No account or server setup is needed.
- **Things to know:**
  - These public brokers come with no uptime guarantee.
  - Anyone can read the game messages, which contain only names and positions. Don't use your real name.

## Controls

| | Touch | Controller | Keyboard |
|---|---|---|---|
| Steer / walk | Joystick (left) | Left stick | WASD / arrow keys |
| Gas / brake | Pedals (right). Slide your thumb between them. Hold brake while stopped to reverse. | RT / LT | W / S |
| Fire / horn / siren / water | Fire button / horn button | X | Space |
| Sprint (on foot) | Push the joystick fully | B | Shift |
| Get in or out | Button | A | E |
| Drift / nitro | Buttons | B / RB | Shift / N |
| Switch weapon | Button | Y | Q |
| Camera | Camera icon | LB | C |
| Map | Map icon | – | K |
| Chat | Speech bubble | Select | T, then 1–8 |

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
| `account.js`, `config.js` | Accounts and cloud saves (Firebase), save codes |
| `main.js` | Input (touch, controller, keyboard), sound, HUD, lobby UI |
| `sw.js`, `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | Home-screen app and offline cache |
| `three.min.js` | three.js r128 (MIT licence) |
| `*.ttf`, `OFL-*.txt` | Fonts Bungee and Barlow Condensed (SIL Open Font License) |

Without an account, your save game and settings stay in the browser on your device.
