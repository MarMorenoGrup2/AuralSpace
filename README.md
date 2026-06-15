# AuralSpace

This project is a web application for room auralization.

You can access the web application here: https://marmorenogrup2.github.io/AuralSpace/

## Description

AuralSpace is a web-based application that simulates sound perception within an acoustic environment according to the listener's position. Using measured impulse responses (IRs) acquired at different locations, the application reproduces how sound changes throughout the space and allows users to experience the acoustic scene through mono, stereo, or binaural rendering.

The application consists of a demo based on the Montserrat Torrent Organ Hall at the ESMUC (Escola Superior de Música de Catalunya), which was named in her honor on the occasion of her 100th anniversary. It uses a stereo recording of Johann Sebastian Bach’s "Prelude and Fugue in A minor, BWV 543" to showcase the acoustic response of the hall through mono, stereo, binaural and pseudo-BRIR rendering.

## Features

- Navigate a 3D model of the room  
- Move the red point to change the listener’s position  
- Listen to how the sound changes depending on location  
- Optionally load external `.wav` audio files (mono or stereo)  

## Current Status

- Position-dependent auralization using measured impulse responses
- Audio reproduction in mono, stereo, and binaural modes
- Pseudo-BRIR rendering for a single listener position
- Interactive navigation of the acoustic environment
- Loading custom mono and stereo `.wav` audio files

## Additional Work

The project includes a deconvolution script located in the `Deconvolver` folder (`deconvolver.py`), which processes the recorded sweep measurements and generates impulse responses (IRs).

The repository also provides an `IRs` dataset containing the room impulse responses in mono, stereo, and binaural formats.

## Future Work

Potential extensions of the project include:

- Extending pseudo-BRIR rendering to multiple listener positions
- Increasing the number of measurement positions within the room
- Allowing users to upload and auralize their own room models
- Further optimization of real-time audio processing

---

This project is part of a Bachelor's Thesis (TFG) and aims to explore the potential of interactive web technologies for auralization and acoustic space simulation.
