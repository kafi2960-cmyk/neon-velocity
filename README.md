# NEON VELOCITY

A futuristic 3D hover-car racing game that runs in the browser, built with [Three.js](https://threejs.org/) (WebGL) and bloom post-processing. No build step and no downloads: open the page and race.

## Features

- **Story mode.** Eight chapters in Neo-Kyoto, 2087. Rise from scrapyard rookie to Apex League champion against Vex, the Oracle AI and Kaiser, with dialogue between races and an objective in every chapter (podium finishes, wins, duels, a time trial).
- **Quick Race and Time Trial.** Choose the track, laps, number of opponents and difficulty. Best laps are saved for every track.
- **4 worlds:** Neon Harbor (night city), Solar Dunes (synthwave desert), The Grid (a simulation made of light) and Aurora Ridge (frozen mountains under an aurora). Each track is an elevated, banked skyway circuit.
- **Garage.** 5 hover-cars, 5 upgrade lines per car (Fusion Core, Ion Thrusters, Mag-Lev Grip, Boost Capacitor, Hull Plating) and full customization: paint, trim, underglow, thruster colour, paint finish (gloss, metallic, matte, iridescent, liquid chrome) and rear wings. A 3D showroom previews every change.
- **Racing systems.** Cornering slides when you exceed grip, a shorter inside line, slipstream that charges boost, boost pads, energy orbs, car-to-car contact, hull damage with reboot, neon light trails, warp lines, a dynamic FOV and three camera views.
- **Audio.** Procedural synthwave soundtrack, an engine synth with gear shifts, and sound effects, all generated in real time with WebAudio.
- **Controls.** Keyboard, gamepad and touch.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | W / ↑ | RT |
| Brake | S / ↓ | LT |
| Steer | A D / ← → | Left stick |
| Boost | Space / Shift | A |
| Camera | C | Y |
| Pause | Esc / P | Start |

## Run locally

ES modules need to be served over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

```
index.html      UI screens, HUD and import map
css/style.css   Interface styling
js/main.js      Renderer, screens, story flow, garage UI, HUD
js/race.js      Race simulation: physics, AI, collisions, laps, camera
js/track.js     Track generation and themed environments
js/car.js       Procedural hover-car models
js/garage.js    3D showroom
js/fx.js        Sparks, speed lines, light trails
js/audio.js     Engine synth, sound effects, procedural music
js/input.js     Keyboard, gamepad and touch input
js/data.js      Cars, tracks, story chapters, save data
```
