# External audio slots

Put licensed or original `.mp3`, `.wav`, or `.ogg` files in this directory and
import them from `src/audio-assets.js`. The production build inlines imported
audio into the standalone HTML, so the released game still works offline.

For dynamic music, export synchronized stems with the same length and loop
point. Supported layers are `mix`, `drums`, `bass`, `melody`, and `tension`.
The game crossfades scenes and changes stem levels for Boss phases, low squad
strength, max-weapon countermeasures, and global-strike warnings.

Remote HTTPS URLs also load when the host permits CORS, but they are intended
for temporary preview only. A remote host can expire or make the game fail
offline, so final releases should use imported local files.
